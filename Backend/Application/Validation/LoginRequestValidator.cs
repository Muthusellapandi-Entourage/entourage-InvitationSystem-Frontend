using Entourage.Application.DTOs;
using FluentValidation;

namespace Entourage.Application.Validation;

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(request => request.Email)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Email is required.")
            .MaximumLength(256).WithMessage("Email must be 256 characters or fewer.")
            .EmailAddress().WithMessage("Enter a valid email address.");

        RuleFor(request => request.Password)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Password is required.")
            .MaximumLength(200).WithMessage("Password must be 200 characters or fewer.");
    }
}
