using Entourage.Application.DTOs;
using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

/// <summary>
/// The guest's RSVP page and the calls it makes, keyed by the guest's personal code (g). No sign-in.
/// Served on the app's own address and on the event's domain.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("api/public/rsvp")]
public sealed class PublicRsvpController(RsvpPageService rsvp) : ControllerBase
{
    /// <summary>The page: ?g={code}&amp;status=accept|decline (r= also works).</summary>
    [HttpGet]
    public async Task<IActionResult> Page([FromQuery] string? g, [FromQuery] string? status, [FromQuery] string? r, CancellationToken cancellationToken)
    {
        var (code, html) = await rsvp.PageAsync(g, status ?? r, cancellationToken);
        NoStore();
        return new ContentResult { Content = html, ContentType = "text/html; charset=utf-8", StatusCode = code };
    }

    /// <summary>The guest's own invitation (their guest type's design); its buttons open the RSVP page.</summary>
    [HttpGet("invitation")]
    public async Task<IActionResult> Invitation([FromQuery] string? g, CancellationToken cancellationToken)
    {
        var (code, html) = await rsvp.InvitationAsync(g, $"{Request.Scheme}://{Request.Host}", cancellationToken);
        NoStore();
        return new ContentResult { Content = html, ContentType = "text/html; charset=utf-8", StatusCode = code };
    }

    [HttpGet("name")]
    public async Task<IActionResult> Name([FromQuery] string? g, CancellationToken cancellationToken)
    {
        var png = await rsvp.NameImageAsync(g, cancellationToken);
        if (png is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "private, max-age=300";
        return File(png, "image/png");
    }

    /// <summary>The confirm button: saves Accepted or Declined (with the optional decline reason).</summary>
    [HttpPost("confirm")]
    public async Task<IActionResult> Confirm(PublicRsvpRequest request, CancellationToken cancellationToken)
    {
        var (code, result) = await rsvp.ConfirmAsync(request, cancellationToken);
        NoStore();
        return StatusCode(code, result);
    }

    [HttpGet("e-badge")]
    public async Task<IActionResult> Badge([FromQuery] string? g, [FromQuery] string? download, CancellationToken cancellationToken)
    {
        var badge = await rsvp.BadgeAsync(g, cancellationToken);
        if (badge is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "private, max-age=300";
        return download == "1" ? File(badge.Value.Png, "image/png", badge.Value.FileName) : File(badge.Value.Png, "image/png");
    }

    [HttpGet("qr")]
    public async Task<IActionResult> Qr([FromQuery] string? g, CancellationToken cancellationToken)
    {
        var png = await rsvp.QrAsync(g, $"{Request.Scheme}://{Request.Host}", cancellationToken);
        if (png is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "private, max-age=300";
        return File(png, "image/png");
    }

    [HttpGet("wallet")]
    public async Task<IActionResult> Wallet([FromQuery] string? g, CancellationToken cancellationToken)
    {
        var pass = await rsvp.WalletAsync(g, cancellationToken);
        if (pass is null)
        {
            return NotFound();
        }

        NoStore();
        return File(pass.Value.Bytes, "application/vnd.apple.pkpass", pass.Value.FileName);
    }

    private void NoStore()
    {
        Response.Headers.CacheControl = "no-store";
        Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
    }
}
