using Entourage.Application;
using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

/// <summary>Admin: design and publish the event's self-registration page.</summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/registration")]
public sealed class RegistrationController(RegistrationService registration) : ControllerBase
{
    private string Origin => $"{Request.Scheme}://{Request.Host}";

    [HttpGet]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<ActionResult<ApiResponse<RegistrationInfoDto>>> Get(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<RegistrationInfoDto>(true, await registration.GetInfoAsync(eventId, Origin, cancellationToken)));

    [HttpPut]
    public async Task<ActionResult<ApiResponse<RegistrationInfoDto>>> Save(Guid eventId, RegistrationSettingsDto settings, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<RegistrationInfoDto>(true, await registration.SaveAsync(eventId, settings, Origin, cancellationToken), "Registration page saved."));

    /// <summary>The page with unsaved settings (view = form, done or closed). Nothing is stored.</summary>
    [HttpPost("preview")]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<IActionResult> Preview(Guid eventId, RegistrationSettingsDto settings, [FromQuery] string? view, CancellationToken cancellationToken)
    {
        var html = await registration.PreviewAsync(eventId, settings, view, cancellationToken);
        Response.Headers.CacheControl = "no-store";
        return Content(html, "text/html; charset=utf-8");
    }

    /// <summary>QR code that opens the public registration page.</summary>
    [HttpGet("qr")]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<IActionResult> Qr(Guid eventId, CancellationToken cancellationToken)
    {
        var png = await registration.QrAsync(eventId, Origin, cancellationToken);
        Response.Headers.CacheControl = "no-store";
        return File(png, "image/png");
    }
}

/// <summary>The public registration page and its submit call. No sign-in.</summary>
[ApiController]
[AllowAnonymous]
[Route("api/public/register/{key}")]
public sealed class PublicRegistrationController(RegistrationService registration) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Page(string key, CancellationToken cancellationToken)
    {
        var (status, html) = await registration.PageAsync(key, cancellationToken);
        NoStore();
        return new ContentResult { Content = html, ContentType = "text/html; charset=utf-8", StatusCode = status };
    }

    [HttpPost]
    public async Task<IActionResult> Submit(string key, PublicRegistrationRequest request, CancellationToken cancellationToken)
    {
        var (status, result) = await registration.SubmitAsync(key, request, cancellationToken);
        NoStore();
        return StatusCode(status, result);
    }

    private void NoStore()
    {
        Response.Headers.CacheControl = "no-store";
        Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
    }
}
