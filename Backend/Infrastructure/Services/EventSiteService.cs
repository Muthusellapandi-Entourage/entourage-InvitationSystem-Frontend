using System.Net;
using System.Text;
using System.Text.Json;
using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Application.Invitations;
using Entourage.Domain.Entities;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Entourage.Infrastructure.Services;

/// <summary>
/// An event's own web address: setting and checking it (admin), and the pages guests see on it —
/// their personal invitation, the Accept / Decline confirmation and the drawn name image.
/// </summary>
public sealed class EventSiteService(
    AppDbContext db,
    IMemoryCache cache,
    IConfiguration configuration,
    IHttpClientFactory httpClients,
    GuestNameImageService nameImages,
    ILogger<EventSiteService> logger,
    IEventAssetService? assets = null,
    AppleWalletService? wallet = null,
    RsvpPageService? rsvpPages = null)
{
    public const string HttpClientName = "event-domain-check";
    private static readonly JsonSerializerOptions DesignJsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan HostCacheTime = TimeSpan.FromSeconds(60);

    /* ------------------------------------------------------------------ */
    /* Admin                                                               */
    /* ------------------------------------------------------------------ */

    public async Task<EventDomainDto> GetAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await FindEventAsync(eventId, cancellationToken);
        return ToDto(item);
    }

    /// <param name="reservedHosts">This app's own addresses; an event cannot take them over.</param>
    public async Task<EventDomainDto> SetAsync(
        Guid eventId,
        SetEventDomainRequest request,
        IReadOnlyCollection<string> reservedHosts,
        CancellationToken cancellationToken)
    {
        var domain = EventDomains.Normalize(request.Domain, out var error)
            ?? throw AppException.Validation(new Dictionary<string, string[]> { ["domain"] = [error!] });
        if (reservedHosts.Any(host => string.Equals(host, domain, StringComparison.OrdinalIgnoreCase)))
        {
            throw AppException.Validation(new Dictionary<string, string[]>
            {
                ["domain"] = ["That is this system's own address. Use the event's domain instead."],
            });
        }

        var item = await FindEventAsync(eventId, cancellationToken, tracking: true);
        var taken = await db.Events.AnyAsync(other => other.Id != eventId && other.CustomDomain == domain, cancellationToken);
        if (taken)
        {
            throw AppException.Conflict("Domain already in use.", "domain", "Another event already uses this domain.");
        }

        if (item.CustomDomain != domain)
        {
            Forget(item.CustomDomain);
            item.CustomDomain = domain;
            // A new address has to be checked again before invitations use it.
            item.CustomDomainVerifiedOn = null;
            item.UpdatedOn = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
            Forget(domain);
        }

        return ToDto(item);
    }

    public async Task<EventDomainDto> ClearAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await FindEventAsync(eventId, cancellationToken, tracking: true);
        Forget(item.CustomDomain);
        item.CustomDomain = null;
        item.CustomDomainVerifiedOn = null;
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(item);
    }

    /// <summary>
    /// Asks the domain for this event's check code over HTTPS (then HTTP, to explain what is missing).
    /// Only an HTTPS answer marks the domain as confirmed, because every guest link uses HTTPS.
    /// </summary>
    public async Task<EventDomainCheckDto> CheckAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await FindEventAsync(eventId, cancellationToken, tracking: true);
        if (item.CustomDomain is not { } domain)
        {
            throw AppException.Validation(new Dictionary<string, string[]> { ["domain"] = ["Save a domain first."] });
        }

        var expected = EventDomains.CheckCode(eventId);
        var secure = await AnswersAsync($"https://{domain}{EventDomains.CheckPath}", expected, cancellationToken);
        bool reachable;
        string message;
        if (secure == CheckOutcome.Match)
        {
            reachable = true;
            item.CustomDomainVerifiedOn = DateTime.UtcNow;
            message = $"{domain} reaches this server over HTTPS. Invitations now use it.";
        }
        else
        {
            var plain = await AnswersAsync($"http://{domain}{EventDomains.CheckPath}", expected, cancellationToken);
            reachable = plain == CheckOutcome.Match;
            item.CustomDomainVerifiedOn = null;
            message = (secure, plain) switch
            {
                (_, CheckOutcome.Match) => $"{domain} reaches this server, but not over HTTPS yet. Add an SSL certificate for {domain} on the server, then check again.",
                (CheckOutcome.WrongServer, _) or (_, CheckOutcome.WrongServer) => $"{domain} answers, but from a different server. Point its DNS at this server (see the steps), wait for DNS to update, then check again.",
                _ => $"{domain} could not be reached. Check the DNS record; changes can take up to a few hours to spread.",
            };
        }

        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        Forget(domain);
        return new EventDomainCheckDto(reachable, secure == CheckOutcome.Match, message, ToDto(item));
    }

    private enum CheckOutcome
    {
        Unreachable,
        WrongServer,
        Match,
    }

    private async Task<CheckOutcome> AnswersAsync(string url, string expected, CancellationToken cancellationToken)
    {
        try
        {
            var client = httpClients.CreateClient(HttpClientName);
            using var response = await client.GetAsync(url, cancellationToken);
            var body = (await response.Content.ReadAsStringAsync(cancellationToken)).Trim();
            return response.IsSuccessStatusCode && body == expected ? CheckOutcome.Match : CheckOutcome.WrongServer;
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException)
        {
            logger.LogInformation(error, "Event domain check failed for {Url}", url);
            return CheckOutcome.Unreachable;
        }
    }

    private EventDomainDto ToDto(Event item)
    {
        var target = configuration["EventDomains:DnsTarget"]?.Trim();
        var configured = configuration["EventDomains:DnsRecordType"]?.Trim();
        var recordType = !string.IsNullOrEmpty(configured)
            ? configured.ToUpperInvariant()
            : target is not null && IPAddress.TryParse(target, out _) ? "A" : "CNAME";
        return new EventDomainDto(
            item.CustomDomain,
            item.CustomDomainVerifiedOn,
            item.CustomDomain is not null && item.CustomDomainVerifiedOn is not null,
            string.IsNullOrWhiteSpace(target) ? null : target,
            string.IsNullOrWhiteSpace(target) ? null : recordType,
            item.CustomDomain is null ? null : EventDomains.InvitationUrl(item.CustomDomain, "a1b2c3d4e5f60718"));
    }

    private async Task<Event> FindEventAsync(Guid eventId, CancellationToken cancellationToken, bool tracking = false)
    {
        var query = tracking ? db.Events : db.Events.AsNoTracking();
        return await query.FirstOrDefaultAsync(item => item.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
    }

    /* ------------------------------------------------------------------ */
    /* Guest pages on the event domain                                     */
    /* ------------------------------------------------------------------ */

    public sealed record Site(Guid EventId, string Domain, string EventName, string Slug, EventStatus Status);

    /// <summary>The event that owns this host name, or null. Cached briefly, including misses.</summary>
    public async Task<Site?> FindByHostAsync(string host, CancellationToken cancellationToken)
    {
        var key = HostKey(host);
        if (cache.TryGetValue(key, out Site? cached))
        {
            return cached;
        }

        var site = await db.Events.AsNoTracking()
            .Where(item => item.CustomDomain == host)
            .Select(item => new Site(item.Id, item.CustomDomain!, item.Name, item.Slug, item.Status))
            .FirstOrDefaultAsync(cancellationToken);
        cache.Set(key, site, HostCacheTime);
        return site;
    }

    private void Forget(string? domain)
    {
        if (domain is not null)
        {
            cache.Remove(HostKey(domain));
        }
    }

    private static string HostKey(string host) => $"event-site:{host.ToLowerInvariant()}";

    public sealed record Page(int Status, string Html);

    /// <summary>The event domain's home and invitation links: the guest's invitation page.</summary>
    public Task<Page> HomeAsync(Site site, string? token, string? view, CancellationToken cancellationToken) =>
        InvitationPageAsync(site, token, cancellationToken);

    public async Task<Page> InvitationPageAsync(Site site, string? token, CancellationToken cancellationToken)
    {
        var (guest, problem) = await FindGuestAsync(site, token, cancellationToken);
        if (guest is null)
        {
            return problem!;
        }

        var type = guest.GuestTypeId is Guid typeId
            ? await db.GuestTypes.AsNoTracking().FirstOrDefaultAsync(item => item.Id == typeId && item.EventId == site.EventId, cancellationToken)
            : null;
        var design = type?.InvitationDesignJson is { Length: > 0 } json
            ? JsonSerializer.Deserialize<InvitationDesignDto>(json, DesignJsonOptions)
            : null;
        if (design is null)
        {
            return Message(site, 200, "Your invitation is being prepared", "Please check back soon.");
        }

        // Images load from this same domain, so every URL can stay relative.
        var urls = InvitationEmailBuilder.AllAssetIds(design).ToDictionary(id => id, id => $"/api/public/assets/{id}");
        var html = GuestDirectoryService.Personalize(InvitationEmailBuilder.Build(design, urls), guest, string.Empty, site.Domain);
        if (design.Slices is not null)
        {
            html = html
                .Replace(InvitationEmailBuilder.GuestNameImageToken, $"{EventDomains.NameImagePath}?g={guest.InviteToken}", StringComparison.Ordinal)
                .Replace(
                    InvitationEmailBuilder.GuestNameAltToken,
                    WebUtility.HtmlEncode(GuestNameRenderer.Greeting(design.Slices.Name.Template, guest.Name)),
                    StringComparison.Ordinal);
        }

        var replied = guest.RsvpStatus switch
        {
            GuestRsvp.Accepted => "You have accepted this invitation. Thank you. You can change your reply with the buttons below.",
            GuestRsvp.Declined => "You have declined this invitation. You can change your reply with the buttons below.",
            _ => null,
        };
        var banner = replied is null ? string.Empty : $"<p class=\"note\">{WebUtility.HtmlEncode(replied)}</p>";
        var width = design.Width is >= 200 and <= 2400 ? design.Width.Value : 600;
        // On narrow screens the whole card is scaled down so the sliced rows stay lined up.
        var body = $$"""
            {{banner}}
            <div class="card" data-width="{{width}}">{{html}}</div>
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
            """;
        return new Page(200, Shell(site.EventName, body, wide: true));
    }

    public async Task<Page> RsvpPageAsync(Site site, string? token, string? reply, CancellationToken cancellationToken)
    {
        var (guest, problem) = await FindGuestAsync(site, token, cancellationToken);
        if (guest is null)
        {
            return problem!;
        }

        if (reply is not ("accept" or "decline"))
        {
            return Message(site, 400, "Reply not recognised", "Use the Accept or Decline button in your invitation.", BackLink(guest));
        }

        // The event's RSVP page (confirm → thank-you with QR, E-Badge and Wallet).
        if (rsvpPages is not null)
        {
            var (code, html) = await rsvpPages.PageAsync(guest.InviteToken, reply, cancellationToken);
            return new Page(code, html);
        }

        var accept = reply == "accept";
        var current = guest.RsvpStatus == (accept ? GuestRsvp.Accepted : GuestRsvp.Declined)
            ? $"<p class=\"muted\">You have already {(accept ? "accepted" : "declined")}. Confirm again to keep this reply.</p>"
            : string.Empty;
        var askReason = !accept && await db.Events.AsNoTracking().Where(item => item.Id == site.EventId).Select(item => item.AskDeclineReason).FirstAsync(cancellationToken);
        var reason = askReason
            ? $"""
              <label class="field" for="reason">Reason (optional)</label>
              <textarea id="reason" name="reason" maxlength="500" rows="3" placeholder="Let us know why you can't attend">{WebUtility.HtmlEncode(guest.DeclineReason ?? string.Empty)}</textarea>
              """
            : string.Empty;
        var body = $"""
            <main class="box">
              <p class="eyebrow">{WebUtility.HtmlEncode(site.EventName)}</p>
              <h1>{(accept ? "Confirm your attendance" : "Decline the invitation")}</h1>
              <p>Dear {WebUtility.HtmlEncode(guest.Name)},</p>
              <p>{(accept ? "Please confirm that you will attend." : "Please confirm that you will not be able to attend.")}</p>
              {current}
              <form id="rsvp-form" method="post" action="{EventDomains.RsvpPath}">
                <input type="hidden" name="g" value="{guest.InviteToken}">
                <input type="hidden" name="r" value="{reply}">
                {reason}
                <p id="rsvp-error" class="error" role="alert" hidden></p>
                <button type="submit" class="{(accept ? "primary" : "danger")}">{(accept ? "Yes, I will attend" : "I cannot attend")}</button>
              </form>
              {BackLink(guest)}
            </main>
            {MicrositeRenderer.ConfirmScript}
            """;
        return new Page(200, Shell(site.EventName, body));
    }


    /// <summary>Saves a confirmed reply. Returns the guest, or the problem page when the link or reply is not valid.</summary>
    private async Task<(Guest? Guest, Page? Problem)> RecordAsync(Site site, string? token, string? reply, string? reason, CancellationToken cancellationToken)
    {
        var (guest, problem) = await FindGuestAsync(site, token, cancellationToken, tracking: true);
        if (guest is null)
        {
            return (null, problem);
        }

        if (reply is not ("accept" or "decline"))
        {
            return (null, Message(site, 400, "Reply not recognised", "Use the Accept or Decline button in your invitation.", BackLink(guest)));
        }

        var next = reply == "accept" ? GuestRsvp.Accepted : GuestRsvp.Declined;
        var previous = GuestRsvp.IsValid(guest.RsvpStatus) ? guest.RsvpStatus : GuestRsvp.Pending;
        var now = DateTime.UtcNow;
        var askReason = await db.Events.AsNoTracking().Where(item => item.Id == site.EventId).Select(item => item.AskDeclineReason).FirstAsync(cancellationToken);
        var cleanReason = next == GuestRsvp.Declined && askReason ? CleanReason(reason) : null;
        guest.RsvpStatus = next;
        guest.RsvpUpdatedOn = now;
        guest.UpdatedOn = now;
        guest.DeclineReason = cleanReason;
        var detail = $"{previous} → {next} (guest replied on {site.Domain})";
        GuestActivityLog.Add(db, guest.Id, GuestActivityKinds.StatusChanged, cleanReason is null ? detail : $"{detail} · “{cleanReason}”", now);
        await db.SaveChangesAsync(cancellationToken);
        return (guest, null);
    }

    /// <summary>Records the guest's reply from the form (no JavaScript). Only a POST changes anything, so link scanners cannot reply.</summary>
    public async Task<Page> RecordRsvpAsync(Site site, string? token, string? reply, CancellationToken cancellationToken, string? reason = null)
    {
        var (guest, problem) = await RecordAsync(site, token, reply, reason, cancellationToken);
        if (guest is null)
        {
            return problem!;
        }

        return await AfterReplyAsync(site, guest, cancellationToken);
    }

    public sealed record ConfirmResult(int Status, string? Next, string Message);

    /// <summary>The reply API behind the confirm button: saves the reply and says which page to open next.</summary>
    public async Task<ConfirmResult> ConfirmRsvpAsync(Site site, string? token, string? reply, string? reason, CancellationToken cancellationToken)
    {
        var (guest, problem) = await RecordAsync(site, token, reply, reason, cancellationToken);
        if (guest is null)
        {
            return new ConfirmResult(problem?.Status ?? 400, null, "This invitation link is not valid. Open the link from your email again.");
        }

        var next = guest.RsvpStatus == GuestRsvp.Accepted
            ? $"{EventDomains.ThankYouPath}?g={guest.InviteToken}"
            : $"{EventDomains.DeclinedPath}?g={guest.InviteToken}";
        return new ConfirmResult(200, next, guest.RsvpStatus == GuestRsvp.Accepted ? "Attendance confirmed." : "Reply recorded.");
    }

    /// <summary>The page after confirming: thank-you for accepted guests, the decline message otherwise.</summary>
    public async Task<Page> AfterReplyPageAsync(Site site, string? token, CancellationToken cancellationToken)
    {
        var (guest, problem) = await FindGuestAsync(site, token, cancellationToken);
        if (guest is null)
        {
            return problem!;
        }

        return await AfterReplyAsync(site, guest, cancellationToken);
    }

    /// <summary>Thank-you or declined page: the designed microsite page when there is one, else the built-in page.</summary>
    private async Task<Page> AfterReplyAsync(Site site, Guest guest, CancellationToken cancellationToken)
    {
        return guest.RsvpStatus switch
        {
            GuestRsvp.Accepted => await AcceptedPageAsync(site, guest, cancellationToken),
            GuestRsvp.Declined => DeclinedPage(site, guest),
            _ => Message(site, 200, "No reply yet", "Use the Accept or Decline button in your invitation.", BackLink(guest)),
        };
    }

    private static Page DeclinedPage(Site site, Guest guest) =>
        Message(site, 200, "Thank you for letting us know", $"Dear {guest.Name}, your reply has been recorded. We hope to see you at a future event.", BackLink(guest));

    /// <summary>Trims the guest's free text, drops control characters and caps it at 500 characters.</summary>
    public static string? CleanReason(string? reason)
    {
        var text = new string((reason ?? string.Empty).Where(character => !char.IsControl(character) || character is '\n').ToArray()).Trim();
        return text.Length == 0 ? null : text.Length <= 500 ? text : text[..500];
    }

    /// <summary>
    /// After accepting: thank-you, the guest's check-in QR (tap to open the E-Badge page), and the E-Badge
    /// download when their guest type has a badge design.
    /// </summary>
    private async Task<Page> AcceptedPageAsync(Site site, Guest guest, CancellationToken cancellationToken)
    {
        var hasBadge = await HasBadgeDesignAsync(site, guest, cancellationToken);
        var badge = $"{EventDomains.BadgePath}?g={guest.InviteToken}";
        var download = hasBadge ? DownloadButton(guest) : string.Empty;
        var wallet = await WalletButtonAsync(site, guest, cancellationToken);
        var thankYouId = await db.Events.AsNoTracking().Where(item => item.Id == site.EventId).Select(item => item.ThankYouAssetId).FirstOrDefaultAsync(cancellationToken);
        // With thank-you artwork, the image says it all; otherwise a short text thank-you.
        var heading = thankYouId is Guid imageId
            ? $"<img class=\"thanks\" src=\"/api/public/assets/{imageId}\" alt=\"Thank you, {WebUtility.HtmlEncode(guest.Name)}. Your attendance is confirmed.\">"
            : $"<h1>Thank you</h1><p>Dear {WebUtility.HtmlEncode(guest.Name)}, your attendance is confirmed. We look forward to welcoming you.</p>";
        var body = $"""
            <main class="box">
              <p class="eyebrow">{WebUtility.HtmlEncode(site.EventName)}</p>
              {heading}
              <a class="qr" href="{badge}" aria-label="Open your digital pass">
                <img src="{EventDomains.QrPath}?g={guest.InviteToken}" alt="Your check-in QR code" width="200" height="200">
              </a>
              <p class="muted">Show this QR code at the entrance. Tap it to open your digital pass.</p>
              {download}
              {wallet}
              {BackLink(guest)}
            </main>
            """;
        return new Page(200, Shell(site.EventName, body));
    }

    /// <summary>The guest's E-Badge page: their badge with name and check-in QR, and a download. Accepted guests only.</summary>
    public async Task<Page> BadgePageAsync(Site site, string? token, CancellationToken cancellationToken)
    {
        var (guest, problem) = await FindGuestAsync(site, token, cancellationToken);
        if (guest is null)
        {
            return problem!;
        }

        if (guest.RsvpStatus != GuestRsvp.Accepted)
        {
            return Message(site, 403, "Digital pass not available yet", "Your digital pass appears here after you accept the invitation.", BackLink(guest));
        }

        var hasBadge = await HasBadgeDesignAsync(site, guest, cancellationToken);
        var image = hasBadge
            ? $"<img class=\"badge\" src=\"{EventDomains.BadgeImagePath}?g={guest.InviteToken}\" alt=\"Digital pass for {WebUtility.HtmlEncode(guest.Name)}\">"
            : $"<div class=\"qr\"><img src=\"{EventDomains.QrPath}?g={guest.InviteToken}\" alt=\"Your check-in QR code\" width=\"240\" height=\"240\"></div>";
        var download = hasBadge ? DownloadButton(guest) : string.Empty;
        var wallet = await WalletButtonAsync(site, guest, cancellationToken);
        var body = $"""
            <main class="box">
              <p class="eyebrow">{WebUtility.HtmlEncode(site.EventName)}</p>
              <h1>{WebUtility.HtmlEncode(guest.Name)}</h1>
              {image}
              <p class="muted">Show this at the entrance to check in.</p>
              {download}
              {wallet}
              {BackLink(guest)}
            </main>
            """;
        return new Page(200, Shell(site.EventName, body));
    }

    /// <summary>The guest's check-in QR code as a PNG. Accepted guests only.</summary>
    public async Task<byte[]?> QrPngAsync(Site site, string? token, CancellationToken cancellationToken)
    {
        var guest = await AcceptedGuestAsync(site, token, cancellationToken);
        return guest is null ? null : BadgeRenderer.QrPng(guest.CheckInCode, 10);
    }

    /// <summary>The guest's E-Badge drawn from their guest type's badge design. Cached for a few minutes.</summary>
    public async Task<(byte[] Png, string FileName)?> BadgePngAsync(Site site, string? token, CancellationToken cancellationToken)
    {
        var guest = await AcceptedGuestAsync(site, token, cancellationToken);
        if (guest?.GuestTypeId is not Guid typeId || assets is null)
        {
            return null;
        }

        var type = await db.GuestTypes.AsNoTracking()
            .Where(item => item.Id == typeId && item.EventId == site.EventId)
            .Select(item => new { item.BadgeDesignJson, item.UpdatedOn })
            .FirstOrDefaultAsync(cancellationToken);
        if (type?.BadgeDesignJson is not { Length: > 0 } json || JsonSerializer.Deserialize<BadgeDesignDto>(json, DesignJsonOptions) is not { } design)
        {
            return null;
        }

        var fileName = $"{Slugify(site.EventName)}-{Slugify(guest.Name)}.png";
        var key = $"event-site-badge:{guest.Id}:{guest.UpdatedOn.Ticks}:{type.UpdatedOn.Ticks}";
        if (cache.TryGetValue(key, out byte[]? cached) && cached is not null)
        {
            return (cached, fileName);
        }

        byte[]? background = null;
        if (design.BackgroundAssetId is Guid assetId && await assets.OpenAsync(assetId, cancellationToken) is { } file)
        {
            background = await File.ReadAllBytesAsync(file.Path, cancellationToken);
        }

        var png = BadgeRenderer.Render(design, background, guest.Name, guest.CheckInCode);
        cache.Set(key, png, TimeSpan.FromMinutes(10));
        return (png, fileName);
    }

    /// <summary>The guest's Apple Wallet pass, or null when Wallet is not set up or the guest has not accepted.</summary>
    public async Task<(byte[] Bytes, string FileName)?> WalletPassAsync(Site site, string? token, CancellationToken cancellationToken)
    {
        var guest = await AcceptedGuestAsync(site, token, cancellationToken);
        if (guest is null || wallet is null)
        {
            return null;
        }

        var date = await db.Events.AsNoTracking().Where(item => item.Id == site.EventId).Select(item => item.StartDate).FirstAsync(cancellationToken);
        var company = guest.GuestGroupId is Guid groupId
            ? await db.GuestGroups.AsNoTracking().Where(item => item.Id == groupId).Select(item => item.Name).FirstOrDefaultAsync(cancellationToken)
            : null;
        var plan = await db.SeatingPlans.AsNoTracking().Where(item => item.EventId == site.EventId).Select(item => item.DesignJson).FirstOrDefaultAsync(cancellationToken);
        var seat = SeatLabels.FromDesignJson(plan).GetValueOrDefault(guest.Id);
        var bytes = await wallet.BuildPassAsync(
            new WalletPassData(guest.Id, site.EventName, date, guest.Name, company, seat, guest.CheckInCode),
            cancellationToken);
        return bytes is null ? null : (bytes, $"{Slugify(site.EventName)}-{Slugify(guest.Name)}.pkpass");
    }

    private async Task<Guest?> AcceptedGuestAsync(Site site, string? token, CancellationToken cancellationToken)
    {
        if (site.Status != EventStatus.Active || !GuestInviteTokens.LooksValid(token))
        {
            return null;
        }

        return await db.Guests.AsNoTracking().FirstOrDefaultAsync(
            item => item.EventId == site.EventId && item.InviteToken == token && item.RsvpStatus == GuestRsvp.Accepted,
            cancellationToken);
    }

    private async Task<bool> HasBadgeDesignAsync(Site site, Guest guest, CancellationToken cancellationToken) =>
        guest.GuestTypeId is Guid typeId
        && await db.GuestTypes.AsNoTracking().AnyAsync(
            item => item.Id == typeId && item.EventId == site.EventId && item.BadgeDesignJson != null && item.BadgeDesignJson != "",
            cancellationToken);

    private static string DownloadButton(Guest guest) =>
        $"<a class=\"button primary\" href=\"{EventDomains.BadgeImagePath}?g={guest.InviteToken}&amp;download=1\">Download digital pass</a>";

    /// <summary>"Add to Apple Wallet", once a Wallet certificate is set up. Shown on Apple devices only (by the page script).</summary>
    private async Task<string> WalletButtonAsync(Site site, Guest guest, CancellationToken cancellationToken)
    {
        if (wallet is null || !await wallet.IsReadyAsync(cancellationToken))
        {
            return string.Empty;
        }

        // Replace the text button with Apple's official "Add to Apple Wallet" badge artwork before going live.
        return $$"""
            <a class="button wallet" href="{{EventDomains.WalletPath}}?g={{guest.InviteToken}}" hidden data-apple-only>Add to Apple Wallet</a>
            <script>
            (function () {
              var apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
              document.querySelectorAll('[data-apple-only]').forEach(function (el) { if (apple) el.hidden = false; });
            })();
            </script>
            """;
    }

    private static string Slugify(string value)
    {
        var slug = new string(value.Trim().ToLowerInvariant().Select(character => char.IsLetterOrDigit(character) ? character : '-').ToArray());
        while (slug.Contains("--", StringComparison.Ordinal))
        {
            slug = slug.Replace("--", "-", StringComparison.Ordinal);
        }

        slug = slug.Trim('-');
        return slug.Length == 0 ? "badge" : slug.Length <= 60 ? slug : slug[..60];
    }

    /// <summary>The guest's drawn name strip for single-image designs. Cached for a few minutes.</summary>
    public async Task<byte[]?> NameImageAsync(Site site, string? token, CancellationToken cancellationToken)
    {
        if (!GuestInviteTokens.LooksValid(token))
        {
            return null;
        }

        var found = await db.Guests.AsNoTracking()
            .Where(item => item.EventId == site.EventId && item.InviteToken == token)
            .Select(item => new { item.Name, item.Position, item.GuestTypeId, item.UpdatedOn })
            .FirstOrDefaultAsync(cancellationToken);
        if (found?.GuestTypeId is not Guid typeId)
        {
            return null;
        }

        var type = await db.GuestTypes.AsNoTracking()
            .Where(item => item.Id == typeId && item.EventId == site.EventId)
            .Select(item => new { item.InvitationDesignJson, item.UpdatedOn })
            .FirstOrDefaultAsync(cancellationToken);
        if (type?.InvitationDesignJson is not { Length: > 0 } json)
        {
            return null;
        }

        var key = $"event-site-name:{token}:{found.UpdatedOn.Ticks}:{type.UpdatedOn.Ticks}";
        if (cache.TryGetValue(key, out byte[]? png))
        {
            return png;
        }

        var design = JsonSerializer.Deserialize<InvitationDesignDto>(json, DesignJsonOptions);
        png = design is null ? null : await nameImages.RenderAsync(site.EventId, design, found.Name, found.Position, cancellationToken);
        if (png is not null)
        {
            cache.Set(key, png, TimeSpan.FromMinutes(10));
        }

        return png;
    }

    public Page NotFound(Site site) =>
        Message(site, 404, "Page not found", "Open the invitation link from your email.");

    private async Task<(Guest? Guest, Page? Problem)> FindGuestAsync(Site site, string? token, CancellationToken cancellationToken, bool tracking = false)
    {
        if (site.Status == EventStatus.Archived)
        {
            return (null, Message(site, 410, "This event has ended", "Invitations for this event are no longer available."));
        }

        if (site.Status == EventStatus.Draft)
        {
            return (null, Message(site, 404, "Invitations are not open yet", "Please check back soon."));
        }

        if (!GuestInviteTokens.LooksValid(token))
        {
            return (null, Message(site, 404, "Invitation not found", "Open the invitation link from your email. Check that the whole link was copied."));
        }

        var query = tracking ? db.Guests : db.Guests.AsNoTracking();
        var guest = await query.FirstOrDefaultAsync(item => item.EventId == site.EventId && item.InviteToken == token, cancellationToken);
        return guest is null
            ? (null, Message(site, 404, "Invitation not found", "This link is not valid any more. Please contact the organisers."))
            : (guest, null);
    }

    private static string BackLink(Guest guest) =>
        $"<p class=\"back\"><a href=\"{EventDomains.InvitationPath}?g={guest.InviteToken}\">Back to the invitation</a></p>";

    private static Page Message(Site site, int status, string title, string text, string extra = "") =>
        new(status, Shell(site.EventName, $"""
            <main class="box">
              <p class="eyebrow">{WebUtility.HtmlEncode(site.EventName)}</p>
              <h1>{WebUtility.HtmlEncode(title)}</h1>
              <p>{WebUtility.HtmlEncode(text)}</p>
              {extra}
            </main>
            """));

    private static string Shell(string title, string body, bool wide = false)
    {
        var html = new StringBuilder();
        html.Append("""
            <!doctype html>
            <html lang="en">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="robots" content="noindex, nofollow">
            <meta name="referrer" content="no-referrer">
            """);
        html.Append("<title>").Append(WebUtility.HtmlEncode(title)).Append("</title>");
        html.Append("""
            <style>
              :root { color-scheme: light; }
              * { box-sizing: border-box; }
              body { margin: 0; min-height: 100vh; background: #e8e8e4; color: #1c1c1a;
                     font: 16px/1.55 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
              .page { padding: 24px 8px 40px; }
              .page.narrow { display: flex; align-items: center; justify-content: center; padding: 24px 16px; min-height: 100vh; }
              .card { margin: 0 auto; width: max-content; max-width: none; box-shadow: 0 10px 40px rgba(0,0,0,.18); }
              .note { max-width: 600px; margin: 0 auto 16px; padding: 10px 14px; border-radius: 8px; background: #fff; text-align: center; font-size: 14px; }
              .box { width: 100%; max-width: 440px; background: #fff; border-radius: 14px; padding: 32px 28px; box-shadow: 0 10px 40px rgba(0,0,0,.12); text-align: center; }
              .eyebrow { margin: 0 0 6px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; color: #6b6a66; }
              h1 { margin: 0 0 14px; font-size: 24px; line-height: 1.25; }
              p { margin: 0 0 12px; }
              .muted { color: #6b6a66; font-size: 14px; }
              form { margin: 20px 0 8px; }
              button { width: 100%; height: 48px; border: 0; border-radius: 999px; font: 600 16px/1 inherit; cursor: pointer; color: #fff; }
              button.primary { background: #0f8f6e; }
              button.danger { background: #b23b3b; }
              button:focus-visible, a:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
              .qr { display: inline-block; margin: 8px auto 4px; padding: 10px; border-radius: 12px; background: #fff; border: 1px solid #e3e1db; }
              .qr img { display: block; width: 200px; height: 200px; image-rendering: pixelated; }
              .thanks { display: block; width: 100%; height: auto; margin: 4px 0 8px; border-radius: 12px; }
              .error { margin: 0 0 12px; padding: 8px 12px; border-radius: 8px; background: #fdecec; color: #8d2f2f; font-size: 14px; }
              .badge { display: block; width: 100%; height: auto; margin: 8px 0; border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.12); }
              a.button { display: flex; align-items: center; justify-content: center; height: 48px; margin-top: 12px; border-radius: 999px;
                         font-weight: 600; text-decoration: none; color: #fff; background: #0f8f6e; }
              a.button.wallet { background: #000; }
              a.button[hidden] { display: none; }
              label.field { display: block; text-align: left; font-size: 14px; font-weight: 600; margin: 4px 0 6px; }
              textarea { width: 100%; box-sizing: border-box; margin-bottom: 14px; padding: 10px 12px; border: 1px solid #d6d3cc; border-radius: 10px;
                         font: inherit; resize: vertical; }
              .back { margin-top: 16px; font-size: 14px; }
              .back a { color: #0f6f57; }
            </style>
            </head>
            <body>
            """);
        html.Append(wide ? "<div class=\"page\">" : "<div class=\"page narrow\">").Append(body).Append("</div></body></html>");
        return html.ToString();
    }
}
