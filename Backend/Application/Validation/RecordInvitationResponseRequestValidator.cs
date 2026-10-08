using Entourage.Application.DTOs;
using FluentValidation;

namespace Entourage.Application.Validation;

public sealed class RecordInvitationResponseRequestValidator : AbstractValidator<RecordInvitationResponseRequest>
{
    public RecordInvitationResponseRequestValidator()
    {
        RuleFor(request => request.GuestName)
            .NotEmpty().WithMessage("Name is required.")
            .MaximumLength(120).WithMessage("Name must be 120 characters or fewer.");
        RuleFor(request => request.Status).IsInEnum().WithMessage("Choose accept or decline.");
    }
}
