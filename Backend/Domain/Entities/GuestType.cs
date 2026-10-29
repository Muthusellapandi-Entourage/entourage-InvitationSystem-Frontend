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

    /// <summary>The printed badge (paper, e.g. 4×3 in) for this type, as JSON. Separate from the E-Badge. Null = not designed.</summary>
    public string? PrintBadgeDesignJson { get; set; }

    public DateTime CreatedOn { get; set; }

    public DateTime UpdatedOn { get; set; }

    public Event? Event { get; set; }
}
