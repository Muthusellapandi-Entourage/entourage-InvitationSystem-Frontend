using Entourage.Application.DTOs;

namespace Entourage.Application.Interfaces;

public interface IEventFontService
{
    Task<IReadOnlyList<EventFontDto>> ListAsync(Guid eventId, CancellationToken cancellationToken);

    Task<EventFontDto> UploadAsync(Guid eventId, Stream content, string fileName, string? name, CancellationToken cancellationToken);

    Task DeleteAsync(Guid eventId, Guid fontId, CancellationToken cancellationToken);

    /// <summary>The font file's bytes, or null when it does not exist.</summary>
    Task<(byte[] Bytes, string ContentType, Guid EventId)?> ReadAsync(Guid fontId, CancellationToken cancellationToken);
}
