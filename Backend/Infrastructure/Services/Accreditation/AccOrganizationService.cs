using Entourage.Application;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services.Accreditation;

/// <summary>Organisations (media houses, vendors…) and their portal managers.</summary>
public sealed class AccOrganizationService(AppDbContext db, AccActorResolver actors, AccNotifier notifier)
{
    public static readonly TimeSpan InviteLifetime = TimeSpan.FromDays(14);

    public async Task<AccOrganizationDto[]> ListAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var accEvent = await db.AccEvents.AsNoTracking().FirstOrDefaultAsync(item => item.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Accreditation event not found.");
        var stages = AccSetupService.Stages(accEvent);
        var approved = stages.Where(item => item.Kind == "approved").Select(item => item.Key).ToHashSet();
        var rejected = stages.Where(item => item.Kind == "rejected").Select(item => item.Key).ToHashSet();
        var organizations = await db.AccOrganizations.AsNoTracking().Where(item => item.EventId == eventId).OrderBy(item => item.Name).ToListAsync(cancellationToken);
        var orgIds = organizations.Select(item => item.Id).ToList();
        var counts = await db.AccApplicants.AsNoTracking()
            .Where(item => item.OrganizationId != null && orgIds.Contains(item.OrganizationId.Value))
            .GroupBy(item => new { item.OrganizationId, item.StageKey })
            .Select(group => new { group.Key.OrganizationId, group.Key.StageKey, Count = group.Count() })
            .ToListAsync(cancellationToken);
        var users = await db.AccOrgUsers.AsNoTracking().Where(item => orgIds.Contains(item.OrganizationId)).OrderBy(item => item.Name).ToListAsync(cancellationToken);

        return [.. organizations.Select(org =>
        {
            var own = counts.Where(item => item.OrganizationId == org.Id).ToList();
            var total = own.Sum(item => item.Count);
            var approvedCount = own.Where(item => approved.Contains(item.StageKey)).Sum(item => item.Count);
            var rejectedCount = own.Where(item => rejected.Contains(item.StageKey)).Sum(item => item.Count);
            return new AccOrganizationDto(
                org.Id,
                org.Name,
                org.ApplicantTypeId,
                org.ContactName,
                org.ContactEmail,
                org.ContactPhone,
                org.Quota,
                total,
                total - approvedCount - rejectedCount,
                approvedCount,
                rejectedCount,
                [.. users.Where(item => item.OrganizationId == org.Id).Select(ToUserDto)]);
        })];
    }

    private static AccOrgUserDto ToUserDto(AccOrgUser user) => new(
        user.Id,
        user.Name,
        user.Email,
        user.IsActive,
        string.IsNullOrEmpty(user.PasswordHash),
        user.InviteExpiresOn,
        user.LastLoginOn);

    public async Task<AccOrganizationDto[]> CreateAsync(Guid eventId, AccOrganizationWriteRequest request, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        if (!await db.AccEvents.AsNoTracking().AnyAsync(item => item.Id == eventId, cancellationToken))
        {
            throw AppException.NotFound("Accreditation event not found.");
        }

        var now = DateTime.UtcNow;
        var entity = new AccOrganization { Id = Guid.CreateVersion7(), EventId = eventId, CreatedOn = now, UpdatedOn = now };
        await ApplyAsync(entity, request, cancellationToken);
        db.AccOrganizations.Add(entity);
        AccAudit.Add(db, eventId, null, actor, "Organisation added", entity.Name);
        await db.SaveChangesAsync(cancellationToken);
        return await ListAsync(eventId, cancellationToken);
    }

    public async Task<AccOrganizationDto[]> UpdateAsync(Guid eventId, Guid organizationId, AccOrganizationWriteRequest request, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        var entity = await db.AccOrganizations.FirstOrDefaultAsync(item => item.Id == organizationId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Organisation not found.");
        await ApplyAsync(entity, request, cancellationToken);
        entity.UpdatedOn = DateTime.UtcNow;
        AccAudit.Add(db, eventId, null, actor, "Organisation updated", entity.Name);
        await db.SaveChangesAsync(cancellationToken);
        return await ListAsync(eventId, cancellationToken);
    }

    /// <summary>Only an organisation without applicants can be removed (records are kept otherwise).</summary>
    public async Task<AccOrganizationDto[]> DeleteAsync(Guid eventId, Guid organizationId, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        var entity = await db.AccOrganizations.FirstOrDefaultAsync(item => item.Id == organizationId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Organisation not found.");
        if (await db.AccApplicants.AsNoTracking().AnyAsync(item => item.OrganizationId == organizationId, cancellationToken))
        {
            throw AccErrors.One("organization", "This organisation has applicants, so it is kept for the record. Remove its portal users instead.");
        }

        db.AccOrganizations.Remove(entity);
        AccAudit.Add(db, eventId, null, actor, "Organisation removed", entity.Name);
        await db.SaveChangesAsync(cancellationToken);
        return await ListAsync(eventId, cancellationToken);
    }

    private async Task ApplyAsync(AccOrganization entity, AccOrganizationWriteRequest request, CancellationToken cancellationToken)
    {
        var errors = new AccErrors();
        var name = AccText.Clean(request.Name, 200);
        if (name is null)
        {
            errors.Add("name", "Enter the organisation name.");
        }
        else if (await db.AccOrganizations.AsNoTracking().AnyAsync(item => item.EventId == entity.EventId && item.Id != entity.Id && item.Name == name, cancellationToken))
        {
            errors.Add("name", "An organisation with this name already exists in this event.");
        }

        var email = AccText.Email(request.ContactEmail);
        if (email is not null && !AccText.IsEmail(email))
        {
            errors.Add("contactEmail", "Enter a valid email address.");
        }

        if (request.Quota is < 0)
        {
            errors.Add("quota", "The quota cannot be negative.");
        }

        if (request.ApplicantTypeId is { } typeId && !await db.AccApplicantTypes.AsNoTracking().AnyAsync(item => item.Id == typeId && item.EventId == entity.EventId, cancellationToken))
        {
            errors.Add("applicantTypeId", "Choose an applicant category from this event.");
        }

        errors.ThrowIfAny();
        entity.Name = name!;
        entity.ContactName = AccText.Clean(request.ContactName, 200);
        entity.ContactEmail = email;
        entity.ContactPhone = AccText.Clean(request.ContactPhone, 40);
        entity.Quota = request.Quota;
        entity.ApplicantTypeId = request.ApplicantTypeId;
    }

    /* ---------------- Portal managers ---------------- */

    public async Task<AccInviteResultDto> InviteAsync(Guid eventId, Guid organizationId, AccInviteRequest request, string appOrigin, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        var organization = await db.AccOrganizations.AsNoTracking().FirstOrDefaultAsync(item => item.Id == organizationId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Organisation not found.");
        var errors = new AccErrors();
        var name = AccText.Clean(request.Name, 200);
        var email = AccText.Email(request.Email);
        if (name is null)
        {
            errors.Add("name", "Enter the manager's name.");
        }

        if (!AccText.IsEmail(email))
        {
            errors.Add("email", "Enter a valid email address.");
        }
        else if (await db.AccOrgUsers.AsNoTracking().AnyAsync(item => item.OrganizationId == organizationId && item.Email == email, cancellationToken))
        {
            errors.Add("email", "This person already has access to this organisation. Use Resend invitation instead.");
        }

        errors.ThrowIfAny();

        var user = new AccOrgUser
        {
            Id = Guid.CreateVersion7(),
            OrganizationId = organizationId,
            Email = email!,
            Name = name!,
            IsActive = true,
            CreatedOn = DateTime.UtcNow,
        };
        var token = IssueInvite(user);
        db.AccOrgUsers.Add(user);
        AccAudit.Add(db, eventId, null, actor, "Portal manager invited", $"{user.Name} <{user.Email}> · {organization.Name}");
        await db.SaveChangesAsync(cancellationToken);
        var link = await SendInviteAsync(eventId, organization.Name, user, token, appOrigin, cancellationToken);
        return new AccInviteResultDto(await ListAsync(eventId, cancellationToken), link);
    }

    public async Task<AccInviteResultDto> ResendAsync(Guid eventId, Guid userId, string appOrigin, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        var (user, organization) = await LoadUserAsync(eventId, userId, cancellationToken);
        var token = IssueInvite(user);
        // A resend also works as a password reset: the manager sets a new password from the link.
        AccAudit.Add(db, eventId, null, actor, "Portal invitation resent", $"{user.Name} <{user.Email}> · {organization.Name}");
        await db.SaveChangesAsync(cancellationToken);
        var link = await SendInviteAsync(eventId, organization.Name, user, token, appOrigin, cancellationToken);
        return new AccInviteResultDto(await ListAsync(eventId, cancellationToken), link);
    }

    public async Task<AccOrganizationDto[]> SetActiveAsync(Guid eventId, Guid userId, bool isActive, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        var (user, organization) = await LoadUserAsync(eventId, userId, cancellationToken);
        user.IsActive = isActive;
        if (!isActive)
        {
            await db.AccPortalSessions.Where(item => item.OrgUserId == user.Id).ExecuteDeleteAsync(cancellationToken);
        }

        AccAudit.Add(db, eventId, null, actor, isActive ? "Portal manager enabled" : "Portal manager disabled", $"{user.Name} · {organization.Name}");
        await db.SaveChangesAsync(cancellationToken);
        return await ListAsync(eventId, cancellationToken);
    }

    private async Task<(AccOrgUser User, AccOrganization Organization)> LoadUserAsync(Guid eventId, Guid userId, CancellationToken cancellationToken)
    {
        var row = await (
            from user in db.AccOrgUsers
            join organization in db.AccOrganizations on user.OrganizationId equals organization.Id
            where user.Id == userId && organization.EventId == eventId
            select new { user, organization }).FirstOrDefaultAsync(cancellationToken)
            ?? throw AppException.NotFound("Portal user not found.");
        return (row.user, row.organization);
    }

    private static string IssueInvite(AccOrgUser user)
    {
        var token = AccTokens.New();
        user.InviteTokenHash = AccTokens.Hash(token);
        user.InviteExpiresOn = DateTime.UtcNow.Add(InviteLifetime);
        return token;
    }

    private async Task<string> SendInviteAsync(Guid eventId, string organization, AccOrgUser user, string token, string appOrigin, CancellationToken cancellationToken)
    {
        var eventName = await db.AccEvents.AsNoTracking().Where(item => item.Id == eventId).Select(item => item.Name).FirstAsync(cancellationToken);
        var link = $"{appOrigin.TrimEnd('/')}/portal/invite/{token}";
        var body =
            $"Hello {user.Name},\n\n" +
            $"You have been invited to manage accreditation for {organization} at {eventName}.\n\n" +
            "Open the link below to set your password. From the portal you can add your team, upload their photos and documents, and follow their approval status.\n\n" +
            $"{link}\n\n" +
            $"The link works for {InviteLifetime.Days} days.";
        await notifier.SendAsync([(user.Email, user.Name, $"Accreditation portal – {eventName}", body)], cancellationToken);
        return link;
    }
}
