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

    private async Task EnsureEventExistsAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var exists = await db.Events.AsNoTracking().AnyAsync(item => item.Id == eventId, cancellationToken);
        if (!exists)
        {
            throw AppException.NotFound("Event not found.");
        }
    }
}
