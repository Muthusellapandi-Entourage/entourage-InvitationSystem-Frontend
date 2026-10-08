using Entourage.Domain.Enums;

namespace Entourage.Application.DTOs;

public sealed record InvitationWriteRequest(
    string Addressee,
    string PatronageIntro,
    string PatronName,
    string PatronTitle,
    string PatronClosing,
    string HostIntro,
    string HostName,
    string BodyIntro,
    string OrganizationName,
    string OrganizationSubtitle,
    string Announcement,
    string AttendanceLine,
    string DateLine,
    string HijriDateLine,
    string TimeLine,
    string VenueLine,
    string? LocationUrl,
    string RsvpNote,
    string RsvpDeadline,
    InvitationReplyMode ReplyMode,
    string AcceptLabel,
    string DeclineLabel);

public sealed record InvitationDto(
    Guid Id,
    Guid EventId,
    string Addressee,
    string PatronageIntro,
    string PatronName,
    string PatronTitle,
    string PatronClosing,
    string HostIntro,
    string HostName,
    string BodyIntro,
    string OrganizationName,
    string OrganizationSubtitle,
    string Announcement,
    string AttendanceLine,
    string DateLine,
    string HijriDateLine,
    string TimeLine,
    string VenueLine,
    string LocationUrl,
    string RsvpNote,
    string RsvpDeadline,
    InvitationReplyMode ReplyMode,
    string AcceptLabel,
    string DeclineLabel,
    DateTime UpdatedOn);

public sealed record PublicInvitationDto(
    string EventName,
    string Slug,
    string Addressee,
    string PatronageIntro,
    string PatronName,
    string PatronTitle,
    string PatronClosing,
    string HostIntro,
    string HostName,
    string BodyIntro,
    string OrganizationName,
    string OrganizationSubtitle,
    string Announcement,
    string AttendanceLine,
    string DateLine,
    string HijriDateLine,
    string TimeLine,
    string VenueLine,
    string LocationUrl,
    string RsvpNote,
    string RsvpDeadline,
    InvitationReplyMode ReplyMode,
    string AcceptLabel,
    string DeclineLabel,
    string? Html);

public sealed record RecordInvitationResponseRequest(string GuestName, RsvpStatus Status);

public sealed record InvitationResponseDto(
    Guid Id,
    string GuestName,
    RsvpStatus Status,
    DateTime CreatedOn);
