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

    /// <summary>
    /// The event's own web address, lower case and without "https://", e.g. "excellenceawards2026.com".
    /// Its DNS points at this server; guests' invitation pages, RSVP buttons and images are served from it.
    /// </summary>
    public string? CustomDomain { get; set; }

    /// <summary>When the domain was last confirmed to reach this server. Null = not (yet) confirmed.</summary>
    public DateTime? CustomDomainVerifiedOn { get; set; }

    /// <summary>
    /// Secret code for the read-only live attendance link (/live/{token}) that can be sent to people
    /// without an account. Null = no link; a new code makes the old link stop working.
    /// </summary>
    public string? LiveShareToken { get; set; }

    /// <summary>
    /// Secret code for the front-desk dashboard (/live-dashboard/{token}): the guest list with check-in details,
    /// manual check-in and seating, without signing in. Null = no link.
    /// </summary>
    public string? FrontDeskToken { get; set; }

    /// <summary>When a guest declines, offer an optional box for their reason.</summary>
    public bool AskDeclineReason { get; set; }

    /// <summary>Artwork shown to a guest after they confirm they will attend. Null = a text thank-you.</summary>
    public Guid? ThankYouAssetId { get; set; }

    /// <summary>Look and wording of the guest RSVP page (background, logo, font, texts) as JSON. Null = defaults.</summary>
    public string? RsvpPageJson { get; set; }

    /// <summary>The public self-registration page (/register): fields, custom questions, look, open/closed, as JSON. Null = not set up.</summary>
    public string? RegistrationJson { get; set; }

    /// <summary>Secret code for the self check-in kiosk (/kiosk/{token}). Null = kiosk link turned off.</summary>
    public string? KioskToken { get; set; }

    /// <summary>Look and wording of the self check-in kiosk, as JSON. Null = defaults.</summary>
    public string? KioskJson { get; set; }

    public User? Creator { get; set; }
}
