using Entourage.Application;
using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

/// <summary>The event's analytics dataset (read-only, so it also works on archived events).</summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/analytics")]
public sealed class EventAnalyticsController(EventAnalyticsService analytics) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<EventAnalyticsDto>>> Get(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<EventAnalyticsDto>(true, await analytics.GetAsync(eventId, cancellationToken)));
}
