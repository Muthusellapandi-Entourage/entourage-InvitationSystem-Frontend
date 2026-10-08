using Entourage.Domain.Enums;

namespace Entourage.Domain.Entities;

public sealed class InvitationResponse
{
    public Guid Id { get; set; }

    public Guid InvitationId { get; set; }

    public string GuestName { get; set; } = string.Empty;

    public RsvpStatus Status { get; set; }

    public DateTime CreatedOn { get; set; }
}
