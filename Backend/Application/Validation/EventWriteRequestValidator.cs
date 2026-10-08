using Entourage.Application.DTOs;
using FluentValidation;

namespace Entourage.Application.Validation;

public sealed class EventWriteRequestValidator : AbstractValidator<EventWriteRequest>
{
    public EventWriteRequestValidator()
    {
        RuleFor(request => request.Name)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Event name is required.")
            .MaximumLength(200).WithMessage("Event name must be 200 characters or fewer.");

        RuleFor(request => request.Slug)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Event code is required.")
            .MaximumLength(80).WithMessage("Event code must be 80 characters or fewer.")
            .Matches("^[a-z0-9]+(?:-[a-z0-9]+)*$")
            .WithMessage("Use lowercase letters, numbers, and hyphens only.");

        RuleFor(request => request.Description)
            .MaximumLength(2000)
            .WithMessage("Description must be 2,000 characters or fewer.");

        RuleFor(request => request.StartDate)
            .Must(date => date != default)
            .WithMessage("Start date is required.");

        RuleFor(request => request.EndDate)
            .Cascade(CascadeMode.Stop)
            .Must(date => date != default).WithMessage("End date is required.")
            .Must((request, endDate) => endDate >= request.StartDate)
            .WithMessage("End date must be on or after the start date.");

        RuleFor(request => request.Timezone)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Timezone is required.")
            .MaximumLength(100).WithMessage("Timezone must be 100 characters or fewer.")
            .Must(TimezoneRules.IsValid).WithMessage("Choose a valid timezone.");

        RuleFor(request => request.Status)
            .IsInEnum()
            .WithMessage("Choose a valid status.");
    }
}
