using Entourage.Application.DTOs;
using FluentValidation;

namespace Entourage.Application.Validation;

public sealed class InvitationDesignValidator : AbstractValidator<InvitationDesignDto>
{
    public InvitationDesignValidator()
    {
        RuleFor(design => design.GuestName).NotNull().SetValidator(new GuestFieldValidator());
        RuleFor(design => design.GuestPosition).NotNull().SetValidator(new GuestFieldValidator());
        When(design => design.Width.HasValue, () =>
        {
            RuleFor(design => design.Width!.Value)
                .InclusiveBetween(200, 2400)
                .WithMessage("Width must be between 200 and 2400 pixels.");
        });
        When(design => design.Height.HasValue, () =>
        {
            RuleFor(design => design.Height!.Value)
                .InclusiveBetween(200, 4000)
                .WithMessage("Height must be between 200 and 4000 pixels.");
        });
        RuleFor(design => design.GroupAlign)
            .Must(value => value is null or "left" or "center" or "right")
            .WithMessage("Choose left, center, or right.");
        RuleFor(design => design.GroupVertical)
            .Must(value => value is null or "top" or "middle" or "bottom")
            .WithMessage("Choose top, middle, or bottom.");
        When(design => design.GuestBand is not null, () =>
        {
            RuleFor(design => design.GuestBand!.Y).InclusiveBetween(0, 2000);
            RuleFor(design => design.GuestBand!.Height).InclusiveBetween(48, 800);
            RuleFor(design => design.GuestBand!.Align)
                .Must(value => value is "left" or "center" or "right")
                .WithMessage("Choose left, center, or right.");
            RuleFor(design => design.GuestBand!.Valign)
                .Must(value => value is "top" or "middle" or "bottom")
                .WithMessage("Choose top, middle, or bottom.");
            RuleFor(design => design.GuestBand!.Spacing).InclusiveBetween(0, 80);
            RuleFor(design => design.GuestBand!.Inset).InclusiveBetween(0, 120);
        });
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
        When(field => field.Box is not null, () =>
        {
            RuleFor(field => field.Box!.X).InclusiveBetween(0, 4000);
            RuleFor(field => field.Box!.Y).InclusiveBetween(0, 4000);
            RuleFor(field => field.Box!.Width).InclusiveBetween(40, 2400);
            RuleFor(field => field.Box!.Height).InclusiveBetween(20, 800);
        });
        When(field => field.BackgroundColor is not null, () =>
        {
            RuleFor(field => field.BackgroundColor!)
                .Matches("^#[0-9A-Fa-f]{6}$")
                .WithMessage("Use a background color like #000000.");
        });
        When(field => field.BackgroundOpacity is not null, () =>
        {
            RuleFor(field => field.BackgroundOpacity!.Value).InclusiveBetween(0, 100);
        });
        When(field => field.PadX is not null, () => RuleFor(field => field.PadX!.Value).InclusiveBetween(0, 80));
        When(field => field.PadY is not null, () => RuleFor(field => field.PadY!.Value).InclusiveBetween(0, 80));
        RuleFor(field => field.Weight)
            .Must(value => value is null or "regular" or "bold")
            .WithMessage("Choose regular or bold.");
    }
}
