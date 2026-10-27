using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

/// <summary>Read-only live attendance for people given the viewer link; no sign-in.</summary>
[ApiController]
[AllowAnonymous]
[Route("api/public/live")]
public sealed class PublicLiveController(CheckInService checkIn) : ControllerBase
{
    [HttpGet("{token}")]
    public async Task<ActionResult<ApiResponse<PublicLiveAttendanceDto>>> Get(string token, CancellationToken cancellationToken)
    {
        var live = await checkIn.PublicLiveAsync(token, cancellationToken);
        Response.Headers.CacheControl = "no-store";
        Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
        return Ok(new ApiResponse<PublicLiveAttendanceDto>(true, live));
    }
}
