using Entourage.Application.DTOs;

namespace Entourage.Application.Interfaces;

public interface IInvitationService
{
    Task<InvitationDto> GetAsync(Guid eventId, CancellationToken cancellationToken);

    Task<InvitationDto> SaveAsync(Guid eventId, InvitationWriteRequest request, CancellationToken cancellationToken);

    Task<InvitationTemplateDto> GetTemplateAsync(Guid eventId, CancellationToken cancellationToken);

    Task<InvitationTemplateDto> SaveTemplateAsync(
        Guid eventId,
        InvitationDesignDto design,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<InvitationResponseDto>> ListResponsesAsync(Guid eventId, CancellationToken cancellationToken);

    Task<PublicInvitationDto> GetPublicAsync(string slug, CancellationToken cancellationToken);

    Task<InvitationResponseDto> RecordResponseAsync(
        string slug,
        RecordInvitationResponseRequest request,
        CancellationToken cancellationToken);
}
