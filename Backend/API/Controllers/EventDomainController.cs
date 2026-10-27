using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

/// <summary>The event's own web address for guest invitation pages.</summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/domain")]
public sealed class EventDomainController(EventSiteService sites) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<EventDomainDto>>> Get(Guid eventId, CancellationToken cancellationToken)
    {
        return Ok(new ApiResponse<EventDomainDto>(true, await sites.GetAsync(eventId, cancellationToken)));
    }

    [HttpPut]
    public async Task<ActionResult<ApiResponse<EventDomainDto>>> Set(
        Guid eventId,
        SetEventDomainRequest request,
        CancellationToken cancellationToken)
    {
        // The address the admin uses (and the API's own) can never be given to an event.
        var reserved = new List<string> { Request.Host.Host };
        if (Uri.TryCreate(Request.Headers.Origin.ToString(), UriKind.Absolute, out var origin))
        {
            reserved.Add(origin.Host);
        }

        var domain = await sites.SetAsync(eventId, request, reserved, cancellationToken);
        return Ok(new ApiResponse<EventDomainDto>(true, domain, "Domain saved. Point its DNS at this server, then check it."));
    }

    [HttpDelete]
    public async Task<ActionResult<ApiResponse<EventDomainDto>>> Clear(Guid eventId, CancellationToken cancellationToken)
    {
        return Ok(new ApiResponse<EventDomainDto>(true, await sites.ClearAsync(eventId, cancellationToken), "Domain removed."));
    }

    [HttpPost("check")]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<ActionResult<ApiResponse<EventDomainCheckDto>>> Check(Guid eventId, CancellationToken cancellationToken)
    {
        var result = await sites.CheckAsync(eventId, cancellationToken);
        return Ok(new ApiResponse<EventDomainCheckDto>(true, result, result.Message));
    }
}
