namespace Entourage.Application.DTOs;

public sealed record BadgeTextDto(
    int X,
    int Y,
    int Width,
    int Height,
    string Font,
    int FontSize,
    string Weight,
    string Color,
    string Align,
    string Valign);

public sealed record BadgeDesignDto(
    int Width,
    int Height,
    Guid? BackgroundAssetId,
    ImagePlacementDto? Background,
    ImagePlacementDto? Qr,
    BadgeTextDto? Name,
    DesignGuidesDto? Guides)
{
    public static BadgeDesignDto CreateDefault() => new(600, 900, null, null, null, null, null);
}

public sealed record BadgeTemplateDto(BadgeDesignDto Design, DateTime? UpdatedOn);
