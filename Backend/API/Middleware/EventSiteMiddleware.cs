using Entourage.Application.Invitations;
using Entourage.Infrastructure.Services;

namespace Entourage.Api.Middleware;

/// <summary>
/// Requests whose host is an event's own domain (e.g. excellenceawards2026.com) get the guest pages
/// for that event only: /invitation.html, /rsvp.html, the name image, public images and the domain
/// check. Everything else on that host is "not found", so the admin API never shows up there.
/// Requests for any other host continue to the normal app.
/// </summary>
public sealed class EventSiteMiddleware(RequestDelegate next, ILogger<EventSiteMiddleware> logger)
{
    private static readonly string[] PassThroughPrefixes =
    [
        "/api/public/assets/",
        "/api/public/name-images/",
        "/api/public/fonts/",
        // The RSVP page's calls (confirm, E-Badge, QR, Wallet) work the same on the event domain.
        "/api/public/rsvp",
        // The self-registration page's submit call.
        "/api/public/register",
        // Let's Encrypt / win-acme certificate checks, when the server answers them.
        "/.well-known/acme-challenge/",
    ];

    public async Task InvokeAsync(HttpContext context, EventSiteService sites, RegistrationService registration)
    {
        var host = context.Request.Host.Host;
        if (string.IsNullOrEmpty(host) || host is "localhost" or "127.0.0.1" or "[::1]")
        {
            await next(context);
            return;
        }

        var cancellationToken = context.RequestAborted;
        var site = await sites.FindByHostAsync(host.ToLowerInvariant(), cancellationToken);
        if (site is null)
        {
            await next(context);
            return;
        }

        var path = context.Request.Path.Value ?? "/";
        if (PassThroughPrefixes.Any(prefix => path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
        {
            await next(context);
            return;
        }

        var method = context.Request.Method;
        var read = HttpMethods.IsGet(method) || HttpMethods.IsHead(method);
        try
        {
            if (path.Equals(EventDomains.CheckPath, StringComparison.OrdinalIgnoreCase) && read)
            {
                context.Response.ContentType = "text/plain; charset=utf-8";
                context.Response.Headers.CacheControl = "no-store";
                await context.Response.WriteAsync(EventDomains.CheckCode(site.EventId), cancellationToken);
                return;
            }

            if ((path == "/" || path.Equals(EventDomains.InvitationPath, StringComparison.OrdinalIgnoreCase)) && read)
            {
                await WriteAsync(context, await sites.HomeAsync(site, context.Request.Query["g"], context.Request.Query["view"], cancellationToken));
                return;
            }

            // Self-registration: eventdomain.com/register (also /register/ and /register.html).
            if (read && (path.Equals(RegistrationService.DomainPath, StringComparison.OrdinalIgnoreCase)
                || path.Equals($"{RegistrationService.DomainPath}/", StringComparison.OrdinalIgnoreCase)
                || path.Equals($"{RegistrationService.DomainPath}.html", StringComparison.OrdinalIgnoreCase)))
            {
                var (status, html) = await registration.PageAsync(site.EventId, cancellationToken);
                await WriteAsync(context, new EventSiteService.Page(status, html));
                return;
            }

            if (path.Equals(EventDomains.RsvpPath, StringComparison.OrdinalIgnoreCase))
            {
                if (read)
                {
                    await WriteAsync(context, await sites.RsvpPageAsync(site, context.Request.Query["g"], context.Request.Query["r"], cancellationToken));
                    return;
                }

                if (HttpMethods.IsPost(method) && context.Request.HasFormContentType)
                {
                    var form = await context.Request.ReadFormAsync(cancellationToken);
                    await WriteAsync(context, await sites.RecordRsvpAsync(site, form["g"], form["r"], cancellationToken, form["reason"].FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))));
                    return;
                }
            }

            if (path.Equals(EventDomains.ConfirmApiPath, StringComparison.OrdinalIgnoreCase) && HttpMethods.IsPost(method))
            {
                ConfirmBody? body = null;
                try
                {
                    body = await context.Request.ReadFromJsonAsync<ConfirmBody>(cancellationToken);
                }
                catch (System.Text.Json.JsonException)
                {
                    // Answered as a bad request below.
                }
                catch (InvalidOperationException)
                {
                    // Not JSON.
                }

                var result = body is null
                    ? new EventSiteService.ConfirmResult(400, null, "The reply could not be read.")
                    : await sites.ConfirmRsvpAsync(site, body.G, body.R, body.Reason, cancellationToken);
                context.Response.StatusCode = result.Status;
                context.Response.Headers.CacheControl = "no-store";
                await context.Response.WriteAsJsonAsync(new { ok = result.Status == 200, next = result.Next, message = result.Message }, cancellationToken);
                return;
            }

            if ((path.Equals(EventDomains.ThankYouPath, StringComparison.OrdinalIgnoreCase) || path.Equals(EventDomains.DeclinedPath, StringComparison.OrdinalIgnoreCase)) && read)
            {
                await WriteAsync(context, await sites.AfterReplyPageAsync(site, context.Request.Query["g"], cancellationToken));
                return;
            }

            if (path.Equals(EventDomains.BadgePath, StringComparison.OrdinalIgnoreCase) && read)
            {
                await WriteAsync(context, await sites.BadgePageAsync(site, context.Request.Query["g"], cancellationToken));
                return;
            }

            if (path.Equals(EventDomains.QrPath, StringComparison.OrdinalIgnoreCase) && read)
            {
                await WritePngAsync(context, await sites.QrPngAsync(site, context.Request.Query["g"], cancellationToken), null);
                return;
            }

            if (path.Equals(EventDomains.BadgeImagePath, StringComparison.OrdinalIgnoreCase) && read)
            {
                var badge = await sites.BadgePngAsync(site, context.Request.Query["g"], cancellationToken);
                var download = context.Request.Query["download"] == "1";
                await WritePngAsync(context, badge?.Png, download ? badge?.FileName : null);
                return;
            }

            if (path.Equals(EventDomains.WalletPath, StringComparison.OrdinalIgnoreCase) && read)
            {
                var pass = await sites.WalletPassAsync(site, context.Request.Query["g"], cancellationToken);
                if (pass is null)
                {
                    context.Response.StatusCode = StatusCodes.Status404NotFound;
                    return;
                }

                context.Response.ContentType = "application/vnd.apple.pkpass";
                context.Response.Headers.CacheControl = "private, no-store";
                context.Response.Headers.ContentDisposition = $"attachment; filename=\"{pass.Value.FileName}\"";
                await context.Response.Body.WriteAsync(pass.Value.Bytes, cancellationToken);
                return;
            }

            if (path.Equals(EventDomains.NameImagePath, StringComparison.OrdinalIgnoreCase) && read)
            {
                var png = await sites.NameImageAsync(site, context.Request.Query["g"], cancellationToken);
                if (png is null)
                {
                    context.Response.StatusCode = StatusCodes.Status404NotFound;
                    return;
                }

                context.Response.ContentType = "image/png";
                context.Response.Headers.CacheControl = "private, max-age=300";
                await context.Response.Body.WriteAsync(png, cancellationToken);
                return;
            }

            await WriteAsync(context, sites.NotFound(site));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // The guest closed the page.
        }
        catch (Exception error)
        {
            logger.LogError(error, "Event page {Path} failed on {Host}", path, host);
            if (!context.Response.HasStarted)
            {
                context.Response.Clear();
                context.Response.StatusCode = StatusCodes.Status500InternalServerError;
                context.Response.ContentType = "text/plain; charset=utf-8";
                await context.Response.WriteAsync("Sorry, something went wrong. Please try again in a moment.", CancellationToken.None);
            }
        }
    }

    private sealed record ConfirmBody(string? G, string? R, string? Reason);

    private static async Task WritePngAsync(HttpContext context, byte[]? png, string? downloadName)
    {
        if (png is null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        context.Response.ContentType = "image/png";
        context.Response.Headers.CacheControl = "private, max-age=300";
        if (downloadName is not null)
        {
            context.Response.Headers.ContentDisposition = $"attachment; filename=\"{downloadName}\"";
        }

        if (!HttpMethods.IsHead(context.Request.Method))
        {
            await context.Response.Body.WriteAsync(png, context.RequestAborted);
        }
    }

    private static async Task WriteAsync(HttpContext context, EventSiteService.Page page)
    {
        context.Response.StatusCode = page.Status;
        context.Response.ContentType = "text/html; charset=utf-8";
        // Personal pages: never cached by shared proxies, never framed by other sites.
        context.Response.Headers.CacheControl = "private, no-store";
        context.Response.Headers.XFrameOptions = "DENY";
        context.Response.Headers.XContentTypeOptions = "nosniff";
        if (!HttpMethods.IsHead(context.Request.Method))
        {
            await context.Response.WriteAsync(page.Html, context.RequestAborted);
        }
    }
}
