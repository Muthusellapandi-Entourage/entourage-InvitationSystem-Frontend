using Entourage.Application.DTOs;
using Entourage.Domain.Enums;
using FluentValidation;

namespace Entourage.Application.Validation;

public sealed class InvitationWriteRequestValidator : AbstractValidator<InvitationWriteRequest>
{
    public InvitationWriteRequestValidator()
    {
        RuleFor(request => request.Addressee).MaximumLength(300);
        RuleFor(request => request.PatronageIntro).MaximumLength(500);
        RuleFor(request => request.PatronName).MaximumLength(300);
        RuleFor(request => request.PatronTitle).MaximumLength(300);
        RuleFor(request => request.PatronClosing).MaximumLength(100);
        RuleFor(request => request.HostIntro).MaximumLength(500);
        RuleFor(request => request.HostName).MaximumLength(300);
        RuleFor(request => request.BodyIntro).MaximumLength(500);
        RuleFor(request => request.OrganizationName)
            .NotEmpty().WithMessage("Organization name is required.")
            .MaximumLength(300);
        RuleFor(request => request.OrganizationSubtitle).MaximumLength(300);
        RuleFor(request => request.Announcement).MaximumLength(2000);
        RuleFor(request => request.AttendanceLine).MaximumLength(500);
        RuleFor(request => request.DateLine)
            .NotEmpty().WithMessage("Date line is required.")
            .MaximumLength(200);
        RuleFor(request => request.HijriDateLine).MaximumLength(200);
        RuleFor(request => request.TimeLine).MaximumLength(100);
        RuleFor(request => request.VenueLine)
            .NotEmpty().WithMessage("Venue is required.")
            .MaximumLength(300);
        RuleFor(request => request.LocationUrl)
            .MaximumLength(500)
            .Must(BeHttpUrl)
            .WithMessage("Location link must start with http:// or https://.")
            .When(request => !string.IsNullOrWhiteSpace(request.LocationUrl));
        RuleFor(request => request.RsvpNote).MaximumLength(2000);
        RuleFor(request => request.RsvpDeadline).MaximumLength(300);
        RuleFor(request => request.ReplyMode).IsInEnum().WithMessage("Choose which reply buttons to show.");
        RuleFor(request => request.AcceptLabel)
            .NotEmpty().WithMessage("Accept button label is required.")
            .MaximumLength(40)
            .When(request => request.ReplyMode is InvitationReplyMode.Both or InvitationReplyMode.AcceptOnly);
        RuleFor(request => request.DeclineLabel)
            .NotEmpty().WithMessage("Decline button label is required.")
            .MaximumLength(40)
            .When(request => request.ReplyMode is InvitationReplyMode.Both or InvitationReplyMode.DeclineOnly);
    }

    private static bool BeHttpUrl(string? value)
    {
        return Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
            (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }
}
