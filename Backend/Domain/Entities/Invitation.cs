using Entourage.Domain.Enums;

namespace Entourage.Domain.Entities;

public sealed class Invitation
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public string Addressee { get; set; } = string.Empty;

    public string PatronageIntro { get; set; } = string.Empty;

    public string PatronName { get; set; } = string.Empty;

    public string PatronTitle { get; set; } = string.Empty;

    public string PatronClosing { get; set; } = string.Empty;

    public string HostIntro { get; set; } = string.Empty;

    public string HostName { get; set; } = string.Empty;

    public string BodyIntro { get; set; } = string.Empty;

    public string OrganizationName { get; set; } = string.Empty;

    public string OrganizationSubtitle { get; set; } = string.Empty;

    public string Announcement { get; set; } = string.Empty;

    public string AttendanceLine { get; set; } = string.Empty;

    public string DateLine { get; set; } = string.Empty;

    public string HijriDateLine { get; set; } = string.Empty;

    public string TimeLine { get; set; } = string.Empty;

    public string VenueLine { get; set; } = string.Empty;

    public string? LocationUrl { get; set; }

    public string RsvpNote { get; set; } = string.Empty;

    public string RsvpDeadline { get; set; } = string.Empty;

    public InvitationReplyMode ReplyMode { get; set; } = InvitationReplyMode.Both;

    public string AcceptLabel { get; set; } = "تأكيد";

    public string DeclineLabel { get; set; } = "اعتذار";

    public string? DesignJson { get; set; }

    public string? Html { get; set; }

    public DateTime UpdatedOn { get; set; }

    public Event? Event { get; set; }
}
