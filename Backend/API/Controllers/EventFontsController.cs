using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/fonts")]
public sealed class EventFontsController(IEventFontService fonts) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<EventFontDto>>>> List(Guid eventId, CancellationToken cancellationToken)
    {
        return Ok(new ApiResponse<IReadOnlyList<EventFontDto>>(true, await fonts.ListAsync(eventId, cancellationToken)));
    }

    [HttpPost]
    [RequestSizeLimit(12 * 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<EventFontDto>>> Upload(
        Guid eventId,
        IFormFile file,
        [FromForm] string? name,
        CancellationToken cancellationToken)
    {
        await using var stream = file.OpenReadStream();
        var font = await fonts.UploadAsync(eventId, stream, file.FileName, name, cancellationToken);
        return Ok(new ApiResponse<EventFontDto>(true, font, $"{font.Name} uploaded."));
    }

    [HttpDelete("{fontId:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid eventId, Guid fontId, CancellationToken cancellationToken)
    {
        await fonts.DeleteAsync(eventId, fontId, cancellationToken);
        return Ok(new ApiResponse<object>(true, null, "Font deleted."));
    }
}

/// <summary>Font files for the designer preview, and per-guest name images for emails. No sign-in needed.</summary>
[ApiController]
[AllowAnonymous]
[Route("api/public")]
public sealed class PublicNameImagesController(IEventFontService fonts, GuestNameImageService nameImages) : ControllerBase
{
    [HttpGet("fonts/{fontId:guid}")]
    public async Task<IActionResult> Font(Guid fontId, CancellationToken cancellationToken)
    {
        var font = await fonts.ReadAsync(fontId, cancellationToken);
        if (font is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        Response.Headers.AccessControlAllowOrigin = "*";
        return File(font.Value.Bytes, font.Value.ContentType);
    }

    [HttpGet("name-images/{eventId:guid}/{fileId:guid}")]
    public IActionResult NameImage(Guid eventId, Guid fileId)
    {
        var path = nameImages.Open(eventId, fileId);
        if (path is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        Response.Headers.AccessControlAllowOrigin = "*";
        return PhysicalFile(path, "image/png");
    }
}
