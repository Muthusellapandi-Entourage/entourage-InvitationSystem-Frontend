namespace Entourage.Application.DTOs;

/// <summary>Where an element sits in one layout (desktop or phone), in that layout's pixels.</summary>
/// <param name="FontSize">Text size in this layout; null uses the element's size.</param>
public sealed record MicrositeFrameDto(double X, double Y, double W, double H, bool Hidden = false, double? FontSize = null);

/// <param name="Kind">"text", "guestName", "image", "button", "shape", "qr" (the guest's check-in QR) or "reasonBox" (decline reason).</param>
/// <param name="Text">Text, or for "guestName" a template such as "Dear {name},". Tokens: {name}, {position}, {company}, {event}.</param>
/// <param name="Font">A built-in font name, or "font:{id}" for a font uploaded to the event.</param>
/// <param name="Action">Buttons: "accept", "decline", "badge", "invitation", "link", "confirm" (sends the reply on a
/// confirm page), "download" (E-Badge image), "wallet" (Apple Wallet) or "home" (back to the microsite).</param>
/// <param name="Show">"always", "pending", "accepted", "declined" (personal page only) or "public" (public page only).</param>
public sealed record MicrositeElementDto(
    string Id,
    string Kind,
    MicrositeFrameDto Desktop,
    MicrositeFrameDto Mobile,
    string? Text = null,
    string? Font = null,
    double? FontSize = null,
    string? FontWeight = null,
    bool? Italic = null,
    string? Color = null,
    string? Align = null,
    double? LineHeight = null,
    double? LetterSpacing = null,
    Guid? AssetId = null,
    string? Fit = null,
    double? Radius = null,
    string? Label = null,
    string? Action = null,
    string? Url = null,
    string? Background = null,
    string? BorderColor = null,
    double? BorderWidth = null,
    double? Opacity = null,
    string? Show = null,
    bool? Locked = null,
    string? Name = null);

/// <summary>
/// One extra page of the microsite, shown at a step of the reply: "accept" / "decline" (the confirm pages),
/// "thanks" (after confirming Accept) and "declined" (after confirming Decline). An empty page falls back to
/// the built-in page.
/// </summary>
/// <param name="Background">Null uses the home page's background colour.</param>
public sealed record MicrositePageDto(
    string Key,
    string? Background,
    Guid? BackgroundAssetId,
    int DesktopHeight,
    int MobileHeight,
    MicrositeElementDto[] Elements);

/// <param name="DesktopHeight">Page height of the desktop layout (1200 px wide).</param>
/// <param name="MobileHeight">Page height of the phone layout (390 px wide).</param>
/// <param name="Elements">The home page (the guest's invitation microsite).</param>
/// <param name="Pages">The reply pages; see <see cref="MicrositePageDto"/>.</param>
public sealed record MicrositeDesignDto(
    string? Title,
    string Background,
    Guid? BackgroundAssetId,
    int DesktopHeight,
    int MobileHeight,
    MicrositeElementDto[] Elements,
    MicrositePageDto[]? Pages = null)
{
    public const int DesktopWidth = 1200;
    public const int MobileWidth = 390;

    public static readonly string[] PageKeys = ["accept", "decline", "thanks", "declined"];

    public static MicrositeDesignDto CreateDefault() => new(null, "#FFFFFF", null, 1600, 1800, []);

    /// <summary>The home page as a page.</summary>
    public MicrositePageDto HomePage() => new("home", Background, BackgroundAssetId, DesktopHeight, MobileHeight, Elements);

    /// <summary>A designed reply page, or null when it is missing or empty (the built-in page is used then).</summary>
    public MicrositePageDto? ReplyPage(string key) =>
        Pages?.FirstOrDefault(page => page.Key == key && page.Elements is { Length: > 0 }) is { } page
            ? page with { Background = page.Background ?? Background }
            : null;
}

public sealed record MicrositeDto(MicrositeDesignDto Design, bool IsPublished, bool PublicEnabled, DateTime? UpdatedOn, string? PublicUrl);

public sealed record SaveMicrositeRequest(MicrositeDesignDto Design, bool IsPublished, bool PublicEnabled);
