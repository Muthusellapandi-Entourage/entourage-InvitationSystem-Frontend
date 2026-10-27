using System.Text.Json;
using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Application.Invitations;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

/// <summary>Saving, checking and rendering the event's free-canvas microsite.</summary>
public sealed class MicrositeService(AppDbContext db, IEventAssetService assets)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly string[] Kinds = ["text", "guestName", "image", "button", "shape", "qr", "reasonBox"];
    private static readonly string[] Actions = ["accept", "decline", "badge", "invitation", "link", "confirm", "download", "wallet", "home"];

    public async Task<MicrositeDto> GetAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await FindAsync(eventId, cancellationToken);
        var domain = await ActiveDomainAsync(eventId, cancellationToken);
        return new MicrositeDto(
            Read(item?.DesignJson) ?? MicrositeDesignDto.CreateDefault(),
            item?.IsPublished ?? false,
            item?.PublicEnabled ?? false,
            item?.UpdatedOn,
            domain is null ? null : $"{EventDomains.Origin(domain)}/");
    }

    public async Task<MicrositeDto> SaveAsync(Guid eventId, SaveMicrositeRequest request, CancellationToken cancellationToken)
    {
        if (!await db.Events.AnyAsync(item => item.Id == eventId, cancellationToken))
        {
            throw AppException.NotFound("Event not found.");
        }

        var design = Validate(request.Design);
        await assets.EnsureOwnedAsync(eventId, MicrositeRenderer.AssetIds(design).Distinct().ToArray(), cancellationToken);
        var fonts = design.Elements.Select(element => MicrositeRenderer.FontId(element.Font)).OfType<Guid>().Distinct().ToArray();
        if (fonts.Length > 0 && await db.EventFonts.CountAsync(item => item.EventId == eventId && fonts.Contains(item.Id), cancellationToken) != fonts.Length)
        {
            throw AppException.Validation(new Dictionary<string, string[]> { ["font"] = ["A font used on the microsite is no longer on this event. Pick another font."] });
        }

        var item = await db.EventMicrosites.FirstOrDefaultAsync(entry => entry.EventId == eventId, cancellationToken);
        item ??= db.EventMicrosites.Add(new EventMicrosite { Id = Guid.CreateVersion7(), EventId = eventId }).Entity;
        item.DesignJson = JsonSerializer.Serialize(design, Json);
        item.IsPublished = request.IsPublished;
        item.PublicEnabled = request.PublicEnabled;
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(eventId, cancellationToken);
    }

    /// <summary>A full preview page for the designer, as a sample guest or as the public sees it.</summary>
    /// <param name="pageKey">"home" (default) or a reply page: "accept", "decline", "thanks", "declined".</param>
    public async Task<string> PreviewAsync(Guid eventId, MicrositeDesignDto design, bool asGuest, string assetOrigin, CancellationToken cancellationToken, string? pageKey = null)
    {
        var name = await db.Events.AsNoTracking().Where(item => item.Id == eventId).Select(item => item.Name).FirstOrDefaultAsync(cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        var clean = Validate(design);
        var key = MicrositeDesignDto.PageKeys.Contains(pageKey) ? pageKey! : "home";
        // Reply pages are previewed as a guest at that step; the home page as a guest who has not replied (or the public).
        var status = key switch
        {
            "thanks" => GuestRsvp.Accepted,
            "declined" => GuestRsvp.Declined,
            _ => GuestRsvp.Pending,
        };
        var viewer = asGuest || key != "home"
            ? new MicrositeViewer(name, "Salman K Juma", "Director, Finance", "Sample Company", status, "0000000000000000")
            : new MicrositeViewer(name);
        var page = key == "home" ? clean.HomePage() : clean.ReplyPage(key) ?? clean.HomePage() with { Key = key, Elements = [] };
        var options = new MicrositeRenderOptions(key is "accept" or "decline" ? key : null, AskReason: key == "decline", HasBadge: true, WalletReady: key == "thanks");
        return Page(clean.Title ?? name, MicrositeRenderer.Body(page, viewer, assetOrigin, await FontIdsAsync(eventId, cancellationToken), options));
    }

    /// <summary>The saved microsite for an event, when it exists.</summary>
    public async Task<(MicrositeDesignDto Design, bool IsPublished, bool PublicEnabled)?> PublishedAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await FindAsync(eventId, cancellationToken);
        var design = Read(item?.DesignJson);
        return item is null || design is null ? null : (design, item.IsPublished, item.PublicEnabled);
    }

    public async Task<IReadOnlySet<Guid>> FontIdsAsync(Guid eventId, CancellationToken cancellationToken) =>
        (await db.EventFonts.AsNoTracking().Where(item => item.EventId == eventId).Select(item => item.Id).ToListAsync(cancellationToken)).ToHashSet();

    public static string Page(string title, string body) =>
        $"""
        <!doctype html>
        <html lang="en">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>{System.Net.WebUtility.HtmlEncode(title)}</title>
        </head>
        <body>{body}</body>
        </html>
        """;

    /// <summary>Clamps sizes and drops anything unknown, so a saved design is always safe to render.</summary>
    public static MicrositeDesignDto Validate(MicrositeDesignDto? input)
    {
        if (input is null)
        {
            return MicrositeDesignDto.CreateDefault();
        }

        var pages = (input.Pages ?? [])
            .Where(page => page is not null && MicrositeDesignDto.PageKeys.Contains(page.Key))
            .DistinctBy(page => page.Key)
            .Select(page => new MicrositePageDto(
                page.Key,
                MicrositeRenderer.Color(page.Background),
                page.BackgroundAssetId,
                Math.Clamp(page.DesktopHeight, 200, 20000),
                Math.Clamp(page.MobileHeight, 200, 20000),
                CleanElements(page.Elements)))
            .ToArray();
        return new MicrositeDesignDto(
            Cap(input.Title, 200),
            MicrositeRenderer.Color(input.Background) ?? "#FFFFFF",
            input.BackgroundAssetId,
            Math.Clamp(input.DesktopHeight, 200, 20000),
            Math.Clamp(input.MobileHeight, 200, 20000),
            CleanElements(input.Elements),
            pages);
    }

    private static MicrositeElementDto[] CleanElements(MicrositeElementDto[]? elements) =>
        (elements ?? [])
            .Where(element => element is not null && Kinds.Contains(element.Kind) && element.Desktop is not null && element.Mobile is not null)
            .Take(400)
            .Select(element => element with
            {
                Id = string.IsNullOrWhiteSpace(element.Id) ? Guid.NewGuid().ToString("N") : element.Id[..Math.Min(element.Id.Length, 64)],
                Desktop = Frame(element.Desktop, MicrositeDesignDto.DesktopWidth),
                Mobile = Frame(element.Mobile, MicrositeDesignDto.MobileWidth),
                Text = Cap(element.Text, 5000),
                Label = Cap(element.Label, 200),
                Url = MicrositeRenderer.SafeUrl(element.Url),
                Action = element.Kind == "button" ? (Actions.Contains(element.Action) ? element.Action : "link") : null,
                Font = Cap(element.Font, 60),
                Color = MicrositeRenderer.Color(element.Color),
                Background = MicrositeRenderer.Color(element.Background),
                BorderColor = MicrositeRenderer.Color(element.BorderColor),
                Show = element.Show is "pending" or "accepted" or "declined" or "public" ? element.Show : "always",
            })
            .ToArray();

    private static MicrositeFrameDto Frame(MicrositeFrameDto frame, int width) => frame with
    {
        X = Math.Clamp(frame.X, -width, width * 2),
        Y = Math.Clamp(frame.Y, -1000, 20000),
        W = Math.Clamp(frame.W, 1, width * 2),
        H = Math.Clamp(frame.H, 1, 20000),
        FontSize = frame.FontSize is double size ? Math.Clamp(size, 6, 400) : null,
    };

    private static string? Cap(string? value, int max) => value is null ? null : value.Length <= max ? value : value[..max];

    private static MicrositeDesignDto? Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<MicrositeDesignDto>(json, Json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private Task<EventMicrosite?> FindAsync(Guid eventId, CancellationToken cancellationToken) =>
        db.EventMicrosites.AsNoTracking().FirstOrDefaultAsync(item => item.EventId == eventId, cancellationToken);

    private async Task<string?> ActiveDomainAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var site = await db.Events.AsNoTracking()
            .Where(item => item.Id == eventId)
            .Select(item => new { item.CustomDomain, item.CustomDomainVerifiedOn })
            .FirstOrDefaultAsync(cancellationToken);
        return site?.CustomDomainVerifiedOn is null ? null : site.CustomDomain;
    }
}
