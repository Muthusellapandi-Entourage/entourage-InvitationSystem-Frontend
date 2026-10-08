namespace Entourage.Application.DTOs;

public sealed record GuestFieldDto(
    bool Enabled,
    string Font,
    int FontSize,
    int MobileFontSize,
    string Color,
    string Alignment,
    int LeftPadding,
    int TopSpacing);

public sealed record InvitationDesignDto(
    Guid? HeaderAssetId,
    GuestFieldDto GuestName,
    GuestFieldDto GuestPosition,
    Guid? DetailsAssetId,
    Guid? AcceptAssetId,
    Guid? DeclineAssetId)
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
