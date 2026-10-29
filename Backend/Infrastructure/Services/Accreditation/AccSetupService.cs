using Entourage.Application;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services.Accreditation;

/// <summary>Accreditation events and their setup: zones, access profiles, applicant types, stages, emails.</summary>
public sealed class AccSetupService(AppDbContext db, AccActorResolver actors)
{
    /* ---------------- Events ---------------- */

    public async Task<AccEventSummaryDto[]> ListAsync(CancellationToken cancellationToken)
    {
        var events = await db.AccEvents.AsNoTracking().OrderByDescending(item => item.StartDate).ToListAsync(cancellationToken);
        var result = new List<AccEventSummaryDto>();
        foreach (var item in events)
        {
            result.Add(await SummaryAsync(item, cancellationToken));
        }

        return [.. result];
    }

    public async Task<AccEventSummaryDto> GetAsync(Guid eventId, CancellationToken cancellationToken) =>
        await SummaryAsync(await LoadAsync(eventId, cancellationToken), cancellationToken);

    public async Task<AccEventSummaryDto> CreateAsync(AccEventWriteRequest request, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        var now = DateTime.UtcNow;
        var entity = new AccEvent
        {
            Id = Guid.CreateVersion7(),
            StagesJson = AccJson.Write(AccDefaults.Stages),
            NotificationsJson = AccJson.Write(AccDefaults.Notifications),
            CreatedBy = actor.UserId ?? Guid.Empty,
            CreatedOn = now,
            UpdatedOn = now,
        };
        await ApplyAsync(entity, request, cancellationToken);
        db.AccEvents.Add(entity);

        var order = 0;
        foreach (var (name, fields, documents) in AccDefaults.Types())
        {
            db.AccApplicantTypes.Add(new AccApplicantType
            {
                Id = Guid.CreateVersion7(),
                EventId = entity.Id,
                Name = name,
                FieldsJson = AccJson.Write(fields),
                DocumentsJson = AccJson.Write(documents),
                SortOrder = order++,
            });
        }

        AccAudit.Add(db, entity.Id, null, actor, "Event created", entity.Name);
        await db.SaveChangesAsync(cancellationToken);
        return await SummaryAsync(entity, cancellationToken);
    }

    public async Task<AccEventSummaryDto> UpdateAsync(Guid eventId, AccEventWriteRequest request, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        var entity = await db.AccEvents.FirstOrDefaultAsync(item => item.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Accreditation event not found.");
        var before = entity.Status;
        await ApplyAsync(entity, request, cancellationToken);
        entity.UpdatedOn = DateTime.UtcNow;
        AccAudit.Add(db, entity.Id, null, actor, "Event updated", before != entity.Status ? $"Status {before} → {entity.Status}" : null);
        await db.SaveChangesAsync(cancellationToken);
        return await SummaryAsync(entity, cancellationToken);
    }

    /// <summary>Copies setup (zones, profiles, types, stages, emails) and organisations — not people.</summary>
    public async Task<AccEventSummaryDto> CloneAsync(Guid eventId, AccCloneRequest request, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        var source = await LoadAsync(eventId, cancellationToken);
        var now = DateTime.UtcNow;
        var copy = new AccEvent
        {
            Id = Guid.CreateVersion7(),
            Venue = source.Venue,
            Timezone = source.Timezone,
            StagesJson = source.StagesJson,
            NotificationsJson = source.NotificationsJson,
            PublicApplyEnabled = false,
            CreatedBy = actor.UserId ?? Guid.Empty,
            CreatedOn = now,
            UpdatedOn = now,
        };
        await ApplyAsync(copy, new AccEventWriteRequest(
            request.Name,
            request.Slug,
            source.Venue,
            request.StartDate ?? source.StartDate,
            request.EndDate ?? source.EndDate,
            source.Timezone,
            "Draft",
            false), cancellationToken);
        db.AccEvents.Add(copy);

        var zones = await db.AccZones.AsNoTracking().Where(item => item.EventId == eventId).ToListAsync(cancellationToken);
        var zoneMap = zones.ToDictionary(item => item.Id, _ => Guid.CreateVersion7());
        foreach (var zone in zones)
        {
            db.AccZones.Add(new AccZone { Id = zoneMap[zone.Id], EventId = copy.Id, Code = zone.Code, Name = zone.Name, Color = zone.Color, Capacity = zone.Capacity, SortOrder = zone.SortOrder });
        }

        var profiles = await db.AccAccessProfiles.AsNoTracking().Where(item => item.EventId == eventId).ToListAsync(cancellationToken);
        var profileMap = profiles.ToDictionary(item => item.Id, _ => Guid.CreateVersion7());
        foreach (var profile in profiles)
        {
            var ids = AccJson.Ids(profile.ZoneIdsJson).Where(zoneMap.ContainsKey).Select(id => zoneMap[id]).ToArray();
            db.AccAccessProfiles.Add(new AccAccessProfile { Id = profileMap[profile.Id], EventId = copy.Id, Name = profile.Name, Color = profile.Color, ZoneIdsJson = AccJson.Write(ids), SortOrder = profile.SortOrder });
        }

        var types = await db.AccApplicantTypes.AsNoTracking().Where(item => item.EventId == eventId).ToListAsync(cancellationToken);
        var typeMap = types.ToDictionary(item => item.Id, _ => Guid.CreateVersion7());
        foreach (var type in types)
        {
            db.AccApplicantTypes.Add(new AccApplicantType
            {
                Id = typeMap[type.Id],
                EventId = copy.Id,
                Name = type.Name,
                FieldsJson = type.FieldsJson,
                DocumentsJson = type.DocumentsJson,
                DefaultProfileId = type.DefaultProfileId is { } profileId && profileMap.TryGetValue(profileId, out var mapped) ? mapped : null,
                SortOrder = type.SortOrder,
            });
        }

        var organizations = await db.AccOrganizations.AsNoTracking().Where(item => item.EventId == eventId).ToListAsync(cancellationToken);
        foreach (var organization in organizations)
        {
            db.AccOrganizations.Add(new AccOrganization
            {
                Id = Guid.CreateVersion7(),
                EventId = copy.Id,
                Name = organization.Name,
                ApplicantTypeId = organization.ApplicantTypeId is { } typeId && typeMap.TryGetValue(typeId, out var mappedType) ? mappedType : null,
                ContactName = organization.ContactName,
                ContactEmail = organization.ContactEmail,
                ContactPhone = organization.ContactPhone,
                Quota = organization.Quota,
                CreatedOn = now,
                UpdatedOn = now,
            });
        }

        // Badge templates come along; uploaded logos belong to the old event, so they are left out.
        var templates = await db.AccBadgeTemplates.AsNoTracking().Where(item => item.EventId == eventId).ToListAsync(cancellationToken);
        foreach (var template in templates)
        {
            var design = AccJson.Read(template.DesignJson, AccBadgeService.DefaultDesign());
            design = design with
            {
                BackgroundFileId = null,
                Elements = [.. (design.Elements ?? []).Where(element => element.FileId is null)],
            };
            db.AccBadgeTemplates.Add(new AccBadgeTemplate
            {
                Id = Guid.CreateVersion7(),
                EventId = copy.Id,
                Name = template.Name,
                DesignJson = AccJson.Write(design),
                ApplicantTypeIdsJson = AccJson.Write(AccJson.Ids(template.ApplicantTypeIdsJson).Where(typeMap.ContainsKey).Select(id => typeMap[id]).ToArray()),
                IsDefault = template.IsDefault,
                SortOrder = template.SortOrder,
                UpdatedOn = now,
            });
        }

        AccAudit.Add(db, copy.Id, null, actor, "Event created", $"Cloned from {source.Name}");
        await db.SaveChangesAsync(cancellationToken);
        return await SummaryAsync(copy, cancellationToken);
    }

    private async Task ApplyAsync(AccEvent entity, AccEventWriteRequest request, CancellationToken cancellationToken)
    {
        var errors = new AccErrors();
        var name = AccText.Clean(request.Name, 200);
        if (name is null)
        {
            errors.Add("name", "Enter the event name.");
        }

        var slug = AccText.Slug(string.IsNullOrWhiteSpace(request.Slug) ? request.Name : request.Slug);
        if (slug.Length < 3)
        {
            errors.Add("slug", "Use at least 3 letters or numbers for the link name.");
        }
        else if (await db.AccEvents.AsNoTracking().AnyAsync(item => item.Slug == slug && item.Id != entity.Id, cancellationToken))
        {
            errors.Add("slug", "Another accreditation event already uses this link name.");
        }

        if (request.StartDate is null)
        {
            errors.Add("startDate", "Choose the start date.");
        }

        if (request.EndDate is null)
        {
            errors.Add("endDate", "Choose the end date.");
        }
        else if (request.StartDate is not null && request.EndDate < request.StartDate)
        {
            errors.Add("endDate", "The end date must be on or after the start date.");
        }

        var timezone = AccText.Clean(request.Timezone, 100) ?? "Asia/Dubai";
        if (!TimeZoneInfo.TryFindSystemTimeZoneById(timezone, out _))
        {
            errors.Add("timezone", "Choose a valid time zone.");
        }

        errors.ThrowIfAny();
        entity.Name = name!;
        entity.Slug = slug;
        entity.Venue = AccText.Clean(request.Venue, 200);
        entity.StartDate = request.StartDate!.Value;
        entity.EndDate = request.EndDate!.Value;
        entity.Timezone = timezone;
        entity.Status = AccDefaults.NormalizeStatus(request.Status);
        entity.PublicApplyEnabled = request.PublicApplyEnabled;
    }

    /* ---------------- Setup ---------------- */

    public async Task<AccSetupDto> GetSetupAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var entity = await LoadAsync(eventId, cancellationToken);
        var zones = await db.AccZones.AsNoTracking().Where(item => item.EventId == eventId).OrderBy(item => item.SortOrder).ToListAsync(cancellationToken);
        var profiles = await db.AccAccessProfiles.AsNoTracking().Where(item => item.EventId == eventId).OrderBy(item => item.SortOrder).ToListAsync(cancellationToken);
        var types = await db.AccApplicantTypes.AsNoTracking().Where(item => item.EventId == eventId).OrderBy(item => item.SortOrder).ToListAsync(cancellationToken);
        return new AccSetupDto(
            await SummaryAsync(entity, cancellationToken),
            [.. zones.Select(item => new AccZoneDto(item.Id, item.Code, item.Name, item.Color, item.Capacity))],
            [.. profiles.Select(item => new AccProfileDto(item.Id, item.Name, item.Color, AccJson.Ids(item.ZoneIdsJson)))],
            [.. types.Select(ToTypeDto)],
            Stages(entity),
            Notifications(entity),
            $"/apply/{entity.Slug}");
    }

    public static AccApplicantTypeDto ToTypeDto(AccApplicantType item) =>
        new(item.Id, item.Name, AccJson.Read(item.FieldsJson, Array.Empty<AccFieldDto>()), AccJson.Read(item.DocumentsJson, Array.Empty<AccDocumentRuleDto>()), item.DefaultProfileId);

    public static AccStageDto[] Stages(AccEvent entity)
    {
        var stages = AccJson.Read(entity.StagesJson, Array.Empty<AccStageDto>());
        return stages.Length > 0 ? stages : AccDefaults.Stages;
    }

    public static AccNotificationsDto Notifications(AccEvent entity) =>
        AccJson.Read(entity.NotificationsJson, AccDefaults.Notifications);

    public async Task<AccSetupDto> SaveZonesAsync(Guid eventId, AccZoneDto[] zones, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        await LoadAsync(eventId, cancellationToken);
        var errors = new AccErrors();
        var codes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < zones.Length; index++)
        {
            var zone = zones[index];
            if (string.IsNullOrWhiteSpace(zone.Code) || zone.Code.Trim().Length > 20)
            {
                errors.Add($"zones[{index}].code", "Enter a short code (up to 20 characters).");
            }
            else if (!codes.Add(zone.Code.Trim()))
            {
                errors.Add($"zones[{index}].code", "Each zone needs its own code.");
            }

            if (AccText.Clean(zone.Name, 120) is null)
            {
                errors.Add($"zones[{index}].name", "Enter the zone name.");
            }

            if (!AccText.IsColor(zone.Color))
            {
                errors.Add($"zones[{index}].color", "Choose a colour.");
            }

            if (zone.Capacity is < 0)
            {
                errors.Add($"zones[{index}].capacity", "Capacity cannot be negative.");
            }
        }

        errors.ThrowIfAny();

        var existing = await db.AccZones.Where(item => item.EventId == eventId).ToListAsync(cancellationToken);
        var keep = new HashSet<Guid>();
        for (var index = 0; index < zones.Length; index++)
        {
            var input = zones[index];
            var entity = input.Id is { } id ? existing.FirstOrDefault(item => item.Id == id) : null;
            if (entity is null)
            {
                entity = new AccZone { Id = Guid.CreateVersion7(), EventId = eventId };
                db.AccZones.Add(entity);
            }

            entity.Code = input.Code.Trim();
            entity.Name = AccText.Clean(input.Name, 120)!;
            entity.Color = input.Color;
            entity.Capacity = input.Capacity;
            entity.SortOrder = index;
            keep.Add(entity.Id);
        }

        var removed = existing.Where(item => !keep.Contains(item.Id)).ToList();
        if (removed.Count > 0)
        {
            // Remove the deleted zones from profiles and from applicants' extra zones.
            var removedIds = removed.Select(item => item.Id).ToHashSet();
            foreach (var profile in await db.AccAccessProfiles.Where(item => item.EventId == eventId).ToListAsync(cancellationToken))
            {
                var ids = AccJson.Ids(profile.ZoneIdsJson);
                if (ids.Any(removedIds.Contains))
                {
                    profile.ZoneIdsJson = AccJson.Write(ids.Where(id => !removedIds.Contains(id)).ToArray());
                }
            }

            foreach (var applicant in await db.AccApplicants.Where(item => item.EventId == eventId && item.ExtraZoneIdsJson != "[]").ToListAsync(cancellationToken))
            {
                var ids = AccJson.Ids(applicant.ExtraZoneIdsJson);
                if (ids.Any(removedIds.Contains))
                {
                    applicant.ExtraZoneIdsJson = AccJson.Write(ids.Where(id => !removedIds.Contains(id)).ToArray());
                }
            }

            db.AccZones.RemoveRange(removed);
        }

        AccAudit.Add(db, eventId, null, actor, "Zones updated", $"{zones.Length} zone(s)");
        await db.SaveChangesAsync(cancellationToken);
        return await GetSetupAsync(eventId, cancellationToken);
    }

    public async Task<AccSetupDto> SaveProfilesAsync(Guid eventId, AccProfileDto[] profiles, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        await LoadAsync(eventId, cancellationToken);
        var zoneIds = (await db.AccZones.AsNoTracking().Where(item => item.EventId == eventId).Select(item => item.Id).ToListAsync(cancellationToken)).ToHashSet();
        var errors = new AccErrors();
        for (var index = 0; index < profiles.Length; index++)
        {
            if (AccText.Clean(profiles[index].Name, 120) is null)
            {
                errors.Add($"profiles[{index}].name", "Enter the profile name.");
            }

            if (!AccText.IsColor(profiles[index].Color))
            {
                errors.Add($"profiles[{index}].color", "Choose a colour.");
            }
        }

        errors.ThrowIfAny();

        var existing = await db.AccAccessProfiles.Where(item => item.EventId == eventId).ToListAsync(cancellationToken);
        var keep = new HashSet<Guid>();
        for (var index = 0; index < profiles.Length; index++)
        {
            var input = profiles[index];
            var entity = input.Id is { } id ? existing.FirstOrDefault(item => item.Id == id) : null;
            if (entity is null)
            {
                entity = new AccAccessProfile { Id = Guid.CreateVersion7(), EventId = eventId };
                db.AccAccessProfiles.Add(entity);
            }

            entity.Name = AccText.Clean(input.Name, 120)!;
            entity.Color = input.Color;
            entity.ZoneIdsJson = AccJson.Write((input.ZoneIds ?? []).Where(zoneIds.Contains).Distinct().ToArray());
            entity.SortOrder = index;
            keep.Add(entity.Id);
        }

        var removed = existing.Where(item => !keep.Contains(item.Id)).ToList();
        if (removed.Count > 0)
        {
            var removedIds = removed.Select(item => item.Id).ToList();
            var inUse = await db.AccApplicants.AsNoTracking()
                .CountAsync(item => item.EventId == eventId && item.AccessProfileId != null && removedIds.Contains(item.AccessProfileId.Value), cancellationToken);
            if (inUse > 0)
            {
                throw AccErrors.One("profiles", $"A removed profile is still given to {inUse} applicant(s). Change their access first.");
            }

            foreach (var type in await db.AccApplicantTypes.Where(item => item.EventId == eventId && item.DefaultProfileId != null && removedIds.Contains(item.DefaultProfileId.Value)).ToListAsync(cancellationToken))
            {
                type.DefaultProfileId = null;
            }

            db.AccAccessProfiles.RemoveRange(removed);
        }

        AccAudit.Add(db, eventId, null, actor, "Access profiles updated", $"{profiles.Length} profile(s)");
        await db.SaveChangesAsync(cancellationToken);
        return await GetSetupAsync(eventId, cancellationToken);
    }

    public async Task<AccSetupDto> SaveTypesAsync(Guid eventId, AccApplicantTypeDto[] types, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        await LoadAsync(eventId, cancellationToken);
        var profileIds = (await db.AccAccessProfiles.AsNoTracking().Where(item => item.EventId == eventId).Select(item => item.Id).ToListAsync(cancellationToken)).ToHashSet();
        var errors = new AccErrors();
        string[] fieldTypes = ["text", "textarea", "select", "date", "url"];
        for (var index = 0; index < types.Length; index++)
        {
            var type = types[index];
            if (AccText.Clean(type.Name, 120) is null)
            {
                errors.Add($"types[{index}].name", "Enter the type name.");
            }

            foreach (var field in type.Fields ?? [])
            {
                if (AccText.Clean(field.Label, 120) is null)
                {
                    errors.Add($"types[{index}].fields", "Every field needs a label.");
                }

                if (!fieldTypes.Contains(field.Type))
                {
                    errors.Add($"types[{index}].fields", $"Unknown field type \"{field.Type}\".");
                }

                if (field.Type == "select" && (field.Options is null || field.Options.Count(option => !string.IsNullOrWhiteSpace(option)) == 0))
                {
                    errors.Add($"types[{index}].fields", $"Add options for \"{field.Label}\".");
                }
            }

            foreach (var document in type.Documents ?? [])
            {
                if (AccText.Clean(document.Label, 120) is null)
                {
                    errors.Add($"types[{index}].documents", "Every document needs a label.");
                }
            }
        }

        errors.ThrowIfAny();

        var existing = await db.AccApplicantTypes.Where(item => item.EventId == eventId).ToListAsync(cancellationToken);
        var keep = new HashSet<Guid>();
        for (var index = 0; index < types.Length; index++)
        {
            var input = types[index];
            var entity = input.Id is { } id ? existing.FirstOrDefault(item => item.Id == id) : null;
            if (entity is null)
            {
                entity = new AccApplicantType { Id = Guid.CreateVersion7(), EventId = eventId };
                db.AccApplicantTypes.Add(entity);
            }

            entity.Name = AccText.Clean(input.Name, 120)!;
            entity.FieldsJson = AccJson.Write(CleanFields(input.Fields ?? []));
            entity.DocumentsJson = AccJson.Write(CleanDocuments(input.Documents ?? []));
            entity.DefaultProfileId = input.DefaultProfileId is { } profileId && profileIds.Contains(profileId) ? profileId : null;
            entity.SortOrder = index;
            keep.Add(entity.Id);
        }

        var removed = existing.Where(item => !keep.Contains(item.Id)).ToList();
        if (removed.Count > 0)
        {
            var removedIds = removed.Select(item => item.Id).ToList();
            var inUse = await db.AccApplicants.AsNoTracking()
                .CountAsync(item => item.EventId == eventId && item.ApplicantTypeId != null && removedIds.Contains(item.ApplicantTypeId.Value), cancellationToken);
            if (inUse > 0)
            {
                throw AccErrors.One("types", $"A removed type still has {inUse} applicant(s). Move them to another type first.");
            }

            foreach (var organization in await db.AccOrganizations.Where(item => item.EventId == eventId && item.ApplicantTypeId != null && removedIds.Contains(item.ApplicantTypeId.Value)).ToListAsync(cancellationToken))
            {
                organization.ApplicantTypeId = null;
            }

            db.AccApplicantTypes.RemoveRange(removed);
        }

        AccAudit.Add(db, eventId, null, actor, "Applicant types updated", $"{types.Length} type(s)");
        await db.SaveChangesAsync(cancellationToken);
        return await GetSetupAsync(eventId, cancellationToken);
    }

    private static AccFieldDto[] CleanFields(AccFieldDto[] fields)
    {
        var keys = new HashSet<string>();
        var result = new List<AccFieldDto>();
        foreach (var field in fields)
        {
            var label = AccText.Clean(field.Label, 120)!;
            var key = AccText.Key(string.IsNullOrWhiteSpace(field.Key) ? label : field.Key);
            if (key.Length == 0)
            {
                key = "field";
            }

            var unique = key;
            for (var suffix = 2; !keys.Add(unique); suffix++)
            {
                unique = $"{key}_{suffix}";
            }

            var options = field.Type == "select"
                ? (field.Options ?? []).Select(option => AccText.Clean(option, 120)).OfType<string>().Distinct().Take(50).ToArray()
                : null;
            result.Add(new AccFieldDto(unique, label, field.Type, field.Required, options));
        }

        return [.. result];
    }

    private static AccDocumentRuleDto[] CleanDocuments(AccDocumentRuleDto[] documents)
    {
        var keys = new HashSet<string>();
        var result = new List<AccDocumentRuleDto>();
        foreach (var document in documents)
        {
            var label = AccText.Clean(document.Label, 120)!;
            var key = AccText.Key(string.IsNullOrWhiteSpace(document.Key) ? label : document.Key);
            if (key.Length == 0 || key == "other")
            {
                key = "document";
            }

            var unique = key;
            for (var suffix = 2; !keys.Add(unique); suffix++)
            {
                unique = $"{key}_{suffix}";
            }

            result.Add(new AccDocumentRuleDto(unique, label, document.Required, document.NeedsExpiry));
        }

        return [.. result];
    }

    public async Task<AccSetupDto> SaveStagesAsync(Guid eventId, AccStageDto[] stages, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        var entity = await db.AccEvents.FirstOrDefaultAsync(item => item.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Accreditation event not found.");
        var errors = new AccErrors();
        var cleaned = new List<AccStageDto>();
        var keys = new HashSet<string>();
        foreach (var (stage, index) in stages.Select((item, index) => (item, index)))
        {
            var name = AccText.Clean(stage.Name, 60);
            if (name is null)
            {
                errors.Add($"stages[{index}].name", "Enter the stage name.");
                continue;
            }

            var key = AccText.Key(string.IsNullOrWhiteSpace(stage.Key) ? name : stage.Key);
            if (key.Length == 0 || !keys.Add(key))
            {
                errors.Add($"stages[{index}].name", "Each stage needs its own name.");
                continue;
            }

            var kind = stage.Kind is "approved" or "rejected" ? stage.Kind : "open";
            cleaned.Add(new AccStageDto(key, name, kind, AccText.IsColor(stage.Color) ? stage.Color : "#7a8ea8"));
        }

        if (cleaned.Count == 0 || cleaned[0].Kind != "open")
        {
            errors.Add("stages", "The first stage is where new applications land, so it must be an open (in-review) stage.");
        }

        if (!cleaned.Any(item => item.Kind == "approved"))
        {
            errors.Add("stages", "Add at least one approved stage.");
        }

        if (!cleaned.Any(item => item.Kind == "rejected"))
        {
            errors.Add("stages", "Add at least one rejected stage.");
        }

        errors.ThrowIfAny();

        var removedKeys = Stages(entity).Select(item => item.Key).Except(cleaned.Select(item => item.Key)).ToList();
        if (removedKeys.Count > 0)
        {
            var inUse = await db.AccApplicants.AsNoTracking().CountAsync(item => item.EventId == eventId && removedKeys.Contains(item.StageKey), cancellationToken);
            if (inUse > 0)
            {
                throw AccErrors.One("stages", $"A removed stage still holds {inUse} applicant(s). Move them first.");
            }
        }

        entity.StagesJson = AccJson.Write(cleaned);
        entity.UpdatedOn = DateTime.UtcNow;
        AccAudit.Add(db, eventId, null, actor, "Stages updated", string.Join(" → ", cleaned.Select(item => item.Name)));
        await db.SaveChangesAsync(cancellationToken);
        return await GetSetupAsync(eventId, cancellationToken);
    }

    public async Task<AccSetupDto> SaveNotificationsAsync(Guid eventId, AccNotificationsDto notifications, CancellationToken cancellationToken)
    {
        var actor = await actors.CurrentAsync(cancellationToken);
        var entity = await db.AccEvents.FirstOrDefaultAsync(item => item.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Accreditation event not found.");
        static AccMailTemplateDto Clean(AccMailTemplateDto? template, AccMailTemplateDto fallback) => template is null
            ? fallback
            : new AccMailTemplateDto(
                template.Enabled,
                AccText.Clean(template.Subject, 200) ?? fallback.Subject,
                string.IsNullOrWhiteSpace(template.Body) ? fallback.Body : template.Body.Trim()[..Math.Min(template.Body.Trim().Length, 5000)]);
        entity.NotificationsJson = AccJson.Write(new AccNotificationsDto(
            Clean(notifications.Submitted, AccDefaults.Notifications.Submitted),
            Clean(notifications.Approved, AccDefaults.Notifications.Approved),
            Clean(notifications.Rejected, AccDefaults.Notifications.Rejected)));
        entity.UpdatedOn = DateTime.UtcNow;
        AccAudit.Add(db, eventId, null, actor, "Emails updated");
        await db.SaveChangesAsync(cancellationToken);
        return await GetSetupAsync(eventId, cancellationToken);
    }

    /* ---------------- Overview & audit ---------------- */

    public async Task<AccOverviewDto> OverviewAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var entity = await LoadAsync(eventId, cancellationToken);
        var stages = Stages(entity);
        var applicants = await db.AccApplicants.AsNoTracking().Where(item => item.EventId == eventId)
            .Select(item => new { item.Id, item.StageKey, item.ApplicantTypeId, item.OrganizationId, item.AccessProfileId, item.ExtraZoneIdsJson, item.IdNumberHash, item.FirstName, item.LastName, item.DateOfBirth, item.Email })
            .ToListAsync(cancellationToken);
        var types = await db.AccApplicantTypes.AsNoTracking().Where(item => item.EventId == eventId).OrderBy(item => item.SortOrder).ToListAsync(cancellationToken);
        var organizations = await db.AccOrganizations.AsNoTracking().Where(item => item.EventId == eventId).ToListAsync(cancellationToken);
        var zones = await db.AccZones.AsNoTracking().Where(item => item.EventId == eventId).OrderBy(item => item.SortOrder).ToListAsync(cancellationToken);
        var profiles = await db.AccAccessProfiles.AsNoTracking().Where(item => item.EventId == eventId).ToDictionaryAsync(item => item.Id, item => AccJson.Ids(item.ZoneIdsJson), cancellationToken);
        var approvedKeys = stages.Where(item => item.Kind == "approved").Select(item => item.Key).ToHashSet();

        var used = new Dictionary<Guid, int>();
        foreach (var applicant in applicants.Where(item => approvedKeys.Contains(item.StageKey)))
        {
            var effective = new HashSet<Guid>(AccJson.Ids(applicant.ExtraZoneIdsJson));
            if (applicant.AccessProfileId is { } profileId && profiles.TryGetValue(profileId, out var ids))
            {
                effective.UnionWith(ids);
            }

            foreach (var zoneId in effective)
            {
                used[zoneId] = used.GetValueOrDefault(zoneId) + 1;
            }
        }

        var duplicates = AccDuplicates.Flag(applicants.Select(item => new AccDuplicates.Person(item.Id, item.IdNumberHash, item.FirstName, item.LastName, item.DateOfBirth, item.Email)).ToList());
        var applicantIds = applicants.Select(item => item.Id).ToList();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var documents = await db.AccDocuments.AsNoTracking()
            .Where(item => applicantIds.Contains(item.ApplicantId))
            .Select(item => new { item.Status, item.ExpiresOn })
            .ToListAsync(cancellationToken);

        return new AccOverviewDto(
            await SummaryAsync(entity, cancellationToken),
            [.. stages.Select(stage => new AccCountDto(stage.Key, stage.Name, applicants.Count(item => item.StageKey == stage.Key), stage.Color))],
            [.. types.Select(type => new AccCountDto(type.Id.ToString(), type.Name, applicants.Count(item => item.ApplicantTypeId == type.Id)))
                .Append(new AccCountDto("none", "No type", applicants.Count(item => item.ApplicantTypeId == null)))
                .Where(item => item.Count > 0 || item.Key != "none")],
            [.. organizations.Select(org => new AccCountDto(org.Id.ToString(), org.Name, applicants.Count(item => item.OrganizationId == org.Id)))
                .Append(new AccCountDto("none", "Individual / direct", applicants.Count(item => item.OrganizationId == null)))
                .Where(item => item.Count > 0 || item.Key != "none")
                .OrderByDescending(item => item.Count)],
            [.. zones.Select(zone => new AccZoneUsageDto(zone.Id, zone.Code, zone.Name, zone.Color, zone.Capacity, used.GetValueOrDefault(zone.Id)))],
            duplicates.Count(item => item.Value.Count > 0),
            documents.Count(item => item.Status == "Pending"),
            documents.Count(item => item.ExpiresOn is { } expires && expires < today),
            await AuditAsync(eventId, null, 12, null, cancellationToken));
    }

    public async Task<AccAuditDto[]> AuditAsync(Guid eventId, Guid? applicantId, int take, DateTime? before, CancellationToken cancellationToken)
    {
        var query = db.AccAuditLogs.AsNoTracking().Where(item => item.EventId == eventId);
        if (applicantId is { } id)
        {
            query = query.Where(item => item.ApplicantId == id);
        }

        if (before is { } cutoff)
        {
            query = query.Where(item => item.CreatedOn < cutoff);
        }

        var rows = await query.OrderByDescending(item => item.CreatedOn).Take(Math.Clamp(take, 1, 500)).ToListAsync(cancellationToken);
        var ids = rows.Where(item => item.ApplicantId != null).Select(item => item.ApplicantId!.Value).Distinct().ToList();
        var names = await db.AccApplicants.AsNoTracking().Where(item => ids.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id, item => $"{item.FirstName} {item.LastName}", cancellationToken);
        return [.. rows.Select(item => new AccAuditDto(
            item.Id,
            item.ApplicantId,
            item.ApplicantId is { } applicant && names.TryGetValue(applicant, out var name) ? name : null,
            item.ActorName,
            item.Action,
            item.Detail,
            item.CreatedOn))];
    }

    /* ---------------- Helpers ---------------- */

    public async Task<AccEvent> LoadAsync(Guid eventId, CancellationToken cancellationToken) =>
        await db.AccEvents.AsNoTracking().FirstOrDefaultAsync(item => item.Id == eventId, cancellationToken)
        ?? throw AppException.NotFound("Accreditation event not found.");

    private async Task<AccEventSummaryDto> SummaryAsync(AccEvent entity, CancellationToken cancellationToken)
    {
        var stages = Stages(entity);
        var approved = stages.Where(item => item.Kind == "approved").Select(item => item.Key).ToList();
        var rejected = stages.Where(item => item.Kind == "rejected").Select(item => item.Key).ToList();
        var counts = await db.AccApplicants.AsNoTracking().Where(item => item.EventId == entity.Id)
            .GroupBy(item => item.StageKey)
            .Select(group => new { group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);
        var organizations = await db.AccOrganizations.AsNoTracking().CountAsync(item => item.EventId == entity.Id, cancellationToken);
        var total = counts.Sum(item => item.Count);
        var approvedCount = counts.Where(item => approved.Contains(item.Key)).Sum(item => item.Count);
        var rejectedCount = counts.Where(item => rejected.Contains(item.Key)).Sum(item => item.Count);
        return new AccEventSummaryDto(
            entity.Id,
            entity.Name,
            entity.Slug,
            entity.Venue,
            entity.StartDate,
            entity.EndDate,
            entity.Timezone,
            entity.Status,
            entity.PublicApplyEnabled,
            total,
            total - approvedCount - rejectedCount,
            approvedCount,
            rejectedCount,
            organizations,
            entity.UpdatedOn,
            entity.EventId);
    }

    /* ---------------- Linked to an event ---------------- */

    /// <summary>The accreditation of an event, or null when it has none yet.</summary>
    public async Task<AccEventSummaryDto?> ForEventAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var entity = await db.AccEvents.AsNoTracking().FirstOrDefaultAsync(item => item.EventId == eventId, cancellationToken);
        return entity is null ? null : await SummaryAsync(entity, cancellationToken);
    }

    /// <summary>Starts accreditation for an event, copying its name, dates and time zone. Returns the existing one if already there.</summary>
    public async Task<AccEventSummaryDto> CreateForEventAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var existing = await ForEventAsync(eventId, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var source = await db.Events.AsNoTracking().FirstOrDefaultAsync(item => item.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        var slug = AccText.Slug(source.Slug);
        if (slug.Length < 3)
        {
            slug = AccText.Slug(source.Name);
        }

        // Keep the link name unique among accreditation events.
        var unique = slug;
        for (var suffix = 2; await db.AccEvents.AsNoTracking().AnyAsync(item => item.Slug == unique, cancellationToken); suffix++)
        {
            unique = $"{slug}-{suffix}";
        }

        var created = await CreateAsync(new AccEventWriteRequest(
            source.Name,
            unique,
            null,
            source.StartDate,
            source.EndDate,
            string.IsNullOrWhiteSpace(source.Timezone) ? "Asia/Dubai" : source.Timezone,
            "Draft",
            false), cancellationToken);
        var entity = await db.AccEvents.FirstAsync(item => item.Id == created.Id, cancellationToken);
        entity.EventId = eventId;
        await db.SaveChangesAsync(cancellationToken);
        return created with { EventId = eventId };
    }
}

/// <summary>Duplicate detection: same ID number, same name + date of birth, or same email (within one event).</summary>
public static class AccDuplicates
{
    public sealed record Person(Guid Id, string? IdHash, string FirstName, string LastName, DateOnly? DateOfBirth, string? Email);

    public static Dictionary<Guid, List<(Guid Other, string Reason)>> Flag(IReadOnlyList<Person> people)
    {
        var result = people.ToDictionary(item => item.Id, _ => new List<(Guid, string)>());
        void Link(IEnumerable<IGrouping<string, Person>> groups, string reason)
        {
            foreach (var group in groups.Where(item => item.Count() > 1))
            {
                foreach (var person in group)
                {
                    foreach (var other in group.Where(item => item.Id != person.Id))
                    {
                        result[person.Id].Add((other.Id, reason));
                    }
                }
            }
        }

        Link(people.Where(item => !string.IsNullOrEmpty(item.IdHash)).GroupBy(item => item.IdHash!), "Same ID number");
        Link(people.Where(item => item.DateOfBirth is not null)
            .GroupBy(item => $"{Norm(item.FirstName)}|{Norm(item.LastName)}|{item.DateOfBirth:yyyy-MM-dd}"), "Same name and date of birth");
        Link(people.Where(item => !string.IsNullOrWhiteSpace(item.Email)).GroupBy(item => item.Email!.Trim().ToLowerInvariant()), "Same email");
        return result;
    }

    private static string Norm(string value) => new(value.Where(char.IsLetter).Select(char.ToLowerInvariant).ToArray());
}
