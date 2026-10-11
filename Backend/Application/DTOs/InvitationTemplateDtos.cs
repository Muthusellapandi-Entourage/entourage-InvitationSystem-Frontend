namespace Entourage.Application.DTOs;

public sealed record TextBoxDto(int X, int Y, int Width, int Height);

public sealed record GuestBandDto(int Y, int Height, string Align, string Valign, int Spacing, int Inset);

public sealed record ImagePlacementDto(int X, int Y, int Width, int? Height, bool LockRatio);

public sealed record DesignGuidesDto(int[]? Vertical, int[]? Horizontal);

public sealed record GuestFieldDto(
    bool Enabled,
    string Font,
    int FontSize,
    int MobileFontSize,
    string Color,
    string Alignment,
    int LeftPadding,
    int TopSpacing,
    TextBoxDto? Box = null,
    string? BackgroundColor = null,
    int? BackgroundOpacity = null,
    int? PadX = null,
    int? PadY = null,
    string? Weight = null,
    bool? NameBackground = null);

public sealed record InvitationDesignDto(
    Guid? HeaderAssetId,
    GuestFieldDto GuestName,
    GuestFieldDto GuestPosition,
    Guid? DetailsAssetId,
    Guid? AcceptAssetId,
    Guid? DeclineAssetId,
    int? Width = null,
    int? Height = null,
    string? GroupAlign = null,
    string? GroupVertical = null,
    GuestBandDto? GuestBand = null,
    ImagePlacementDto? HeaderImage = null,
    ImagePlacementDto? DetailsImage = null,
    ImagePlacementDto? AcceptImage = null,
    ImagePlacementDto? DeclineImage = null,
    DesignGuidesDto? Guides = null,
    string? BackgroundColor = null)
{
    public static InvitationDesignDto CreateDefault() => new(
        null,
        new GuestFieldDto(true, "Manifa Bold", 30, 24, "#FFFFFF", "left", 70, 20),
        new GuestFieldDto(true, "Manifa Italic", 15, 12, "#FFFFFF", "left", 70, 5),
        null,
        null,
        null);
}

public sealed record InvitationTemplateDto(
    InvitationDesignDto Design,
    string? Html,
    DateTime? UpdatedOn);

public sealed record EventAssetDto(Guid Id, string FileName, string Url);

public sealed record EventAssetFile(string Path, string ContentType);

public sealed record InvitationPreviewDto(string Url, DateTime ExpiresOn, string Html);
