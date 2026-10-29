using Entourage.Application;
using Entourage.Application.Interfaces;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services.Accreditation;

/// <summary>
/// The organisation portal: invited managers set a password, sign in, and manage their own people.
/// Sessions are random codes sent in the X-Portal-Token header; only their hash is stored.
/// </summary>
public sealed class AccPortalService(AppDbContext db, IPasswordHasher hasher, AccApplicantService applicants)
{
    public const string HeaderName = "X-Portal-Token";
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(7);

    /// <summary>The signed-in manager.</summary>
    public sealed record PortalUser(AccOrgUser User, AccOrganization Organization, AccEvent Event)
    {
        public AccActor Actor => AccActor.Portal(Organization.Name, User.Name);

        public bool Accepting => Event.Status == "Open";
    }

    /* ---------------- Invitation & sign-in ---------------- */

    public async Task<AccInviteInfoDto> InviteInfoAsync(string token, CancellationToken cancellationToken)
    {
        var (user, organization, accEvent) = await FindInviteAsync(token, cancellationToken);
        return new AccInviteInfoDto(user.Email, user.Name, organization.Name, accEvent.Name);
    }

    public async Task<AccPortalLoginResult> AcceptInviteAsync(string token, AccAcceptInviteRequest request, CancellationToken cancellationToken)
    {
        var (user, organization, accEvent) = await FindInviteAsync(token, cancellationToken);
        var errors = new AccErrors();
        var name = AccText.Clean(request.Name, 200);
        if (name is null)
        {
            errors.Add("name", "Enter your name.");
        }

        if (string.IsNullOrEmpty(request.Password) || request.Password.Length < 8)
        {
            errors.Add("password", "Use at least 8 characters.");
        }

        errors.ThrowIfAny();
        user.Name = name!;
        user.PasswordHash = hasher.Hash(request.Password!);
        user.InviteTokenHash = null;
        user.InviteExpiresOn = null;
        user.LastLoginOn = DateTime.UtcNow;
        // A new password signs out every other session.
        await db.AccPortalSessions.Where(item => item.OrgUserId == user.Id).ExecuteDeleteAsync(cancellationToken);
        AccAudit.Add(db, accEvent.Id, null, AccActor.Portal(organization.Name, user.Name), "Portal password set");
        var result = NewSession(user);
        await db.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task<AccPortalLoginResult> LoginAsync(AccPortalLoginRequest request, CancellationToken cancellationToken)
    {
        var email = AccText.Email(request.Email);
        if (email is null || string.IsNullOrEmpty(request.Password))
        {
            throw AppException.Unauthorized("Enter your email and password.");
        }

        var candidates = await (
            from user in db.AccOrgUsers
            join organization in db.AccOrganizations on user.OrganizationId equals organization.Id
            join accEvent in db.AccEvents on organization.EventId equals accEvent.Id
            where user.Email == email && user.IsActive && user.PasswordHash != "" && accEvent.Status != "Archived"
            select new { user, organization, accEvent }).ToListAsync(cancellationToken);
        var matches = candidates.Where(item => hasher.Verify(request.Password, item.user.PasswordHash)).ToList();
        if (matches.Count == 0)
        {
            throw AppException.Unauthorized("The email or password is not correct.");
        }

        if (request.AccountId is { } accountId)
        {
            matches = matches.Where(item => item.user.Id == accountId).ToList();
            if (matches.Count == 0)
            {
                throw AppException.Unauthorized("Choose one of your organisations.");
            }
        }
        else if (matches.Count > 1)
        {
            return new AccPortalLoginResult(null, null, [.. matches.Select(item => new AccPortalChoiceDto(item.user.Id, item.organization.Name, item.accEvent.Name))]);
        }

        var chosen = matches[0];
        chosen.user.LastLoginOn = DateTime.UtcNow;
        var result = NewSession(chosen.user);
        await db.AccPortalSessions.Where(item => item.ExpiresOn < DateTime.UtcNow).ExecuteDeleteAsync(cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return result;
    }

    public async Task LogoutAsync(string? token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return;
        }

        var hash = AccTokens.Hash(token.Trim());
        await db.AccPortalSessions.Where(item => item.TokenHash == hash).ExecuteDeleteAsync(cancellationToken);
    }

    private AccPortalLoginResult NewSession(AccOrgUser user)
    {
        var token = AccTokens.New();
        var expires = DateTime.UtcNow.Add(SessionLifetime);
        db.AccPortalSessions.Add(new AccPortalSession
        {
            Id = Guid.CreateVersion7(),
            OrgUserId = user.Id,
            TokenHash = AccTokens.Hash(token),
            CreatedOn = DateTime.UtcNow,
            ExpiresOn = expires,
        });
        return new AccPortalLoginResult(token, expires, null);
    }

    private async Task<(AccOrgUser User, AccOrganization Organization, AccEvent Event)> FindInviteAsync(string token, CancellationToken cancellationToken)
    {
        var hash = AccTokens.Hash((token ?? string.Empty).Trim());
        var row = await (
            from user in db.AccOrgUsers
            join organization in db.AccOrganizations on user.OrganizationId equals organization.Id
            join accEvent in db.AccEvents on organization.EventId equals accEvent.Id
            where user.InviteTokenHash == hash
            select new { user, organization, accEvent }).FirstOrDefaultAsync(cancellationToken);
        if (row is null || row.user.InviteExpiresOn is null || row.user.InviteExpiresOn < DateTime.UtcNow)
        {
            throw AppException.NotFound("This invitation link has expired or was already used. Ask the accreditation team to send a new one.");
        }

        if (!row.user.IsActive)
        {
            throw AppException.Forbidden("This portal account has been disabled.");
        }

        return (row.user, row.organization, row.accEvent);
    }

    /// <summary>Resolves the session header to the manager, or throws 401.</summary>
    public async Task<PortalUser> AuthenticateAsync(string? token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            throw AppException.Unauthorized("Sign in to the portal to continue.");
        }

        var hash = AccTokens.Hash(token.Trim());
        var row = await (
            from session in db.AccPortalSessions
            join user in db.AccOrgUsers on session.OrgUserId equals user.Id
            join organization in db.AccOrganizations on user.OrganizationId equals organization.Id
            join accEvent in db.AccEvents on organization.EventId equals accEvent.Id
            where session.TokenHash == hash && session.ExpiresOn > DateTime.UtcNow && user.IsActive
            select new { user, organization, accEvent }).AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        if (row is null || row.accEvent.Status == "Archived")
        {
            throw AppException.Unauthorized("Your portal session has ended. Sign in again.");
        }

        return new PortalUser(row.user, row.organization, row.accEvent);
    }

    /* ---------------- Portal data ---------------- */

    public async Task<AccPortalMeDto> MeAsync(PortalUser portal, CancellationToken cancellationToken)
    {
        var stages = AccSetupService.Stages(portal.Event);
        var rejected = stages.Where(item => item.Kind == "rejected").Select(item => item.Key).ToList();
        var used = await db.AccApplicants.AsNoTracking().CountAsync(item => item.OrganizationId == portal.Organization.Id && !rejected.Contains(item.StageKey), cancellationToken);
        var types = await db.AccApplicantTypes.AsNoTracking().Where(item => item.EventId == portal.Event.Id).OrderBy(item => item.SortOrder).ToListAsync(cancellationToken);
        return new AccPortalMeDto(
            portal.User.Name,
            portal.User.Email,
            portal.Organization.Id,
            portal.Organization.Name,
            portal.Event.Name,
            portal.Event.Venue,
            portal.Event.StartDate,
            portal.Event.EndDate,
            portal.Event.Status,
            portal.Accepting,
            portal.Organization.Quota,
            used,
            portal.Organization.ApplicantTypeId,
            [.. types.Select(ToPortalType)],
            stages);
    }

    public static AccPortalTypeDto ToPortalType(AccApplicantType type) => new(
        type.Id,
        type.Name,
        AccJson.Read(type.FieldsJson, Array.Empty<AccFieldDto>()),
        AccJson.Read(type.DocumentsJson, Array.Empty<AccDocumentRuleDto>()));

    public Task<AccApplicantRowDto[]> ListAsync(PortalUser portal, CancellationToken cancellationToken) =>
        applicants.RowsAsync(portal.Event.Id, db.AccApplicants.AsNoTracking().Where(item => item.OrganizationId == portal.Organization.Id), cancellationToken);

    public async Task<AccApplicantDetailDto> DetailAsync(PortalUser portal, Guid applicantId, CancellationToken cancellationToken)
    {
        await EnsureOwnAsync(portal, applicantId, cancellationToken);
        var detail = await applicants.DetailAsync(portal.Event.Id, applicantId, includeHistory: false, cancellationToken);
        // The portal never sees other organisations' people or the internal credential code.
        return detail with { Duplicates = [], CredentialCode = string.Empty };
    }

    public async Task<AccApplicantDetailDto> CreateAsync(PortalUser portal, AccApplicantWriteRequest request, CancellationToken cancellationToken)
    {
        EnsureAccepting(portal);
        var detail = await applicants.CreateAsync(portal.Event.Id, request, Context(portal), cancellationToken);
        return detail with { Duplicates = [], CredentialCode = string.Empty, History = [] };
    }

    public async Task<AccApplicantDetailDto> UpdateAsync(PortalUser portal, Guid applicantId, AccApplicantWriteRequest request, CancellationToken cancellationToken)
    {
        EnsureAccepting(portal);
        await EnsureOwnAsync(portal, applicantId, cancellationToken);
        var detail = await applicants.UpdateAsync(portal.Event.Id, applicantId, request, Context(portal), cancellationToken);
        return detail with { Duplicates = [], CredentialCode = string.Empty, History = [] };
    }

    public async Task<AccBulkResult> BulkAsync(PortalUser portal, AccBulkRow[] rows, CancellationToken cancellationToken)
    {
        EnsureAccepting(portal);
        return await applicants.BulkAsync(portal.Event.Id, new AccBulkRequest(portal.Organization.Id, rows), Context(portal) with { Source = "bulk" }, cancellationToken);
    }

    /// <summary>A file is visible to the portal when it belongs to one of the organisation's people.</summary>
    public async Task EnsureFileVisibleAsync(PortalUser portal, Guid fileId, CancellationToken cancellationToken)
    {
        var own = db.AccApplicants.AsNoTracking().Where(item => item.OrganizationId == portal.Organization.Id);
        var visible = await own.AnyAsync(item => item.PhotoFileId == fileId, cancellationToken)
            || await db.AccDocuments.AsNoTracking().AnyAsync(item => item.FileId == fileId && own.Any(applicant => applicant.Id == item.ApplicantId), cancellationToken);
        if (!visible)
        {
            throw AppException.NotFound("File not found.");
        }
    }

    private static AccApplicantService.SubmitContext Context(PortalUser portal) =>
        new("portal", portal.Actor, portal.Organization.Id, StrictDocuments: true, RequireEmail: false, EnforceQuota: true);

    private static void EnsureAccepting(PortalUser portal)
    {
        if (!portal.Accepting)
        {
            throw AppException.Forbidden(portal.Event.Status == "Draft"
                ? "Applications for this event have not opened yet."
                : "Applications for this event are closed.");
        }
    }

    private async Task EnsureOwnAsync(PortalUser portal, Guid applicantId, CancellationToken cancellationToken)
    {
        if (!await db.AccApplicants.AsNoTracking().AnyAsync(item => item.Id == applicantId && item.OrganizationId == portal.Organization.Id, cancellationToken))
        {
            throw AppException.NotFound("Person not found.");
        }
    }

    /* ---------------- Public application ---------------- */

    public async Task<AccEvent> PublicEventAsync(string slug, CancellationToken cancellationToken)
    {
        var clean = AccText.Slug(slug);
        var accEvent = await db.AccEvents.AsNoTracking().FirstOrDefaultAsync(item => item.Slug == clean, cancellationToken);
        if (accEvent is null || !accEvent.PublicApplyEnabled || accEvent.Status is "Draft" or "Archived")
        {
            throw AppException.NotFound("This application page is not available.");
        }

        return accEvent;
    }

    public async Task<AccPublicApplyInfoDto> PublicInfoAsync(string slug, CancellationToken cancellationToken)
    {
        var accEvent = await PublicEventAsync(slug, cancellationToken);
        var types = await db.AccApplicantTypes.AsNoTracking().Where(item => item.EventId == accEvent.Id).OrderBy(item => item.SortOrder).ToListAsync(cancellationToken);
        return new AccPublicApplyInfoDto(accEvent.Name, accEvent.Venue, accEvent.StartDate, accEvent.EndDate, accEvent.Status == "Open", [.. types.Select(ToPortalType)]);
    }

    public async Task PublicSubmitAsync(string slug, AccPublicApplyRequest request, CancellationToken cancellationToken)
    {
        var accEvent = await PublicEventAsync(slug, cancellationToken);
        if (accEvent.Status != "Open")
        {
            throw AppException.Forbidden("Applications for this event are closed.");
        }

        // Bots fill the hidden "website" box; pretend it worked.
        if (!string.IsNullOrWhiteSpace(request.Website))
        {
            return;
        }

        if (request.Applicant is null)
        {
            throw AccErrors.One("firstName", "Enter your details.");
        }

        if (request.Applicant.ApplicantTypeId is null)
        {
            throw AccErrors.One("applicantTypeId", "Choose what you are applying as.");
        }

        var applicant = request.Applicant with { OrganizationId = null };
        await applicants.CreateAsync(accEvent.Id, applicant,
            new AccApplicantService.SubmitContext("public", AccActor.Public, null, StrictDocuments: true, RequireEmail: true, EnforceQuota: false),
            cancellationToken);
    }
}
