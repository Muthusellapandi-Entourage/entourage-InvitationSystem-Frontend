using Entourage.Application.DTOs;
using FluentValidation;

namespace Entourage.Application.Validation;

public sealed class InvitationDesignValidator : AbstractValidator<InvitationDesignDto>
{
    public InvitationDesignValidator()
    {
        RuleFor(design => design.GuestName).NotNull().SetValidator(new GuestFieldValidator());
        RuleFor(design => design.GuestPosition).NotNull().SetValidator(new GuestFieldValidator());
    }
}

public sealed class GuestFieldValidator : AbstractValidator<GuestFieldDto>
{
    private static readonly string[] Fonts = ["Manifa Bold", "Manifa Italic", "Arial", "Georgia", "Times New Roman"];

    public GuestFieldValidator()
    {
        RuleFor(field => field.Font)
            .Must(font => Fonts.Contains(font))
            .WithMessage("Choose a font from the list.");
        RuleFor(field => field.FontSize).InclusiveBetween(8, 72);
        RuleFor(field => field.MobileFontSize).InclusiveBetween(8, 48);
        RuleFor(field => field.Color)
            .Matches("^#[0-9A-Fa-f]{6}$")
            .WithMessage("Use a color like #FFFFFF.");
        RuleFor(field => field.Alignment)
            .Must(value => value is "left" or "center" or "right")
            .WithMessage("Choose left, center, or right.");
        RuleFor(field => field.LeftPadding).InclusiveBetween(0, 160);
        RuleFor(field => field.TopSpacing).InclusiveBetween(0, 120);
    }
}
