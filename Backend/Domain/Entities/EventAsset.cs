namespace Entourage.Domain.Entities;

public sealed class EventAsset
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public string FileName { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;

    public string RelativePath { get; set; } = string.Empty;

    public DateTime CreatedOn { get; set; }

    public Event? Event { get; set; }
}
