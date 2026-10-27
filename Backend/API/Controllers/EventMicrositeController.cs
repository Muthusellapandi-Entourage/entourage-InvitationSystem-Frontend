using Entourage.Api.Filters;
using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/microsite")]
public sealed class EventMicrositeController(MicrositeService microsite) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<MicrositeDto>>> Get(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<MicrositeDto>(true, await microsite.GetAsync(eventId, cancellationToken)));

    [HttpPut]
    [RequestSizeLimit(4 * 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<MicrositeDto>>> Save(Guid eventId, SaveMicrositeRequest request, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<MicrositeDto>(true, await microsite.SaveAsync(eventId, request, cancellationToken), "Microsite saved."));

    /// <summary>The unsaved design as a full page, as a sample guest (guest=true) or as the public sees it.</summary>
    [HttpPost("preview")]
    [AllowOnArchivedEvent]
    [RequestSizeLimit(4 * 1024 * 1024)]
    public async Task<IActionResult> Preview(Guid eventId, [FromQuery] bool guest, [FromQuery] string? page, MicrositeDesignDto design, CancellationToken cancellationToken)
    {
        // Image and font links stay relative ("/api/public/…"); the app points them at its API address.
        var html = await microsite.PreviewAsync(eventId, design, guest, string.Empty, cancellationToken, page);
        Response.Headers.CacheControl = "no-store";
        return Content(html, "text/html; charset=utf-8");
    }
}
