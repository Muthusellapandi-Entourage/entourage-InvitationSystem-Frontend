using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events")]
public sealed class EventsController(IEventService eventService, ICurrentUser currentUser) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<EventDto>>>> List(
        [FromQuery] string? search,
        [FromQuery] EventStatus? status,
        CancellationToken cancellationToken)
    {
        var events = await eventService.ListAsync(search, status, cancellationToken);
        return Ok(new ApiResponse<IReadOnlyList<EventDto>>(true, events));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<EventDto>>> Get(Guid id, CancellationToken cancellationToken)
    {
        var item = await eventService.GetAsync(id, cancellationToken);
        return Ok(new ApiResponse<EventDto>(true, item));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<EventDto>>> Create(
        EventWriteRequest request,
        CancellationToken cancellationToken)
    {
        var item = await eventService.CreateAsync(request, currentUser.UserId, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = item.Id }, new ApiResponse<EventDto>(true, item));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiResponse<EventDto>>> Update(
        Guid id,
        EventWriteRequest request,
        CancellationToken cancellationToken)
    {
        var item = await eventService.UpdateAsync(id, request, cancellationToken);
        return Ok(new ApiResponse<EventDto>(true, item));
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id, CancellationToken cancellationToken)
    {
        await eventService.DeleteAsync(id, cancellationToken);
        return Ok(new ApiResponse<object>(true, null, "Event deleted successfully."));
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<ActionResult<ApiResponse<EventDto>>> UpdateStatus(
        Guid id,
        UpdateEventStatusRequest request,
        CancellationToken cancellationToken)
    {
        var item = await eventService.UpdateStatusAsync(id, request, cancellationToken);
        return Ok(new ApiResponse<EventDto>(true, item));
    }
}
