using Entourage.Application.DTOs;
using FluentValidation;

namespace Entourage.Application.Validation;

public sealed class BadgeDesignValidator : AbstractValidator<BadgeDesignDto>
{
    private static readonly string[] Fonts = ["Manifa Bold", "Manifa Italic", "Arial", "Georgia", "Times New Roman"];

    public BadgeDesignValidator()
    {
        RuleFor(design => design.Width)
            .InclusiveBetween(200, 2400)
            .WithMessage("Width must be between 200 and 2400 pixels.");
        RuleFor(design => design.Height)
            .InclusiveBetween(200, 4000)
            .WithMessage("Height must be between 200 and 4000 pixels.");
        When(design => design.Background is not null, () => RuleFor(design => design.Background!).SetValidator(new BadgeBoxValidator()));
        When(design => design.Qr is not null, () => RuleFor(design => design.Qr!).SetValidator(new BadgeBoxValidator()));
        When(design => design.Name is not null, () =>
        {
            RuleFor(design => design.Name!.X).InclusiveBetween(0, 2400);
            RuleFor(design => design.Name!.Y).InclusiveBetween(0, 4000);
            RuleFor(design => design.Name!.Width).InclusiveBetween(20, 2400);
            RuleFor(design => design.Name!.Height).InclusiveBetween(20, 4000);
            RuleFor(design => design.Name!.Font)
                .Must(font => Fonts.Contains(font))
                .WithMessage("Choose a font from the list.");
            RuleFor(design => design.Name!.FontSize).InclusiveBetween(8, 160);
            RuleFor(design => design.Name!.Weight)
                .Must(value => value is "regular" or "bold")
                .WithMessage("Choose regular or bold.");
            RuleFor(design => design.Name!.Color)
                .Matches(HexColor.Pattern)
                .WithMessage("Use a color like #111111.");
            RuleFor(design => design.Name!.Align)
                .Must(value => value is "left" or "center" or "right")
                .WithMessage("Choose left, center, or right.");
            RuleFor(design => design.Name!.Valign)
                .Must(value => value is "top" or "middle" or "bottom")
                .WithMessage("Choose top, middle, or bottom.");
        });
        When(design => design.BackgroundColor is not null, () =>
            RuleFor(design => design.BackgroundColor!).Matches(HexColor.Pattern).WithMessage("Use a background colour like #FFFFFF."));
        When(design => design.Elements is not null, () =>
        {
            RuleFor(design => design.Elements!)
                .Must(elements => elements.Length <= 60)
                .WithMessage("A digital pass can hold at most 60 items.");
            RuleForEach(design => design.Elements!).ChildRules(element =>
            {
                element.RuleFor(item => item.Kind)
                    .Must(kind => kind is "name" or "position" or "company" or "guestType" or "seat" or "text" or "qr" or "image" or "rect")
                    .WithMessage("Unknown item on the digital pass.");
                element.RuleFor(item => item.Width).InclusiveBetween(1, 4000);
                element.RuleFor(item => item.Height).InclusiveBetween(1, 4000);
                element.RuleFor(item => item.X).InclusiveBetween(-4000, 4000);
                element.RuleFor(item => item.Y).InclusiveBetween(-4000, 4000);
                element.RuleFor(item => item.FontSize).InclusiveBetween(4, 400);
                element.RuleFor(item => item.Color).Matches(HexColor.Pattern).WithMessage("Use a colour like #111111.");
                element.When(item => item.Fill is not null, () =>
                    element.RuleFor(item => item.Fill!).Matches(HexColor.Pattern).WithMessage("Use a colour like #111111."));
                element.RuleFor(item => item.Text).MaximumLength(300);
                element.RuleFor(item => item.Name).MaximumLength(60);
                element.RuleFor(item => item.Font).MaximumLength(60);
            });
        });
        When(design => design.Guides is not null, () =>
        {
            RuleFor(design => design.Guides!.Vertical)
                .Must(values => values is null || (values.Length <= 40 && values.All(value => value is >= 0 and <= 4000)))
                .WithMessage("Vertical guides must stay between 0 and 4000.");
            RuleFor(design => design.Guides!.Horizontal)
                .Must(values => values is null || (values.Length <= 40 && values.All(value => value is >= 0 and <= 4000)))
                .WithMessage("Horizontal guides must stay between 0 and 4000.");
        });
    }
}

public sealed class BadgeBoxValidator : AbstractValidator<ImagePlacementDto>
{
    public BadgeBoxValidator()
    {
        RuleFor(placement => placement.X).InclusiveBetween(0, 2400);
        RuleFor(placement => placement.Y).InclusiveBetween(0, 4000);
        RuleFor(placement => placement.Width).InclusiveBetween(20, 2400);
        When(placement => placement.Height.HasValue, () =>
        {
            RuleFor(placement => placement.Height!.Value).InclusiveBetween(20, 4000);
        });
    }
}
