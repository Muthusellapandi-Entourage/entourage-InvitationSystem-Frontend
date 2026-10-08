using System.Text.Json;
using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Application.Invitations;
using Entourage.Application.Validation;
using Entourage.Domain.Entities;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using FluentValidation;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

public sealed class InvitationService(
    AppDbContext db,
    IValidator<InvitationWriteRequest> writeValidator,
    IValidator<InvitationDesignDto> designValidator,
    IValidator<RecordInvitationResponseRequest> responseValidator,
    IEventAssetService assets) : IInvitationService
{
    private static readonly JsonSerializerOptions DesignJsonOptions = new(JsonSerializerDefaults.Web);
    public async Task<InvitationDto> GetAsync(Guid eventId, CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        var invitation = await db.Invitations.AsNoTracking()
            .FirstOrDefaultAsync(item => item.EventId == eventId, cancellationToken);
        if (invitation is null)
        {
            throw AppException.NotFound("Invitation has not been created yet.");
        }

        return ToDto(invitation);
    }

    public async Task<InvitationDto> SaveAsync(
        Guid eventId,
        InvitationWriteRequest request,
        CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        await ValidationGuard.EnsureValidAsync(writeValidator, request, cancellationToken);

        var invitation = await db.Invitations.FirstOrDefaultAsync(item => item.EventId == eventId, cancellationToken);
        if (invitation is null)
        {
            invitation = new Invitation
            {
                Id = Guid.CreateVersion7(),
                EventId = eventId,
            };
            db.Invitations.Add(invitation);
        }

        Apply(invitation, request);
        invitation.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(invitation);
    }

    public async Task<InvitationTemplateDto> GetTemplateAsync(Guid eventId, CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        var invitation = await db.Invitations.AsNoTracking()
            .FirstOrDefaultAsync(item => item.EventId == eventId, cancellationToken);
        if (invitation is null || string.IsNullOrWhiteSpace(invitation.DesignJson))
        {
            return new InvitationTemplateDto(InvitationDesignDto.CreateDefault(), invitation?.Html, invitation?.UpdatedOn);
        }

        var design = JsonSerializer.Deserialize<InvitationDesignDto>(invitation.DesignJson, DesignJsonOptions)
            ?? InvitationDesignDto.CreateDefault();
        return new InvitationTemplateDto(design, invitation.Html, invitation.UpdatedOn);
    }

    public async Task<InvitationTemplateDto> SaveTemplateAsync(
        Guid eventId,
        InvitationDesignDto design,
        CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        await ValidationGuard.EnsureValidAsync(designValidator, design, cancellationToken);

        var assetIds = new[] { design.HeaderAssetId, design.DetailsAssetId, design.AcceptAssetId, design.DeclineAssetId }
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToArray();
        await assets.EnsureOwnedAsync(eventId, assetIds, cancellationToken);

        var invitation = await db.Invitations.FirstOrDefaultAsync(item => item.EventId == eventId, cancellationToken);
        if (invitation is null)
        {
            invitation = new Invitation
            {
                Id = Guid.CreateVersion7(),
                EventId = eventId,
                OrganizationName = string.Empty,
                DateLine = string.Empty,
                VenueLine = string.Empty,
            };
            db.Invitations.Add(invitation);
        }

        var urls = assetIds.ToDictionary(id => id, id => $"/api/public/assets/{id}");
        invitation.DesignJson = JsonSerializer.Serialize(design, DesignJsonOptions);
        invitation.Html = InvitationEmailBuilder.Build(design, urls);
        invitation.ReplyMode = design.AcceptAssetId is not null && design.DeclineAssetId is not null
            ? InvitationReplyMode.Both
            : design.AcceptAssetId is not null
                ? InvitationReplyMode.AcceptOnly
                : design.DeclineAssetId is not null
                    ? InvitationReplyMode.DeclineOnly
                    : InvitationReplyMode.Both;
        invitation.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        await assets.DeleteUnreferencedAsync(eventId, assetIds, cancellationToken);
        return new InvitationTemplateDto(design, invitation.Html, invitation.UpdatedOn);
    }

    public async Task<IReadOnlyList<InvitationResponseDto>> ListResponsesAsync(
        Guid eventId,
        CancellationToken cancellationToken)
    {
        var invitation = await db.Invitations.AsNoTracking()
            .FirstOrDefaultAsync(item => item.EventId == eventId, cancellationToken);
        if (invitation is null)
        {
            return [];
        }

        var responses = await db.InvitationResponses.AsNoTracking()
            .Where(item => item.InvitationId == invitation.Id)
            .OrderByDescending(item => item.CreatedOn)
            .ToListAsync(cancellationToken);

        return responses.Select(ToResponseDto).ToList();
    }

    public async Task<PublicInvitationDto> GetPublicAsync(string slug, CancellationToken cancellationToken)
    {
        var invitation = await FindPublishedAsync(slug, cancellationToken);
        return ToPublicDto(invitation);
    }

    public async Task<InvitationResponseDto> RecordResponseAsync(
        string slug,
        RecordInvitationResponseRequest request,
        CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(responseValidator, request, cancellationToken);
        var invitation = await FindPublishedAsync(slug, cancellationToken);
        EnsureReplyAllowed(invitation.ReplyMode, request.Status);

        var name = request.GuestName.Trim();
        var existing = await db.InvitationResponses
            .FirstOrDefaultAsync(
                item => item.InvitationId == invitation.Id && item.GuestName == name,
                cancellationToken);

        if (existing is null)
        {
            existing = new InvitationResponse
            {
                Id = Guid.CreateVersion7(),
                InvitationId = invitation.Id,
                GuestName = name,
                Status = request.Status,
                CreatedOn = DateTime.UtcNow,
            };
            db.InvitationResponses.Add(existing);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
                return ToResponseDto(existing);
            }
            catch (DbUpdateException exception) when (IsUniqueViolation(exception))
            {
                db.Entry(existing).State = EntityState.Detached;
                existing = await db.InvitationResponses.FirstAsync(
                    item => item.InvitationId == invitation.Id && item.GuestName == name,
                    cancellationToken);
            }
        }

        existing.Status = request.Status;
        existing.GuestName = name;
        existing.CreatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return ToResponseDto(existing);
    }

    private async Task<Invitation> FindPublishedAsync(string slug, CancellationToken cancellationToken)
    {
        var normalized = slug.Trim().ToLowerInvariant();
        var invitation = await db.Invitations
            .Include(item => item.Event)
            .FirstOrDefaultAsync(
                item => item.Event != null && item.Event.Slug == normalized && item.Event.Status == EventStatus.Active,
                cancellationToken);

        if (invitation?.Event is null)
        {
            throw AppException.NotFound("This invitation is not available.");
        }

        return invitation;
    }

    private async Task EnsureEventExistsAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var exists = await db.Events.AsNoTracking().AnyAsync(item => item.Id == eventId, cancellationToken);
        if (!exists)
        {
            throw AppException.NotFound("Event not found.");
        }
    }

    private static void EnsureReplyAllowed(InvitationReplyMode mode, RsvpStatus status)
    {
        var allowed = mode switch
        {
            InvitationReplyMode.AcceptOnly => status == RsvpStatus.Accepted,
            InvitationReplyMode.DeclineOnly => status == RsvpStatus.Declined,
            _ => status is RsvpStatus.Accepted or RsvpStatus.Declined,
        };

        if (!allowed)
        {
            throw AppException.Validation(new Dictionary<string, string[]>
            {
                ["status"] = ["This reply is not open for this invitation."],
            });
        }
    }

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is SqlException sql && sql.Number is 2601 or 2627;

    private static void Apply(Invitation invitation, InvitationWriteRequest request)
    {
        invitation.Addressee = request.Addressee.Trim();
        invitation.PatronageIntro = request.PatronageIntro.Trim();
        invitation.PatronName = request.PatronName.Trim();
        invitation.PatronTitle = request.PatronTitle.Trim();
        invitation.PatronClosing = request.PatronClosing.Trim();
        invitation.HostIntro = request.HostIntro.Trim();
        invitation.HostName = request.HostName.Trim();
        invitation.BodyIntro = request.BodyIntro.Trim();
        invitation.OrganizationName = request.OrganizationName.Trim();
        invitation.OrganizationSubtitle = request.OrganizationSubtitle.Trim();
        invitation.Announcement = request.Announcement.Trim();
        invitation.AttendanceLine = request.AttendanceLine.Trim();
        invitation.DateLine = request.DateLine.Trim();
        invitation.HijriDateLine = request.HijriDateLine.Trim();
        invitation.TimeLine = request.TimeLine.Trim();
        invitation.VenueLine = request.VenueLine.Trim();
        invitation.LocationUrl = string.IsNullOrWhiteSpace(request.LocationUrl) ? null : request.LocationUrl.Trim();
        invitation.RsvpNote = request.RsvpNote.Trim();
        invitation.RsvpDeadline = request.RsvpDeadline.Trim();
        invitation.ReplyMode = request.ReplyMode;
        invitation.AcceptLabel = string.IsNullOrWhiteSpace(request.AcceptLabel) ? "تأكيد" : request.AcceptLabel.Trim();
        invitation.DeclineLabel = string.IsNullOrWhiteSpace(request.DeclineLabel) ? "اعتذار" : request.DeclineLabel.Trim();
    }

    private static InvitationDto ToDto(Invitation invitation) => new(
        invitation.Id,
        invitation.EventId,
        invitation.Addressee,
        invitation.PatronageIntro,
        invitation.PatronName,
        invitation.PatronTitle,
        invitation.PatronClosing,
        invitation.HostIntro,
        invitation.HostName,
        invitation.BodyIntro,
        invitation.OrganizationName,
        invitation.OrganizationSubtitle,
        invitation.Announcement,
        invitation.AttendanceLine,
        invitation.DateLine,
        invitation.HijriDateLine,
        invitation.TimeLine,
        invitation.VenueLine,
        invitation.LocationUrl ?? string.Empty,
        invitation.RsvpNote,
        invitation.RsvpDeadline,
        invitation.ReplyMode,
        invitation.AcceptLabel,
        invitation.DeclineLabel,
        invitation.UpdatedOn);

    private static PublicInvitationDto ToPublicDto(Invitation invitation) => new(
        invitation.Event!.Name,
        invitation.Event.Slug,
        invitation.Addressee,
        invitation.PatronageIntro,
        invitation.PatronName,
        invitation.PatronTitle,
        invitation.PatronClosing,
        invitation.HostIntro,
        invitation.HostName,
        invitation.BodyIntro,
        invitation.OrganizationName,
        invitation.OrganizationSubtitle,
        invitation.Announcement,
        invitation.AttendanceLine,
        invitation.DateLine,
        invitation.HijriDateLine,
        invitation.TimeLine,
        invitation.VenueLine,
        invitation.LocationUrl ?? string.Empty,
        invitation.RsvpNote,
        invitation.RsvpDeadline,
        invitation.ReplyMode,
        invitation.AcceptLabel,
        invitation.DeclineLabel,
        invitation.Html);

    private static InvitationResponseDto ToResponseDto(InvitationResponse response) => new(
        response.Id,
        response.GuestName,
        response.Status,
        response.CreatedOn);
}
