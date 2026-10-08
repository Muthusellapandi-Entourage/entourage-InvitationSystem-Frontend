using Entourage.Domain.Enums;

namespace Entourage.Domain.Entities;

public sealed class Event
{
    public Guid Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Slug { get; set; } = string.Empty;

    public string? Description { get; set; }

    public DateOnly StartDate { get; set; }

    public DateOnly EndDate { get; set; }

    public string Timezone { get; set; } = string.Empty;

    public EventStatus Status { get; set; }

    public Guid CreatedBy { get; set; }

    public DateTime CreatedOn { get; set; }

    public DateTime UpdatedOn { get; set; }

    public bool IsActive { get; set; }

    public User? Creator { get; set; }
}
