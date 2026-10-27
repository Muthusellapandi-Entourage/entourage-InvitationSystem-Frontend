using System.Security.Cryptography;
using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Domain.Entities;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

public sealed record FrontDeskGuestDto(
    Guid Id,
    string Name,
    string? Position,
    string? Company,
    string? Email,
    string? GuestTypeName,
    string? Seat,
    string RsvpStatus,
    string? DeclineReason,
    int CheckInCount,
    DateTime? FirstCheckedInOn,
    DateTime? LastCheckedInOn,
    DateTime? SeatedOn,
    string CheckInCode = "");

public sealed record FrontDeskTotalsDto(int Guests, int Accepted, int Declined, int Pending, int CheckedIn, int Seated);

/// <param name="Status">"Draft", "Active" or "Archived". Check-in works while Active.</param>
public sealed record FrontDeskDto(string EventName, string Timezone, string Status, FrontDeskTotalsDto Totals, FrontDeskGuestDto[] Guests);

public sealed record FrontDeskShareDto(string? Token);

public sealed record FrontDeskActionResult(string Status, string Message, FrontDeskGuestDto? Guest);

/// <summary>
/// The front-desk dashboard behind a secret link (/live-dashboard/{token}): the full guest list with
/// RSVP and check-in details, plus manual check-in and seating for guests without their E-Badge.
/// </summary>
public sealed class FrontDeskService(AppDbContext db, CheckInService checkIn)
{
    private const string Source = "front desk";

    /* ---------------- link (admin) ---------------- */

    public async Task<FrontDeskShareDto> GetShareAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var token = await db.Events.AsNoTracking().Where(item => item.Id == eventId).Select(item => new { item.FrontDeskToken }).FirstOrDefaultAsync(cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        return new FrontDeskShareDto(token.FrontDeskToken);
    }

    /// <summary>Creates the link, or replaces it so the old one stops working.</summary>
    public async Task<FrontDeskShareDto> RenewShareAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken) ?? throw AppException.NotFound("Event not found.");
        item.FrontDeskToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return new FrontDeskShareDto(item.FrontDeskToken);
    }

    public async Task<FrontDeskShareDto> DisableShareAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken) ?? throw AppException.NotFound("Event not found.");
        item.FrontDeskToken = null;
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return new FrontDeskShareDto(null);
    }

    /* ---------------- dashboard (public) ---------------- */

    public async Task<FrontDeskDto> GetAsync(string token, CancellationToken cancellationToken)
    {
        var item = await FindAsync(token, cancellationToken);
        var guests = await db.Guests.AsNoTracking().Where(guest => guest.EventId == item.Id).OrderBy(guest => guest.Name).ToListAsync(cancellationToken);
        var groups = await db.GuestGroups.AsNoTracking().Where(group => group.EventId == item.Id).ToDictionaryAsync(group => group.Id, group => group.Name, cancellationToken);
        var types = await db.GuestTypes.AsNoTracking().Where(type => type.EventId == item.Id).ToDictionaryAsync(type => type.Id, type => type.Name, cancellationToken);
        var plan = await db.SeatingPlans.AsNoTracking().Where(seating => seating.EventId == item.Id).Select(seating => seating.DesignJson).FirstOrDefaultAsync(cancellationToken);
        var seats = SeatLabels.FromDesignJson(plan);

        var rows = guests.Select(guest => ToDto(guest, groups, types, seats)).ToArray();
        var totals = new FrontDeskTotalsDto(
            rows.Length,
            rows.Count(row => row.RsvpStatus == GuestRsvp.Accepted),
            rows.Count(row => row.RsvpStatus == GuestRsvp.Declined),
            rows.Count(row => row.RsvpStatus == GuestRsvp.Pending),
            rows.Count(row => row.FirstCheckedInOn is not null),
            rows.Count(row => row.SeatedOn is not null));
        return new FrontDeskDto(item.Name, item.Timezone, item.Status.ToString(), totals, rows);
    }

    public async Task<FrontDeskActionResult> CheckInAsync(string token, Guid guestId, CancellationToken cancellationToken)
    {
        var item = await FindAsync(token, cancellationToken);
        var result = await checkIn.CheckInByIdAsync(item.Id, guestId, Source, cancellationToken);
        return new FrontDeskActionResult(result.Status, result.Message, await RowAsync(item.Id, guestId, cancellationToken));
    }

    public async Task<FrontDeskActionResult> MarkSeatedAsync(string token, Guid guestId, CancellationToken cancellationToken)
    {
        var item = await FindAsync(token, cancellationToken);
        if (item.Status != EventStatus.Active)
        {
            return new FrontDeskActionResult(CheckInService.Closed, "The event is not Active.", null);
        }

        await checkIn.MarkSeatedAsync(item.Id, guestId, cancellationToken, Source);
        return new FrontDeskActionResult("Seated", "Marked as seated.", await RowAsync(item.Id, guestId, cancellationToken));
    }

    private async Task<FrontDeskGuestDto?> RowAsync(Guid eventId, Guid guestId, CancellationToken cancellationToken)
    {
        var guest = await db.Guests.AsNoTracking().FirstOrDefaultAsync(item => item.EventId == eventId && item.Id == guestId, cancellationToken);
        if (guest is null)
        {
            return null;
        }

        var groups = guest.GuestGroupId is Guid groupId
            ? await db.GuestGroups.AsNoTracking().Where(item => item.Id == groupId).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken)
            : new Dictionary<Guid, string>();
        var types = guest.GuestTypeId is Guid typeId
            ? await db.GuestTypes.AsNoTracking().Where(item => item.Id == typeId).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken)
            : new Dictionary<Guid, string>();
        var plan = await db.SeatingPlans.AsNoTracking().Where(item => item.EventId == eventId).Select(item => item.DesignJson).FirstOrDefaultAsync(cancellationToken);
        return ToDto(guest, groups, types, SeatLabels.FromDesignJson(plan));
    }

    private static FrontDeskGuestDto ToDto(Guest guest, Dictionary<Guid, string> groups, Dictionary<Guid, string> types, Dictionary<Guid, string> seats) =>
        new(
            guest.Id,
            guest.Name,
            guest.Position,
            guest.GuestGroupId is Guid groupId ? groups.GetValueOrDefault(groupId) : null,
            guest.Email,
            guest.GuestTypeId is Guid typeId ? types.GetValueOrDefault(typeId) : null,
            seats.GetValueOrDefault(guest.Id),
            GuestRsvp.IsValid(guest.RsvpStatus) ? guest.RsvpStatus : GuestRsvp.Pending,
            guest.DeclineReason,
            guest.CheckInCount,
            guest.FirstCheckedInOn,
            guest.LastCheckedInOn,
            guest.SeatedOn,
            guest.CheckInCode);

    /// <summary>The event behind a front-desk link. Not found for an unknown or turned-off link; gone once archived.</summary>
    private async Task<Event> FindAsync(string token, CancellationToken cancellationToken)
    {
        var key = (token ?? string.Empty).Trim().ToLowerInvariant();
        if (key.Length != 32 || !key.All(char.IsAsciiHexDigit))
        {
            throw AppException.NotFound("This front-desk link is not valid.");
        }

        var item = await db.Events.AsNoTracking().FirstOrDefaultAsync(entry => entry.FrontDeskToken == key, cancellationToken)
            ?? throw AppException.NotFound("This front-desk link is not valid or has been turned off.");
        if (item.Status == EventStatus.Archived)
        {
            throw new AppException("This event has ended.", StatusCodes.Status410Gone);
        }

        return item;
    }
}
