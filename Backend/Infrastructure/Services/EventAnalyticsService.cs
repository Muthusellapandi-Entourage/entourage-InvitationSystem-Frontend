using System.Text.Json;
using Entourage.Application;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

/// <summary>One guest as a row of the analytics dataset. The dashboard filters and groups these in the browser.</summary>
public sealed record AnalyticsGuestDto(
    Guid Id,
    string Name,
    string? Position,
    bool HasEmail,
    string GuestType,
    string Group,
    string Rsvp,
    DateTime? RsvpOn,
    string? DeclineReason,
    DateTime AddedOn,
    int InvitationCount,
    DateTime? FirstInvitedOn,
    DateTime? LastInvitedOn,
    int EmailCount,
    int ReminderCount,
    int EmailFailures,
    DateTime? LastEmailedOn,
    int BadgeCount,
    int CheckInCount,
    DateTime? FirstCheckInOn,
    DateTime? LastCheckInOn,
    DateTime? SeatedOn,
    string? Table,
    string? Seat);

/// <summary>A table (or seat block) on the active floor: chairs and how many have a guest.</summary>
public sealed record AnalyticsTableDto(string Name, string Kind, int Capacity, int Assigned);

/// <summary>One timestamped event in a guest's history (emails, replies, check-ins…).</summary>
public sealed record AnalyticsActivityDto(Guid GuestId, string Kind, DateTime On, string? Detail);

public sealed record EventAnalyticsDto(
    string EventName,
    string Status,
    DateOnly StartDate,
    DateOnly EndDate,
    string Timezone,
    DateTime GeneratedOn,
    IReadOnlyList<AnalyticsGuestDto> Guests,
    IReadOnlyList<AnalyticsTableDto> Tables,
    IReadOnlyList<AnalyticsActivityDto> Activities);

/// <summary>
/// Builds the event's analytics dataset: every guest with invitation, email, RSVP, badge, seat and
/// check-in facts, the tables on the active floor, and the activity timeline.
/// </summary>
public sealed class EventAnalyticsService(AppDbContext db)
{
    private static readonly string[] TimelineKinds =
    [
        GuestActivityKinds.InvitationRecorded,
        GuestActivityKinds.InvitationEmailed,
        GuestActivityKinds.ReminderEmailed,
        GuestActivityKinds.EmailFailed,
        GuestActivityKinds.StatusChanged,
        GuestActivityKinds.BadgeGenerated,
        GuestActivityKinds.CheckedIn,
        GuestActivityKinds.Seated,
    ];

    public async Task<EventAnalyticsDto> GetAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await db.Events.AsNoTracking().FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("The event was not found.");

        var guests = await db.Guests.AsNoTracking().Where(guest => guest.EventId == eventId).ToListAsync(cancellationToken);
        var ids = guests.Select(guest => guest.Id).ToList();
        var types = await db.GuestTypes.AsNoTracking().Where(type => type.EventId == eventId).ToDictionaryAsync(type => type.Id, type => type.Name, cancellationToken);
        var groups = await db.GuestGroups.AsNoTracking().Where(group => group.EventId == eventId).ToDictionaryAsync(group => group.Id, group => group.Name, cancellationToken);

        var invitations = await db.GuestInvitationIssues.AsNoTracking()
            .Where(issue => ids.Contains(issue.GuestId))
            .GroupBy(issue => issue.GuestId)
            .Select(group => new { GuestId = group.Key, Count = group.Count(), First = group.Min(issue => issue.IssuedOn), Last = group.Max(issue => issue.IssuedOn) })
            .ToDictionaryAsync(entry => entry.GuestId, cancellationToken);
        var badges = await db.GuestBadgeIssues.AsNoTracking()
            .Where(issue => ids.Contains(issue.GuestId))
            .GroupBy(issue => issue.GuestId)
            .Select(group => new { GuestId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(entry => entry.GuestId, entry => entry.Count, cancellationToken);

        var activities = await db.GuestActivities.AsNoTracking()
            .Where(activity => ids.Contains(activity.GuestId) && TimelineKinds.Contains(activity.Kind))
            .OrderBy(activity => activity.CreatedOn)
            .Select(activity => new AnalyticsActivityDto(activity.GuestId, activity.Kind, activity.CreatedOn, activity.Detail))
            .ToListAsync(cancellationToken);
        var byGuest = activities.ToLookup(activity => activity.GuestId);

        var planJson = await db.SeatingPlans.AsNoTracking().Where(plan => plan.EventId == eventId).Select(plan => plan.DesignJson).FirstOrDefaultAsync(cancellationToken);
        var seatLabels = SeatLabels.FromDesignJson(planJson);
        var tables = ReadTables(planJson);

        var rows = guests
            .OrderBy(guest => guest.Name)
            .Select(guest =>
            {
                var history = byGuest[guest.Id].ToList();
                var emails = history.Where(activity => activity.Kind == GuestActivityKinds.InvitationEmailed).ToList();
                var reminders = history.Where(activity => activity.Kind == GuestActivityKinds.ReminderEmailed).ToList();
                var lastEmail = emails.Concat(reminders).Select(activity => (DateTime?)activity.On).DefaultIfEmpty().Max();
                invitations.TryGetValue(guest.Id, out var invited);
                var label = seatLabels.GetValueOrDefault(guest.Id);
                var (table, seat) = SplitSeat(label);
                return new AnalyticsGuestDto(
                    guest.Id,
                    guest.Name,
                    guest.Position,
                    !string.IsNullOrWhiteSpace(guest.Email),
                    guest.GuestTypeId is Guid typeId && types.TryGetValue(typeId, out var typeName) ? typeName : "No guest type",
                    guest.GuestGroupId is Guid groupId && groups.TryGetValue(groupId, out var groupName) ? groupName : "No group",
                    guest.RsvpStatus,
                    guest.RsvpUpdatedOn,
                    guest.DeclineReason,
                    guest.CreatedOn,
                    invited?.Count ?? 0,
                    invited?.First,
                    invited?.Last,
                    emails.Count,
                    reminders.Count,
                    history.Count(activity => activity.Kind == GuestActivityKinds.EmailFailed),
                    lastEmail,
                    badges.GetValueOrDefault(guest.Id),
                    guest.CheckInCount,
                    guest.FirstCheckedInOn,
                    guest.LastCheckedInOn,
                    guest.SeatedOn,
                    table,
                    seat);
            })
            .ToList();

        return new EventAnalyticsDto(item.Name, item.Status.ToString(), item.StartDate, item.EndDate, item.Timezone, DateTime.UtcNow, rows, tables, activities);
    }

    /// <summary>"Table 1 · Seat 7" → ("Table 1", "7"); "Block A · Row 2 · Seat 14" → ("Block A", "Row 2 · 14").</summary>
    private static (string? Table, string? Seat) SplitSeat(string? label)
    {
        if (string.IsNullOrWhiteSpace(label))
        {
            return (null, null);
        }

        var parts = label.Split(" · ");
        var seat = parts[^1].StartsWith("Seat ", StringComparison.Ordinal) ? parts[^1][5..] : parts[^1];
        return parts.Length switch
        {
            1 => (label, null),
            2 => (parts[0], seat),
            _ => (parts[0], $"{string.Join(" · ", parts[1..^1])} · {seat}"),
        };
    }

    /// <summary>Tables and seat blocks on the active floor with chair and assigned counts (the stage is left out).</summary>
    private static List<AnalyticsTableDto> ReadTables(string? json)
    {
        var tables = new List<AnalyticsTableDto>();
        if (string.IsNullOrWhiteSpace(json))
        {
            return tables;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("layouts", out var layouts) || layouts.ValueKind != JsonValueKind.Array)
            {
                return tables;
            }

            var activeId = Text(root, "activeLayoutId");
            JsonElement? layout = null;
            foreach (var entry in layouts.EnumerateArray())
            {
                if (entry.ValueKind != JsonValueKind.Object) continue;
                layout ??= entry;
                if (activeId is not null && Text(entry, "id") == activeId)
                {
                    layout = entry;
                    break;
                }
            }

            if (layout is not { } floor || !floor.TryGetProperty("arrangements", out var arrangements) || arrangements.ValueKind != JsonValueKind.Array)
            {
                return tables;
            }

            foreach (var arrangement in arrangements.EnumerateArray())
            {
                if (arrangement.ValueKind != JsonValueKind.Object) continue;
                var kind = Text(arrangement, "kind") ?? "round";
                if (kind == "stage") continue;
                var capacity = 0;
                var assigned = 0;
                if (arrangement.TryGetProperty("seats", out var seats) && seats.ValueKind == JsonValueKind.Array)
                {
                    foreach (var seat in seats.EnumerateArray())
                    {
                        capacity++;
                        if (Guid.TryParse(Text(seat, "guestId"), out _)) assigned++;
                    }
                }

                var name = Text(arrangement, "name")?.Trim();
                tables.Add(new AnalyticsTableDto(string.IsNullOrEmpty(name) ? "Table" : name, kind, capacity, assigned));
            }
        }
        catch (JsonException)
        {
            // A damaged plan shows no tables rather than failing the dashboard.
        }

        return tables;
    }

    private static string? Text(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
