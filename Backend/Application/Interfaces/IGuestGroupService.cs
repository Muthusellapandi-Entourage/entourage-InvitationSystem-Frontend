using Entourage.Application.DTOs;

namespace Entourage.Application.Interfaces;

public interface IGuestGroupService
{
    Task<IReadOnlyList<GuestGroupDto>> ListAsync(Guid eventId, CancellationToken cancellationToken);

    Task<GuestGroupDto> CreateAsync(Guid eventId, SaveGuestGroupRequest request, CancellationToken cancellationToken);

    Task<GuestGroupDto> RenameAsync(Guid eventId, Guid groupId, SaveGuestGroupRequest request, CancellationToken cancellationToken);

    /// <summary>
    /// Removes the group. With <paramref name="deleteGuests"/> its guests are deleted too
    /// (with their invitations, badges and seats); otherwise they stay on the event, ungrouped.
    /// </summary>
    Task<DeleteGuestGroupResult> DeleteAsync(Guid eventId, Guid groupId, bool deleteGuests, CancellationToken cancellationToken);

    Task<int> MoveGuestsAsync(Guid eventId, MoveGuestsToGroupRequest request, CancellationToken cancellationToken);

    /// <summary>Deletes guests with their invitation and badge history, and clears their seats.</summary>
    Task<DeleteGuestsResult> DeleteGuestsAsync(Guid eventId, GuestIdsRequest request, CancellationToken cancellationToken);

    /// <summary>Sets the guest's RSVP status (Pending / Accepted / Declined) and logs the change.</summary>
    Task<GuestActivityDto?> SetRsvpAsync(Guid eventId, Guid guestId, SetGuestRsvpRequest request, CancellationToken cancellationToken);

    /// <summary>The guest's history, newest first.</summary>
    Task<IReadOnlyList<GuestActivityDto>> ListActivityAsync(Guid eventId, Guid guestId, CancellationToken cancellationToken);

    /// <summary>Logs a browser-side action such as a download.</summary>
    Task<GuestActivityDto> LogActivityAsync(Guid eventId, Guid guestId, LogGuestActivityRequest request, CancellationToken cancellationToken);
}
