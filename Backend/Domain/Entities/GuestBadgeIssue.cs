namespace Entourage.Domain.Entities;

public sealed class GuestBadgeIssue
{
    public Guid Id { get; set; }

    public Guid GuestId { get; set; }

    public Guid? GuestTypeId { get; set; }

    public string GuestTypeName { get; set; } = string.Empty;

    public string QrPayload { get; set; } = string.Empty;

    public DateTime GeneratedOn { get; set; }

    public Guest? Guest { get; set; }
}
