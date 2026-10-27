using Entourage.Application.DTOs;
using FluentValidation;

namespace Entourage.Application.Validation;

public sealed class SaveMailSettingsRequestValidator : AbstractValidator<SaveMailSettingsRequest>
{
    public SaveMailSettingsRequestValidator()
    {
        RuleFor(request => request.Provider)
            .Must(provider => provider is "smtp" or "graph")
            .WithMessage("Choose SMTP or Microsoft 365 (Graph).");

        When(request => request.Provider != "graph", () =>
        {
            RuleFor(request => request.Host).NotEmpty().WithMessage("Enter the SMTP server, e.g. smtp.gmail.com.").MaximumLength(255);
            RuleFor(request => request.Port).InclusiveBetween(1, 65535).WithMessage("Enter a port between 1 and 65535 (usually 587).");
        });

        When(request => request.Provider == "graph", () =>
        {
            RuleFor(request => request.GraphTenantId)
                .NotEmpty().WithMessage("Enter the Directory (tenant) ID from the app registration.")
                .MaximumLength(100);
            RuleFor(request => request.GraphClientId)
                .NotEmpty().WithMessage("Enter the Application (client) ID from the app registration.")
                .Must(value => Guid.TryParse(value?.Trim(), out _)).WithMessage("The Application (client) ID is a GUID, e.g. 1a2b3c4d-….")
                .MaximumLength(100);
            RuleFor(request => request.GraphClientSecret).MaximumLength(500);
        });

        RuleFor(request => request.Username).MaximumLength(256);
        RuleFor(request => request.Password).MaximumLength(500);
        RuleFor(request => request.FromEmail)
            .NotEmpty().WithMessage("Enter the address invitations are sent from.")
            .MaximumLength(256)
            .Matches(EmailPattern.Value).WithMessage("Enter a valid sender email address.");
        RuleFor(request => request.FromName).MaximumLength(200);
    }
}

public sealed class SendTestEmailRequestValidator : AbstractValidator<SendTestEmailRequest>
{
    public SendTestEmailRequestValidator()
    {
        RuleFor(request => request.To)
            .NotEmpty().WithMessage("Enter the address to send the test to.")
            .MaximumLength(256)
            // Stricter than FluentValidation's EmailAddress(), which accepts typos such as "name@gmail,com".
            .Matches(EmailPattern.Value)
            .WithMessage("That email address looks wrong. Check for typos such as a comma instead of a dot (gmail,com → gmail.com).");
    }
}

internal static class EmailPattern
{
    public const string Value = @"^\s*[^@\s,;]+@[^@\s,;]+\.[^@\s,;.]{2,}\s*$";
}
