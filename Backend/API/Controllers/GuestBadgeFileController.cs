using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

/// <summary>One guest's E-Badge as a PNG drawn on the server (used by the guest panel's downloads).</summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/guests/{guestId:guid}/e-badge")]
public sealed class GuestBadgeFileController(RsvpPageService rsvp) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(Guid eventId, Guid guestId, CancellationToken cancellationToken)
    {
        var (png, fileName) = await rsvp.GuestBadgeAsync(eventId, guestId, cancellationToken);
        Response.Headers.CacheControl = "no-store";
        return File(png, "image/png", fileName);
    }
}
