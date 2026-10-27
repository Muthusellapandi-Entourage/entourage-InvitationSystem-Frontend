namespace Entourage.Domain.Entities;

/// <summary>
/// A font file (TTF or OTF) uploaded for one event, used to draw guest names on invitations.
/// The file lives under App_Data/fonts; this row only describes it.
/// </summary>
public sealed class EventFont
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    /// <summary>Display name shown in the font picker, e.g. "Manifa Bold".</summary>
    public string Name { get; set; } = string.Empty;

    public string FileName { get; set; } = string.Empty;

    public string RelativePath { get; set; } = string.Empty;

    /// <summary>"font/ttf" or "font/otf".</summary>
    public string ContentType { get; set; } = string.Empty;

    public long SizeBytes { get; set; }

    public DateTime CreatedOn { get; set; }

    public Event? Event { get; set; }
}
