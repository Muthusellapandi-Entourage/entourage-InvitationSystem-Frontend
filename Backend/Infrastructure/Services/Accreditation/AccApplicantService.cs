using Entourage.Application;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services.Accreditation;

/// <summary>
/// Applicants: create (staff, portal, bulk, public), edit, vet through the pipeline, access, documents,
/// duplicates and capacity warnings. Every change is written to the audit log.
/// </summary>
public sealed class AccApplicantService(AppDbContext db, AccIdProtector ids, AccFileService files, AccNotifier notifier)
{
    /* ---------------- Read ---------------- */

    public async Task<AccApplicantRowDto[]> ListAsync(
        Guid eventId,
        string? stage,
        Guid? organizationId,
        Guid? typeId,
        string? search,
        bool duplicatesOnly,
        CancellationToken cancellationToken)
    {
        var query = db.AccApplicants.AsNoTracking().Where(item => item.EventId == eventId);
        if (!string.IsNullOrWhiteSpace(stage))
        {
            query = query.Where(item => item.StageKey == stage);
        }

        if (organizationId is { } org)
        {
            query = org == Guid.Empty ? query.Where(item => item.OrganizationId == null) : query.Where(item => item.OrganizationId == org);
        }

        if (typeId is { } type)
        {
            query = query.Where(item => item.ApplicantTypeId == type);
        }

        var rows = await RowsAsync(eventId, query, cancellationToken);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(item =>
                $"{item.FirstName} {item.LastName}".Contains(term, StringComparison.OrdinalIgnoreCase)
                || (item.Email?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false)
                || (item.Organization?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false)
                || (item.JobTitle?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false)
                || (item.BadgeNumber?.ToString() == term)
                || (item.IdNumberMasked?.EndsWith(term, StringComparison.OrdinalIgnoreCase) ?? false)).ToArray();
        }

        if (duplicatesOnly)
        {
            rows = rows.Where(item => item.DuplicateCount > 0).ToArray();
        }

        return rows;
    }

    /// <summary>Rows for a query, with names, duplicate counts (checked across the whole event) and pending documents.</summary>
    public async Task<AccApplicantRowDto[]> RowsAsync(Guid eventId, IQueryable<AccApplicant> query, CancellationToken cancellationToken)
    {
        var applicants = await query.OrderByDescending(item => item.SubmittedOn).ToListAsync(cancellationToken);
        if (applicants.Count == 0)
        {
            return [];
        }

        var organizations = await db.AccOrganizations.AsNoTracking().Where(item => item.EventId == eventId).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken);
        var types = await db.AccApplicantTypes.AsNoTracking().Where(item => item.EventId == eventId).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken);
        var profiles = await db.AccAccessProfiles.AsNoTracking().Where(item => item.EventId == eventId).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken);
        var everyone = await db.AccApplicants.AsNoTracking().Where(item => item.EventId == eventId)
            .Select(item => new AccDuplicates.Person(item.Id, item.IdNumberHash, item.FirstName, item.LastName, item.DateOfBirth, item.Email))
            .ToListAsync(cancellationToken);
        var duplicates = AccDuplicates.Flag(everyone);
        var idList = applicants.Select(item => item.Id).ToList();
        var pending = await db.AccDocuments.AsNoTracking()
            .Where(item => idList.Contains(item.ApplicantId) && item.Status == "Pending")
            .GroupBy(item => item.ApplicantId)
            .Select(group => new { group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.Key, item => item.Count, cancellationToken);

        return [.. applicants.Select(item => new AccApplicantRowDto(
            item.Id,
            item.FirstName,
            item.LastName,
            item.Email,
            item.JobTitle,
            item.Nationality,
            item.OrganizationId,
            item.OrganizationId is { } org && organizations.TryGetValue(org, out var orgName) ? orgName : null,
            item.ApplicantTypeId,
            item.ApplicantTypeId is { } type && types.TryGetValue(type, out var typeName) ? typeName : null,
            item.StageKey,
            item.AccessProfileId,
            item.AccessProfileId is { } profile && profiles.TryGetValue(profile, out var profileName) ? profileName : null,
            item.BadgeNumber,
            item.PhotoFileId,
            AccIdProtector.Mask(item.IdNumberLast4),
            item.Source,
            duplicates.TryGetValue(item.Id, out var list) ? list.Select(entry => entry.Other).Distinct().Count() : 0,
            pending.GetValueOrDefault(item.Id),
            item.SubmittedOn,
            item.UpdatedOn))];
    }

    public async Task<AccApplicantDetailDto> DetailAsync(Guid eventId, Guid applicantId, bool includeHistory, CancellationToken cancellationToken)
    {
        var applicant = await db.AccApplicants.AsNoTracking().FirstOrDefaultAsync(item => item.Id == applicantId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Applicant not found.");
        var summary = (await RowsAsync(eventId, db.AccApplicants.AsNoTracking().Where(item => item.Id == applicantId), cancellationToken))[0];

        var everyone = await db.AccApplicants.AsNoTracking().Where(item => item.EventId == eventId)
            .Select(item => new { item.Id, item.IdNumberHash, item.FirstName, item.LastName, item.DateOfBirth, item.Email, item.OrganizationId, item.StageKey })
            .ToListAsync(cancellationToken);
        var flags = AccDuplicates.Flag(everyone.Select(item => new AccDuplicates.Person(item.Id, item.IdNumberHash, item.FirstName, item.LastName, item.DateOfBirth, item.Email)).ToList());
        var organizations = await db.AccOrganizations.AsNoTracking().Where(item => item.EventId == eventId).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken);
        var duplicates = flags[applicantId]
            .GroupBy(item => item.Other)
            .Select(group =>
            {
                var other = everyone.First(item => item.Id == group.Key);
                return new AccDuplicateDto(
                    other.Id,
                    $"{other.FirstName} {other.LastName}",
                    other.OrganizationId is { } org && organizations.TryGetValue(org, out var name) ? name : null,
                    other.StageKey,
                    [.. group.Select(item => item.Reason).Distinct()]);
            })
            .ToArray();

        var documents = await DocumentsAsync([applicantId], cancellationToken);
        var effective = await EffectiveZonesAsync(eventId, applicant.AccessProfileId, applicant.ExtraZoneIdsJson, cancellationToken);
        string? decidedBy = null;
        if (applicant.DecidedBy is { } decider)
        {
            decidedBy = await db.Users.AsNoTracking().Where(item => item.Id == decider).Select(item => item.FirstName + " " + item.LastName).FirstOrDefaultAsync(cancellationToken);
        }

        AccAuditDto[] history = [];
        if (includeHistory)
        {
            history = await db.AccAuditLogs.AsNoTracking()
                .Where(item => item.ApplicantId == applicantId)
                .OrderByDescending(item => item.CreatedOn)
                .Take(200)
                .Select(item => new AccAuditDto(item.Id, item.ApplicantId, null, item.ActorName, item.Action, item.Detail, item.CreatedOn))
                .ToArrayAsync(cancellationToken);
        }

        return new AccApplicantDetailDto(
            summary,
            applicant.Phone,
            applicant.DateOfBirth,
            AccJson.Read(applicant.CustomFieldsJson, new Dictionary<string, string?>()),
            AccJson.Ids(applicant.ExtraZoneIdsJson),
            effective,
            applicant.RejectionReason,
            applicant.CredentialCode,
            applicant.DecidedOn,
            decidedBy,
            documents.TryGetValue(applicantId, out var applicantDocuments) ? applicantDocuments : [],
            duplicates,
            history);
    }

    private async Task<Dictionary<Guid, AccDocumentDto[]>> DocumentsAsync(IReadOnlyCollection<Guid> applicantIds, CancellationToken cancellationToken)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var idList = applicantIds.ToList();
        var rows = await (
            from document in db.AccDocuments.AsNoTracking()
            join file in db.AccFiles.AsNoTracking() on document.FileId equals file.Id
            where idList.Contains(document.ApplicantId)
            orderby document.UploadedOn
            select new { document, file.FileName, file.ContentType }).ToListAsync(cancellationToken);
        return rows.GroupBy(item => item.document.ApplicantId).ToDictionary(
            group => group.Key,
            group => group.Select(item => new AccDocumentDto(
                item.document.Id,
                item.document.Kind,
                item.document.Label,
                item.document.FileId,
                item.FileName,
                item.ContentType,
                item.document.ExpiresOn,
                item.document.Status,
                item.document.ExpiresOn is { } expires && expires < today,
                item.document.UploadedOn)).ToArray());
    }

    public async Task<Guid[]> EffectiveZonesAsync(Guid eventId, Guid? profileId, string extraJson, CancellationToken cancellationToken)
    {
        var zones = new HashSet<Guid>(AccJson.Ids(extraJson));
        if (profileId is { } id)
        {
            var json = await db.AccAccessProfiles.AsNoTracking().Where(item => item.Id == id && item.EventId == eventId).Select(item => item.ZoneIdsJson).FirstOrDefaultAsync(cancellationToken);
            zones.UnionWith(AccJson.Ids(json));
        }

        return [.. zones];
    }

    /* ---------------- Create / update ---------------- */

    /// <summary>Who is submitting and what rules apply.</summary>
    public sealed record SubmitContext(string Source, AccActor Actor, Guid? FixedOrganizationId, bool StrictDocuments, bool RequireEmail, bool EnforceQuota);

    public async Task<AccApplicantDetailDto> CreateAsync(Guid eventId, AccApplicantWriteRequest request, SubmitContext context, CancellationToken cancellationToken)
    {
        var entity = await CreateCoreAsync(eventId, request, context, notify: true, cancellationToken);
        return await DetailAsync(eventId, entity.Id, includeHistory: true, cancellationToken);
    }

    private async Task<AccApplicant> CreateCoreAsync(Guid eventId, AccApplicantWriteRequest request, SubmitContext context, bool notify, CancellationToken cancellationToken)
    {
        var accEvent = await db.AccEvents.AsNoTracking().FirstOrDefaultAsync(item => item.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Accreditation event not found.");
        var stages = AccSetupService.Stages(accEvent);
        var organizationId = context.FixedOrganizationId ?? request.OrganizationId;
        AccOrganization? organization = null;
        if (organizationId is { } orgId)
        {
            organization = await db.AccOrganizations.AsNoTracking().FirstOrDefaultAsync(item => item.Id == orgId && item.EventId == eventId, cancellationToken)
                ?? throw AccErrors.One("organizationId", "Choose an organisation from this event.");
        }

        var typeId = request.ApplicantTypeId ?? organization?.ApplicantTypeId;
        var type = typeId is { } id
            ? await db.AccApplicantTypes.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id && item.EventId == eventId, cancellationToken)
                ?? throw AccErrors.One("applicantTypeId", "Choose an applicant category from this event.")
            : null;

        if (context.EnforceQuota && organization?.Quota is { } quota)
        {
            var rejectedKeys = stages.Where(item => item.Kind == "rejected").Select(item => item.Key).ToList();
            var used = await db.AccApplicants.AsNoTracking().CountAsync(item => item.OrganizationId == organization.Id && !rejectedKeys.Contains(item.StageKey), cancellationToken);
            if (used >= quota)
            {
                throw AccErrors.One("organizationId", $"{organization.Name} has used its quota of {quota} people.");
            }
        }

        var now = DateTime.UtcNow;
        var entity = new AccApplicant
        {
            Id = Guid.CreateVersion7(),
            EventId = eventId,
            OrganizationId = organization?.Id,
            StageKey = stages[0].Key,
            Source = context.Source,
            CredentialCode = AccTokens.Credential(),
            AccessProfileId = type?.DefaultProfileId,
            SubmittedOn = now,
            CreatedOn = now,
            UpdatedOn = now,
        };
        await ApplyAsync(entity, request, type, context, isNew: true, cancellationToken);
        db.AccApplicants.Add(entity);
        AddDocuments(entity.Id, request.Documents, type);
        AccAudit.Add(db, eventId, entity.Id, context.Actor, "Application submitted",
            $"{entity.FirstName} {entity.LastName}{(organization is null ? string.Empty : $" · {organization.Name}")}{(type is null ? string.Empty : $" · {type.Name}")}");
        await db.SaveChangesAsync(cancellationToken);

        if (notify)
        {
            await NotifyAsync(accEvent, "submitted", [entity], cancellationToken);
        }

        return entity;
    }

    public async Task<AccApplicantDetailDto> UpdateAsync(Guid eventId, Guid applicantId, AccApplicantWriteRequest request, SubmitContext context, CancellationToken cancellationToken)
    {
        var entity = await db.AccApplicants.FirstOrDefaultAsync(item => item.Id == applicantId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Applicant not found.");
        if (context.FixedOrganizationId is { } fixedOrg)
        {
            if (entity.OrganizationId != fixedOrg)
            {
                throw AppException.NotFound("Applicant not found.");
            }

            var accEvent = await db.AccEvents.AsNoTracking().FirstAsync(item => item.Id == eventId, cancellationToken);
            if (entity.StageKey != AccSetupService.Stages(accEvent)[0].Key)
            {
                throw AppException.Forbidden("This application is already being reviewed and can no longer be changed here. Contact the accreditation team.");
            }
        }
        else if (request.OrganizationId != entity.OrganizationId)
        {
            if (request.OrganizationId is { } orgId && !await db.AccOrganizations.AsNoTracking().AnyAsync(item => item.Id == orgId && item.EventId == eventId, cancellationToken))
            {
                throw AccErrors.One("organizationId", "Choose an organisation from this event.");
            }

            entity.OrganizationId = request.OrganizationId;
        }

        var typeId = request.ApplicantTypeId ?? entity.ApplicantTypeId;
        var type = typeId is { } id
            ? await db.AccApplicantTypes.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id && item.EventId == eventId, cancellationToken)
                ?? throw AccErrors.One("applicantTypeId", "Choose an applicant category from this event.")
            : null;
        var before = $"{entity.FirstName} {entity.LastName}";
        await ApplyAsync(entity, request, type, context, isNew: false, cancellationToken);
        AddDocuments(entity.Id, request.Documents, type);
        entity.UpdatedOn = DateTime.UtcNow;
        AccAudit.Add(db, eventId, entity.Id, context.Actor, "Details updated",
            before != $"{entity.FirstName} {entity.LastName}" ? $"Name {before} → {entity.FirstName} {entity.LastName}" : null);
        await db.SaveChangesAsync(cancellationToken);
        return await DetailAsync(eventId, entity.Id, includeHistory: context.FixedOrganizationId is null, cancellationToken);
    }

    private async Task ApplyAsync(AccApplicant entity, AccApplicantWriteRequest request, AccApplicantType? type, SubmitContext context, bool isNew, CancellationToken cancellationToken)
    {
        var errors = new AccErrors();
        var firstName = AccText.Clean(request.FirstName, 100);
        var lastName = AccText.Clean(request.LastName, 100);
        if (firstName is null)
        {
            errors.Add("firstName", "Enter the first name.");
        }

        if (lastName is null)
        {
            errors.Add("lastName", "Enter the last name.");
        }

        var email = AccText.Email(request.Email);
        if (email is not null && !AccText.IsEmail(email))
        {
            errors.Add("email", "Enter a valid email address.");
        }
        else if (email is null && context.RequireEmail)
        {
            errors.Add("email", "Enter an email address so we can send you the decision.");
        }

        if (request.DateOfBirth is { } dob && (dob > DateOnly.FromDateTime(DateTime.UtcNow) || dob.Year < 1900))
        {
            errors.Add("dateOfBirth", "Enter a valid date of birth.");
        }

        // Custom fields of the applicant type.
        var answers = new Dictionary<string, string?>();
        var fields = type is null ? Array.Empty<AccFieldDto>() : AccJson.Read(type.FieldsJson, Array.Empty<AccFieldDto>());
        foreach (var field in fields)
        {
            var value = request.CustomFields is not null && request.CustomFields.TryGetValue(field.Key, out var raw) ? AccText.Clean(raw, 1000) : null;
            if (value is null)
            {
                if (field.Required && context.StrictDocuments)
                {
                    errors.Add($"customFields.{field.Key}", $"{field.Label} is required.");
                }

                continue;
            }

            if (field.Type == "select" && field.Options is { Length: > 0 } options && !options.Contains(value, StringComparer.OrdinalIgnoreCase))
            {
                errors.Add($"customFields.{field.Key}", $"Choose one of the options for {field.Label}.");
                continue;
            }

            answers[field.Key] = field.Type == "select" ? field.Options!.First(option => option.Equals(value, StringComparison.OrdinalIgnoreCase)) : value;
        }

        // Required uploads (portal and public must provide them; staff may add them later).
        var documents = request.Documents ?? [];
        if (context.StrictDocuments && type is not null && isNew)
        {
            foreach (var rule in AccJson.Read(type.DocumentsJson, Array.Empty<AccDocumentRuleDto>()).Where(item => item.Required))
            {
                var provided = documents.FirstOrDefault(item => item.Kind == rule.Key);
                if (provided is null)
                {
                    errors.Add($"documents.{rule.Key}", $"Upload {rule.Label}.");
                }
                else if (rule.NeedsExpiry && provided.ExpiresOn is null)
                {
                    errors.Add($"documents.{rule.Key}", $"Enter the expiry date of {rule.Label}.");
                }
            }
        }

        if (context.StrictDocuments && isNew && request.PhotoFileId is null)
        {
            errors.Add("photoFileId", "Add a passport-style photo.");
        }

        errors.ThrowIfAny();

        var fileIds = documents.Select(item => item.FileId).ToList();
        if (request.PhotoFileId is { } photo)
        {
            await files.EnsureImageAsync(entity.EventId, photo, cancellationToken);
        }

        await files.EnsureOwnedAsync(entity.EventId, fileIds, cancellationToken);

        entity.FirstName = firstName!;
        entity.LastName = lastName!;
        entity.Email = email;
        entity.Phone = AccText.Clean(request.Phone, 40);
        entity.JobTitle = AccText.Clean(request.JobTitle, 200);
        entity.Nationality = AccText.Clean(request.Nationality, 80);
        entity.DateOfBirth = request.DateOfBirth;
        entity.ApplicantTypeId = type?.Id;
        entity.CustomFieldsJson = AccJson.Write(answers);
        if (request.PhotoFileId is not null || isNew)
        {
            entity.PhotoFileId = request.PhotoFileId ?? entity.PhotoFileId;
        }

        // A blank ID number on edit keeps the stored one.
        if (!string.IsNullOrWhiteSpace(request.IdNumber))
        {
            var protectedId = ids.Protect(request.IdNumber);
            entity.IdNumberProtected = protectedId?.Protected;
            entity.IdNumberLast4 = protectedId?.Last4;
            entity.IdNumberHash = protectedId?.Hash;
        }
    }

    private void AddDocuments(Guid applicantId, AccDocumentInput[]? documents, AccApplicantType? type)
    {
        if (documents is null || documents.Length == 0)
        {
            return;
        }

        var rules = type is null ? Array.Empty<AccDocumentRuleDto>() : AccJson.Read(type.DocumentsJson, Array.Empty<AccDocumentRuleDto>());
        foreach (var document in documents)
        {
            var rule = rules.FirstOrDefault(item => item.Key == document.Kind);
            db.AccDocuments.Add(new AccDocument
            {
                Id = Guid.CreateVersion7(),
                ApplicantId = applicantId,
                Kind = rule?.Key ?? "other",
                Label = rule?.Label ?? AccText.Clean(document.Label, 200) ?? "Document",
                FileId = document.FileId,
                ExpiresOn = document.ExpiresOn,
                Status = "Pending",
                UploadedOn = DateTime.UtcNow,
            });
        }
    }

    /* ---------------- Bulk ---------------- */

    public async Task<AccBulkResult> BulkAsync(Guid eventId, AccBulkRequest request, SubmitContext context, CancellationToken cancellationToken)
    {
        var rows = request.Rows ?? [];
        if (rows.Length == 0)
        {
            throw AccErrors.One("rows", "The file has no people in it.");
        }

        if (rows.Length > 2000)
        {
            throw AccErrors.One("rows", "Upload at most 2,000 people at a time.");
        }

        var types = await db.AccApplicantTypes.AsNoTracking().Where(item => item.EventId == eventId).ToListAsync(cancellationToken);
        var errors = new List<AccBulkRowError>();
        var created = new List<AccApplicant>();
        var bulkContext = context with { StrictDocuments = false, RequireEmail = false };
        for (var index = 0; index < rows.Length; index++)
        {
            var row = rows[index];
            Guid? typeId = null;
            if (!string.IsNullOrWhiteSpace(row.ApplicantType))
            {
                var match = types.FirstOrDefault(item => item.Name.Equals(row.ApplicantType.Trim(), StringComparison.OrdinalIgnoreCase));
                if (match is null)
                {
                    errors.Add(new AccBulkRowError(index + 2, $"Unknown applicant category \"{row.ApplicantType}\"."));
                    continue;
                }

                typeId = match.Id;
            }

            DateOnly? dob = null;
            if (!string.IsNullOrWhiteSpace(row.DateOfBirth))
            {
                dob = AccText.Date(row.DateOfBirth);
                if (dob is null)
                {
                    errors.Add(new AccBulkRowError(index + 2, $"Date of birth \"{row.DateOfBirth}\" is not a date (use YYYY-MM-DD)."));
                    continue;
                }
            }

            try
            {
                var entity = await CreateCoreAsync(eventId, new AccApplicantWriteRequest(
                    request.OrganizationId,
                    typeId,
                    row.FirstName,
                    row.LastName,
                    row.Email,
                    row.Phone,
                    row.JobTitle,
                    row.Nationality,
                    dob,
                    row.IdNumber,
                    row.PhotoFileId,
                    row.CustomFields,
                    null), bulkContext, notify: false, cancellationToken);
                created.Add(entity);
            }
            catch (AppException exception)
            {
                var detail = exception.Errors?.Values.SelectMany(item => item).FirstOrDefault() ?? exception.Message;
                errors.Add(new AccBulkRowError(index + 2, detail));
                db.ChangeTracker.Clear();
            }
        }

        if (created.Count > 0)
        {
            AccAudit.Add(db, eventId, null, context.Actor, "Bulk upload", $"{created.Count} added, {errors.Count} skipped");
            await db.SaveChangesAsync(cancellationToken);
            var accEvent = await db.AccEvents.AsNoTracking().FirstAsync(item => item.Id == eventId, cancellationToken);
            await NotifyAsync(accEvent, "submitted", created, cancellationToken);
        }

        return new AccBulkResult(created.Count, [.. errors]);
    }

    /* ---------------- Vetting ---------------- */

    public async Task<AccDecisionResult> MoveAsync(Guid eventId, IReadOnlyCollection<Guid> applicantIds, string? stageKey, string? reason, AccActor actor, CancellationToken cancellationToken)
    {
        var accEvent = await db.AccEvents.AsNoTracking().FirstOrDefaultAsync(item => item.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Accreditation event not found.");
        var stages = AccSetupService.Stages(accEvent);
        var target = stages.FirstOrDefault(item => item.Key == stageKey) ?? throw AccErrors.One("stageKey", "Choose a step.");
        var cleanReason = AccText.Clean(reason, 1000);
        if (target.Kind == "rejected" && cleanReason is null)
        {
            throw AccErrors.One("reason", "Give a reason for the rejection (it is emailed to the applicant).");
        }

        var distinct = applicantIds.Distinct().ToList();
        if (distinct.Count == 0)
        {
            throw AccErrors.One("ids", "Select at least one applicant.");
        }

        var applicants = await db.AccApplicants.Where(item => item.EventId == eventId && distinct.Contains(item.Id)).ToListAsync(cancellationToken);
        var skipped = new List<string>();
        var changed = new List<AccApplicant>();
        var nextBadge = (await db.AccApplicants.AsNoTracking().Where(item => item.EventId == eventId).MaxAsync(item => item.BadgeNumber, cancellationToken) ?? 1000) + 1;
        var now = DateTime.UtcNow;
        foreach (var applicant in applicants)
        {
            if (applicant.StageKey == target.Key)
            {
                skipped.Add($"{applicant.FirstName} {applicant.LastName} is already in {target.Name}.");
                continue;
            }

            var from = stages.FirstOrDefault(item => item.Key == applicant.StageKey)?.Name ?? applicant.StageKey;
            applicant.StageKey = target.Key;
            applicant.UpdatedOn = now;
            if (target.Kind == "open")
            {
                applicant.DecidedOn = null;
                applicant.DecidedBy = null;
                applicant.RejectionReason = null;
            }
            else
            {
                applicant.DecidedOn = now;
                applicant.DecidedBy = actor.UserId;
                applicant.RejectionReason = target.Kind == "rejected" ? cleanReason : null;
                if (target.Kind == "rejected" && applicant.PrintCount > 0)
                {
                    // A badge was already printed: make it stop working at the gates.
                    db.AccRevokedCredentials.Add(new AccRevokedCredential
                    {
                        Id = Guid.CreateVersion7(),
                        EventId = eventId,
                        ApplicantId = applicant.Id,
                        Code = applicant.CredentialCode,
                        Reason = $"Rejected after printing: {cleanReason}"[..Math.Min(500, $"Rejected after printing: {cleanReason}".Length)],
                        RevokedOn = now,
                    });
                    applicant.CredentialCode = AccTokens.Credential();
                    applicant.LastPrintedOn = null;
                    applicant.CollectedOn = null;
                }
                if (target.Kind == "approved" && applicant.BadgeNumber is null)
                {
                    applicant.BadgeNumber = nextBadge++;
                }
            }

            AccAudit.Add(db, eventId, applicant.Id, actor, target.Kind switch
            {
                "approved" => "Approved",
                "rejected" => "Rejected",
                _ => "Step changed",
            }, $"{from} → {target.Name}{(cleanReason is null ? string.Empty : $" · {cleanReason}")}{(target.Kind == "approved" ? $" · Badge #{applicant.BadgeNumber}" : string.Empty)}");
            changed.Add(applicant);
        }

        await db.SaveChangesAsync(cancellationToken);
        if (target.Kind is "approved" or "rejected" && changed.Count > 0)
        {
            await NotifyAsync(accEvent, target.Kind, changed, cancellationToken, target.Name);
        }

        var warnings = target.Kind == "approved" ? await CapacityWarningsAsync(eventId, stages, cancellationToken) : [];
        return new AccDecisionResult(changed.Count, warnings, [.. skipped]);
    }

    public async Task<AccDecisionResult> SetAccessAsync(Guid eventId, Guid applicantId, AccAccessRequest request, AccActor actor, CancellationToken cancellationToken)
    {
        var applicant = await db.AccApplicants.FirstOrDefaultAsync(item => item.Id == applicantId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Applicant not found.");
        if (request.AccessProfileId is { } profileId && !await db.AccAccessProfiles.AsNoTracking().AnyAsync(item => item.Id == profileId && item.EventId == eventId, cancellationToken))
        {
            throw AccErrors.One("accessProfileId", "Choose an access profile from this event.");
        }

        var zoneIds = (await db.AccZones.AsNoTracking().Where(item => item.EventId == eventId).Select(item => item.Id).ToListAsync(cancellationToken)).ToHashSet();
        var extras = (request.ExtraZoneIds ?? []).Where(zoneIds.Contains).Distinct().ToArray();
        applicant.AccessProfileId = request.AccessProfileId;
        applicant.ExtraZoneIdsJson = AccJson.Write(extras);
        applicant.UpdatedOn = DateTime.UtcNow;

        var profileName = request.AccessProfileId is { } id
            ? await db.AccAccessProfiles.AsNoTracking().Where(item => item.Id == id).Select(item => item.Name).FirstOrDefaultAsync(cancellationToken)
            : null;
        var zoneNames = await db.AccZones.AsNoTracking().Where(item => extras.Contains(item.Id)).Select(item => item.Code).ToListAsync(cancellationToken);
        AccAudit.Add(db, eventId, applicantId, actor, "Access changed",
            $"Profile: {profileName ?? "none"}{(zoneNames.Count > 0 ? $" · Extra zones: {string.Join(", ", zoneNames)}" : string.Empty)}");
        await db.SaveChangesAsync(cancellationToken);

        var accEvent = await db.AccEvents.AsNoTracking().FirstAsync(item => item.Id == eventId, cancellationToken);
        return new AccDecisionResult(1, await CapacityWarningsAsync(eventId, AccSetupService.Stages(accEvent), cancellationToken), []);
    }

    /// <summary>Zones whose approved people exceed capacity (warn only, never blocks).</summary>
    private async Task<string[]> CapacityWarningsAsync(Guid eventId, AccStageDto[] stages, CancellationToken cancellationToken)
    {
        var zones = await db.AccZones.AsNoTracking().Where(item => item.EventId == eventId && item.Capacity != null).ToListAsync(cancellationToken);
        if (zones.Count == 0)
        {
            return [];
        }

        var approved = stages.Where(item => item.Kind == "approved").Select(item => item.Key).ToList();
        var people = await db.AccApplicants.AsNoTracking()
            .Where(item => item.EventId == eventId && approved.Contains(item.StageKey))
            .Select(item => new { item.AccessProfileId, item.ExtraZoneIdsJson })
            .ToListAsync(cancellationToken);
        var profiles = await db.AccAccessProfiles.AsNoTracking().Where(item => item.EventId == eventId).ToDictionaryAsync(item => item.Id, item => AccJson.Ids(item.ZoneIdsJson), cancellationToken);
        var used = new Dictionary<Guid, int>();
        foreach (var person in people)
        {
            var effective = new HashSet<Guid>(AccJson.Ids(person.ExtraZoneIdsJson));
            if (person.AccessProfileId is { } id && profiles.TryGetValue(id, out var zoneIds))
            {
                effective.UnionWith(zoneIds);
            }

            foreach (var zone in effective)
            {
                used[zone] = used.GetValueOrDefault(zone) + 1;
            }
        }

        return [.. zones
            .Where(zone => used.GetValueOrDefault(zone.Id) > zone.Capacity)
            .Select(zone => $"{zone.Name} ({zone.Code}) is over capacity: {used[zone.Id]} approved for {zone.Capacity} places.")];
    }

    public async Task<string?> RevealIdAsync(Guid eventId, Guid applicantId, AccActor actor, CancellationToken cancellationToken)
    {
        var applicant = await db.AccApplicants.AsNoTracking().FirstOrDefaultAsync(item => item.Id == applicantId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Applicant not found.");
        AccAudit.Add(db, eventId, applicantId, actor, "ID number viewed");
        await db.SaveChangesAsync(cancellationToken);
        return ids.Unprotect(applicant.IdNumberProtected);
    }

    public async Task<AccApplicantDetailDto> AddDocumentAsync(Guid eventId, Guid applicantId, AccDocumentInput input, AccActor actor, CancellationToken cancellationToken)
    {
        var applicant = await db.AccApplicants.FirstOrDefaultAsync(item => item.Id == applicantId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Applicant not found.");
        await files.EnsureOwnedAsync(eventId, [input.FileId], cancellationToken);
        var type = applicant.ApplicantTypeId is { } typeId
            ? await db.AccApplicantTypes.AsNoTracking().FirstOrDefaultAsync(item => item.Id == typeId, cancellationToken)
            : null;
        AddDocuments(applicantId, [input], type);
        applicant.UpdatedOn = DateTime.UtcNow;
        AccAudit.Add(db, eventId, applicantId, actor, "Document uploaded", AccText.Clean(input.Label, 200) ?? input.Kind);
        await db.SaveChangesAsync(cancellationToken);
        return await DetailAsync(eventId, applicantId, includeHistory: true, cancellationToken);
    }

    public async Task<AccApplicantDetailDto> SetDocumentStatusAsync(Guid eventId, Guid applicantId, Guid documentId, string? status, AccActor actor, CancellationToken cancellationToken)
    {
        var normalized = status?.Trim().ToLowerInvariant() switch
        {
            "verified" => "Verified",
            "rejected" => "Rejected",
            "pending" => "Pending",
            _ => throw AccErrors.One("status", "Choose Verified, Rejected or Pending."),
        };
        var document = await (
            from item in db.AccDocuments
            join applicant in db.AccApplicants on item.ApplicantId equals applicant.Id
            where item.Id == documentId && applicant.Id == applicantId && applicant.EventId == eventId
            select item).FirstOrDefaultAsync(cancellationToken)
            ?? throw AppException.NotFound("Document not found.");
        document.Status = normalized;
        AccAudit.Add(db, eventId, applicantId, actor, $"Document {normalized.ToLowerInvariant()}", document.Label);
        await db.SaveChangesAsync(cancellationToken);
        return await DetailAsync(eventId, applicantId, includeHistory: true, cancellationToken);
    }

    /* ---------------- Email ---------------- */

    private async Task NotifyAsync(AccEvent accEvent, string trigger, IReadOnlyList<AccApplicant> applicants, CancellationToken cancellationToken, string? stageName = null)
    {
        var templates = AccSetupService.Notifications(accEvent);
        var template = trigger switch
        {
            "approved" => templates.Approved,
            "rejected" => templates.Rejected,
            _ => templates.Submitted,
        };
        if (!template.Enabled)
        {
            return;
        }

        var orgIds = applicants.Where(item => item.OrganizationId != null).Select(item => item.OrganizationId!.Value).Distinct().ToList();
        var organizations = await db.AccOrganizations.AsNoTracking().Where(item => orgIds.Contains(item.Id)).ToDictionaryAsync(item => item.Id, item => item.Name, cancellationToken);
        var messages = applicants
            .Where(item => !string.IsNullOrWhiteSpace(item.Email))
            .Select(item =>
            {
                var values = new Dictionary<string, string?>
                {
                    ["firstName"] = item.FirstName,
                    ["lastName"] = item.LastName,
                    ["event"] = accEvent.Name,
                    ["organization"] = item.OrganizationId is { } org && organizations.TryGetValue(org, out var name) ? name : string.Empty,
                    ["badgeNumber"] = item.BadgeNumber?.ToString() ?? string.Empty,
                    ["reason"] = item.RejectionReason ?? string.Empty,
                    ["stage"] = stageName ?? string.Empty,
                };
                return (item.Email!, (string?)$"{item.FirstName} {item.LastName}", AccNotifier.Fill(template.Subject, values), AccNotifier.Fill(template.Body, values));
            })
            .ToList();
        await notifier.SendAsync(messages, cancellationToken);
    }
}
