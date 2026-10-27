using Entourage.Application.DTOs;

namespace Entourage.Application.Interfaces;

public interface ISeatingPlanService
{
    Task<SeatingPlanDto> GetAsync(Guid eventId, CancellationToken cancellationToken);

    Task<SeatingPlanDto> SaveAsync(Guid eventId, SaveSeatingPlanRequest request, CancellationToken cancellationToken);

    Task<SeatingPlanDto> DeleteLayoutAsync(Guid eventId, string layoutId, CancellationToken cancellationToken);

    Task<SeatingPlanDto> ResetLayoutAsync(Guid eventId, string layoutId, CancellationToken cancellationToken);
}
