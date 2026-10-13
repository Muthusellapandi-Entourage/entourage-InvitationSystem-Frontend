namespace Entourage.Domain.Entities;

public sealed class Guest
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public Guid? GuestTypeId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Email { get; set; }

    public string? Position { get; set; }

    /// <summary>Stable check-in identity. Type changes and new invitations do not rotate it.</summary>
    public string CheckInCode { get; set; } = string.Empty;

    public DateTime CreatedOn { get; set; }

    public DateTime UpdatedOn { get; set; }

    public Event? Event { get; set; }

    public GuestType? GuestType { get; set; }
}
