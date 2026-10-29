using Entourage.Application;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services.Accreditation;

/* ---------------- DTOs ---------------- */

/// <summary>
/// One element on the badge (millimetres; font size in points). Kinds: fullName, firstName, lastName,
/// organization, jobTitle, applicantType, badgeNumber, nationality, accessProfile, eventName, text,
/// photo, qr, zones, profileBand, rect, image.
/// </summary>
public sealed record AccBadgeElementDto(
    string Id,
    string Kind,
    double X,
    double Y,
    double Width,
    double Height,
    double FontSize,
    string FontWeight,
    string Color,
    string? Fill,
    double Radius,
    string Align,
    string Valign,
    bool Uppercase,
    string? Text,
    string? Font,
    Guid? FileId,
    bool Hidden = false,
    bool Locked = false,
    string? Name = null);

public sealed record AccBadgeDesignDto(double WidthMm, double HeightMm, string BackgroundColor, Guid? BackgroundFileId, AccBadgeElementDto[] Elements);

public sealed record AccBadgeTemplateDto(Guid Id, string Name, AccBadgeDesignDto Design, Guid[] ApplicantTypeIds, bool IsDefault, DateTime UpdatedOn);

public sealed record AccBadgeTemplateWrite(string? Name, AccBadgeDesignDto? Design, Guid[]? ApplicantTypeIds, bool IsDefault);

public sealed record AccBadgeZoneDto(string Code, string Name, string Color);

public sealed record AccPrintRowDto(
    Guid Id,
    string FirstName,
    string LastName,
    Guid? OrganizationId,
    string? Organization,
    Guid? ApplicantTypeId,
    string? ApplicantType,
    string? JobTitle,
    string? Nationality,
    int? BadgeNumber,
    string CredentialCode,
    Guid? PhotoFileId,
    string? AccessProfile,
    string? ProfileColor,
    AccBadgeZoneDto[] Zones,
    Guid? TemplateId,
    int PrintCount,
    DateTime? LastPrintedOn,
    DateTime? CollectedOn,
    string Status);

public sealed record AccPrintQueueDto(string EventName, AccPrintRowDto[] Rows, AccBadgeTemplateDto[] Templates, int ToPrint, int Printed, int Collected);

public sealed record AccIdsRequest(Guid[] Ids);

public sealed record AccCollectedRequest(Guid[] Ids, bool Collected);

public sealed record AccReprintRequest(Guid[] Ids, string? Reason, bool Revoke);

/// <summary>Badge templates, the print queue, reprints (with optional revoke) and collection.</summary>
public sealed class AccBadgeService(AppDbContext db, AccFileService files)
{
    private static readonly string[] Kinds =
    [
        "fullName", "firstName", "lastName", "organization", "jobTitle", "applicantType", "badgeNumber", "nationality",
        "accessProfile", "eventName", "text", "photo", "qr", "zones", "profileBand", "rect", "image",
    ];

    /* ---------------- Templates ---------------- */

    public async Task<AccBadgeTemplateDto[]> TemplatesAsync(Guid eventId, CancellationToken cancellationToken)
    {
        await EnsureEventAsync(eventId, cancellationToken);
        var templates = await db.AccBadgeTemplates.AsNoTracking().Where(item => item.EventId == eventId)
            .OrderBy(item => item.SortOrder).ThenBy(item => item.Name).ToListAsync(cancellationToken);
        return [.. templates.Select(ToDto)];
    }

    private static AccBadgeTemplateDto ToDto(AccBadgeTemplate item) => new(
        item.Id,
        item.Name,
        AccJson.Read(item.DesignJson, DefaultDesign()),
        AccJson.Ids(item.ApplicantTypeIdsJson),
        item.IsDefault,
        item.UpdatedOn);

    public async Task<AccBadgeTemplateDto> CreateAsync(Guid eventId, AccBadgeTemplateWrite request, AccActor actor, CancellationToken cancellationToken)
    {
        await EnsureEventAsync(eventId, cancellationToken);
        var count = await db.AccBadgeTemplates.CountAsync(item => item.EventId == eventId, cancellationToken);
        var entity = new AccBadgeTemplate
        {
            Id = Guid.CreateVersion7(),
            EventId = eventId,
            SortOrder = count,
            UpdatedOn = DateTime.UtcNow,
        };
        // The first template becomes the default so everyone has a badge.
        await ApplyAsync(entity, request with { Design = request.Design ?? DefaultDesign(), IsDefault = request.IsDefault || count == 0 }, cancellationToken);
        db.AccBadgeTemplates.Add(entity);
        AccAudit.Add(db, eventId, null, actor, "Badge template added", entity.Name);
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(entity);
    }

    public async Task<AccBadgeTemplateDto> UpdateAsync(Guid eventId, Guid templateId, AccBadgeTemplateWrite request, AccActor actor, CancellationToken cancellationToken)
    {
        var entity = await db.AccBadgeTemplates.FirstOrDefaultAsync(item => item.Id == templateId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Badge template not found.");
        await ApplyAsync(entity, request with { Design = request.Design ?? AccJson.Read(entity.DesignJson, DefaultDesign()) }, cancellationToken);
        entity.UpdatedOn = DateTime.UtcNow;
        AccAudit.Add(db, eventId, null, actor, "Badge template saved", entity.Name);
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(entity);
    }

    public async Task DeleteAsync(Guid eventId, Guid templateId, AccActor actor, CancellationToken cancellationToken)
    {
        var entity = await db.AccBadgeTemplates.FirstOrDefaultAsync(item => item.Id == templateId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Badge template not found.");
        db.AccBadgeTemplates.Remove(entity);
        if (entity.IsDefault)
        {
            var next = await db.AccBadgeTemplates.Where(item => item.EventId == eventId && item.Id != templateId).OrderBy(item => item.SortOrder).FirstOrDefaultAsync(cancellationToken);
            if (next is not null)
            {
                next.IsDefault = true;
            }
        }

        AccAudit.Add(db, eventId, null, actor, "Badge template removed", entity.Name);
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task ApplyAsync(AccBadgeTemplate entity, AccBadgeTemplateWrite request, CancellationToken cancellationToken)
    {
        var errors = new AccErrors();
        var name = AccText.Clean(request.Name, 120);
        if (name is null)
        {
            errors.Add("name", "Enter a template name.");
        }

        var design = request.Design!;
        if (design.WidthMm is < 20 or > 300 || design.HeightMm is < 20 or > 300)
        {
            errors.Add("design", "The badge must be between 20 and 300 mm on each side.");
        }

        if (!AccText.IsColor(design.BackgroundColor))
        {
            errors.Add("design", "Choose a background colour.");
        }

        var elements = design.Elements ?? [];
        if (elements.Length > 80)
        {
            errors.Add("design", "A badge can hold at most 80 items.");
        }

        foreach (var element in elements)
        {
            if (!Kinds.Contains(element.Kind))
            {
                errors.Add("design", $"Unknown badge item \"{element.Kind}\".");
            }

            if (element.Width <= 0 || element.Height <= 0)
            {
                errors.Add("design", "Every badge item needs a size.");
            }

            if (!AccText.IsColor(element.Color) || (element.Fill is not null && !AccText.IsColor(element.Fill)))
            {
                errors.Add("design", "Use #RRGGBB or #RRGGBBAA colours.");
            }
        }

        errors.ThrowIfAny();
        elements = [.. elements.Select(item => item with { Name = AccText.Clean(item.Name, 80) })];

        var imageIds = elements.Where(item => item.FileId is not null).Select(item => item.FileId!.Value).ToList();
        if (design.BackgroundFileId is { } background)
        {
            imageIds.Add(background);
        }

        foreach (var id in imageIds.Distinct())
        {
            await files.EnsureImageAsync(entity.EventId, id, cancellationToken);
        }

        var typeIds = (await db.AccApplicantTypes.AsNoTracking().Where(item => item.EventId == entity.EventId).Select(item => item.Id).ToListAsync(cancellationToken)).ToHashSet();
        var assigned = (request.ApplicantTypeIds ?? []).Where(typeIds.Contains).Distinct().ToArray();

        // A type uses one template: take it away from the others.
        var others = await db.AccBadgeTemplates.Where(item => item.EventId == entity.EventId && item.Id != entity.Id).ToListAsync(cancellationToken);
        foreach (var other in others)
        {
            var ids = AccJson.Ids(other.ApplicantTypeIdsJson);
            if (ids.Any(assigned.Contains))
            {
                other.ApplicantTypeIdsJson = AccJson.Write(ids.Where(id => !assigned.Contains(id)).ToArray());
            }

            if (request.IsDefault)
            {
                other.IsDefault = false;
            }
        }

        entity.Name = name!;
        entity.DesignJson = AccJson.Write(design with { Elements = elements });
        entity.ApplicantTypeIdsJson = AccJson.Write(assigned);
        entity.IsDefault = request.IsDefault || (entity.IsDefault && !others.Any(item => item.IsDefault));
    }

    /// <summary>A CR80 portrait card (54 × 85.6 mm): header, photo, name, company, role, zones, QR.</summary>
    public static AccBadgeDesignDto DefaultDesign()
    {
        static AccBadgeElementDto Item(string kind, double x, double y, double w, double h, double size = 9, string weight = "regular", string color = "#111111", string? fill = null, string? text = null, bool upper = false) =>
            new(Guid.NewGuid().ToString("N")[..10], kind, x, y, w, h, size, weight, color, fill, 0, "center", "middle", upper, text, null, null);

        return new AccBadgeDesignDto(54, 85.6, "#FFFFFF", null,
        [
            Item("profileBand", 0, 0, 54, 9, 9, "bold", "#FFFFFF", null, null, true),
            Item("eventName", 3, 9.5, 48, 5, 7, "semibold", "#333333"),
            Item("photo", 15, 15.5, 24, 30),
            Item("fullName", 3, 47, 48, 8, 13, "bold"),
            Item("organization", 3, 55, 48, 4.5, 8, "semibold", "#333333"),
            Item("jobTitle", 3, 59.5, 48, 4, 7, "regular", "#555555"),
            Item("zones", 3, 65, 32, 17.5, 14, "bold", "#FFFFFF"),
            Item("qr", 37, 66.5, 14, 14),
            Item("badgeNumber", 37, 80.5, 14, 3.5, 6, "semibold", "#555555"),
        ]);
    }

    /* ---------------- Print queue ---------------- */

    public async Task<AccPrintQueueDto> QueueAsync(Guid eventId, string? status, Guid? organizationId, Guid? typeId, string? search, CancellationToken cancellationToken)
    {
        var accEvent = await db.AccEvents.AsNoTracking().FirstOrDefaultAsync(item => item.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Accreditation event not found.");
        var approved = AccSetupService.Stages(accEvent).Where(item => item.Kind == "approved").Select(item => item.Key).ToList();
        var query = db.AccApplicants.AsNoTracking().Where(item => item.EventId == eventId && approved.Contains(item.StageKey));
        if (organizationId is { } org)
        {
            query = org == Guid.Empty ? query.Where(item => item.OrganizationId == null) : query.Where(item => item.OrganizationId == org);
        }

        if (typeId is { } type)
        {
            query = query.Where(item => item.ApplicantTypeId == type);
        }

        var applicants = await query.ToListAsync(cancellationToken);
        var templates = await TemplatesAsync(eventId, cancellationToken);
        var organizations = await db.AccOrganizations.AsNoTracking().Where(item => item.EventId == eventId).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken);
        var types = await db.AccApplicantTypes.AsNoTracking().Where(item => item.EventId == eventId).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken);
        var profiles = await db.AccAccessProfiles.AsNoTracking().Where(item => item.EventId == eventId).ToDictionaryAsync(item => item.Id, cancellationToken);
        var zones = await db.AccZones.AsNoTracking().Where(item => item.EventId == eventId).OrderBy(item => item.SortOrder).ToListAsync(cancellationToken);
        var defaultTemplate = templates.FirstOrDefault(item => item.IsDefault)?.Id ?? templates.FirstOrDefault()?.Id;

        var rows = applicants.Select(item =>
        {
            var effective = new HashSet<Guid>(AccJson.Ids(item.ExtraZoneIdsJson));
            AccAccessProfile? profile = null;
            if (item.AccessProfileId is { } profileId && profiles.TryGetValue(profileId, out profile))
            {
                effective.UnionWith(AccJson.Ids(profile.ZoneIdsJson));
            }

            var template = item.ApplicantTypeId is { } typeKey
                ? templates.FirstOrDefault(entry => entry.ApplicantTypeIds.Contains(typeKey))?.Id ?? defaultTemplate
                : defaultTemplate;
            var rowStatus = item.LastPrintedOn is null ? "ToPrint" : item.CollectedOn is null ? "Printed" : "Collected";
            return new AccPrintRowDto(
                item.Id,
                item.FirstName,
                item.LastName,
                item.OrganizationId,
                item.OrganizationId is { } orgKey && organizations.TryGetValue(orgKey, out var orgName) ? orgName : null,
                item.ApplicantTypeId,
                item.ApplicantTypeId is { } typeName && types.TryGetValue(typeName, out var name) ? name : null,
                item.JobTitle,
                item.Nationality,
                item.BadgeNumber,
                item.CredentialCode,
                item.PhotoFileId,
                profile?.Name,
                profile?.Color,
                [.. zones.Where(zone => effective.Contains(zone.Id)).Select(zone => new AccBadgeZoneDto(zone.Code, zone.Name, zone.Color))],
                template,
                item.PrintCount,
                item.LastPrintedOn,
                item.CollectedOn,
                rowStatus);
        }).ToList();

        var toPrint = rows.Count(item => item.Status == "ToPrint");
        var printed = rows.Count(item => item.Status == "Printed");
        var collected = rows.Count(item => item.Status == "Collected");

        if (!string.IsNullOrWhiteSpace(status) && status != "All")
        {
            rows = rows.Where(item => item.Status == status).ToList();
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(item =>
                $"{item.FirstName} {item.LastName}".Contains(term, StringComparison.OrdinalIgnoreCase)
                || (item.Organization?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false)
                || item.BadgeNumber?.ToString() == term).ToList();
        }

        // Grouped by organisation, then name: badges come off the printer in hand-out order.
        rows = rows.OrderBy(item => item.Organization ?? "~").ThenBy(item => item.LastName).ThenBy(item => item.FirstName).ToList();
        return new AccPrintQueueDto(accEvent.Name, [.. rows], templates, toPrint, printed, collected);
    }

    public async Task<int> MarkPrintedAsync(Guid eventId, Guid[] ids, AccActor actor, CancellationToken cancellationToken)
    {
        var applicants = await LoadAsync(eventId, ids, cancellationToken);
        var now = DateTime.UtcNow;
        foreach (var applicant in applicants)
        {
            applicant.PrintCount++;
            applicant.LastPrintedOn = now;
            applicant.UpdatedOn = now;
            AccAudit.Add(db, eventId, applicant.Id, actor, "Badge printed", applicant.PrintCount > 1 ? $"Print #{applicant.PrintCount}" : null);
        }

        await db.SaveChangesAsync(cancellationToken);
        return applicants.Count;
    }

    public async Task<int> SetCollectedAsync(Guid eventId, Guid[] ids, bool collected, AccActor actor, CancellationToken cancellationToken)
    {
        var applicants = await LoadAsync(eventId, ids, cancellationToken);
        var now = DateTime.UtcNow;
        var changed = 0;
        foreach (var applicant in applicants)
        {
            if (collected && applicant.LastPrintedOn is null)
            {
                continue;
            }

            applicant.CollectedOn = collected ? now : null;
            applicant.UpdatedOn = now;
            AccAudit.Add(db, eventId, applicant.Id, actor, collected ? "Badge collected" : "Badge collection undone");
            changed++;
        }

        await db.SaveChangesAsync(cancellationToken);
        return changed;
    }

    /// <summary>Puts badges back in the queue. With revoke, the old badge code stops working (lost / stolen).</summary>
    public async Task<int> ReprintAsync(Guid eventId, Guid[] ids, string? reason, bool revoke, AccActor actor, CancellationToken cancellationToken)
    {
        var cleanReason = AccText.Clean(reason, 500) ?? throw AccErrors.One("reason", "Say why the badge is reprinted (e.g. lost, damaged, name change).");
        var applicants = await LoadAsync(eventId, ids, cancellationToken);
        var now = DateTime.UtcNow;
        foreach (var applicant in applicants)
        {
            if (revoke)
            {
                Revoke(applicant, cleanReason, now);
            }

            applicant.LastPrintedOn = null;
            applicant.CollectedOn = null;
            applicant.UpdatedOn = now;
            AccAudit.Add(db, eventId, applicant.Id, actor, revoke ? "Badge cancelled for reprint" : "Reprint requested", cleanReason);
        }

        await db.SaveChangesAsync(cancellationToken);
        return applicants.Count;
    }

    /// <summary>Retires the current badge code and issues a new one.</summary>
    public void Revoke(AccApplicant applicant, string reason, DateTime now)
    {
        db.AccRevokedCredentials.Add(new AccRevokedCredential
        {
            Id = Guid.CreateVersion7(),
            EventId = applicant.EventId,
            ApplicantId = applicant.Id,
            Code = applicant.CredentialCode,
            Reason = reason.Length <= 500 ? reason : reason[..500],
            RevokedOn = now,
        });
        applicant.CredentialCode = AccTokens.Credential();
    }

    private async Task<List<AccApplicant>> LoadAsync(Guid eventId, Guid[] ids, CancellationToken cancellationToken)
    {
        var list = (ids ?? []).Distinct().ToList();
        if (list.Count == 0)
        {
            throw AccErrors.One("ids", "Select at least one badge.");
        }

        return await db.AccApplicants.Where(item => item.EventId == eventId && list.Contains(item.Id)).ToListAsync(cancellationToken);
    }

    private async Task EnsureEventAsync(Guid eventId, CancellationToken cancellationToken)
    {
        if (!await db.AccEvents.AsNoTracking().AnyAsync(item => item.Id == eventId, cancellationToken))
        {
            throw AppException.NotFound("Accreditation event not found.");
        }
    }
}
