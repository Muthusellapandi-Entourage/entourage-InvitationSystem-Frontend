using System.Net;
using System.Text.Json;
using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Application.Invitations;
using Entourage.Domain.Entities;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

/// <summary>
/// The guest RSVP page (a faithful version of the event's rsvp.html): Accept / Decline open a confirm
/// view; Confirm calls the reply API; then the thank-you view (QR to the E-Badge, Download E-Badge,
/// Add to Apple Wallet) or the decline view. Works on the event domain and on the app's own address.
/// </summary>
public sealed class RsvpPageService(
    AppDbContext db,
    IEventAssetService assets,
    AppleWalletService? wallet = null,
    GuestNameImageService? nameImages = null)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public const string ApiBase = "/api/public/rsvp";

    /* ---------------- settings (admin) ---------------- */

    public async Task<RsvpPageSettingsDto> GetSettingsAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var json = await db.Events.AsNoTracking().Where(item => item.Id == eventId).Select(item => new { item.RsvpPageJson }).FirstOrDefaultAsync(cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        return Read(json.RsvpPageJson);
    }

    public async Task<RsvpPageSettingsDto> SaveSettingsAsync(Guid eventId, RsvpPageSettingsDto input, CancellationToken cancellationToken)
    {
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken) ?? throw AppException.NotFound("Event not found.");
        var settings = Clean(input);
        // Keep only images that are still on this event; one removed meanwhile is dropped instead of blocking the save.
        var images = new[] { settings.BackgroundAssetId, settings.LogoAssetId }.OfType<Guid>().ToArray();
        var present = images.Length == 0
            ? []
            : await db.EventAssets.AsNoTracking().Where(asset => asset.EventId == eventId && images.Contains(asset.Id)).Select(asset => asset.Id).ToListAsync(cancellationToken);
        settings = settings with
        {
            BackgroundAssetId = settings.BackgroundAssetId is Guid background && present.Contains(background) ? background : null,
            LogoAssetId = settings.LogoAssetId is Guid logo && present.Contains(logo) ? logo : null,
        };
        if (settings.FontId is Guid fontId && !await db.EventFonts.AnyAsync(font => font.Id == fontId && font.EventId == eventId, cancellationToken))
        {
            throw AppException.Validation(new Dictionary<string, string[]> { ["fontId"] = ["That font is not on this event. Upload it again."] });
        }

        item.RsvpPageJson = JsonSerializer.Serialize(settings, Json);
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return settings;
    }

    public static RsvpPageSettingsDto Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new RsvpPageSettingsDto();
        }

        try
        {
            return JsonSerializer.Deserialize<RsvpPageSettingsDto>(json, Json) ?? new RsvpPageSettingsDto();
        }
        catch (JsonException)
        {
            return new RsvpPageSettingsDto();
        }
    }

    private static RsvpPageSettingsDto Clean(RsvpPageSettingsDto input)
    {
        var defaults = new RsvpPageSettingsDto();
        string Text(string? value, string fallback, int max = 1000) =>
            string.IsNullOrWhiteSpace(value) ? fallback : value.Trim().Length <= max ? value.Trim() : value.Trim()[..max];
        string Colour(string? value, string fallback) => MicrositeRenderer.Color(value) ?? fallback;
        var reasons = (input.DeclineReasons ?? [])
            .Select(reason => reason?.Trim() ?? string.Empty)
            .Where(reason => reason.Length > 0 && !string.Equals(reason, "Other", StringComparison.OrdinalIgnoreCase))
            .Select(reason => reason.Length <= 120 ? reason : reason[..120])
            .Distinct()
            .Take(8)
            .ToArray();
        return new RsvpPageSettingsDto(
            input.BackgroundAssetId,
            input.LogoAssetId,
            input.FontId,
            Colour(input.BackgroundColor, defaults.BackgroundColor),
            Colour(input.TextColor, defaults.TextColor),
            Colour(input.ButtonColor, defaults.ButtonColor),
            Colour(input.ButtonTextColor, defaults.ButtonTextColor),
            Text(input.ConfirmAcceptText, defaults.ConfirmAcceptText),
            Text(input.ConfirmDeclineText, defaults.ConfirmDeclineText),
            Text(input.AcceptButton, defaults.AcceptButton, 60),
            Text(input.DeclineButton, defaults.DeclineButton, 60),
            Text(input.ReasonsPrompt, defaults.ReasonsPrompt),
            reasons.Length == 0 ? null : reasons,
            Text(input.ThankYouText, defaults.ThankYouText),
            Text(input.QrText, defaults.QrText),
            Text(input.DownloadButton, defaults.DownloadButton, 60),
            Text(input.WalletButton, defaults.WalletButton, 60),
            Text(input.InfoText, defaults.InfoText),
            Text(input.ContactText, defaults.ContactText),
            Text(input.SignOff, defaults.SignOff, 200),
            Text(input.DeclineText, defaults.DeclineText));
    }

    /* ---------------- guest ---------------- */

    private sealed record Found(Guest Guest, Event Event);

    private async Task<Found?> FindAsync(string? token, bool tracking, CancellationToken cancellationToken)
    {
        if (!GuestInviteTokens.LooksValid(token))
        {
            return null;
        }

        var guests = tracking ? db.Guests : db.Guests.AsNoTracking();
        var guest = await guests.FirstOrDefaultAsync(item => item.InviteToken == token, cancellationToken);
        if (guest is null)
        {
            return null;
        }

        var item = await db.Events.AsNoTracking().FirstOrDefaultAsync(entry => entry.Id == guest.EventId, cancellationToken);
        return item is null ? null : new Found(guest, item);
    }

    /// <summary>The page for a guest's link (status = accept or decline).</summary>
    public async Task<(int Status, string Html)> PageAsync(string? token, string? status, CancellationToken cancellationToken)
    {
        var found = await FindAsync(token, tracking: false, cancellationToken);
        if (found is null)
        {
            return (404, Notice("Invitation not found", "Open the RSVP link from your email again. Check that the whole link was copied."));
        }

        if (found.Event.Status != EventStatus.Active)
        {
            return found.Event.Status == EventStatus.Archived
                ? (410, Notice("This event has ended", "Replies for this event are closed."))
                : (404, Notice("Replies are not open yet", "Please check back soon."));
        }

        var settings = Read(found.Event.RsvpPageJson);
        var hasBadge = await HasBadgeAsync(found.Guest, cancellationToken);
        var walletReady = wallet is not null && await wallet.IsReadyAsync(cancellationToken);
        return (200, Render(settings, found.Event, found.Guest.Name, found.Guest.InviteToken, Intent(status), hasBadge, walletReady, preview: null));
    }

    /// <summary>Admin preview with a sample guest. view: "confirm-accept", "confirm-decline", "accepted" or "declined".</summary>
    public async Task<string> PreviewAsync(Guid eventId, RsvpPageSettingsDto settings, string? view, CancellationToken cancellationToken)
    {
        var item = await db.Events.AsNoTracking().FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken) ?? throw AppException.NotFound("Event not found.");
        var clean = Clean(settings);
        var intent = view is "confirm-decline" or "declined" ? "decline" : "accept";
        var forcedView = view is "accepted" or "declined" ? view : "confirm";
        return Render(clean, item, "Salman K Juma", "0000000000000000", intent, hasBadge: true, walletReady: true, preview: forcedView, askReasonOverride: intent == "decline");
    }

    /// <summary>
    /// The guest's own invitation (their guest type's design, with their name) as a page. Its Accept /
    /// Decline buttons open this RSVP page. Used when the event has no domain of its own.
    /// </summary>
    public async Task<(int Status, string Html)> InvitationAsync(string? token, string apiOrigin, CancellationToken cancellationToken)
    {
        var found = await FindAsync(token, tracking: false, cancellationToken);
        if (found is null)
        {
            return (404, Notice("Invitation not found", "Open the invitation link from your email again. Check that the whole link was copied."));
        }

        if (found.Event.Status != EventStatus.Active)
        {
            return found.Event.Status == EventStatus.Archived
                ? (410, Notice("This event has ended", "Invitations for this event are no longer available."))
                : (404, Notice("Invitations are not open yet", "Please check back soon."));
        }

        var guest = found.Guest;
        var json = guest.GuestTypeId is Guid typeId
            ? await db.GuestTypes.AsNoTracking().Where(item => item.Id == typeId && item.EventId == found.Event.Id).Select(item => item.InvitationDesignJson).FirstOrDefaultAsync(cancellationToken)
            : null;
        var design = string.IsNullOrWhiteSpace(json) ? null : JsonSerializer.Deserialize<InvitationDesignDto>(json, Json);
        if (design is null)
        {
            return (200, Notice("Your invitation is being prepared", "Please check back soon."));
        }

        var urls = InvitationEmailBuilder.AllAssetIds(design).ToDictionary(id => id, id => $"/api/public/assets/{id}");
        var domain = found.Event.CustomDomainVerifiedOn is not null ? found.Event.CustomDomain : null;
        var html = GuestDirectoryService.Personalize(InvitationEmailBuilder.Build(design, urls), guest, apiOrigin, domain);
        if (design.Slices is not null)
        {
            html = html
                .Replace(InvitationEmailBuilder.GuestNameImageToken, $"{ApiBase}/name?g={guest.InviteToken}", StringComparison.Ordinal)
                .Replace(InvitationEmailBuilder.GuestNameAltToken, E(GuestNameRenderer.Greeting(design.Slices.Name.Template, guest.Name)), StringComparison.Ordinal);
        }

        var width = design.Width is >= 200 and <= 2400 ? design.Width.Value : 600;
        return (200, $$"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="robots" content="noindex, nofollow">
            <title>{{E(found.Event.Name)}}</title>
            <style>
              body { margin: 0; background: #e8e8e4; }
              .page { padding: 24px 8px 40px; }
              .card { margin: 0 auto; width: max-content; box-shadow: 0 10px 40px rgba(0,0,0,.18); }
            </style>
            </head>
            <body>
            <div class="page"><div class="card" data-width="{{width}}">{{html}}</div></div>
            <script>
            (function () {
              var card = document.querySelector('.card');
              function fit() {
                var w = parseInt(card.getAttribute('data-width'), 10) || card.scrollWidth;
                var s = Math.min(1, (window.innerWidth - 16) / w);
                card.style.zoom = s < 1 ? String(s) : '';
              }
              window.addEventListener('resize', fit);
              fit();
            })();
            </script>
            </body>
            </html>
            """);
    }

    public async Task<(int Status, PublicRsvpResult Result)> ConfirmAsync(PublicRsvpRequest request, CancellationToken cancellationToken)
    {
        var found = await FindAsync(request.G, tracking: true, cancellationToken);
        if (found is null)
        {
            return (404, new PublicRsvpResult(string.Empty, "Invalid RSVP link."));
        }

        if (found.Event.Status != EventStatus.Active)
        {
            return (409, new PublicRsvpResult(string.Empty, "Replies for this event are closed."));
        }

        var next = Intent(request.Status) switch
        {
            "accept" => GuestRsvp.Accepted,
            "decline" => GuestRsvp.Declined,
            _ => null,
        };
        if (next is null)
        {
            return (400, new PublicRsvpResult(string.Empty, "Invalid RSVP link."));
        }

        var guest = found.Guest;
        string? reason = null;
        if (next == GuestRsvp.Declined && found.Event.AskDeclineReason)
        {
            var choice = EventSiteService.CleanReason(request.DeclineReason);
            var note = EventSiteService.CleanReason(request.DeclineReasonNote);
            reason = string.Equals(choice, "Other", StringComparison.OrdinalIgnoreCase)
                ? note is null ? "Other" : $"Other: {note}"
                : choice;
            reason = EventSiteService.CleanReason(reason);
        }

        var previous = GuestRsvp.IsValid(guest.RsvpStatus) ? guest.RsvpStatus : GuestRsvp.Pending;
        var now = DateTime.UtcNow;
        guest.RsvpStatus = next;
        guest.RsvpUpdatedOn = now;
        guest.UpdatedOn = now;
        guest.DeclineReason = reason;
        var detail = $"{previous} → {next} (guest replied)";
        GuestActivityLog.Add(db, guest.Id, GuestActivityKinds.StatusChanged, reason is null ? detail : $"{detail} · “{reason}”", now);
        await db.SaveChangesAsync(cancellationToken);
        return (200, new PublicRsvpResult(next.ToLowerInvariant(), next == GuestRsvp.Accepted ? "Attendance confirmed." : "Reply recorded."));
    }

    /// <summary>The guest's drawn name strip, for single-image invitation designs.</summary>
    public async Task<byte[]?> NameImageAsync(string? token, CancellationToken cancellationToken)
    {
        var found = await FindAsync(token, tracking: false, cancellationToken);
        if (found is null || nameImages is null || found.Guest.GuestTypeId is not Guid typeId)
        {
            return null;
        }

        var json = await db.GuestTypes.AsNoTracking().Where(item => item.Id == typeId).Select(item => item.InvitationDesignJson).FirstOrDefaultAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(json) || JsonSerializer.Deserialize<InvitationDesignDto>(json, Json) is not { } design)
        {
            return null;
        }

        return await nameImages.RenderAsync(found.Event.Id, design, found.Guest.Name, found.Guest.Position, cancellationToken);
    }

    public async Task<(byte[] Png, string FileName)?> BadgeAsync(string? token, CancellationToken cancellationToken)
    {
        var found = await AcceptedAsync(token, cancellationToken);
        if (found?.Guest.GuestTypeId is not Guid typeId)
        {
            return null;
        }

        var json = await db.GuestTypes.AsNoTracking()
            .Where(item => item.Id == typeId && item.EventId == found.Event.Id)
            .Select(item => item.BadgeDesignJson)
            .FirstOrDefaultAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(json) || JsonSerializer.Deserialize<BadgeDesignDto>(json, Json) is not { } design)
        {
            return null;
        }

        byte[]? background = null;
        if (design.BackgroundAssetId is Guid assetId && await assets.OpenAsync(assetId, cancellationToken) is { } file)
        {
            background = await File.ReadAllBytesAsync(file.Path, cancellationToken);
        }

        return (BadgeRenderer.Render(design, background, found.Guest.Name, found.Guest.CheckInCode), $"{Slug(found.Event.Name)}-{Slug(found.Guest.Name)}.png");
    }

    /// <summary>
    /// Admin download of one guest's E-Badge, drawn on the server (any event status, any RSVP).
    /// Throws a readable message when the guest's type has no badge design.
    /// </summary>
    public async Task<(byte[] Png, string FileName)> GuestBadgeAsync(Guid eventId, Guid guestId, CancellationToken cancellationToken)
    {
        var guest = await db.Guests.AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == guestId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("The guest was not found.");
        var eventName = await db.Events.AsNoTracking().Where(item => item.Id == eventId).Select(item => item.Name).FirstOrDefaultAsync(cancellationToken) ?? "event";
        if (guest.GuestTypeId is not Guid typeId)
        {
            throw new AppException("Assign a guest category to download the digital pass.", StatusCodes.Status409Conflict);
        }

        var type = await db.GuestTypes.AsNoTracking()
            .Where(item => item.Id == typeId && item.EventId == eventId)
            .Select(item => new { item.Name, item.BadgeDesignJson })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new AppException("This guest's category no longer exists. Assign a guest category.", StatusCodes.Status409Conflict);
        BadgeDesignDto? design = null;
        if (!string.IsNullOrWhiteSpace(type.BadgeDesignJson))
        {
            try
            {
                design = JsonSerializer.Deserialize<BadgeDesignDto>(type.BadgeDesignJson, Json);
            }
            catch (JsonException)
            {
                design = null;
            }
        }

        if (design is null || design.Width <= 0 || design.Height <= 0)
        {
            throw new AppException($"The {type.Name} badge design is missing. Set up the {type.Name} digital pass first.", StatusCodes.Status409Conflict);
        }

        byte[]? background = null;
        if (design.BackgroundAssetId is Guid assetId && await assets.OpenAsync(assetId, cancellationToken) is { } file)
        {
            background = await File.ReadAllBytesAsync(file.Path, cancellationToken);
        }

        return (BadgeRenderer.Render(design, background, guest.Name, guest.CheckInCode), $"{Slug(eventName)}-{Slug(guest.Name)}.png");
    }

    /// <summary>A QR code that opens the guest's E-Badge (scan it with a phone).</summary>
    public async Task<byte[]?> QrAsync(string? token, string origin, CancellationToken cancellationToken)
    {
        var found = await AcceptedAsync(token, cancellationToken);
        if (found is null)
        {
            return null;
        }

        var site = found.Event.CustomDomainVerifiedOn is not null && found.Event.CustomDomain is { } domain ? EventDomains.Origin(domain) : origin.TrimEnd('/');
        return BadgeRenderer.QrPng($"{site}{ApiBase}/e-badge?g={found.Guest.InviteToken}", 10);
    }

    public async Task<(byte[] Bytes, string FileName)?> WalletAsync(string? token, CancellationToken cancellationToken)
    {
        var found = await AcceptedAsync(token, cancellationToken);
        if (found is null || wallet is null)
        {
            return null;
        }

        var company = found.Guest.GuestGroupId is Guid groupId
            ? await db.GuestGroups.AsNoTracking().Where(item => item.Id == groupId).Select(item => item.Name).FirstOrDefaultAsync(cancellationToken)
            : null;
        var plan = await db.SeatingPlans.AsNoTracking().Where(item => item.EventId == found.Event.Id).Select(item => item.DesignJson).FirstOrDefaultAsync(cancellationToken);
        var bytes = await wallet.BuildPassAsync(
            new WalletPassData(found.Guest.Id, found.Event.Name, found.Event.StartDate, found.Guest.Name, company, SeatLabels.FromDesignJson(plan).GetValueOrDefault(found.Guest.Id), found.Guest.CheckInCode),
            cancellationToken);
        return bytes is null ? null : (bytes, $"{Slug(found.Event.Name)}-{Slug(found.Guest.Name)}.pkpass");
    }

    private async Task<Found?> AcceptedAsync(string? token, CancellationToken cancellationToken)
    {
        var found = await FindAsync(token, tracking: false, cancellationToken);
        return found is not null && found.Event.Status == EventStatus.Active && found.Guest.RsvpStatus == GuestRsvp.Accepted ? found : null;
    }

    private async Task<bool> HasBadgeAsync(Guest guest, CancellationToken cancellationToken) =>
        guest.GuestTypeId is Guid typeId
        && await db.GuestTypes.AsNoTracking().AnyAsync(item => item.Id == typeId && item.BadgeDesignJson != null && item.BadgeDesignJson != "", cancellationToken);

    /// <summary>"accept", "decline" or null, from accept/accepted/decline/declined (any case).</summary>
    public static string? Intent(string? status) => (status ?? string.Empty).Trim().ToLowerInvariant() switch
    {
        "accept" or "accepted" => "accept",
        "decline" or "declined" => "decline",
        _ => null,
    };

    private static string Slug(string value)
    {
        var slug = new string(value.Trim().ToLowerInvariant().Select(character => char.IsLetterOrDigit(character) ? character : '-').ToArray());
        while (slug.Contains("--", StringComparison.Ordinal))
        {
            slug = slug.Replace("--", "-", StringComparison.Ordinal);
        }

        slug = slug.Trim('-');
        return slug.Length == 0 ? "guest" : slug.Length <= 60 ? slug : slug[..60];
    }

    /* ---------------- the page ---------------- */

    private static string E(string value) => WebUtility.HtmlEncode(value);

    /// <param name="preview">Admin preview: "confirm", "accepted" or "declined" is shown without calling the API.</param>
    private static string Render(
        RsvpPageSettingsDto settings,
        Event item,
        string guestName,
        string token,
        string? intent,
        bool hasBadge,
        bool walletReady,
        string? preview,
        bool? askReasonOverride = null)
    {
        var askReason = askReasonOverride ?? item.AskDeclineReason;
        var reasons = string.Join(
            "\n",
            settings.Reasons.Select(reason => $"<label><input type=\"radio\" name=\"declineReason\" value=\"{E(reason)}\"> {E(reason)}</label>"));
        var fontFace = settings.FontId is Guid fontId
            ? $"@font-face{{font-family:'RsvpFont';src:url('/api/public/fonts/{fontId}');font-display:swap;}}"
            : string.Empty;
        var background = settings.BackgroundAssetId is Guid backgroundId ? $"url('/api/public/assets/{backgroundId}')" : "none";
        var logo = settings.LogoAssetId is Guid logoId
            ? $"<div class=\"brand-logo\"><img src=\"/api/public/assets/{logoId}\" alt=\"{E(item.Name)}\" /></div>"
            : string.Empty;

        return Template
            .Replace("__FONT_FACE__", fontFace, StringComparison.Ordinal)
            .Replace("__BG_COLOR__", settings.BackgroundColor, StringComparison.Ordinal)
            .Replace("__BG_IMAGE__", background, StringComparison.Ordinal)
            .Replace("__TEXT_COLOR__", settings.TextColor, StringComparison.Ordinal)
            .Replace("__BUTTON_COLOR__", settings.ButtonColor, StringComparison.Ordinal)
            .Replace("__BUTTON_TEXT__", settings.ButtonTextColor, StringComparison.Ordinal)
            .Replace("__TITLE__", E($"RSVP | {item.Name}"), StringComparison.Ordinal)
            .Replace("__EVENT__", E(item.Name), StringComparison.Ordinal)
            .Replace("__LOGO__", logo, StringComparison.Ordinal)
            .Replace("__DEAR__", E(Dear(guestName)), StringComparison.Ordinal)
            .Replace("__CONFIRM_ACCEPT__", E(settings.ConfirmAcceptText), StringComparison.Ordinal)
            .Replace("__CONFIRM_DECLINE__", E(settings.ConfirmDeclineText), StringComparison.Ordinal)
            .Replace("__ACCEPT_BUTTON__", E(settings.AcceptButton), StringComparison.Ordinal)
            .Replace("__DECLINE_BUTTON__", E(settings.DeclineButton), StringComparison.Ordinal)
            .Replace("__REASONS_PROMPT__", E(settings.ReasonsPrompt), StringComparison.Ordinal)
            .Replace("__REASONS__", reasons, StringComparison.Ordinal)
            .Replace("__THANK_YOU__", E(settings.ThankYouText), StringComparison.Ordinal)
            .Replace("__QR_TEXT__", E(settings.QrText), StringComparison.Ordinal)
            .Replace("__DOWNLOAD__", E(settings.DownloadButton), StringComparison.Ordinal)
            .Replace("__WALLET__", E(settings.WalletButton), StringComparison.Ordinal)
            .Replace("__INFO__", E(settings.InfoText), StringComparison.Ordinal)
            .Replace("__CONTACT__", E(settings.ContactText), StringComparison.Ordinal)
            .Replace("__SIGN_OFF__", E(settings.SignOff), StringComparison.Ordinal)
            .Replace("__DECLINE_TEXT__", E(settings.DeclineText), StringComparison.Ordinal)
            .Replace("__TOKEN__", token, StringComparison.Ordinal)
            .Replace("__INTENT__", intent ?? string.Empty, StringComparison.Ordinal)
            .Replace("__ASK_REASON__", askReason ? "1" : "0", StringComparison.Ordinal)
            .Replace("__HAS_BADGE__", hasBadge ? "1" : "0", StringComparison.Ordinal)
            .Replace("__WALLET_READY__", walletReady ? "1" : "0", StringComparison.Ordinal)
            .Replace("__PREVIEW__", preview ?? string.Empty, StringComparison.Ordinal)
            .Replace("__API__", ApiBase, StringComparison.Ordinal);
    }

    private static string Dear(string name)
    {
        var display = string.IsNullOrWhiteSpace(name) ? "Guest" : name.Trim();
        if (!display.StartsWith("Dear ", StringComparison.OrdinalIgnoreCase)) display = $"Dear {display}";
        if (!display.EndsWith(',')) display += ",";
        return display;
    }

    private static string Notice(string title, string text) =>
        $$"""
        <!DOCTYPE html>
        <html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="robots" content="noindex, nofollow"><title>{{E(title)}}</title>
        <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#313131;color:#fff;font-family:Tahoma,sans-serif;text-align:center;padding:24px;box-sizing:border-box}h1{font-size:1.4rem;margin:0 0 .5rem}p{opacity:.9}</style>
        </head><body><main><h1>{{E(title)}}</h1><p>{{E(text)}}</p></main></body></html>
        """;

    /// <summary>The page, kept close to the event's rsvp.html (same structure, styles and behaviour).</summary>
    private const string Template = """
        <!DOCTYPE html>
        <html lang="en" dir="ltr">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
            <meta name="robots" content="noindex, nofollow" />
            <meta name="referrer" content="no-referrer" />
            <title>__TITLE__</title>
            <style>
                __FONT_FACE__
                :root {
                    --white: __TEXT_COLOR__;
                    --muted: __TEXT_COLOR__;
                    --page-max: 720px;
                    --page-pad-x: clamp(0.85rem, 3vw, 1.5rem);
                    --safe-top: env(safe-area-inset-top, 0px);
                    --page-pad-top: calc(var(--safe-top) + 1.75rem);
                }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                html { overflow-x: hidden; overflow-y: auto; }
                html, body {
                    min-height: 100%;
                    font-family: 'RsvpFont', "Manifa Pro", Tahoma, sans-serif;
                    color: var(--white);
                    background-color: __BG_COLOR__;
                    background-image: __BG_IMAGE__;
                    background-repeat: no-repeat;
                    background-position: center center;
                    background-size: cover;
                }
                body {
                    position: relative;
                    isolation: isolate;
                    min-height: 100vh;
                    min-height: 100dvh;
                    display: flex;
                    flex-direction: column;
                    padding: var(--page-pad-top) var(--page-pad-x) 0;
                    overflow-x: hidden;
                }
                .page {
                    position: relative;
                    z-index: 1;
                    width: min(100%, var(--page-max));
                    max-width: 100%;
                    margin: 0 auto;
                    text-align: center;
                    flex: 1 0 auto;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-start;
                    gap: clamp(1rem, 2.5vw, 1.5rem);
                    padding-top: clamp(4.5rem, 12vw, 5.5rem);
                    padding-bottom: 1.5rem;
                    animation: fadeUp 0.6s ease both;
                }
                .guest-name {
                    width: 100%;
                    background: transparent;
                    color: var(--white);
                    font-size: clamp(1rem, 3.2vw, 1.75rem);
                    font-weight: 500;
                    line-height: 1.5;
                    padding: clamp(0.5rem, 1.5vw, 0.75rem) clamp(0.85rem, 2.5vw, 1.25rem);
                    word-break: break-word;
                }
                .copy, .decline-copy { max-width: 38rem; display: flex; flex-direction: column; gap: 1rem; color: var(--white); }
                .copy p, .decline-copy p { font-size: clamp(0.95rem, 2.4vw, 1.1rem); line-height: 1.9; color: var(--white); }
                #viewAccept, #viewDecline, #viewConfirm {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: clamp(1rem, 2.5vw, 1.5rem);
                }
                .qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 1rem; margin-top: 0.5rem; }
                .qr-frame { background: #ffffff; padding: 0.85rem; box-shadow: 0 10px 30px rgba(0, 38, 80, 0.12); }
                .qr-frame img { display: block; width: min(200px, 55vw); height: auto; image-rendering: pixelated; }
                .btn-download {
                    appearance: none;
                    display: inline-block;
                    border: 0;
                    background: __BUTTON_COLOR__;
                    color: __BUTTON_TEXT__;
                    font-family: inherit;
                    font-size: 0.95rem;
                    font-weight: 700;
                    padding: 0.85rem 1.75rem;
                    border-radius: 36px;
                    cursor: pointer;
                    text-decoration: none;
                    transition: transform 0.2s ease, background 0.2s ease;
                }
                .btn-download:focus-visible { outline: 3px solid #8ab4ff; outline-offset: 3px; }
                .qr-wrap p { max-width: 38rem; font-size: clamp(0.95rem, 2.4vw, 1.1rem); line-height: 1.9; color: var(--white); }
                .btn-download:disabled { opacity: 0.65; cursor: wait; }
                .confirm-copy { max-width: 38rem; display: flex; flex-direction: column; gap: 0.75rem; color: var(--white); text-align: center; }
                .confirm-copy p { font-size: clamp(0.95rem, 2.4vw, 1.1rem); line-height: 1.9; color: var(--white); }
                .confirm-error { color: #ffd0d0; font-size: 0.9rem; min-height: 1.25rem; }
                .decline-reasons { width: min(100%, 32rem); display: flex; flex-direction: column; align-items: stretch; gap: 0.75rem; text-align: left; color: var(--white); }
                .decline-reasons p { font-size: clamp(0.95rem, 2.4vw, 1.1rem); line-height: 1.6; }
                .decline-reasons label { display: flex; align-items: flex-start; gap: 0.65rem; font-size: clamp(0.92rem, 2.2vw, 1.02rem); line-height: 1.45; cursor: pointer; }
                .decline-reasons input[type="radio"] { margin-top: 0.22rem; flex: 0 0 auto; accent-color: #ffffff; }
                .decline-reasons textarea {
                    width: 100%;
                    min-height: 5rem;
                    border: 0;
                    border-radius: 8px;
                    padding: 0.75rem 0.85rem;
                    font: inherit;
                    color: #140c09;
                    background: #ffffff;
                    resize: vertical;
                }
                .wallet-hint { margin-top: 0.65rem; font-size: 0.8rem; line-height: 1.45; color: var(--muted); opacity: 0.8; text-align: center; }
                .brand-logo { position: fixed; top: calc(env(safe-area-inset-top, 0px) + 18px); right: clamp(16px, 4vw, 32px); width: clamp(128px, 34vw, 180px); margin: 0; z-index: 3; }
                .brand-logo img { display: block; width: 100%; height: auto; }
                .hidden { display: none !important; }
                @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
                @media (max-width: 640px) {
                    .copy, .decline-copy { max-width: 100%; }
                    .btn-download { width: min(100%, 260px); font-size: 0.9rem; padding: 0.75rem 1.25rem; }
                }
                @media (max-width: 420px) {
                    .guest-name { font-size: 0.95rem; }
                    .qr-frame img { width: min(160px, 50vw); }
                }
                @media (max-height: 700px) { .page { justify-content: flex-start; gap: 0.85rem; } }
                @media (prefers-reduced-motion: reduce) { .page { animation: none; } }
            </style>
        </head>
        <body data-token="__TOKEN__" data-intent="__INTENT__" data-ask-reason="__ASK_REASON__" data-has-badge="__HAS_BADGE__" data-wallet="__WALLET_READY__" data-preview="__PREVIEW__" data-api="__API__"
              data-text-accept="__CONFIRM_ACCEPT__" data-text-decline="__CONFIRM_DECLINE__" data-label-accept="__ACCEPT_BUTTON__" data-label-decline="__DECLINE_BUTTON__">
            __LOGO__
            <main class="page">
                <div class="guest-name hidden" id="guestName">__DEAR__</div>

                <section id="viewConfirm" class="hidden" aria-live="polite">
                    <div class="confirm-copy">
                        <p id="confirmText"></p>
                    </div>
                    <div id="declineReasons" class="decline-reasons hidden">
                        <p>__REASONS_PROMPT__</p>
                        __REASONS__
                        <label><input type="radio" name="declineReason" value="Other"> Other (please specify).</label>
                        <textarea id="declineReasonNote" class="hidden" maxlength="500" placeholder="Please specify" aria-label="Please specify"></textarea>
                    </div>
                    <button type="button" class="btn-download" id="btnConfirmRsvp">__ACCEPT_BUTTON__</button>
                    <p class="confirm-error" id="confirmError" aria-live="polite"></p>
                </section>

                <section id="viewAccept" class="hidden" aria-live="polite">
                    <div class="copy">
                        <p id="dearLine">__DEAR__</p>
                        <p>__THANK_YOU__</p>
                    </div>
                    <div class="qr-wrap">
                        <div class="qr-frame">
                            <img id="qrImage" alt="QR code to open your digital pass" width="240" height="240" />
                        </div>
                        <p>__QR_TEXT__</p>
                        <button type="button" class="btn-download hidden" id="btnViewEbadge">__DOWNLOAD__</button>
                        <a class="btn-download hidden" id="btnAppleWallet" href="#">__WALLET__</a>
                        <p class="wallet-hint hidden" id="walletHint">Safari adds the pass directly. Chrome on iPhone downloads a .pkpass file — open it to add it to Wallet.</p>
                        <p>__INFO__</p>
                        <p>__CONTACT__</p>
                        <p>__SIGN_OFF__</p>
                        <p class="confirm-error" id="acceptError" aria-live="polite"></p>
                    </div>
                </section>

                <section id="viewDecline" class="hidden" aria-live="polite">
                    <div class="decline-copy">
                        <p>__DECLINE_TEXT__</p>
                    </div>
                </section>
            </main>

            <script>
                (function () {
                    var body = document.body;
                    var token = body.getAttribute("data-token");
                    var intent = body.getAttribute("data-intent");
                    var api = body.getAttribute("data-api");
                    var preview = body.getAttribute("data-preview");
                    var askReason = body.getAttribute("data-ask-reason") === "1";
                    var hasBadge = body.getAttribute("data-has-badge") === "1";
                    var walletReady = body.getAttribute("data-wallet") === "1";
                    var texts = { accept: body.getAttribute("data-text-accept"), decline: body.getAttribute("data-text-decline") };
                    var labels = { accept: body.getAttribute("data-label-accept"), decline: body.getAttribute("data-label-decline") };

                    var guestEl = document.getElementById("guestName");
                    var viewConfirm = document.getElementById("viewConfirm");
                    var viewAccept = document.getElementById("viewAccept");
                    var viewDecline = document.getElementById("viewDecline");
                    var qrImage = document.getElementById("qrImage");
                    var btnViewEbadge = document.getElementById("btnViewEbadge");
                    var btnWallet = document.getElementById("btnAppleWallet");
                    var walletHint = document.getElementById("walletHint");
                    var btnConfirm = document.getElementById("btnConfirmRsvp");
                    var confirmText = document.getElementById("confirmText");
                    var confirmError = document.getElementById("confirmError");
                    var acceptError = document.getElementById("acceptError");
                    var declineReasons = document.getElementById("declineReasons");
                    var declineReasonNote = document.getElementById("declineReasonNote");

                    var isAccept = intent === "accept";
                    var isDecline = intent === "decline";
                    var apiStatus = isAccept ? "Accepted" : (isDecline ? "Declined" : "");
                    var storageKey = token && apiStatus ? ("rsvp-commit:" + token + ":" + apiStatus) : "";
                    var inFlight = false;

                    function decode(value) { return value || ""; }

                    function hideAll() {
                        viewConfirm.classList.add("hidden");
                        viewAccept.classList.add("hidden");
                        viewDecline.classList.add("hidden");
                    }

                    function showConfirm() {
                        hideAll();
                        guestEl.classList.remove("hidden");
                        viewConfirm.classList.remove("hidden");
                        btnConfirm.textContent = decode(isDecline ? labels.decline : labels.accept);
                        confirmText.textContent = decode(isDecline ? texts.decline : texts.accept);
                        declineReasons.classList.toggle("hidden", !(askReason && isDecline));
                        document.title = isDecline ? "Confirm decline" : "Confirm attendance";
                    }

                    function isAppleDevice() {
                        var ua = navigator.userAgent || "";
                        if (/iPhone|iPad|iPod/i.test(ua)) return true;
                        if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
                        return /Macintosh|Mac OS X/i.test(ua) && !/Android/i.test(ua);
                    }

                    function showResult(next) {
                        hideAll();
                        if (next === "accept" || next === "accepted") {
                            viewAccept.classList.remove("hidden");
                            guestEl.classList.add("hidden");
                            document.title = "Attendance confirmed";
                            if (!qrImage.getAttribute("src") && !preview) qrImage.src = api + "/qr?g=" + encodeURIComponent(token);
                            if (hasBadge) btnViewEbadge.classList.remove("hidden");
                            if (walletReady && (isAppleDevice() || preview)) {
                                btnWallet.href = preview ? "#" : api + "/wallet?g=" + encodeURIComponent(token);
                                btnWallet.classList.remove("hidden");
                                walletHint.classList.remove("hidden");
                            }
                        } else if (next === "decline" || next === "declined") {
                            viewDecline.classList.remove("hidden");
                            guestEl.classList.remove("hidden");
                            document.title = "Decline confirmed";
                        } else {
                            showConfirm();
                        }
                    }

                    function saveBlob(blob, filename) {
                        var url = URL.createObjectURL(blob);
                        var link = document.createElement("a");
                        link.href = url;
                        link.download = filename;
                        link.rel = "noopener";
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
                    }

                    function downloadEbadge() {
                        if (preview) return;
                        var previous = btnViewEbadge.textContent;
                        btnViewEbadge.disabled = true;
                        btnViewEbadge.textContent = "Downloading…";
                        acceptError.textContent = "";
                        fetch(api + "/e-badge?g=" + encodeURIComponent(token) + "&download=1", { cache: "no-store" })
                            .then(function (res) {
                                if (!res.ok) throw new Error("E-Badge download failed");
                                var disposition = res.headers.get("Content-Disposition") || "";
                                var match = /filename="?([^";]+)"?/i.exec(disposition);
                                return res.blob().then(function (blob) { return { blob: blob, name: match ? match[1] : "e-badge.png" }; });
                            })
                            .then(function (file) {
                                var shared = new File([file.blob], file.name, { type: file.blob.type || "image/png" });
                                var phone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
                                if (phone && navigator.canShare && navigator.canShare({ files: [shared] })) {
                                    return navigator.share({ files: [shared], title: "Digital pass" }).catch(function (err) {
                                        if (err && err.name === "AbortError") return;
                                        saveBlob(file.blob, file.name);
                                    });
                                }
                                saveBlob(file.blob, file.name);
                            })
                            .catch(function () { acceptError.textContent = "Could not download the digital pass. Please try again."; })
                            .then(function () {
                                btnViewEbadge.disabled = false;
                                btnViewEbadge.textContent = previous;
                            });
                    }

                    btnViewEbadge.addEventListener("click", function (ev) { ev.preventDefault(); downloadEbadge(); });

                    declineReasons.addEventListener("change", function (ev) {
                        if (!ev.target || ev.target.name !== "declineReason") return;
                        declineReasonNote.classList.toggle("hidden", ev.target.value !== "Other");
                    });

                    function declinePayload() {
                        if (!askReason || !isDecline) return {};
                        var selected = document.querySelector('input[name="declineReason"]:checked');
                        var reason = selected ? selected.value : "";
                        return { declineReason: reason, declineReasonNote: reason === "Other" ? declineReasonNote.value.trim() : "" };
                    }

                    function alreadyCommitted() {
                        if (!storageKey) return false;
                        try { return sessionStorage.getItem(storageKey) === "1"; } catch (e) { return false; }
                    }

                    function commit() {
                        if (!token || !apiStatus || inFlight) return;
                        inFlight = true;
                        btnConfirm.disabled = true;
                        btnConfirm.textContent = isDecline ? "Declining…" : "Accepting…";
                        confirmError.textContent = "";
                        var payload = { g: token, status: apiStatus };
                        var extra = declinePayload();
                        for (var key in extra) payload[key] = extra[key];
                        fetch(api + "/confirm", {
                            method: "POST",
                            cache: "no-store",
                            headers: { "Accept": "application/json", "Content-Type": "application/json" },
                            body: JSON.stringify(payload)
                        }).then(function (res) {
                            return res.text().then(function (text) {
                                var data = {};
                                try { data = text ? JSON.parse(text) : {}; } catch (e) {}
                                return { ok: res.ok, data: data.data || data };
                            });
                        }).then(function (result) {
                            inFlight = false;
                            if (result.ok) {
                                try { if (storageKey) sessionStorage.setItem(storageKey, "1"); } catch (e) {}
                                showResult(result.data && result.data.status ? String(result.data.status).toLowerCase() : intent);
                                return;
                            }
                            btnConfirm.disabled = false;
                            btnConfirm.textContent = decode(isDecline ? labels.decline : labels.accept);
                            confirmError.textContent = result.data && result.data.message ? String(result.data.message) : "Could not save your reply. Please try again.";
                        }).catch(function () {
                            inFlight = false;
                            btnConfirm.disabled = false;
                            btnConfirm.textContent = decode(isDecline ? labels.decline : labels.accept);
                            confirmError.textContent = "Could not connect. Please try again.";
                        });
                    }

                    btnConfirm.addEventListener("click", function (ev) {
                        // Only a real tap counts: link checkers and scripts cannot reply for the guest.
                        if (ev && ev.isTrusted === false) return;
                        if (navigator.webdriver) return;
                        if (preview) { showResult(isDecline ? "declined" : "accepted"); return; }
                        commit();
                    });

                    if (preview === "accepted" || preview === "declined") {
                        showResult(preview);
                    } else if (!apiStatus) {
                        showConfirm();
                        confirmError.textContent = "Invalid RSVP link.";
                        btnConfirm.disabled = true;
                    } else if (!preview && alreadyCommitted()) {
                        showResult(intent);
                    } else {
                        showConfirm();
                    }
                })();
            </script>
        </body>
        </html>
        """;
}
