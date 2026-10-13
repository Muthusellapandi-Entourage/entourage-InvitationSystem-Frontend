using Entourage.Application.DTOs;

namespace Entourage.Application.Interfaces;

public interface ISeatingPlanService
{
    Task<SeatingPlanDto> GetAsync(Guid eventId, CancellationToken cancellationToken);

    Task<SeatingPlanDto> SaveAsync(Guid eventId, SaveSeatingPlanRequest request, CancellationToken cancellationToken);
}
