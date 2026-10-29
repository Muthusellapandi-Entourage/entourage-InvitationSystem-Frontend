namespace Entourage.Domain.Entities;

/// <summary>
/// One line in a guest's activity history ("Added", "Invitation emailed", "Badge generated", "PDF downloaded"…).
/// Removed with the guest.
/// </summary>
public sealed class GuestActivity
{
    public Guid Id { get; set; }

    public Guid GuestId { get; set; }

    /// <summary>Short title, e.g. "Invitation emailed".</summary>
    public string Kind { get; set; } = string.Empty;

    /// <summary>Optional detail, e.g. "Invite PDF (Awardee)" or "Pending → Accepted".</summary>
    public string? Detail { get; set; }

    public DateTime CreatedOn { get; set; }

    public Guest? Guest { get; set; }
}

public static class GuestActivityKinds
{
    public const string Added = "Added";
    public const string Edited = "Edited";
    public const string InvitationRecorded = "Invitation recorded";
    public const string InvitationEmailed = "Invitation emailed";
    public const string ReminderEmailed = "Reminder emailed";
    public const string EmailFailed = "Email failed";
    public const string BadgeGenerated = "Badge generated";
    public const string StatusChanged = "Status changed";
    public const string Downloaded = "Downloaded";
    public const string CheckedIn = "Checked in";
    public const string Seated = "Seated";
    public const string SelfRegistered = "Self-registered";
    public const string BadgePrinted = "Badge printed";
}
