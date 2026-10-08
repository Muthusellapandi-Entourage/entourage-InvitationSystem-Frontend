using Entourage.Application.DTOs;
using FluentValidation;

namespace Entourage.Application.Validation;

public sealed class UpdateEventStatusRequestValidator : AbstractValidator<UpdateEventStatusRequest>
{
    public UpdateEventStatusRequestValidator()
    {
        RuleFor(request => request.Status)
            .NotNull().WithMessage("Status is required.")
            .IsInEnum().WithMessage("Choose a valid status.");
    }
}
