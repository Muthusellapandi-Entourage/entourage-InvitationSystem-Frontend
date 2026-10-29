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

/// <summary>
/// One element of a digital pass (pixels; font size in pixels). Same kinds as the printed badge:
/// name, position, company, guestType, seat, text, qr, image, rect.
/// </summary>
public sealed record BadgeElementDto(
    string Id,
    string Kind,
    double X,
    double Y,
    double Width,
    double Height,
    double FontSize = 32,
    string FontWeight = "regular",
    string Color = "#111111",
    string Align = "center",
    string Valign = "middle",
    bool Uppercase = false,
    string? Text = null,
    string? Font = null,
    Guid? AssetId = null,
    string? Fill = null,
    double Radius = 0,
    bool Hidden = false,
    bool Locked = false,
    string? Name = null);

/// <summary>
/// A digital pass design. New designs use <see cref="Elements"/> (free canvas) with <see cref="BackgroundColor"/>;
/// older designs only have Background / Name / Qr and are still drawn the old way.
/// </summary>
public sealed record BadgeDesignDto(
    int Width,
    int Height,
    Guid? BackgroundAssetId,
    ImagePlacementDto? Background,
    ImagePlacementDto? Qr,
    BadgeTextDto? Name,
    DesignGuidesDto? Guides,
    string? BackgroundColor = null,
    BadgeElementDto[]? Elements = null)
{
    public static BadgeDesignDto CreateDefault() => new(600, 900, null, null, null, null, null);

    /// <summary>Images the design uses (background and image elements).</summary>
    public IEnumerable<Guid> AssetIds() =>
        (Elements ?? []).Where(element => element.Kind == "image").Select(element => element.AssetId).Append(BackgroundAssetId).OfType<Guid>();
}

public sealed record BadgeTemplateDto(BadgeDesignDto Design, DateTime? UpdatedOn);
