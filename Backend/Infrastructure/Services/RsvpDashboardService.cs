using Entourage.Application;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

public sealed record RsvpReplyDto(
    Guid GuestId,
    string Name,
    string? Position,
    string? Company,
    string? GuestTypeName,
    string Status,
    DateTime? RepliedOn,
    string? DeclineReason);

public sealed record RsvpGroupDto(string Name, int Accepted, int Declined, int Pending);

public sealed record RsvpDashboardDto(
    int Total,
    int Accepted,
    int Declined,
    int Pending,
    bool AskDeclineReason,
    RsvpGroupDto[] Groups,
    RsvpReplyDto[] Replies,
    Guid? ThankYouAssetId = null);

public sealed record RsvpSettingsRequest(bool AskDeclineReason);

/// <param name="AssetId">An uploaded image of this event, or null for the text thank-you.</param>
public sealed record ThankYouImageRequest(Guid? AssetId);

/// <summary>The RSVP dashboard: reply totals, a per-group breakdown and the latest replies with decline reasons.</summary>
public sealed class RsvpDashboardService(AppDbContext db, Entourage.Application.Interfaces.IEventAssetService? assets = null)
{
    public async Task<ThankYouImageRequest> SetThankYouImageAsync(Guid eventId, ThankYouImageRequest request, CancellationToken cancellationToken)
    {
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        if (request.AssetId is Guid assetId && assets is not null)
        {
            await assets.EnsureOwnedAsync(eventId, [assetId], cancellationToken);
        }

        item.ThankYouAssetId = request.AssetId;
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return new ThankYouImageRequest(item.ThankYouAssetId);
    }

    public async Task<RsvpDashboardDto> GetAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var settings = await db.Events.AsNoTracking()
            .Where(item => item.Id == eventId)
            .Select(item => new { item.AskDeclineReason, item.ThankYouAssetId })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        var ask = settings.AskDeclineReason;

        var guests = await db.Guests.AsNoTracking()
            .Where(item => item.EventId == eventId)
            .Select(item => new
            {
                item.Id,
                item.Name,
                item.Position,
                item.GuestGroupId,
                item.GuestTypeId,
                item.RsvpStatus,
                item.RsvpUpdatedOn,
                item.DeclineReason,
            })
            .ToListAsync(cancellationToken);
        var groups = await db.GuestGroups.AsNoTracking().Where(item => item.EventId == eventId).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken);
        var types = await db.GuestTypes.AsNoTracking().Where(item => item.EventId == eventId).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken);

        string StatusOf(string value) => GuestRsvp.IsValid(value) ? value : GuestRsvp.Pending;
        string? GroupOf(Guid? id) => id is Guid value ? groups.GetValueOrDefault(value) : null;

        var breakdown = guests
            .GroupBy(item => GroupOf(item.GuestGroupId) ?? "No group")
            .Select(group => new RsvpGroupDto(
                group.Key,
                group.Count(item => StatusOf(item.RsvpStatus) == GuestRsvp.Accepted),
                group.Count(item => StatusOf(item.RsvpStatus) == GuestRsvp.Declined),
                group.Count(item => StatusOf(item.RsvpStatus) == GuestRsvp.Pending)))
            .OrderBy(group => group.Name == "No group")
            .ThenBy(group => group.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var replies = guests
            .Where(item => StatusOf(item.RsvpStatus) != GuestRsvp.Pending)
            .OrderByDescending(item => item.RsvpUpdatedOn ?? DateTime.MinValue)
            .Take(500)
            .Select(item => new RsvpReplyDto(
                item.Id,
                item.Name,
                item.Position,
                GroupOf(item.GuestGroupId),
                item.GuestTypeId is Guid typeId ? types.GetValueOrDefault(typeId) : null,
                StatusOf(item.RsvpStatus),
                item.RsvpUpdatedOn is DateTime on ? DateTime.SpecifyKind(on, DateTimeKind.Utc) : null,
                item.DeclineReason))
            .ToArray();

        return new RsvpDashboardDto(
            guests.Count,
            guests.Count(item => StatusOf(item.RsvpStatus) == GuestRsvp.Accepted),
            guests.Count(item => StatusOf(item.RsvpStatus) == GuestRsvp.Declined),
            guests.Count(item => StatusOf(item.RsvpStatus) == GuestRsvp.Pending),
            ask,
            breakdown,
            replies,
            settings.ThankYouAssetId);
    }

    public async Task<RsvpSettingsRequest> SaveSettingsAsync(Guid eventId, RsvpSettingsRequest request, CancellationToken cancellationToken)
    {
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        item.AskDeclineReason = request.AskDeclineReason;
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return new RsvpSettingsRequest(item.AskDeclineReason);
    }
}
