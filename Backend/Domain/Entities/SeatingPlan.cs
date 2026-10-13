namespace Entourage.Domain.Entities;

public sealed class SeatingPlan
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public Event Event { get; set; } = null!;

    public string DesignJson { get; set; } = "{}";

    public DateTime UpdatedOn { get; set; }
}
