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
        When(design => design.HeaderImage is not null, () => RuleFor(design => design.HeaderImage!).SetValidator(new ImagePlacementValidator()));
        When(design => design.DetailsImage is not null, () => RuleFor(design => design.DetailsImage!).SetValidator(new ImagePlacementValidator()));
        When(design => design.AcceptImage is not null, () => RuleFor(design => design.AcceptImage!).SetValidator(new ImagePlacementValidator()));
        When(design => design.DeclineImage is not null, () => RuleFor(design => design.DeclineImage!).SetValidator(new ImagePlacementValidator()));
        RuleFor(design => design.BackgroundColor)
            .Must(value => value is null || value == "transparent" || System.Text.RegularExpressions.Regex.IsMatch(value, HexColor.Pattern))
            .WithMessage("Use a canvas background like #313131, or transparent.");
        When(design => design.Guides is not null, () =>
        {
            RuleFor(design => design.Guides!.Vertical)
                .Must(values => values is null || (values.Length <= 40 && values.All(value => value is >= 0 and <= 4000)))
                .WithMessage("Vertical guides must stay between 0 and 4000.");
            RuleFor(design => design.Guides!.Horizontal)
                .Must(values => values is null || (values.Length <= 40 && values.All(value => value is >= 0 and <= 4000)))
                .WithMessage("Horizontal guides must stay between 0 and 4000.");
        });
        When(design => design.Slices is not null, () => RuleFor(design => design.Slices!).SetValidator(new SliceDesignValidator()));
    }
}

/// <summary>A sliced design must cover the whole image top to bottom, with exactly one name strip.</summary>
public sealed class SliceDesignValidator : AbstractValidator<SliceDesignDto>
{
    private static readonly string[] BuiltInFonts = ["Arial", "Georgia", "Times New Roman"];

    public SliceDesignValidator()
    {
        RuleFor(slices => slices.SourceAssetId).NotEmpty().WithMessage("Upload the full invitation design first.");
        RuleFor(slices => slices.SourceWidth).InclusiveBetween(200, 6000).WithMessage("The design must be between 200 and 6000 pixels wide.");
        RuleFor(slices => slices.SourceHeight).InclusiveBetween(100, 20000).WithMessage("The design must be between 100 and 20000 pixels tall.");
        RuleFor(slices => slices.Strips).NotNull().Must(strips => strips.Length is >= 1 and <= 30).WithMessage("Use between 1 and 30 slices.");
        RuleFor(slices => slices)
            .Must(slices => Covers(slices))
            .WithMessage("The slices must run from the top to the bottom of the design without gaps or overlaps.");
        RuleFor(slices => slices.Strips)
            .Must(strips => strips.Count(strip => strip.Role == "name") == 1)
            .WithMessage("Mark exactly one slice as the guest name area.");
        RuleFor(slices => slices.Strips)
            .Must(strips => strips.Count(strip => strip.Role == "buttons") <= 1)
            .WithMessage("Mark at most one slice as the Accept / Decline row.");
        RuleForEach(slices => slices.Strips).ChildRules(strip =>
        {
            strip.RuleFor(item => item.Role)
                .Must(role => role is "image" or "name" or "buttons")
                .WithMessage("Each slice is an image, the guest name area, or the Accept / Decline row.");
            strip.RuleFor(item => item.Height).GreaterThanOrEqualTo(4).WithMessage("A slice must be at least 4 pixels tall.");
            strip.When(item => item.Role != "buttons", () =>
                strip.RuleFor(item => item.AssetId).NotNull().WithMessage("A slice image is missing. Save the slices again."));
        });
        RuleFor(slices => slices)
            .Must(slices => ButtonsValid(slices))
            .WithMessage("The Accept / Decline row needs an Accept area and a Decline area that fit inside the design's width.");
        RuleFor(slices => slices.Name).NotNull().WithMessage("Set up how the guest name is drawn.").SetValidator(new GuestNameImageValidator());
    }

    private sealed class GuestNameImageValidator : AbstractValidator<GuestNameImageDto>
    {
        public GuestNameImageValidator()
        {
            RuleFor(name => name.Template)
                .NotEmpty().WithMessage("Enter the greeting, e.g. Dear {name},")
                .MaximumLength(120)
                .Must(template => template is not null && template.Contains("{name}", StringComparison.OrdinalIgnoreCase))
                .WithMessage("The greeting must include {name} where the guest's name goes.");
            RuleFor(name => name.FontSize).InclusiveBetween(6, 400);
            RuleFor(name => name.PositionFontSize).InclusiveBetween(6, 400);
            RuleFor(name => name.Font)
                .Must(font => BuiltInFonts.Contains(font))
                .WithMessage("Choose Arial, Georgia or Times New Roman, or an uploaded font.");
            RuleFor(name => name.PositionFont)
                .Must(font => BuiltInFonts.Contains(font))
                .WithMessage("Choose Arial, Georgia or Times New Roman, or an uploaded font.");
            RuleFor(name => name.Color).Matches(HexColor.Pattern).WithMessage("Use a colour like #FFFFFF.");
            RuleFor(name => name.PositionColor).Matches(HexColor.Pattern).WithMessage("Use a colour like #FFFFFF.");
            RuleFor(name => name.Align).Must(value => value is "left" or "center" or "right").WithMessage("Choose left, center, or right.");
            RuleFor(name => name.Valign).Must(value => value is "top" or "middle" or "bottom").WithMessage("Choose top, middle, or bottom.");
            RuleFor(name => name.PaddingX).InclusiveBetween(0, 3000);
            RuleFor(name => name.OffsetY).InclusiveBetween(-2000, 2000);
            RuleFor(name => name.LineGap).InclusiveBetween(0, 400);
        }
    }

    private static bool Covers(SliceDesignDto slices)
    {
        if (slices.Strips is null || slices.Strips.Length == 0)
        {
            return false;
        }

        var cursor = 0;
        foreach (var strip in slices.Strips)
        {
            if (strip.Y != cursor || strip.Height <= 0)
            {
                return false;
            }

            cursor += strip.Height;
        }

        return cursor == slices.SourceHeight;
    }

    private static bool ButtonsValid(SliceDesignDto slices)
    {
        var row = slices.Strips?.FirstOrDefault(strip => strip.Role == "buttons");
        if (row is null)
        {
            return true;
        }

        var pieces = row.Pieces ?? [];
        if (pieces.Count(piece => piece.Kind == "accept") != 1 || pieces.Count(piece => piece.Kind == "decline") > 1)
        {
            return false;
        }

        var cursor = 0;
        foreach (var piece in pieces)
        {
            if (piece.Kind is not ("image" or "accept" or "decline") || piece.X != cursor || piece.Width <= 0 || piece.AssetId == Guid.Empty)
            {
                return false;
            }

            cursor += piece.Width;
        }

        return cursor == slices.SourceWidth;
    }
}

public sealed class ImagePlacementValidator : AbstractValidator<ImagePlacementDto>
{
    public ImagePlacementValidator()
    {
        RuleFor(placement => placement.X).InclusiveBetween(0, 2400);
        RuleFor(placement => placement.Y).InclusiveBetween(0, 2000);
        RuleFor(placement => placement.Width).InclusiveBetween(20, 2400);
        When(placement => placement.Height.HasValue, () =>
        {
            RuleFor(placement => placement.Height!.Value).InclusiveBetween(20, 4000);
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
            .Matches(HexColor.Pattern)
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
                .Matches(HexColor.Pattern)
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
