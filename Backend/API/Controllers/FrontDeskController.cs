using Entourage.Application;
using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

/// <summary>Admin: the front-desk dashboard link for an event.</summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/front-desk-share")]
public sealed class FrontDeskShareController(FrontDeskService frontDesk) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<FrontDeskShareDto>>> Get(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<FrontDeskShareDto>(true, await frontDesk.GetShareAsync(eventId, cancellationToken)));

    [HttpPost]
    public async Task<ActionResult<ApiResponse<FrontDeskShareDto>>> Renew(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<FrontDeskShareDto>(true, await frontDesk.RenewShareAsync(eventId, cancellationToken), "Front-desk link ready."));

    [HttpDelete]
    public async Task<ActionResult<ApiResponse<FrontDeskShareDto>>> Disable(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<FrontDeskShareDto>(true, await frontDesk.DisableShareAsync(eventId, cancellationToken), "Front-desk link turned off."));
}

/// <summary>The front-desk dashboard behind its secret link. No sign-in.</summary>
[ApiController]
[AllowAnonymous]
[Route("api/public/front-desk/{token}")]
public sealed class PublicFrontDeskController(FrontDeskService frontDesk) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<FrontDeskDto>>> Get(string token, CancellationToken cancellationToken)
    {
        NoStore();
        return Ok(new ApiResponse<FrontDeskDto>(true, await frontDesk.GetAsync(token, cancellationToken)));
    }

    [HttpPost("guests/{guestId:guid}/check-in")]
    public async Task<ActionResult<ApiResponse<FrontDeskActionResult>>> CheckIn(string token, Guid guestId, CancellationToken cancellationToken)
    {
        NoStore();
        var result = await frontDesk.CheckInAsync(token, guestId, cancellationToken);
        return Ok(new ApiResponse<FrontDeskActionResult>(true, result, result.Message));
    }

    [HttpPost("guests/{guestId:guid}/seated")]
    public async Task<ActionResult<ApiResponse<FrontDeskActionResult>>> Seated(string token, Guid guestId, CancellationToken cancellationToken)
    {
        NoStore();
        var result = await frontDesk.MarkSeatedAsync(token, guestId, cancellationToken);
        return Ok(new ApiResponse<FrontDeskActionResult>(true, result, result.Message));
    }

    private void NoStore()
    {
        Response.Headers.CacheControl = "no-store";
        Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
    }
}
