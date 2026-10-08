using Entourage.Application.DTOs;
using Entourage.Domain.Enums;

namespace Entourage.Application.Interfaces;

public interface IEventService
{
    Task<IReadOnlyList<EventDto>> ListAsync(string? search, EventStatus? status, CancellationToken cancellationToken);

    Task<EventDto> GetAsync(Guid id, CancellationToken cancellationToken);

    Task<EventDto> CreateAsync(EventWriteRequest request, Guid userId, CancellationToken cancellationToken);

    Task<EventDto> UpdateAsync(Guid id, EventWriteRequest request, CancellationToken cancellationToken);

    Task DeleteAsync(Guid id, CancellationToken cancellationToken);

    Task<EventDto> UpdateStatusAsync(Guid id, UpdateEventStatusRequest request, CancellationToken cancellationToken);
}
