using Entourage.Application.DTOs;

namespace Entourage.Application.Interfaces;

public interface IGuestDirectoryService
{
    Task<IReadOnlyList<GuestTypeDto>> ListTypesAsync(Guid eventId, CancellationToken cancellationToken);

    Task<GuestTypeDto> CreateTypeAsync(Guid eventId, CreateGuestTypeRequest request, CancellationToken cancellationToken);

    Task<GuestTypeDto> UpdateTypeAsync(Guid eventId, Guid guestTypeId, UpdateGuestTypeRequest request, CancellationToken cancellationToken);

    Task<IReadOnlyList<GuestTypeDto>> ReorderTypesAsync(Guid eventId, ReorderGuestTypesRequest request, CancellationToken cancellationToken);

    Task DeleteTypeAsync(Guid eventId, Guid guestTypeId, bool discardDesigns, CancellationToken cancellationToken);

    Task<GuestTypeDto> DuplicateDesignAsync(Guid eventId, Guid guestTypeId, DuplicateDesignRequest request, CancellationToken cancellationToken);

    Task<GuestTypeInvitationDto> GetInvitationAsync(Guid eventId, Guid guestTypeId, CancellationToken cancellationToken);

    Task<GuestTypeInvitationDto> SaveInvitationAsync(Guid eventId, Guid guestTypeId, InvitationDesignDto design, CancellationToken cancellationToken);

    Task<GuestTypeBadgeDto> GetBadgeAsync(Guid eventId, Guid guestTypeId, CancellationToken cancellationToken);

    Task<GuestTypeBadgeDto> SaveBadgeAsync(Guid eventId, Guid guestTypeId, BadgeDesignDto design, CancellationToken cancellationToken);

    Task<IReadOnlyList<GuestDto>> ListGuestsAsync(Guid eventId, Guid? guestTypeId, bool unassigned, CancellationToken cancellationToken);

    Task<GuestDto> CreateGuestAsync(Guid eventId, SaveGuestRequest request, CancellationToken cancellationToken);

    Task<GuestDto> UpdateGuestAsync(Guid eventId, Guid guestId, SaveGuestRequest request, CancellationToken cancellationToken);

    Task<GuestOperationResult> ReassignGuestsAsync(Guid eventId, ReassignGuestsRequest request, CancellationToken cancellationToken);

    Task<ImportGuestsResultDto> ImportGuestsAsync(Guid eventId, ImportGuestsRequest request, CancellationToken cancellationToken);

    Task<GuestOperationResult> IssueInvitationsAsync(
        Guid eventId,
        GuestIdsRequest request,
        string assetOrigin,
        string appOrigin,
        CancellationToken cancellationToken);

    Task<BadgeBatchDto> PrepareBadgesAsync(Guid eventId, GuestIdsRequest request, CancellationToken cancellationToken);

    Task<GuestOperationResult> CommitBadgesAsync(Guid eventId, GuestIdsRequest request, CancellationToken cancellationToken);
}
