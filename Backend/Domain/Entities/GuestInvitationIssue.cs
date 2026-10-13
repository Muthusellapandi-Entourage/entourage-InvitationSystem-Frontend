namespace Entourage.Domain.Entities;

public sealed class GuestInvitationIssue
{
    public Guid Id { get; set; }

    public Guid GuestId { get; set; }

    public Guid? GuestTypeId { get; set; }

    public string GuestTypeName { get; set; } = string.Empty;

    public string Html { get; set; } = string.Empty;

    public DateTime IssuedOn { get; set; }

    public Guest? Guest { get; set; }
}
