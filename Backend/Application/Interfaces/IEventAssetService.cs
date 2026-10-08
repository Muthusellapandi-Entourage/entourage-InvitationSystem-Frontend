using Entourage.Application.DTOs;

namespace Entourage.Application.Interfaces;

public interface IEventAssetService
{
    Task<EventAssetDto> SaveAsync(
        Guid eventId,
        Stream content,
        string contentType,
        string originalFileName,
        CancellationToken cancellationToken);

    Task EnsureOwnedAsync(Guid eventId, IReadOnlyCollection<Guid> assetIds, CancellationToken cancellationToken);

    Task DeleteUnreferencedAsync(Guid eventId, IReadOnlyCollection<Guid> keep, CancellationToken cancellationToken);

    Task<EventAssetFile?> OpenAsync(Guid assetId, CancellationToken cancellationToken);
}
