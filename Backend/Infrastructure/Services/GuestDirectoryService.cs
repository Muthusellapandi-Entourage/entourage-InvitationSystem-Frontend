using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Application.Invitations;
using Entourage.Application.Validation;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

public sealed class GuestDirectoryService(
    AppDbContext db,
    IValidator<CreateGuestTypeRequest> createTypeValidator,
    IValidator<UpdateGuestTypeRequest> updateTypeValidator,
    IValidator<ReorderGuestTypesRequest> reorderValidator,
    IValidator<DuplicateDesignRequest> duplicateValidator,
    IValidator<SaveGuestRequest> saveGuestValidator,
    IValidator<ReassignGuestsRequest> reassignValidator,
    IValidator<GuestIdsRequest> guestIdsValidator,
    IValidator<ImportGuestsRequest> importValidator,
    IValidator<InvitationDesignDto> designValidator,
    IValidator<BadgeDesignDto> badgeValidator,
    IEventAssetService assets) : IGuestDirectoryService
{
    private static readonly JsonSerializerOptions DesignJsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<GuestTypeDto>> ListTypesAsync(Guid eventId, CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        var types = await db.GuestTypes.AsNoTracking()
            .Where(item => item.EventId == eventId)
            .OrderBy(item => item.SortOrder)
            .ThenBy(item => item.Name)
            .ToListAsync(cancellationToken);
        var counts = await db.Guests.AsNoTracking()
            .Where(item => item.EventId == eventId && item.GuestTypeId != null)
            .GroupBy(item => item.GuestTypeId)
            .Select(group => new { Id = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);
        var byType = counts.ToDictionary(item => item.Id!.Value, item => item.Count);
        return types.Select(type => ToTypeDto(type, byType.GetValueOrDefault(type.Id))).ToList();
    }

    public async Task<GuestTypeDto> CreateTypeAsync(Guid eventId, CreateGuestTypeRequest request, CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        await ValidationGuard.EnsureValidAsync(createTypeValidator, request, cancellationToken);
        var name = request.Name.Trim();
        await EnsureTypeNameAvailableAsync(eventId, name, null, cancellationToken);
        var sort = await db.GuestTypes.Where(item => item.EventId == eventId).MaxAsync(item => (int?)item.SortOrder, cancellationToken) ?? -1;
        var type = new GuestType
        {
            Id = Guid.CreateVersion7(),
            EventId = eventId,
            Name = name,
            SortOrder = sort + 1,
            IsEnabled = true,
            CreatedOn = DateTime.UtcNow,
            UpdatedOn = DateTime.UtcNow,
        };
        db.GuestTypes.Add(type);
        await db.SaveChangesAsync(cancellationToken);
        return ToTypeDto(type, 0);
    }

    public async Task<GuestTypeDto> UpdateTypeAsync(
        Guid eventId,
        Guid guestTypeId,
        UpdateGuestTypeRequest request,
        CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(updateTypeValidator, request, cancellationToken);
        var type = await FindTypeAsync(eventId, guestTypeId, cancellationToken);
        var name = request.Name.Trim();
        await EnsureTypeNameAvailableAsync(eventId, name, type.Id, cancellationToken);
        type.Name = name;
        type.IsEnabled = request.IsEnabled;
        type.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        var count = await db.Guests.CountAsync(item => item.GuestTypeId == type.Id, cancellationToken);
        return ToTypeDto(type, count);
    }

    public async Task<IReadOnlyList<GuestTypeDto>> ReorderTypesAsync(
        Guid eventId,
        ReorderGuestTypesRequest request,
        CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(reorderValidator, request, cancellationToken);
        var types = await db.GuestTypes.Where(item => item.EventId == eventId).ToListAsync(cancellationToken);
        if (types.Count == 0)
        {
            throw AppException.NotFound("This event has no guest types.");
        }

        var incoming = request.Ids.Distinct().ToArray();
        if (incoming.Length != types.Count || types.Any(type => !incoming.Contains(type.Id)))
        {
            throw AppException.Validation(new Dictionary<string, string[]>
            {
                ["ids"] = ["Include every guest type for this event."],
            });
        }

        var order = incoming.Select((id, index) => (id, index)).ToDictionary(item => item.id, item => item.index);
        foreach (var type in types)
        {
            type.SortOrder = order[type.Id];
            type.UpdatedOn = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(cancellationToken);
        return await ListTypesAsync(eventId, cancellationToken);
    }

    public async Task DeleteTypeAsync(Guid eventId, Guid guestTypeId, bool discardDesigns, CancellationToken cancellationToken)
    {
        var type = await FindTypeAsync(eventId, guestTypeId, cancellationToken);
        var guests = await db.Guests.CountAsync(item => item.GuestTypeId == type.Id, cancellationToken);
        if (guests > 0)
        {
            throw AppException.Conflict(
                $"Reassign the {guests} guest{(guests == 1 ? "" : "s")} on {type.Name} before deleting this guest type.",
                "guestType",
                "Guests are still assigned to this type.");
        }

        var hasDesign = IsConfigured(type.InvitationDesignJson) || IsConfigured(type.BadgeDesignJson);
        if (hasDesign && !discardDesigns)
        {
            throw AppException.Conflict(
                $"{type.Name} still has a saved design. Confirm deletion to remove the guest type and its invitation and badge designs. Guest history is not deleted.",
                "guestType",
                "Designs must be discarded explicitly.");
        }

        db.GuestTypes.Remove(type);
        await db.SaveChangesAsync(cancellationToken);
        await assets.DeleteUnreferencedAsync(eventId, await DesignAssetIds.KeepSet(db, eventId, cancellationToken), cancellationToken);
    }

    public async Task<GuestTypeDto> DuplicateDesignAsync(
        Guid eventId,
        Guid guestTypeId,
        DuplicateDesignRequest request,
        CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(duplicateValidator, request, cancellationToken);
        var source = await FindTypeAsync(eventId, guestTypeId, cancellationToken);
        if (request.DestinationGuestTypeId == source.Id)
        {
            throw AppException.Validation(new Dictionary<string, string[]>
            {
                ["destinationGuestTypeId"] = ["Choose a different guest type."],
            });
        }

        var destination = await FindTypeAsync(eventId, request.DestinationGuestTypeId, cancellationToken);
        var invitation = request.Category == "invitation";
        var sourceJson = invitation ? source.InvitationDesignJson : source.BadgeDesignJson;
        if (!IsConfigured(sourceJson))
        {
            var label = invitation ? "invitation" : "badge";
            throw AppException.Validation(new Dictionary<string, string[]>
            {
                ["category"] = [$"The {source.Name} {label} design has not been configured."],
            });
        }

        var destinationJson = invitation ? destination.InvitationDesignJson : destination.BadgeDesignJson;
        if (IsConfigured(destinationJson) && !request.Replace)
        {
            var label = invitation ? "invitation" : "badge";
            throw AppException.Conflict(
                $"{destination.Name} already has a {label} design. Confirm to replace it. {source.Name} will stay unchanged.",
                "destinationGuestTypeId",
                "Confirm replacement.");
        }

        if (invitation)
        {
            destination.InvitationDesignJson = sourceJson;
            destination.InvitationHtml = source.InvitationHtml;
        }
        else
        {
            destination.BadgeDesignJson = sourceJson;
        }

        destination.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        var count = await db.Guests.CountAsync(item => item.GuestTypeId == destination.Id, cancellationToken);
        return ToTypeDto(destination, count);
    }

    public async Task<GuestTypeInvitationDto> GetInvitationAsync(Guid eventId, Guid guestTypeId, CancellationToken cancellationToken)
    {
        var type = await FindTypeAsync(eventId, guestTypeId, cancellationToken);
        if (!IsConfigured(type.InvitationDesignJson))
        {
            return new GuestTypeInvitationDto(InvitationDesignDto.CreateDefault(), null, null, false);
        }

        var design = JsonSerializer.Deserialize<InvitationDesignDto>(type.InvitationDesignJson!, DesignJsonOptions)
            ?? InvitationDesignDto.CreateDefault();
        return new GuestTypeInvitationDto(design, type.InvitationHtml, type.UpdatedOn, true);
    }

    public async Task<GuestTypeInvitationDto> SaveInvitationAsync(
        Guid eventId,
        Guid guestTypeId,
        InvitationDesignDto design,
        CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(designValidator, design, cancellationToken);
        var type = await FindTypeAsync(eventId, guestTypeId, cancellationToken);
        var assetIds = new[] { design.HeaderAssetId, design.DetailsAssetId, design.AcceptAssetId, design.DeclineAssetId }
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToArray();
        await assets.EnsureOwnedAsync(eventId, assetIds, cancellationToken);
        var urls = assetIds.ToDictionary(id => id, id => $"/api/public/assets/{id}");
        type.InvitationDesignJson = JsonSerializer.Serialize(design, DesignJsonOptions);
        type.InvitationHtml = InvitationEmailBuilder.Build(design, urls);
        type.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        await assets.DeleteUnreferencedAsync(eventId, await DesignAssetIds.KeepSet(db, eventId, cancellationToken), cancellationToken);
        return new GuestTypeInvitationDto(design, type.InvitationHtml, type.UpdatedOn, true);
    }

    public async Task<GuestTypeBadgeDto> GetBadgeAsync(Guid eventId, Guid guestTypeId, CancellationToken cancellationToken)
    {
        var type = await FindTypeAsync(eventId, guestTypeId, cancellationToken);
        if (!IsConfigured(type.BadgeDesignJson))
        {
            return new GuestTypeBadgeDto(BadgeDesignDto.CreateDefault(), null, false);
        }

        var design = JsonSerializer.Deserialize<BadgeDesignDto>(type.BadgeDesignJson!, DesignJsonOptions)
            ?? BadgeDesignDto.CreateDefault();
        return new GuestTypeBadgeDto(design, type.UpdatedOn, true);
    }

    public async Task<GuestTypeBadgeDto> SaveBadgeAsync(
        Guid eventId,
        Guid guestTypeId,
        BadgeDesignDto design,
        CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(badgeValidator, design, cancellationToken);
        var type = await FindTypeAsync(eventId, guestTypeId, cancellationToken);
        var owned = design.BackgroundAssetId is Guid backgroundId ? new[] { backgroundId } : Array.Empty<Guid>();
        await assets.EnsureOwnedAsync(eventId, owned, cancellationToken);
        type.BadgeDesignJson = JsonSerializer.Serialize(design, DesignJsonOptions);
        type.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        await assets.DeleteUnreferencedAsync(eventId, await DesignAssetIds.KeepSet(db, eventId, cancellationToken), cancellationToken);
        return new GuestTypeBadgeDto(design, type.UpdatedOn, true);
    }

    public async Task<IReadOnlyList<GuestDto>> ListGuestsAsync(
        Guid eventId,
        Guid? guestTypeId,
        bool unassigned,
        CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        var query = db.Guests.AsNoTracking().Where(item => item.EventId == eventId);
        if (unassigned)
        {
            query = query.Where(item => item.GuestTypeId == null);
        }
        else if (guestTypeId.HasValue)
        {
            query = query.Where(item => item.GuestTypeId == guestTypeId);
        }

        var guests = await query.OrderBy(item => item.Name).ToListAsync(cancellationToken);
        return await MapGuestsAsync(eventId, guests, cancellationToken);
    }

    public async Task<GuestDto> CreateGuestAsync(Guid eventId, SaveGuestRequest request, CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        await ValidationGuard.EnsureValidAsync(saveGuestValidator, request, cancellationToken);
        GuestType? type = null;
        if (request.GuestTypeId.HasValue)
        {
            type = await FindTypeAsync(eventId, request.GuestTypeId.Value, cancellationToken);
            EnsureAssignable(type);
        }

        var guest = new Guest
        {
            Id = Guid.CreateVersion7(),
            EventId = eventId,
            GuestTypeId = type?.Id,
            Name = request.Name.Trim(),
            Email = BlankToNull(request.Email),
            Position = BlankToNull(request.Position),
            CheckInCode = NewCheckInCode(),
            CreatedOn = DateTime.UtcNow,
            UpdatedOn = DateTime.UtcNow,
        };
        db.Guests.Add(guest);
        await db.SaveChangesAsync(cancellationToken);
        return (await MapGuestsAsync(eventId, [guest], cancellationToken)).Single();
    }

    public async Task<GuestDto> UpdateGuestAsync(
        Guid eventId,
        Guid guestId,
        SaveGuestRequest request,
        CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(saveGuestValidator, request, cancellationToken);
        var guest = await FindGuestAsync(eventId, guestId, cancellationToken);
        GuestType? type = null;
        if (request.GuestTypeId.HasValue)
        {
            type = await FindTypeAsync(eventId, request.GuestTypeId.Value, cancellationToken);
            if (guest.GuestTypeId != type.Id)
            {
                EnsureAssignable(type);
            }
        }

        if (guest.GuestTypeId != type?.Id)
        {
            await EnsureTypeChangeAcknowledgedAsync(guest, request.AcknowledgeTypeChange, cancellationToken);
        }

        guest.Name = request.Name.Trim();
        guest.Email = BlankToNull(request.Email);
        guest.Position = BlankToNull(request.Position);
        guest.GuestTypeId = type?.Id;
        guest.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return (await MapGuestsAsync(eventId, [guest], cancellationToken)).Single();
    }

    public async Task<GuestOperationResult> ReassignGuestsAsync(
        Guid eventId,
        ReassignGuestsRequest request,
        CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(reassignValidator, request, cancellationToken);
        var type = await FindTypeAsync(eventId, request.GuestTypeId, cancellationToken);
        EnsureAssignable(type);
        var guests = await LoadGuestsAsync(eventId, request.GuestIds, cancellationToken);
        var needsAck = new List<Guest>();
        foreach (var guest in guests)
        {
            if (guest.GuestTypeId != type.Id && await HasArtifactsAsync(guest.Id, cancellationToken))
            {
                needsAck.Add(guest);
            }
        }

        if (needsAck.Count > 0 && !request.AcknowledgeTypeChange)
        {
            throw AppException.Conflict(
                "Changing a guest type does not resend the invitation or regenerate the badge. Confirm to update the assignment only.",
                "acknowledgeTypeChange",
                "Confirm the type change.");
        }

        foreach (var guest in guests)
        {
            guest.GuestTypeId = type.Id;
            guest.UpdatedOn = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(cancellationToken);
        var issued = guests.Select(guest => new GuestOperationItem(guest.Id, guest.Name, type.Name)).ToArray();
        return new GuestOperationResult(true, issued, [], $"Assigned {issued.Length} guest{(issued.Length == 1 ? "" : "s")} to {type.Name}.");
    }

    public async Task<ImportGuestsResultDto> ImportGuestsAsync(
        Guid eventId,
        ImportGuestsRequest request,
        CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        await ValidationGuard.EnsureValidAsync(importValidator, request, cancellationToken);
        var types = await db.GuestTypes.Where(item => item.EventId == eventId).ToListAsync(cancellationToken);
        var plan = PlanImport(eventId, request, types);
        if (!request.Commit || plan.Errors.Count > 0)
        {
            return new ImportGuestsResultDto(
                plan.Errors.Count == 0,
                plan.Ready.Count,
                0,
                plan.Errors.ToArray(),
                plan.Unmatched.ToArray(),
                plan.Errors.Count == 0
                    ? $"{plan.Ready.Count} guest{(plan.Ready.Count == 1 ? "" : "s")} ready to import."
                    : "Fix the rows below before importing. Nothing was saved.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var sort = types.Count == 0 ? -1 : types.Max(item => item.SortOrder);
        foreach (var name in plan.TypesToCreate)
        {
            sort += 1;
            var created = new GuestType
            {
                Id = Guid.CreateVersion7(),
                EventId = eventId,
                Name = name,
                SortOrder = sort,
                IsEnabled = true,
                CreatedOn = DateTime.UtcNow,
                UpdatedOn = DateTime.UtcNow,
            };
            db.GuestTypes.Add(created);
            types.Add(created);
            plan.Resolved[Key(name)] = created;
        }

        var now = DateTime.UtcNow;
        foreach (var row in plan.Ready)
        {
            var type = row.Type;
            if (type is null && row.RawType is not null && plan.Resolved.TryGetValue(Key(row.RawType), out var created))
            {
                type = created;
            }

            db.Guests.Add(new Guest
            {
                Id = Guid.CreateVersion7(),
                EventId = eventId,
                GuestTypeId = type?.Id,
                Name = row.Name,
                Email = row.Email,
                Position = row.Position,
                CheckInCode = NewCheckInCode(),
                CreatedOn = now,
                UpdatedOn = now,
            });
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new ImportGuestsResultDto(
            true,
            plan.Ready.Count,
            plan.TypesToCreate.Count,
            [],
            [],
            $"Imported {plan.Ready.Count} guest{(plan.Ready.Count == 1 ? "" : "s")}.");
    }

    public async Task<GuestOperationResult> IssueInvitationsAsync(
        Guid eventId,
        GuestIdsRequest request,
        string assetOrigin,
        string appOrigin,
        CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(guestIdsValidator, request, cancellationToken);
        var slug = await EventSlugAsync(eventId, cancellationToken);
        var guests = await LoadGuestsAsync(eventId, request.GuestIds, cancellationToken);
        var types = await TypesByIdAsync(eventId, cancellationToken);
        var ready = new List<(Guest Guest, GuestType Type, string Html)>();
        var blocked = new List<GuestBlockDto>();
        foreach (var guest in guests)
        {
            var block = InvitationBlock(guest, types);
            if (block is not null)
            {
                blocked.Add(block);
                continue;
            }

            var type = types[guest.GuestTypeId!.Value];
            var design = JsonSerializer.Deserialize<InvitationDesignDto>(type.InvitationDesignJson!, DesignJsonOptions);
            if (design is null)
            {
                blocked.Add(new GuestBlockDto(guest.Id, guest.Name, Unreadable(type.Name, "invitation")));
                continue;
            }

            var assetIds = new[] { design.HeaderAssetId, design.DetailsAssetId, design.AcceptAssetId, design.DeclineAssetId }
                .Where(id => id.HasValue)
                .Select(id => id!.Value)
                .Distinct()
                .ToArray();
            var urls = assetIds.ToDictionary(id => id, id => $"{assetOrigin.TrimEnd('/')}/api/public/assets/{id}");
            var html = Personalize(InvitationEmailBuilder.Build(design, urls), guest, slug, appOrigin);
            ready.Add((guest, type, html));
        }

        if (ready.Count == 0)
        {
            throw Blocked(blocked);
        }

        var now = DateTime.UtcNow;
        foreach (var (guest, type, html) in ready)
        {
            db.GuestInvitationIssues.Add(new GuestInvitationIssue
            {
                Id = Guid.CreateVersion7(),
                GuestId = guest.Id,
                GuestTypeId = type.Id,
                GuestTypeName = type.Name,
                Html = html,
                IssuedOn = now,
            });
        }

        await db.SaveChangesAsync(cancellationToken);
        return OperationResult(
            ready.Select(item => new GuestOperationItem(item.Guest.Id, item.Guest.Name, item.Type.Name)).ToArray(),
            blocked,
            "invitation");
    }

    public async Task<BadgeBatchDto> PrepareBadgesAsync(Guid eventId, GuestIdsRequest request, CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(guestIdsValidator, request, cancellationToken);
        await EnsureEventExistsAsync(eventId, cancellationToken);
        var guests = await LoadGuestsAsync(eventId, request.GuestIds, cancellationToken);
        var types = await TypesByIdAsync(eventId, cancellationToken);
        var ready = new List<BadgeGenerationDto>();
        var blocked = new List<GuestBlockDto>();
        foreach (var guest in guests)
        {
            var (type, design, block) = ResolveBadge(guest, types);
            if (block is not null)
            {
                blocked.Add(block);
                continue;
            }

            ready.Add(new BadgeGenerationDto(guest.Id, type!.Id, guest.Name, type.Name, guest.CheckInCode, design!));
        }

        var complete = blocked.Count == 0;
        var message = complete
            ? $"{ready.Count} badge{(ready.Count == 1 ? "" : "s")} ready."
            : $"{ready.Count} ready, {blocked.Count} blocked. Blocked guests were not included.";
        return new BadgeBatchDto(complete, ready.ToArray(), blocked.ToArray(), message);
    }

    public async Task<GuestOperationResult> CommitBadgesAsync(Guid eventId, GuestIdsRequest request, CancellationToken cancellationToken)
    {
        var prepared = await PrepareBadgesAsync(eventId, request, cancellationToken);
        if (prepared.Ready.Length == 0)
        {
            throw Blocked(prepared.Blocked);
        }

        var now = DateTime.UtcNow;
        foreach (var item in prepared.Ready)
        {
            db.GuestBadgeIssues.Add(new GuestBadgeIssue
            {
                Id = Guid.CreateVersion7(),
                GuestId = item.GuestId,
                GuestTypeId = item.GuestTypeId,
                GuestTypeName = item.GuestTypeName,
                QrPayload = item.QrPayload,
                GeneratedOn = now,
            });
        }

        await db.SaveChangesAsync(cancellationToken);
        return OperationResult(
            prepared.Ready.Select(item => new GuestOperationItem(item.GuestId, item.Name, item.GuestTypeName)).ToArray(),
            prepared.Blocked.ToList(),
            "badge");
    }

    private async Task EnsureTypeChangeAcknowledgedAsync(Guest guest, bool acknowledged, CancellationToken cancellationToken)
    {
        if (acknowledged || !await HasArtifactsAsync(guest.Id, cancellationToken))
        {
            return;
        }

        throw AppException.Conflict(
            "Changing the guest type does not resend the invitation or regenerate the badge. The existing invitation, RSVP, and check-in code stay as they are.",
            "acknowledgeTypeChange",
            "Confirm the type change.");
    }

    private async Task<bool> HasArtifactsAsync(Guid guestId, CancellationToken cancellationToken)
    {
        return await db.GuestInvitationIssues.AnyAsync(item => item.GuestId == guestId, cancellationToken)
            || await db.GuestBadgeIssues.AnyAsync(item => item.GuestId == guestId, cancellationToken);
    }

    private static GuestBlockDto? InvitationBlock(Guest guest, IReadOnlyDictionary<Guid, GuestType> types)
    {
        if (guest.GuestTypeId is not Guid typeId || !types.TryGetValue(typeId, out var type))
        {
            return new GuestBlockDto(guest.Id, guest.Name, "This guest has no valid guest type. Assign a guest type before continuing.");
        }

        if (!type.IsEnabled)
        {
            return new GuestBlockDto(guest.Id, guest.Name, $"{type.Name} is disabled. Enable it before sending invitations or generating badges.");
        }

        if (!IsConfigured(type.InvitationDesignJson))
        {
            return new GuestBlockDto(
                guest.Id,
                guest.Name,
                $"The {type.Name} invitation design has not been configured. Open the {type.Name} invitation designer to continue.");
        }

        return null;
    }

    private static (GuestType? Type, BadgeDesignDto? Design, GuestBlockDto? Block) ResolveBadge(
        Guest guest,
        IReadOnlyDictionary<Guid, GuestType> types)
    {
        if (guest.GuestTypeId is not Guid typeId || !types.TryGetValue(typeId, out var type))
        {
            return (null, null, new GuestBlockDto(guest.Id, guest.Name, "This guest has no valid guest type. Assign a guest type before continuing."));
        }

        if (!type.IsEnabled)
        {
            return (null, null, new GuestBlockDto(guest.Id, guest.Name, $"{type.Name} is disabled. Enable it before sending invitations or generating badges."));
        }

        if (!IsConfigured(type.BadgeDesignJson))
        {
            return (null, null, new GuestBlockDto(
                guest.Id,
                guest.Name,
                $"The {type.Name} badge design is missing. Configure the {type.Name} badge before generating badges."));
        }

        var design = JsonSerializer.Deserialize<BadgeDesignDto>(type.BadgeDesignJson!, DesignJsonOptions);
        if (design is null)
        {
            return (null, null, new GuestBlockDto(guest.Id, guest.Name, Unreadable(type.Name, "badge")));
        }

        return (type, design, null);
    }

    private static GuestOperationResult OperationResult(GuestOperationItem[] issued, List<GuestBlockDto> blocked, string noun)
    {
        var complete = blocked.Count == 0;
        var nounLabel = issued.Length == 1 ? noun : $"{noun}s";
        var message = complete
            ? $"Recorded {issued.Length} {nounLabel}."
            : $"Recorded {issued.Length} {nounLabel}. {blocked.Count} guest{(blocked.Count == 1 ? " was" : "s were")} blocked and were not included.";
        return new GuestOperationResult(complete, issued, blocked.ToArray(), message);
    }

    private static AppException Blocked(IReadOnlyList<GuestBlockDto> blocked)
    {
        var errors = Blocks(blocked);
        var message = errors["guests"][0];
        return new AppException(message, StatusCodes.Status400BadRequest, errors);
    }

    private static Dictionary<string, string[]> Blocks(IReadOnlyList<GuestBlockDto> blocked)
    {
        var message = blocked.Count == 0
            ? "Nothing could be completed."
            : blocked.Count == 1
                ? blocked[0].Reason
                : $"{blocked.Count} guests are blocked. Nothing was recorded.";
        return new Dictionary<string, string[]>
        {
            ["guests"] = [message, .. blocked.Select(item => $"{item.Name}: {item.Reason}")],
        };
    }

    private ImportPlan PlanImport(Guid eventId, ImportGuestsRequest request, List<GuestType> types)
    {
        var byKey = types.GroupBy(type => Key(type.Name)).ToDictionary(group => group.Key, group => group.First());
        var mappings = new Dictionary<string, ImportTypeMapping>(StringComparer.Ordinal);
        foreach (var mapping in request.Mappings ?? [])
        {
            var key = Key(mapping.Value ?? string.Empty);
            if (key.Length > 0)
            {
                mappings[key] = mapping;
            }
        }

        var errors = new List<ImportRowErrorDto>();
        var unmatched = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        var ready = new List<ReadyGuest>();
        var createNames = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var row in request.Rows)
        {
            var name = row.Name?.Trim() ?? string.Empty;
            if (name.Length == 0)
            {
                errors.Add(new ImportRowErrorDto(row.Row, $"Row {row.Row} needs a guest name."));
                continue;
            }

            var email = BlankToNull(row.Email);
            if (email is not null && !email.Contains('@'))
            {
                errors.Add(new ImportRowErrorDto(row.Row, $"Row {row.Row} has an invalid email address."));
                continue;
            }

            GuestType? type = null;
            var rawType = row.GuestType;
            if (rawType is not null && string.IsNullOrWhiteSpace(rawType))
            {
                errors.Add(new ImportRowErrorDto(row.Row, $"Row {row.Row} has a blank guest type."));
                continue;
            }

            if (!string.IsNullOrWhiteSpace(rawType))
            {
                var key = Key(rawType);
                if (byKey.TryGetValue(key, out var existing))
                {
                    if (!existing.IsEnabled)
                    {
                        errors.Add(new ImportRowErrorDto(row.Row, $"Row {row.Row} uses {existing.Name}, which is disabled."));
                        continue;
                    }

                    type = existing;
                }
                else if (mappings.TryGetValue(key, out var mapping) && mapping.GuestTypeId.HasValue)
                {
                    type = types.FirstOrDefault(item => item.Id == mapping.GuestTypeId && item.EventId == eventId);
                    if (type is null)
                    {
                        errors.Add(new ImportRowErrorDto(row.Row, $"Row {row.Row} is mapped to a guest type that is not on this event."));
                        continue;
                    }

                    if (!type.IsEnabled)
                    {
                        errors.Add(new ImportRowErrorDto(row.Row, $"Row {row.Row} is mapped to {type.Name}, which is disabled."));
                        continue;
                    }
                }
                else if (mappings.TryGetValue(key, out mapping) && mapping.Create)
                {
                    createNames.TryAdd(key, rawType.Trim());
                }
                else
                {
                    unmatched.Add(rawType.Trim());
                    errors.Add(new ImportRowErrorDto(row.Row, $"Row {row.Row} has an unknown guest type \"{rawType.Trim()}\"."));
                    continue;
                }
            }

            ready.Add(new ReadyGuest(name, email, BlankToNull(row.Position), type, rawType));
        }

        var resolved = byKey.ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);
        return new ImportPlan(ready, errors, unmatched, createNames.Values.ToList(), resolved);
    }

    private async Task<IReadOnlyList<GuestDto>> MapGuestsAsync(Guid eventId, IReadOnlyList<Guest> guests, CancellationToken cancellationToken)
    {
        if (guests.Count == 0)
        {
            return [];
        }

        var ids = guests.Select(item => item.Id).ToArray();
        var typeIds = guests.Where(item => item.GuestTypeId.HasValue).Select(item => item.GuestTypeId!.Value).Distinct().ToArray();
        var types = await db.GuestTypes.AsNoTracking()
            .Where(item => item.EventId == eventId && typeIds.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id, cancellationToken);
        var invitations = await db.GuestInvitationIssues.AsNoTracking()
            .Where(item => ids.Contains(item.GuestId))
            .ToListAsync(cancellationToken);
        var badges = await db.GuestBadgeIssues.AsNoTracking()
            .Where(item => ids.Contains(item.GuestId))
            .ToListAsync(cancellationToken);
        return guests.Select(guest =>
        {
            types.TryGetValue(guest.GuestTypeId ?? Guid.Empty, out var type);
            var invitationRows = invitations.Where(item => item.GuestId == guest.Id).ToArray();
            var badgeRows = badges.Where(item => item.GuestId == guest.Id).ToArray();
            var lastInvitation = invitationRows.OrderByDescending(item => item.IssuedOn).FirstOrDefault();
            var lastBadge = badgeRows.OrderByDescending(item => item.GeneratedOn).FirstOrDefault();
            return new GuestDto(
                guest.Id,
                guest.Name,
                guest.Email,
                guest.Position,
                guest.GuestTypeId,
                type?.Name,
                type?.IsEnabled,
                guest.CheckInCode,
                invitationRows.Length,
                badgeRows.Length,
                lastInvitation?.IssuedOn,
                lastInvitation?.GuestTypeName,
                lastBadge?.GeneratedOn,
                lastBadge?.GuestTypeName);
        }).ToList();
    }

    private async Task<List<Guest>> LoadGuestsAsync(Guid eventId, IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken)
    {
        var distinct = ids.Distinct().ToArray();
        var guests = await db.Guests.Where(item => item.EventId == eventId && distinct.Contains(item.Id)).ToListAsync(cancellationToken);
        if (guests.Count != distinct.Length)
        {
            throw AppException.NotFound("One or more guests are not on this event.");
        }

        return guests;
    }

    private async Task<Dictionary<Guid, GuestType>> TypesByIdAsync(Guid eventId, CancellationToken cancellationToken)
    {
        return await db.GuestTypes.AsNoTracking()
            .Where(item => item.EventId == eventId)
            .ToDictionaryAsync(item => item.Id, cancellationToken);
    }

    private async Task EnsureTypeNameAvailableAsync(Guid eventId, string name, Guid? exceptId, CancellationToken cancellationToken)
    {
        var key = Key(name);
        var taken = await db.GuestTypes.AnyAsync(
            item => item.EventId == eventId && item.Id != exceptId && item.Name.ToLower() == key,
            cancellationToken);
        if (taken)
        {
            throw AppException.Conflict("A guest type with this name already exists on the event.", "name", "Choose a different name.");
        }
    }

    private async Task<GuestType> FindTypeAsync(Guid eventId, Guid guestTypeId, CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        var type = await db.GuestTypes.FirstOrDefaultAsync(item => item.Id == guestTypeId && item.EventId == eventId, cancellationToken);
        if (type is null)
        {
            throw AppException.NotFound("Guest type not found on this event.");
        }

        return type;
    }

    private async Task<Guest> FindGuestAsync(Guid eventId, Guid guestId, CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        var guest = await db.Guests.FirstOrDefaultAsync(item => item.Id == guestId && item.EventId == eventId, cancellationToken);
        if (guest is null)
        {
            throw AppException.NotFound("Guest not found on this event.");
        }

        return guest;
    }

    private async Task EnsureEventExistsAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var exists = await db.Events.AsNoTracking().AnyAsync(item => item.Id == eventId, cancellationToken);
        if (!exists)
        {
            throw AppException.NotFound("Event not found.");
        }
    }

    private async Task<string> EventSlugAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var slug = await db.Events.AsNoTracking()
            .Where(item => item.Id == eventId)
            .Select(item => item.Slug)
            .FirstOrDefaultAsync(cancellationToken);
        if (slug is null)
        {
            throw AppException.NotFound("Event not found.");
        }

        return slug;
    }

    private static void EnsureAssignable(GuestType type)
    {
        if (!type.IsEnabled)
        {
            throw AppException.Validation(new Dictionary<string, string[]>
            {
                ["guestTypeId"] = [$"{type.Name} is disabled. Enable it before assigning guests."],
            });
        }
    }

    private static string Personalize(string html, Guest guest, string slug, string appOrigin)
    {
        var guestPage = $"{appOrigin.TrimEnd('/')}/invite/{Uri.EscapeDataString(slug)}";
        return html
            .Replace("{{GuestName}}", WebUtility.HtmlEncode(guest.Name), StringComparison.Ordinal)
            .Replace("{{GuestPosition}}", WebUtility.HtmlEncode(guest.Position ?? string.Empty), StringComparison.Ordinal)
            .Replace("{{AcceptUrl}}", $"{guestPage}/rsvp?status=accept", StringComparison.Ordinal)
            .Replace("{{DeclineUrl}}", $"{guestPage}/rsvp?status=decline", StringComparison.Ordinal);
    }

    private static GuestTypeDto ToTypeDto(GuestType type, int guestCount) => new(
        type.Id,
        type.Name,
        type.SortOrder,
        type.IsEnabled,
        guestCount,
        IsConfigured(type.InvitationDesignJson),
        IsConfigured(type.BadgeDesignJson),
        type.UpdatedOn);

    private static bool IsConfigured(string? json) => !string.IsNullOrWhiteSpace(json);

    private static string? BlankToNull(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }

    private static string Key(string value) => value.Trim().ToLowerInvariant();

    private static string NewCheckInCode() => Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();

    private static string Unreadable(string typeName, string kind) =>
        $"The {typeName} {kind} design could not be read. Open the {typeName} {kind} designer and save it again.";

    private sealed record ReadyGuest(string Name, string? Email, string? Position, GuestType? Type, string? RawType);

    private sealed class ImportPlan(
        List<ReadyGuest> ready,
        List<ImportRowErrorDto> errors,
        SortedSet<string> unmatched,
        List<string> typesToCreate,
        Dictionary<string, GuestType> resolved)
    {
        public List<ReadyGuest> Ready { get; } = ready;

        public List<ImportRowErrorDto> Errors { get; } = errors;

        public SortedSet<string> Unmatched { get; } = unmatched;

        public List<string> TypesToCreate { get; } = typesToCreate;

        public Dictionary<string, GuestType> Resolved { get; } = resolved;
    }
}
