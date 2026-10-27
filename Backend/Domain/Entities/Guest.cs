namespace Entourage.Domain.Entities;

public sealed class Guest
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public Guid? GuestTypeId { get; set; }

    /// <summary>Optional group this guest is organised under. Null = ungrouped.</summary>
    public Guid? GuestGroupId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string? Email { get; set; }

    public string? Position { get; set; }

    /// <summary>"Pending", "Accepted" or "Declined". Set by the admin or by the guest's RSVP reply.</summary>
    public string RsvpStatus { get; set; } = GuestRsvp.Pending;

    /// <summary>When <see cref="RsvpStatus"/> last changed. Null while it has never changed.</summary>
    public DateTime? RsvpUpdatedOn { get; set; }

    /// <summary>What the guest wrote when declining (optional, only when the event asks). Cleared on accept.</summary>
    public string? DeclineReason { get; set; }

    /// <summary>Stable check-in identity. Type changes and new invitations do not rotate it.</summary>
    public string CheckInCode { get; set; } = string.Empty;

    /// <summary>
    /// Secret code in the guest's personal invitation link (eventdomain.com/invitation.html?g=…).
    /// Random and unguessable; set for every new guest automatically.
    /// </summary>
    public string InviteToken { get; set; } = GuestInviteTokens.New();

    /// <summary>How many times the guest's E-Badge was scanned at the door.</summary>
    public int CheckInCount { get; set; }

    /// <summary>First door scan. Null = not checked in.</summary>
    public DateTime? FirstCheckedInOn { get; set; }

    /// <summary>Most recent door scan.</summary>
    public DateTime? LastCheckedInOn { get; set; }

    /// <summary>When staff marked the guest as seated at their table. Null = not seated.</summary>
    public DateTime? SeatedOn { get; set; }

    public DateTime CreatedOn { get; set; }

    public DateTime UpdatedOn { get; set; }

    public Event? Event { get; set; }

    public GuestType? GuestType { get; set; }

    public GuestGroup? GuestGroup { get; set; }
}

public static class GuestInviteTokens
{
    public const int Length = 16;

    /// <summary>16 lower-case hex characters (64 random bits).</summary>
    public static string New() =>
        Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(Length / 2)).ToLowerInvariant();

    public static bool LooksValid(string? value) =>
        value is { Length: Length } && value.All(character => character is (>= '0' and <= '9') or (>= 'a' and <= 'f'));
}

public static class GuestRsvp
{
    public const string Pending = "Pending";
    public const string Accepted = "Accepted";
    public const string Declined = "Declined";

    public static bool IsValid(string? value) => value is Pending or Accepted or Declined;
}
