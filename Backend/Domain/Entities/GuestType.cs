namespace Entourage.Domain.Entities;

public sealed class GuestType
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public string Name { get; set; } = string.Empty;

    public int SortOrder { get; set; }

    public bool IsEnabled { get; set; } = true;

    public string? InvitationDesignJson { get; set; }

    public string? InvitationHtml { get; set; }

    public string? BadgeDesignJson { get; set; }

    public DateTime CreatedOn { get; set; }

    public DateTime UpdatedOn { get; set; }

    public Event? Event { get; set; }
}
