using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services.Accreditation;

/* ---------------- DTOs ---------------- */

/// <param name="ZoneId">The zone this gate controls; null = venue entrance (any approved badge).</param>
/// <param name="AllowGuests">Mixed entrance: invitation guests are checked in here too (entrance only).</param>
public sealed record AccScanRequest(string? Code, Guid? ZoneId, string? GateName, string? Direction, bool AllowGuests);

public sealed record AccScanPersonDto(
    Guid Id,
    string Name,
    string? Organization,
    string? JobTitle,
    string? ApplicantType,
    int? BadgeNumber,
    Guid? PhotoFileId,
    string? AccessProfile,
    string? ProfileColor,
    AccBadgeZoneDto[] Zones);

/// <param name="Result">"green", "yellow" or "red".</param>
/// <param name="Reason">granted, wrong_zone, unknown, revoked, not_approved, guest, guest_repeat, guest_not_allowed, closed.</param>
/// <param name="Guest">Set when an invitation guest was scanned at a mixed entrance.</param>
public sealed record AccScanResultDto(
    string Result,
    string Reason,
    string Title,
    string Message,
    AccScanPersonDto? Person,
    CheckInGuestDto? Guest,
    string GateLabel,
    DateTime ScannedOn);

public sealed record AccScanRowDto(
    Guid Id,
    string Result,
    string Reason,
    string? Name,
    string? Organization,
    string GateName,
    string? ZoneCode,
    string Direction,
    string ScannedByName,
    DateTime ScannedOn);

public sealed record AccLiveZoneDto(Guid? Id, string Code, string Name, string Color, int? Capacity, int Inside);

public sealed record AccHourDto(DateTime Hour, int Granted, int Denied);

public sealed record AccLiveDto(
    int OnSite,
    AccLiveZoneDto[] Zones,
    int ScansToday,
    int GrantedToday,
    int WrongZoneToday,
    int DeniedToday,
    AccHourDto[] Hours,
    AccScanRowDto[] Recent);

/// <summary>
/// Gate scanning (online): a badge code is checked against the gate's zone and gets green / yellow / red.
/// At a mixed entrance, invitation guests are checked in through the invitation system's own check-in.
/// Every scan is logged.
/// </summary>
public sealed class AccScanService(AppDbContext db, CheckInService guestCheckIn)
{
    public async Task<AccScanResultDto> ScanAsync(Guid eventId, AccScanRequest request, AccActor actor, CancellationToken cancellationToken)
    {
        var accEvent = await db.AccEvents.AsNoTracking().FirstOrDefaultAsync(item => item.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Accreditation event not found.");
        var zone = request.ZoneId is { } zoneId
            ? await db.AccZones.AsNoTracking().FirstOrDefaultAsync(item => item.Id == zoneId && item.EventId == eventId, cancellationToken)
                ?? throw AccErrors.One("zoneId", "This zone no longer exists. Set the gate up again.")
            : null;
        var gateName = AccText.Clean(request.GateName, 80) ?? (zone is null ? "Entrance" : $"{zone.Code} · {zone.Name}");
        var gateLabel = zone is null ? "Venue entrance" : $"Zone {zone.Code} · {zone.Name}";
        var direction = request.Direction == "out" ? "out" : "in";
        var raw = request.Code?.Trim() ?? string.Empty;
        var now = DateTime.UtcNow;

        AccScanResultDto Log(string result, string reason, string title, string message, AccScanPersonDto? person = null, CheckInGuestDto? guest = null, Guid? applicantId = null)
        {
            db.AccScanLogs.Add(new AccScanLog
            {
                Id = Guid.CreateVersion7(),
                EventId = eventId,
                ApplicantId = applicantId ?? person?.Id,
                Code = raw.Length <= 64 ? raw : raw[..64],
                ZoneId = zone?.Id,
                GateName = gateName,
                Direction = direction,
                Result = result,
                Reason = reason,
                ScannedBy = actor.UserId,
                ScannedByName = actor.Name.Length <= 200 ? actor.Name : actor.Name[..200],
                ScannedOn = now,
            });
            return new AccScanResultDto(result, reason, title, message, person, guest, gateLabel, now);
        }

        if (raw.Length == 0)
        {
            return new AccScanResultDto("red", "unknown", "Nothing scanned", "Scan the QR code on the badge.", null, null, gateLabel, now);
        }

        if (accEvent.Status == "Archived")
        {
            var closed = Log("red", "closed", "Scanning is closed", "This accreditation event is finished.");
            await db.SaveChangesAsync(cancellationToken);
            return closed;
        }

        var code = NormalizeCredential(raw);
        var applicant = code is null
            ? null
            : await db.AccApplicants.AsNoTracking().FirstOrDefaultAsync(item => item.EventId == eventId && item.CredentialCode == code, cancellationToken);

        AccScanResultDto result;
        if (applicant is not null)
        {
            var person = await PersonAsync(eventId, applicant, cancellationToken);
            var stage = AccSetupService.Stages(accEvent).FirstOrDefault(item => item.Key == applicant.StageKey);
            if (stage?.Kind != "approved")
            {
                result = Log("red", "not_approved", "Not approved",
                    stage?.Kind == "rejected" ? "This accreditation was rejected. Do not allow entry." : $"This accreditation is not approved yet ({stage?.Name ?? applicant.StageKey}).",
                    person);
            }
            else if (zone is not null && !person.Zones.Any(item => item.Code == zone.Code))
            {
                result = Log("yellow", "wrong_zone", "Wrong zone",
                    person.Zones.Length == 0
                        ? $"Valid badge, but no zone access. This gate is {gateLabel}."
                        : $"Valid badge, but not for {gateLabel}. Allowed: {string.Join(", ", person.Zones.Select(item => $"{item.Code} {item.Name}"))}.",
                    person);
            }
            else
            {
                result = Log("green", "granted", direction == "out" ? "Exit recorded" : "Access granted", $"{person.Name}{(person.Organization is null ? string.Empty : $" · {person.Organization}")}", person);
            }
        }
        else if (code is not null && await db.AccRevokedCredentials.AsNoTracking().FirstOrDefaultAsync(item => item.EventId == eventId && item.Code == code, cancellationToken) is { } revoked)
        {
            var holder = await db.AccApplicants.AsNoTracking().FirstOrDefaultAsync(item => item.Id == revoked.ApplicantId, cancellationToken);
            var person = holder is null ? null : await PersonAsync(eventId, holder, cancellationToken);
            result = Log("red", "revoked", "Badge cancelled", $"This badge was cancelled ({revoked.Reason}). Keep the badge and call the accreditation desk.", person, null, revoked.ApplicantId);
        }
        else
        {
            result = await GuestAsync(accEvent, zone, request.AllowGuests, raw, gateName, Log, cancellationToken);
        }

        await db.SaveChangesAsync(cancellationToken);
        return result;
    }

    /// <summary>A code that is not a badge: maybe an invitation guest of the linked event.</summary>
    private async Task<AccScanResultDto> GuestAsync(
        AccEvent accEvent,
        AccZone? zone,
        bool allowGuests,
        string raw,
        string gateName,
        Func<string, string, string, string, AccScanPersonDto?, CheckInGuestDto?, Guid?, AccScanResultDto> log,
        CancellationToken cancellationToken)
    {
        var guestCode = CheckInService.ReadCode(raw);
        var isGuest = accEvent.EventId is { } linkedEventId && guestCode is not null
            && await db.Guests.AsNoTracking().AnyAsync(item => item.EventId == linkedEventId && (item.CheckInCode == guestCode || item.InviteToken == guestCode), cancellationToken);
        if (!isGuest)
        {
            return log("red", "unknown", "Unknown badge", "This code is not an accreditation badge for this event. Do not allow entry.", null, null, null);
        }

        if (zone is not null)
        {
            return log("yellow", "guest_not_allowed", "Guest invitation", $"This is an invited guest, not staff. Guests may not enter Zone {zone.Code} · {zone.Name}.", null, null, null);
        }

        if (!allowGuests)
        {
            return log("yellow", "guest_not_allowed", "Guest invitation", "This is an invited guest. Send them to the guest entrance.", null, null, null);
        }

        // Mixed entrance: the invitation system checks the guest in and keeps its own history.
        var checkIn = await guestCheckIn.ScanAsync(accEvent.EventId!.Value, new CheckInScanRequest(raw), cancellationToken, $"gate: {gateName}");
        return checkIn.Status switch
        {
            CheckInService.CheckedIn => log("green", "guest", "Guest checked in", checkIn.Guest?.Name ?? checkIn.Message, null, checkIn.Guest, null),
            CheckInService.AlreadyCheckedIn => log("yellow", "guest_repeat", "Guest already checked in", checkIn.Message, null, checkIn.Guest, null),
            _ => log("red", "unknown", "Guest check-in failed", checkIn.Message, null, checkIn.Guest, null),
        };
    }

    /// <summary>Badge codes are 12 characters, upper case; scanners may add spaces or lower-case them.</summary>
    private static string? NormalizeCredential(string raw)
    {
        var value = raw.Trim();
        var slash = value.LastIndexOf('/');
        if (slash >= 0 && slash < value.Length - 1)
        {
            value = value[(slash + 1)..];
        }

        var cleaned = new string(value.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());
        return cleaned.Length is >= 6 and <= 32 ? cleaned : null;
    }

    private async Task<AccScanPersonDto> PersonAsync(Guid eventId, AccApplicant applicant, CancellationToken cancellationToken)
    {
        var effective = new HashSet<Guid>(AccJson.Ids(applicant.ExtraZoneIdsJson));
        AccAccessProfile? profile = null;
        if (applicant.AccessProfileId is { } profileId)
        {
            profile = await db.AccAccessProfiles.AsNoTracking().FirstOrDefaultAsync(item => item.Id == profileId, cancellationToken);
            if (profile is not null)
            {
                effective.UnionWith(AccJson.Ids(profile.ZoneIdsJson));
            }
        }

        var zones = await db.AccZones.AsNoTracking().Where(item => item.EventId == eventId).OrderBy(item => item.SortOrder).ToListAsync(cancellationToken);
        var organization = applicant.OrganizationId is { } orgId
            ? await db.AccOrganizations.AsNoTracking().Where(item => item.Id == orgId).Select(item => item.Name).FirstOrDefaultAsync(cancellationToken)
            : null;
        var type = applicant.ApplicantTypeId is { } typeId
            ? await db.AccApplicantTypes.AsNoTracking().Where(item => item.Id == typeId).Select(item => item.Name).FirstOrDefaultAsync(cancellationToken)
            : null;
        return new AccScanPersonDto(
            applicant.Id,
            $"{applicant.FirstName} {applicant.LastName}",
            organization,
            applicant.JobTitle,
            type,
            applicant.BadgeNumber,
            applicant.PhotoFileId,
            profile?.Name,
            profile?.Color,
            [.. zones.Where(item => effective.Contains(item.Id)).Select(item => new AccBadgeZoneDto(item.Code, item.Name, item.Color))]);
    }

    /* ---------------- Live monitor ---------------- */

    public async Task<AccLiveDto> LiveAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var accEvent = await db.AccEvents.AsNoTracking().FirstOrDefaultAsync(item => item.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Accreditation event not found.");
        var zones = await db.AccZones.AsNoTracking().Where(item => item.EventId == eventId).OrderBy(item => item.SortOrder).ToListAsync(cancellationToken);

        // Who is inside: each person's latest granted scan per gate zone decides in / out.
        var grantedScans = await db.AccScanLogs.AsNoTracking()
            .Where(item => item.EventId == eventId && item.Result == "green" && item.ApplicantId != null)
            .Select(item => new { item.ApplicantId, item.ZoneId, item.Direction, item.ScannedOn })
            .ToListAsync(cancellationToken);
        var inside = grantedScans
            .GroupBy(item => (item.ApplicantId, item.ZoneId))
            .Select(group => group.MaxBy(item => item.ScannedOn)!)
            .Where(item => item.Direction == "in")
            .ToList();

        var timezone = TimeZoneInfo.TryFindSystemTimeZoneById(accEvent.Timezone, out var found) ? found : TimeZoneInfo.Utc;
        var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, timezone);
        var dayStart = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(localNow.Date, DateTimeKind.Unspecified), timezone);
        var today = await db.AccScanLogs.AsNoTracking()
            .Where(item => item.EventId == eventId && item.ScannedOn >= dayStart)
            .Select(item => new { item.Result, item.Reason, item.ScannedOn })
            .ToListAsync(cancellationToken);

        var hourStart = DateTime.UtcNow.AddHours(-11);
        hourStart = new DateTime(hourStart.Year, hourStart.Month, hourStart.Day, hourStart.Hour, 0, 0, DateTimeKind.Utc);
        var recentHours = await db.AccScanLogs.AsNoTracking()
            .Where(item => item.EventId == eventId && item.ScannedOn >= hourStart)
            .Select(item => new { item.Result, item.ScannedOn })
            .ToListAsync(cancellationToken);
        var hours = Enumerable.Range(0, 12).Select(index =>
        {
            var from = hourStart.AddHours(index);
            var slice = recentHours.Where(item => item.ScannedOn >= from && item.ScannedOn < from.AddHours(1)).ToList();
            return new AccHourDto(from, slice.Count(item => item.Result == "green"), slice.Count(item => item.Result != "green"));
        }).ToArray();

        var recentRows = await db.AccScanLogs.AsNoTracking().Where(item => item.EventId == eventId)
            .OrderByDescending(item => item.ScannedOn).Take(50).ToListAsync(cancellationToken);
        var ids = recentRows.Where(item => item.ApplicantId != null).Select(item => item.ApplicantId!.Value).Distinct().ToList();
        var people = await db.AccApplicants.AsNoTracking().Where(item => ids.Contains(item.Id))
            .Select(item => new { item.Id, Name = item.FirstName + " " + item.LastName, item.OrganizationId })
            .ToListAsync(cancellationToken);
        var organizations = await db.AccOrganizations.AsNoTracking().Where(item => item.EventId == eventId).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken);
        var zoneCodes = zones.ToDictionary(item => item.Id, item => item.Code);

        var recent = recentRows.Select(item =>
        {
            var person = people.FirstOrDefault(entry => entry.Id == item.ApplicantId);
            return new AccScanRowDto(
                item.Id,
                item.Result,
                item.Reason,
                person?.Name ?? (item.Reason is "guest" or "guest_repeat" ? "Invited guest" : null),
                person?.OrganizationId is { } orgId && organizations.TryGetValue(orgId, out var orgName) ? orgName : null,
                item.GateName,
                item.ZoneId is { } zoneId && zoneCodes.TryGetValue(zoneId, out var code) ? code : null,
                item.Direction,
                item.ScannedByName,
                item.ScannedOn);
        }).ToArray();

        // On site = people whose latest entrance scan is "in", or who are inside any zone.
        var onSite = inside.Select(item => item.ApplicantId).Distinct().Count();
        var zoneRows = new List<AccLiveZoneDto>
        {
            new(null, "—", "Venue entrance", "#7A8EA8", null, inside.Count(item => item.ZoneId == null)),
        };
        zoneRows.AddRange(zones.Select(zone => new AccLiveZoneDto(zone.Id, zone.Code, zone.Name, zone.Color, zone.Capacity, inside.Count(item => item.ZoneId == zone.Id))));

        return new AccLiveDto(
            onSite,
            [.. zoneRows],
            today.Count,
            today.Count(item => item.Result == "green"),
            today.Count(item => item.Reason == "wrong_zone"),
            today.Count(item => item.Result == "red"),
            hours,
            recent);
    }
}
