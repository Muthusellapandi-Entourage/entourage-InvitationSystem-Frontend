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

public sealed class SeatingPlanService(
    AppDbContext db,
    IValidator<SaveSeatingPlanRequest> validator) : ISeatingPlanService
{
    public async Task<SeatingPlanDto> GetAsync(Guid eventId, CancellationToken cancellationToken)
    {
        await EnsureEventExistsAsync(eventId, cancellationToken);
        var plan = await db.SeatingPlans.AsNoTracking().FirstOrDefaultAsync(item => item.EventId == eventId, cancellationToken);
        return plan is null
            ? new SeatingPlanDto(null, null)
            : new SeatingPlanDto(plan.DesignJson, plan.UpdatedOn);
    }

    public async Task<SeatingPlanDto> SaveAsync(Guid eventId, SaveSeatingPlanRequest request, CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(validator, request, cancellationToken);
        await EnsureEventExistsAsync(eventId, cancellationToken);
        var plan = await db.SeatingPlans.FirstOrDefaultAsync(item => item.EventId == eventId, cancellationToken);
        var now = DateTime.UtcNow;
        if (plan is null)
        {
            plan = new SeatingPlan
            {
                Id = Guid.CreateVersion7(),
                EventId = eventId,
                DesignJson = request.DesignJson,
                UpdatedOn = now,
            };
            db.SeatingPlans.Add(plan);
        }
        else
        {
            plan.DesignJson = request.DesignJson;
            plan.UpdatedOn = now;
        }

        await db.SaveChangesAsync(cancellationToken);
        return new SeatingPlanDto(plan.DesignJson, plan.UpdatedOn);
    }

    public Task<SeatingPlanDto> DeleteLayoutAsync(Guid eventId, string layoutId, CancellationToken cancellationToken) =>
        MutateLayoutAsync(eventId, layoutId, (root, _, index) =>
        {
            if (root["layouts"] is not JsonArray layouts)
            {
                throw AppException.NotFound("Layout not found on this event.");
            }

            layouts.RemoveAt(index);
            var active = ReadString(root["activeLayoutId"]);
            if (active == layoutId)
            {
                if (layouts.Count == 0)
                {
                    root["activeLayoutId"] = "";
                }
                else
                {
                    var nextIndex = Math.Min(index, layouts.Count - 1);
                    root["activeLayoutId"] = ReadString(layouts[nextIndex]?["id"]) ?? "";
                }
            }
        }, cancellationToken);

    public Task<SeatingPlanDto> ResetLayoutAsync(Guid eventId, string layoutId, CancellationToken cancellationToken) =>
        MutateLayoutAsync(eventId, layoutId, static (_, layout, _) =>
        {
            // Assignments live only inside this layout's chairs. Guest, invitation, and check-in rows are untouched.
            layout["arrangements"] = new JsonArray();
        }, cancellationToken);

    private async Task<SeatingPlanDto> MutateLayoutAsync(
        Guid eventId,
        string layoutId,
        Action<JsonObject, JsonObject, int> mutate,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(layoutId) || layoutId.Length > 80)
        {
            throw AppException.NotFound("Layout not found on this event.");
        }

        await EnsureEventExistsAsync(eventId, cancellationToken);
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var plan = await db.SeatingPlans.FirstOrDefaultAsync(item => item.EventId == eventId, cancellationToken);
        if (plan is null || string.IsNullOrWhiteSpace(plan.DesignJson))
        {
            throw AppException.NotFound("This event has no seating plan.");
        }

        JsonObject root;
        try
        {
            root = JsonNode.Parse(plan.DesignJson) as JsonObject ?? throw new FormatException();
        }
        catch (Exception exception) when (exception is FormatException or System.Text.Json.JsonException)
        {
            throw new AppException("The seating plan is not valid.", StatusCodes.Status400BadRequest);
        }

        if (root["layouts"] is not JsonArray layouts)
        {
            throw AppException.NotFound("Layout not found on this event.");
        }

        var index = -1;
        JsonObject? layout = null;
        for (var i = 0; i < layouts.Count; i++)
        {
            if (layouts[i] is JsonObject candidate && ReadString(candidate["id"]) == layoutId)
            {
                index = i;
                layout = candidate;
                break;
            }
        }

        if (layout is null || index < 0)
        {
            throw AppException.NotFound("Layout not found on this event.");
        }

        mutate(root, layout, index);
        plan.DesignJson = root.ToJsonString();
        plan.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new SeatingPlanDto(plan.DesignJson, plan.UpdatedOn);
    }

    private static string? ReadString(JsonNode? node) =>
        node is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;

    private async Task EnsureEventExistsAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var exists = await db.Events.AsNoTracking().AnyAsync(item => item.Id == eventId, cancellationToken);
        if (!exists)
        {
            throw AppException.NotFound("Event not found.");
        }
    }
}
