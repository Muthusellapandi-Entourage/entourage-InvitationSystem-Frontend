using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/seating")]
public sealed class EventSeatingController(ISeatingPlanService seatingPlanService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<SeatingPlanDto>>> Get(Guid eventId, CancellationToken cancellationToken)
    {
        var plan = await seatingPlanService.GetAsync(eventId, cancellationToken);
        return Ok(new ApiResponse<SeatingPlanDto>(true, plan));
    }

    [HttpPut]
    public async Task<ActionResult<ApiResponse<SeatingPlanDto>>> Save(
        Guid eventId,
        SaveSeatingPlanRequest request,
        CancellationToken cancellationToken)
    {
        var plan = await seatingPlanService.SaveAsync(eventId, request, cancellationToken);
        return Ok(new ApiResponse<SeatingPlanDto>(true, plan, "Seating layout saved."));
    }

    [HttpDelete("layouts/{layoutId}")]
    public async Task<ActionResult<ApiResponse<SeatingPlanDto>>> DeleteLayout(
        Guid eventId,
        string layoutId,
        CancellationToken cancellationToken)
    {
        var plan = await seatingPlanService.DeleteLayoutAsync(eventId, layoutId, cancellationToken);
        return Ok(new ApiResponse<SeatingPlanDto>(true, plan, "Layout deleted."));
    }

    [HttpPost("layouts/{layoutId}/reset")]
    public async Task<ActionResult<ApiResponse<SeatingPlanDto>>> ResetLayout(
        Guid eventId,
        string layoutId,
        CancellationToken cancellationToken)
    {
        var plan = await seatingPlanService.ResetLayoutAsync(eventId, layoutId, cancellationToken);
        return Ok(new ApiResponse<SeatingPlanDto>(true, plan, "Layout reset."));
    }
}
