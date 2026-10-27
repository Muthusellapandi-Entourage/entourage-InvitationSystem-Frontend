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
    string? BackgroundColor = null,
    SliceDesignDto? Slices = null)
{
    public static InvitationDesignDto CreateDefault() => new(
        null,
        new GuestFieldDto(true, "Manifa Bold", 30, 24, "#FFFFFF", "left", 70, 20),
        new GuestFieldDto(true, "Manifa Italic", 15, 12, "#FFFFFF", "left", 70, 5),
        null,
        null,
        null);
}

/// <summary>
/// "Single image" invitation: one uploaded design cut into horizontal strips (top to bottom).
/// Coordinates are in the source image's own pixels. The email shows it at <see cref="InvitationDesignDto.Width"/>.
/// </summary>
/// <param name="SourceAssetId">The full uploaded design, kept so the slices can be edited again.</param>
/// <param name="Strips">Top to bottom, covering the whole image with no gaps.</param>
/// <param name="Name">How each guest's name is drawn onto the "name" strip.</param>
public sealed record SliceDesignDto(
    Guid SourceAssetId,
    int SourceWidth,
    int SourceHeight,
    SliceStripDto[] Strips,
    GuestNameImageDto Name);

/// <param name="Role">"image" (shown as is), "name" (guest name drawn on it) or "buttons" (Accept / Decline cut out).</param>
/// <param name="AssetId">The strip cut from the design. For "buttons", null: its pieces carry the images.</param>
/// <param name="Pieces">Only for "buttons": left to right, covering the strip's full width.</param>
public sealed record SliceStripDto(string Role, int Y, int Height, Guid? AssetId, SlicePieceDto[]? Pieces = null);

/// <param name="Kind">"image", "accept" or "decline".</param>
public sealed record SlicePieceDto(string Kind, int X, int Width, Guid AssetId);

/// <summary>Text drawn onto the name strip for each guest. Sizes are in source pixels.</summary>
/// <param name="Template">Greeting with a {name} placeholder, e.g. "Dear {name},".</param>
/// <param name="FontId">An uploaded font. Null uses <paramref name="Font"/>.</param>
/// <param name="Font">Built-in family used when no uploaded font is chosen: Arial, Georgia or Times New Roman.</param>
public sealed record GuestNameImageDto(
    string Template,
    Guid? FontId,
    string Font,
    int FontSize,
    string Color,
    string Align,
    string Valign,
    int PaddingX,
    int OffsetY,
    bool PositionEnabled,
    Guid? PositionFontId,
    string PositionFont,
    int PositionFontSize,
    string PositionColor,
    int LineGap);

public sealed record EventFontDto(Guid Id, string Name, string FileName, long SizeBytes, string Url, DateTime CreatedOn);

public sealed record GuestNamePreviewRequest(InvitationDesignDto Design, string? Name, string? Position);

public sealed record InvitationTemplateDto(
    InvitationDesignDto Design,
    string? Html,
    DateTime? UpdatedOn);

public sealed record EventAssetDto(Guid Id, string FileName, string Url);

public sealed record EventAssetFile(string Path, string ContentType);

public sealed record InvitationPreviewDto(string Url, DateTime ExpiresOn, string Html);
