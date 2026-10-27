using System.Text.Json;
using System.Text.Json.Nodes;
using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Application.Validation;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

public sealed class GuestGroupService(
    AppDbContext db,
    IValidator<SaveGuestGroupRequest> saveValidator,
    IValidator<MoveGuestsToGroupRequest> moveValidator,
    IValidator<GuestIdsRequest> guestIdsValidator,
    IValidator<SetGuestRsvpRequest> rsvpValidator,
    IValidator<LogGuestActivityRequest> activityValidator) : IGuestGroupService
{
    public async Task<GuestActivityDto?> SetRsvpAsync(Guid eventId, Guid guestId, SetGuestRsvpRequest request, CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(rsvpValidator, request, cancellationToken);
        var guest = await FindGuestAsync(eventId, guestId, cancellationToken);
        var previous = GuestRsvp.IsValid(guest.RsvpStatus) ? guest.RsvpStatus : GuestRsvp.Pending;
        if (previous == request.Status)
        {
            return null;
        }

        var now = DateTime.UtcNow;
        guest.RsvpStatus = request.Status;
        guest.RsvpUpdatedOn = now;
        guest.UpdatedOn = now;
        var activity = new GuestActivity
        {
            Id = Guid.CreateVersion7(),
            GuestId = guest.Id,
            Kind = GuestActivityKinds.StatusChanged,
            Detail = $"{previous} → {request.Status} (by admin)",
            CreatedOn = now,
        };
        db.GuestActivities.Add(activity);
        await db.SaveChangesAsync(cancellationToken);
        return ToActivityDto(activity);
    }

    public async Task<IReadOnlyList<GuestActivityDto>> ListActivityAsync(Guid eventId, Guid guestId, CancellationToken cancellationToken)
    {
        await FindGuestAsync(eventId, guestId, cancellationToken);
        var items = await db.GuestActivities.AsNoTracking()
            .Where(item => item.GuestId == guestId)
            .OrderByDescending(item => item.CreatedOn)
            .Take(200)
            .ToListAsync(cancellationToken);
        return items.Select(ToActivityDto).ToList();
    }

    public async Task<GuestActivityDto> LogActivityAsync(Guid eventId, Guid guestId, LogGuestActivityRequest request, CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(activityValidator, request, cancellationToken);
        await FindGuestAsync(eventId, guestId, cancellationToken);
        var activity = new GuestActivity
        {
            Id = Guid.CreateVersion7(),
            GuestId = guestId,
            Kind = request.Kind,
            Detail = string.IsNullOrWhiteSpace(request.Detail) ? null : request.Detail.Trim(),
            CreatedOn = DateTime.UtcNow,
        };
        db.GuestActivities.Add(activity);
        await db.SaveChangesAsync(cancellationToken);
        return ToActivityDto(activity);
    }

    private async Task<Guest> FindGuestAsync(Guid eventId, Guid guestId, CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        return await db.Guests.FirstOrDefaultAsync(item => item.Id == guestId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Guest not found on this event.");
    }

    private static GuestActivityDto ToActivityDto(GuestActivity item) =>
        new(item.Id, item.Kind, item.Detail, DateTime.SpecifyKind(item.CreatedOn, DateTimeKind.Utc));

    public async Task<IReadOnlyList<GuestGroupDto>> ListAsync(Guid eventId, CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        var groups = await db.GuestGroups.AsNoTracking()
            .Where(item => item.EventId == eventId)
            .OrderBy(item => item.Name)
            .ToListAsync(cancellationToken);
        var counts = await db.Guests.AsNoTracking()
            .Where(item => item.EventId == eventId && item.GuestGroupId != null)
            .GroupBy(item => item.GuestGroupId)
            .Select(group => new { Id = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);
        var byGroup = counts.ToDictionary(item => item.Id!.Value, item => item.Count);
        return groups.Select(group => ToDto(group, byGroup.GetValueOrDefault(group.Id))).ToList();
    }

    public async Task<GuestGroupDto> CreateAsync(Guid eventId, SaveGuestGroupRequest request, CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        await ValidationGuard.EnsureValidAsync(saveValidator, request, cancellationToken);
        var name = request.Name.Trim();
        await EnsureNameAvailableAsync(eventId, name, null, cancellationToken);
        var now = DateTime.UtcNow;
        var group = new GuestGroup
        {
            Id = Guid.CreateVersion7(),
            EventId = eventId,
            Name = name,
            CreatedOn = now,
            UpdatedOn = now,
        };
        db.GuestGroups.Add(group);
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(group, 0);
    }

    public async Task<GuestGroupDto> RenameAsync(Guid eventId, Guid groupId, SaveGuestGroupRequest request, CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(saveValidator, request, cancellationToken);
        var group = await FindAsync(eventId, groupId, cancellationToken);
        var name = request.Name.Trim();
        await EnsureNameAvailableAsync(eventId, name, group.Id, cancellationToken);
        group.Name = name;
        group.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        var count = await db.Guests.CountAsync(item => item.GuestGroupId == group.Id, cancellationToken);
        return ToDto(group, count);
    }

    public async Task<DeleteGuestGroupResult> DeleteAsync(Guid eventId, Guid groupId, bool deleteGuests, CancellationToken cancellationToken)
    {
        var group = await FindAsync(eventId, groupId, cancellationToken);
        var members = await db.Guests.Where(item => item.EventId == eventId && item.GuestGroupId == group.Id).ToListAsync(cancellationToken);
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        if (deleteGuests && members.Count > 0)
        {
            await ClearSeatsAsync(eventId, members.Select(item => item.Id).ToHashSet(), cancellationToken);
            db.Guests.RemoveRange(members);
        }
        else
        {
            foreach (var guest in members)
            {
                guest.GuestGroupId = null;
                guest.UpdatedOn = DateTime.UtcNow;
            }
        }

        // Save the guest changes first so the group is no longer referenced when it is removed.
        await db.SaveChangesAsync(cancellationToken);
        db.GuestGroups.Remove(group);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var deleted = deleteGuests ? members.Count : 0;
        var ungrouped = deleteGuests ? 0 : members.Count;
        var message = members.Count == 0
            ? $"Deleted {group.Name}."
            : deleteGuests
                ? $"Deleted {group.Name} and its {Plural(deleted, "guest")}."
                : $"Deleted {group.Name}. {Plural(ungrouped, "guest")} kept, now without a group.";
        return new DeleteGuestGroupResult(group.Name, deleted, ungrouped, message);
    }

    public async Task<int> MoveGuestsAsync(Guid eventId, MoveGuestsToGroupRequest request, CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(moveValidator, request, cancellationToken);
        await EnsureEventExistsAsync(eventId, cancellationToken);
        if (request.GuestGroupId is Guid targetId)
        {
            await FindAsync(eventId, targetId, cancellationToken);
        }

        var ids = request.GuestIds.Distinct().ToArray();
        var guests = await db.Guests.Where(item => item.EventId == eventId && ids.Contains(item.Id)).ToListAsync(cancellationToken);
        if (guests.Count != ids.Length)
        {
            throw AppException.NotFound("One or more guests are not on this event.");
        }

        foreach (var guest in guests)
        {
            guest.GuestGroupId = request.GuestGroupId;
            guest.UpdatedOn = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(cancellationToken);
        return guests.Count;
    }

    public async Task<DeleteGuestsResult> DeleteGuestsAsync(Guid eventId, GuestIdsRequest request, CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(guestIdsValidator, request, cancellationToken);
        await EnsureEventExistsAsync(eventId, cancellationToken);
        var ids = request.GuestIds.Distinct().ToArray();
        // Deleting is idempotent: guests that are already gone (a second click, another tab, a list
        // that was not refreshed yet) are simply skipped instead of failing the whole request.
        var guests = await db.Guests.Where(item => item.EventId == eventId && ids.Contains(item.Id)).ToListAsync(cancellationToken);
        var alreadyGone = ids.Length - guests.Count;
        if (guests.Count == 0)
        {
            return new DeleteGuestsResult(0, 0, ids.Length == 1 ? "This guest was already deleted." : "These guests were already deleted.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var cleared = await ClearSeatsAsync(eventId, guests.Select(item => item.Id).ToHashSet(), cancellationToken);
        // Invitation and badge history rows are removed by the database (cascade on GuestId).
        db.Guests.RemoveRange(guests);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        var message = guests.Count == 1 ? $"Deleted {guests[0].Name}." : $"Deleted {Plural(guests.Count, "guest")}.";
        if (alreadyGone > 0)
        {
            message += $" {Plural(alreadyGone, "guest")} had already been deleted.";
        }

        return new DeleteGuestsResult(guests.Count, cleared, message);
    }

    /// <summary>
    /// Empties every chair in the event's saved seating plan that points at one of these guests.
    /// The plan is JSON (layouts → arrangements → seats → guestId); everything else is left as is.
    /// </summary>
    private async Task<int> ClearSeatsAsync(Guid eventId, HashSet<Guid> guestIds, CancellationToken cancellationToken)
    {
        var plan = await db.SeatingPlans.FirstOrDefaultAsync(item => item.EventId == eventId, cancellationToken);
        if (plan is null || string.IsNullOrWhiteSpace(plan.DesignJson))
        {
            return 0;
        }

        JsonNode? root;
        try
        {
            root = JsonNode.Parse(plan.DesignJson);
        }
        catch (JsonException)
        {
            return 0;
        }

        var cleared = 0;
        foreach (var layout in Items(root?["layouts"]))
        {
            foreach (var arrangement in Items(layout?["arrangements"]))
            {
                foreach (var seat in Items(arrangement?["seats"]))
                {
                    if (seat is not JsonObject chair)
                    {
                        continue;
                    }

                    if (chair["guestId"] is JsonValue raw
                        && raw.TryGetValue<string>(out var value)
                        && Guid.TryParse(value, out var guestId)
                        && guestIds.Contains(guestId))
                    {
                        chair["guestId"] = null;
                        cleared += 1;
                    }
                }
            }
        }

        if (cleared > 0)
        {
            plan.DesignJson = root!.ToJsonString();
            plan.UpdatedOn = DateTime.UtcNow;
        }

        return cleared;
    }

    private static IEnumerable<JsonNode?> Items(JsonNode? node) => node as JsonArray ?? [];

    private async Task EnsureNameAvailableAsync(Guid eventId, string name, Guid? exceptId, CancellationToken cancellationToken)
    {
        var key = name.Trim().ToLowerInvariant();
        var taken = await db.GuestGroups.AnyAsync(
            item => item.EventId == eventId && item.Id != exceptId && item.Name.ToLower() == key,
            cancellationToken);
        if (taken)
        {
            throw AppException.Conflict("A group with this name already exists on the event.", "name", "Choose a different name.");
        }
    }

    private async Task<GuestGroup> FindAsync(Guid eventId, Guid groupId, CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        var group = await db.GuestGroups.FirstOrDefaultAsync(item => item.Id == groupId && item.EventId == eventId, cancellationToken);
        return group ?? throw AppException.NotFound("Group not found on this event.");
    }

    private async Task EnsureEventExistsAsync(Guid eventId, CancellationToken cancellationToken)
    {
        if (!await db.Events.AsNoTracking().AnyAsync(item => item.Id == eventId, cancellationToken))
        {
            throw AppException.NotFound("Event not found.");
        }
    }

    private static GuestGroupDto ToDto(GuestGroup group, int count) => new(group.Id, group.Name, count, group.CreatedOn, group.UpdatedOn);

    private static string Plural(int count, string noun) => $"{count} {noun}{(count == 1 ? "" : "s")}";
}
