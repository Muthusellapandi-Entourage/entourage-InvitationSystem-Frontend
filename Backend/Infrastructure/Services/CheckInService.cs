using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Domain.Entities;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

/// <summary>
/// Door check-in: a scanned E-Badge (its check-in code) checks the guest in, and staff can then
/// mark the guest as seated. Every scan and seating is kept in the guest's activity history.
/// </summary>
public sealed class CheckInService(AppDbContext db)
{
    public const string CheckedIn = "CheckedIn";
    public const string AlreadyCheckedIn = "AlreadyCheckedIn";
    public const string NotFound = "NotFound";
    public const string Invalid = "Invalid";
    /// <summary>The event is not Active (draft or archived), so the door is closed.</summary>
    public const string Closed = "Closed";

    /// <param name="source">Where the scan happened when it was not the door scanner, e.g. "front desk" or "self check-in".</param>
    public async Task<CheckInResultDto> ScanAsync(Guid eventId, CheckInScanRequest request, CancellationToken cancellationToken, string? source = null)
    {
        var status = await EventStatusAsync(eventId, cancellationToken);
        if (status != EventStatus.Active)
        {
            return new CheckInResultDto(
                Closed,
                status == EventStatus.Draft
                    ? "Check-in is closed: this event is still being set up (not Live yet). Make the event Live to open the door."
                    : "Check-in is closed: this event is finished.",
                null);
        }

        var code = ReadCode(request.Code);
        if (code is null)
        {
            return new CheckInResultDto(Invalid, "Nothing was scanned. Scan the QR code on the guest's digital pass.", null);
        }

        var guest = await db.Guests
            .FirstOrDefaultAsync(item => item.EventId == eventId && (item.CheckInCode == code || item.InviteToken == code), cancellationToken);
        if (guest is null)
        {
            return new CheckInResultDto(NotFound, "Guest not found. This badge is not on the guest list for this event.", null);
        }

        return await RecordAsync(guest, source, cancellationToken);
    }

    /// <summary>Checks a guest in by hand (front desk), for a guest without their E-Badge.</summary>
    public async Task<CheckInResultDto> CheckInByIdAsync(Guid eventId, Guid guestId, string source, CancellationToken cancellationToken)
    {
        if (await EventStatusAsync(eventId, cancellationToken) != EventStatus.Active)
        {
            return new CheckInResultDto(Closed, "Check-in is closed: the event is not Live.", null);
        }

        var guest = await db.Guests.FirstOrDefaultAsync(item => item.EventId == eventId && item.Id == guestId, cancellationToken);
        return guest is null
            ? new CheckInResultDto(NotFound, "Guest not found.", null)
            : await RecordAsync(guest, source, cancellationToken);
    }

    /// <param name="source">Who checked the guest in when it was not a scan, e.g. "front desk".</param>
    private async Task<CheckInResultDto> RecordAsync(Guest guest, string? source, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var first = guest.FirstCheckedInOn is null;
        guest.CheckInCount += 1;
        guest.FirstCheckedInOn ??= now;
        guest.LastCheckedInOn = now;
        guest.UpdatedOn = now;
        var detail = first ? "First check-in" : $"Scan {guest.CheckInCount}";
        GuestActivityLog.Add(db, guest.Id, GuestActivityKinds.CheckedIn, source is null ? detail : $"{detail} · {source}", now);
        await db.SaveChangesAsync(cancellationToken);

        return new CheckInResultDto(
            first ? CheckedIn : AlreadyCheckedIn,
            first ? "Checked in." : $"Already checked in ({guest.CheckInCount} check-ins).",
            await ToDtoAsync(guest, cancellationToken));
    }

    public async Task<CheckInGuestDto> MarkSeatedAsync(Guid eventId, Guid guestId, CancellationToken cancellationToken, string? source = null)
    {
        var guest = await db.Guests.FirstOrDefaultAsync(item => item.EventId == eventId && item.Id == guestId, cancellationToken)
            ?? throw AppException.NotFound("Guest not found.");
        if (guest.FirstCheckedInOn is null)
        {
            throw AppException.Validation(new Dictionary<string, string[]> { ["guest"] = ["Check the guest in before marking them as seated."] });
        }

        if (guest.SeatedOn is null)
        {
            var now = DateTime.UtcNow;
            guest.SeatedOn = now;
            guest.UpdatedOn = now;
            GuestActivityLog.Add(db, guest.Id, GuestActivityKinds.Seated, source, now);
            await db.SaveChangesAsync(cancellationToken);
        }

        return await ToDtoAsync(guest, cancellationToken);
    }

    /// <summary>Totals and the latest door scans (newest first) for the live attendance board.</summary>
    public async Task<LiveAttendanceDto> LiveAsync(Guid eventId, int take, CancellationToken cancellationToken)
    {
        await EventStatusAsync(eventId, cancellationToken);
        take = Math.Clamp(take, 1, 500);
        var total = await db.Guests.CountAsync(item => item.EventId == eventId, cancellationToken);
        var checkedIn = await db.Guests.CountAsync(item => item.EventId == eventId && item.FirstCheckedInOn != null, cancellationToken);
        var seated = await db.Guests.CountAsync(item => item.EventId == eventId && item.SeatedOn != null, cancellationToken);

        var scans = await (
                from activity in db.GuestActivities.AsNoTracking()
                join guest in db.Guests.AsNoTracking() on activity.GuestId equals guest.Id
                where guest.EventId == eventId && activity.Kind == GuestActivityKinds.CheckedIn
                orderby activity.CreatedOn descending, activity.Id descending
                select new
                {
                    activity.Id,
                    GuestId = guest.Id,
                    guest.Name,
                    guest.Position,
                    guest.GuestGroupId,
                    guest.GuestTypeId,
                    guest.CheckInCode,
                    activity.Detail,
                    guest.SeatedOn,
                    activity.CreatedOn,
                })
            .Take(take)
            .ToListAsync(cancellationToken);

        var groupIds = scans.Where(item => item.GuestGroupId.HasValue).Select(item => item.GuestGroupId!.Value).Distinct().ToArray();
        var typeIds = scans.Where(item => item.GuestTypeId.HasValue).Select(item => item.GuestTypeId!.Value).Distinct().ToArray();
        var groups = await db.GuestGroups.AsNoTracking().Where(item => groupIds.Contains(item.Id)).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken);
        var types = await db.GuestTypes.AsNoTracking().Where(item => typeIds.Contains(item.Id)).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken);
        var plan = await db.SeatingPlans.AsNoTracking().Where(item => item.EventId == eventId).Select(item => item.DesignJson).FirstOrDefaultAsync(cancellationToken);
        var seats = SeatLabels.FromDesignJson(plan);

        return new LiveAttendanceDto(
            total,
            checkedIn,
            seated,
            scans.Select(item => new LiveScanDto(
                item.Id,
                item.GuestId,
                item.Name,
                item.Position,
                item.GuestGroupId is Guid groupId ? groups.GetValueOrDefault(groupId) : null,
                item.GuestTypeId is Guid typeId ? types.GetValueOrDefault(typeId) : null,
                item.CheckInCode,
                item.Detail != null && item.Detail.StartsWith("First check-in", StringComparison.Ordinal),
                item.SeatedOn != null,
                DateTime.SpecifyKind(item.CreatedOn, DateTimeKind.Utc),
                seats.GetValueOrDefault(item.GuestId))).ToArray());
    }

    /* ---------------- Read-only viewer link ---------------- */

    public async Task<LiveShareDto> GetShareAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await db.Events.AsNoTracking().FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        return new LiveShareDto(item.LiveShareToken);
    }

    /// <summary>Turns the viewer link on, or replaces it (the old link stops working).</summary>
    public async Task<LiveShareDto> RenewShareAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        item.LiveShareToken = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return new LiveShareDto(item.LiveShareToken);
    }

    public async Task<LiveShareDto> DisableShareAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        item.LiveShareToken = null;
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return new LiveShareDto(null);
    }

    /// <summary>The board for a viewer link. Not found for an unknown or turned-off link, gone once the event is archived.</summary>
    public async Task<PublicLiveAttendanceDto> PublicLiveAsync(string token, CancellationToken cancellationToken)
    {
        var key = (token ?? string.Empty).Trim().ToLowerInvariant();
        if (key.Length != 32 || !key.All(char.IsAsciiHexDigit))
        {
            throw AppException.NotFound("This live attendance link is not valid.");
        }

        var item = await db.Events.AsNoTracking().FirstOrDefaultAsync(entry => entry.LiveShareToken == key, cancellationToken)
            ?? throw AppException.NotFound("This live attendance link is not valid or has been turned off.");
        if (item.Status == EventStatus.Archived)
        {
            throw new AppException("This event has ended.", StatusCodes.Status410Gone);
        }

        var live = await LiveAsync(item.Id, 200, cancellationToken);
        return new PublicLiveAttendanceDto(item.Name, item.Timezone, item.Status.ToString(), live);
    }

    /// <summary>
    /// Accepts the badge's check-in code, a GUID (with or without dashes) or a link that carries one
    /// as uniqueId=, code= or g=. Returns the lower-case code, or null when nothing usable was read.
    /// </summary>
    public static string? ReadCode(string? raw)
    {
        var value = raw?.Trim();
        if (string.IsNullOrEmpty(value) || value.Length > 2048)
        {
            return null;
        }

        if (Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https")
        {
            var query = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(uri.Query);
            value = new[] { "uniqueId", "uniqueid", "code", "g" }
                .Select(key => query.TryGetValue(key, out var found) ? found.ToString() : null)
                .FirstOrDefault(found => !string.IsNullOrWhiteSpace(found))?.Trim();
            if (string.IsNullOrEmpty(value))
            {
                return null;
            }
        }

        if (Guid.TryParse(value, out var guid))
        {
            return guid.ToString("N");
        }

        value = value.ToLowerInvariant();
        return value.Length is >= 8 and <= 64 && value.All(char.IsAsciiLetterOrDigit) ? value : null;
    }

    private async Task<CheckInGuestDto> ToDtoAsync(Guest guest, CancellationToken cancellationToken)
    {
        var company = guest.GuestGroupId is Guid groupId
            ? await db.GuestGroups.AsNoTracking().Where(item => item.Id == groupId).Select(item => item.Name).FirstOrDefaultAsync(cancellationToken)
            : null;
        var typeName = guest.GuestTypeId is Guid typeId
            ? await db.GuestTypes.AsNoTracking().Where(item => item.Id == typeId).Select(item => item.Name).FirstOrDefaultAsync(cancellationToken)
            : null;
        var kinds = new[] { GuestActivityKinds.CheckedIn, GuestActivityKinds.Seated };
        var history = (await db.GuestActivities.AsNoTracking()
                .Where(item => item.GuestId == guest.Id && kinds.Contains(item.Kind))
                .Select(item => new { item.Kind, item.CreatedOn })
                .ToListAsync(cancellationToken))
            .OrderByDescending(item => item.CreatedOn)
            .Take(50)
            .Select(item => new CheckInHistoryItemDto(item.Kind, DateTime.SpecifyKind(item.CreatedOn, DateTimeKind.Utc)))
            .ToArray();

        return new CheckInGuestDto(
            guest.Id,
            guest.Name,
            company,
            guest.Position,
            typeName,
            GuestRsvp.IsValid(guest.RsvpStatus) ? guest.RsvpStatus : GuestRsvp.Pending,
            guest.CheckInCount,
            guest.FirstCheckedInOn,
            guest.LastCheckedInOn,
            guest.SeatedOn,
            history);
    }

    private async Task<EventStatus> EventStatusAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var found = await db.Events.AsNoTracking()
            .Where(item => item.Id == eventId)
            .Select(item => (EventStatus?)item.Status)
            .FirstOrDefaultAsync(cancellationToken);
        return found ?? throw AppException.NotFound("Event not found.");
    }
}
