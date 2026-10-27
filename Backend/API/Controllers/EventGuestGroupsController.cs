using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/guest-groups")]
public sealed class EventGuestGroupsController(IGuestGroupService groups) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<GuestGroupDto>>>> List(Guid eventId, CancellationToken cancellationToken)
    {
        var items = await groups.ListAsync(eventId, cancellationToken);
        return Ok(new ApiResponse<IReadOnlyList<GuestGroupDto>>(true, items));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<GuestGroupDto>>> Create(
        Guid eventId,
        SaveGuestGroupRequest request,
        CancellationToken cancellationToken)
    {
        var group = await groups.CreateAsync(eventId, request, cancellationToken);
        return Ok(new ApiResponse<GuestGroupDto>(true, group, "Group created."));
    }

    [HttpPut("{groupId:guid}")]
    public async Task<ActionResult<ApiResponse<GuestGroupDto>>> Rename(
        Guid eventId,
        Guid groupId,
        SaveGuestGroupRequest request,
        CancellationToken cancellationToken)
    {
        var group = await groups.RenameAsync(eventId, groupId, request, cancellationToken);
        return Ok(new ApiResponse<GuestGroupDto>(true, group, "Group renamed."));
    }

    /// <param name="deleteGuests">True deletes the group's guests too; false keeps them, ungrouped.</param>
    [HttpDelete("{groupId:guid}")]
    public async Task<ActionResult<ApiResponse<DeleteGuestGroupResult>>> Delete(
        Guid eventId,
        Guid groupId,
        [FromQuery] bool deleteGuests,
        CancellationToken cancellationToken)
    {
        var result = await groups.DeleteAsync(eventId, groupId, deleteGuests, cancellationToken);
        return Ok(new ApiResponse<DeleteGuestGroupResult>(true, result, result.Message));
    }

    [HttpPost("move")]
    public async Task<ActionResult<ApiResponse<int>>> Move(
        Guid eventId,
        MoveGuestsToGroupRequest request,
        CancellationToken cancellationToken)
    {
        var moved = await groups.MoveGuestsAsync(eventId, request, cancellationToken);
        return Ok(new ApiResponse<int>(true, moved, $"Moved {moved} guest{(moved == 1 ? "" : "s")}."));
    }
}
