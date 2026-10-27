namespace Entourage.Domain.Entities;

/// <summary>
/// The event's microsite, designed on a free canvas with a desktop and a phone layout. Served on the
/// event's own domain: personal (with RSVP buttons) for invited guests, and optionally a public version.
/// </summary>
public sealed class EventMicrosite
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    /// <summary>The canvas design (elements, frames per layout, page settings) as JSON.</summary>
    public string DesignJson { get; set; } = "{}";

    /// <summary>Guests' personal links open the microsite instead of the email-style invitation page.</summary>
    public bool IsPublished { get; set; }

    /// <summary>The event domain's home page shows a public version (no names, no RSVP buttons).</summary>
    public bool PublicEnabled { get; set; }

    public DateTime UpdatedOn { get; set; }

    public Event? Event { get; set; }
}
