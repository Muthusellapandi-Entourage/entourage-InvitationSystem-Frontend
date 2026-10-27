using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

/// <summary>Generated guest-name images for "single image" invitations (PNG responses).</summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}")]
public sealed class NameImagesController(IGuestDirectoryService guests) : ControllerBase
{
    /// <summary>Live preview in the designer: the unsaved design with a sample name.</summary>
    [HttpPost("invitation-name-preview")]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<IActionResult> Preview(Guid eventId, GuestNamePreviewRequest request, CancellationToken cancellationToken)
    {
        var name = string.IsNullOrWhiteSpace(request.Name) ? "Salman K Juma" : request.Name.Trim();
        var png = await guests.RenderNameImageAsync(eventId, request.Design, name, request.Position, cancellationToken);
        Response.Headers.CacheControl = "no-store";
        return File(png, "image/png");
    }

    /// <summary>The name image for one guest, used by "View invitation" and PDF downloads.</summary>
    [HttpGet("guests/{guestId:guid}/name-image")]
    public async Task<IActionResult> GuestNameImage(Guid eventId, Guid guestId, CancellationToken cancellationToken)
    {
        var png = await guests.RenderGuestNameImageAsync(eventId, guestId, cancellationToken);
        Response.Headers.CacheControl = "no-store";
        return File(png, "image/png");
    }
}
