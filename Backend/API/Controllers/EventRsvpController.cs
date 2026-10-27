using Entourage.Application;
using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/rsvp")]
public sealed class EventRsvpController(RsvpDashboardService rsvp, RsvpPageService pages) : ControllerBase
{
    /// <summary>Look and wording of the guest RSVP page.</summary>
    [HttpGet("page")]
    public async Task<ActionResult<ApiResponse<Entourage.Application.DTOs.RsvpPageSettingsDto>>> GetPage(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<Entourage.Application.DTOs.RsvpPageSettingsDto>(true, await pages.GetSettingsAsync(eventId, cancellationToken)));

    [HttpPut("page")]
    public async Task<ActionResult<ApiResponse<Entourage.Application.DTOs.RsvpPageSettingsDto>>> SavePage(
        Guid eventId,
        Entourage.Application.DTOs.RsvpPageSettingsDto settings,
        CancellationToken cancellationToken) =>
        Ok(new ApiResponse<Entourage.Application.DTOs.RsvpPageSettingsDto>(true, await pages.SaveSettingsAsync(eventId, settings, cancellationToken), "RSVP page saved."));

    /// <summary>The page with a sample guest. view: confirm-accept, confirm-decline, accepted, declined.</summary>
    [HttpPost("page/preview")]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<IActionResult> PreviewPage(
        Guid eventId,
        [FromQuery] string? view,
        Entourage.Application.DTOs.RsvpPageSettingsDto settings,
        CancellationToken cancellationToken)
    {
        var html = await pages.PreviewAsync(eventId, settings, view, cancellationToken);
        Response.Headers.CacheControl = "no-store";
        return Content(html, "text/html; charset=utf-8");
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<RsvpDashboardDto>>> Get(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<RsvpDashboardDto>(true, await rsvp.GetAsync(eventId, cancellationToken)));

    /// <summary>Sets (or clears, with null) the artwork guests see after confirming they will attend.</summary>
    [HttpPut("thank-you-image")]
    public async Task<ActionResult<ApiResponse<ThankYouImageRequest>>> SetThankYouImage(
        Guid eventId,
        ThankYouImageRequest request,
        CancellationToken cancellationToken) =>
        Ok(new ApiResponse<ThankYouImageRequest>(true, await rsvp.SetThankYouImageAsync(eventId, request, cancellationToken), "Thank-you image saved."));

    [HttpPut("settings")]
    public async Task<ActionResult<ApiResponse<RsvpSettingsRequest>>> SaveSettings(
        Guid eventId,
        RsvpSettingsRequest request,
        CancellationToken cancellationToken) =>
        Ok(new ApiResponse<RsvpSettingsRequest>(true, await rsvp.SaveSettingsAsync(eventId, request, cancellationToken), "RSVP settings saved."));
}
