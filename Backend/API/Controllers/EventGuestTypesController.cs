using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/guest-types")]
public sealed class EventGuestTypesController(IGuestDirectoryService guests) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<GuestTypeDto>>>> List(Guid eventId, CancellationToken cancellationToken)
    {
        var types = await guests.ListTypesAsync(eventId, cancellationToken);
        return Ok(new ApiResponse<IReadOnlyList<GuestTypeDto>>(true, types));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<GuestTypeDto>>> Create(
        Guid eventId,
        CreateGuestTypeRequest request,
        CancellationToken cancellationToken)
    {
        var type = await guests.CreateTypeAsync(eventId, request, cancellationToken);
        return Ok(new ApiResponse<GuestTypeDto>(true, type, "Guest category created."));
    }

    [HttpPut("{guestTypeId:guid}")]
    public async Task<ActionResult<ApiResponse<GuestTypeDto>>> Update(
        Guid eventId,
        Guid guestTypeId,
        UpdateGuestTypeRequest request,
        CancellationToken cancellationToken)
    {
        var type = await guests.UpdateTypeAsync(eventId, guestTypeId, request, cancellationToken);
        return Ok(new ApiResponse<GuestTypeDto>(true, type, "Guest category saved."));
    }

    [HttpPut("order")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<GuestTypeDto>>>> Reorder(
        Guid eventId,
        ReorderGuestTypesRequest request,
        CancellationToken cancellationToken)
    {
        var types = await guests.ReorderTypesAsync(eventId, request, cancellationToken);
        return Ok(new ApiResponse<IReadOnlyList<GuestTypeDto>>(true, types, "Guest category order saved."));
    }

    [HttpDelete("{guestTypeId:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(
        Guid eventId,
        Guid guestTypeId,
        [FromQuery] bool discardDesigns,
        CancellationToken cancellationToken)
    {
        await guests.DeleteTypeAsync(eventId, guestTypeId, discardDesigns, cancellationToken);
        return Ok(new ApiResponse<object>(true, null, "Guest category deleted."));
    }

    [HttpPost("{guestTypeId:guid}/duplicate")]
    public async Task<ActionResult<ApiResponse<GuestTypeDto>>> Duplicate(
        Guid eventId,
        Guid guestTypeId,
        DuplicateDesignRequest request,
        CancellationToken cancellationToken)
    {
        var type = await guests.DuplicateDesignAsync(eventId, guestTypeId, request, cancellationToken);
        return Ok(new ApiResponse<GuestTypeDto>(true, type, "Design copied."));
    }

    [HttpGet("{guestTypeId:guid}/invitation")]
    public async Task<ActionResult<ApiResponse<GuestTypeInvitationDto>>> GetInvitation(
        Guid eventId,
        Guid guestTypeId,
        CancellationToken cancellationToken)
    {
        var template = await guests.GetInvitationAsync(eventId, guestTypeId, cancellationToken);
        return Ok(new ApiResponse<GuestTypeInvitationDto>(true, template));
    }

    [HttpPut("{guestTypeId:guid}/invitation")]
    public async Task<ActionResult<ApiResponse<GuestTypeInvitationDto>>> SaveInvitation(
        Guid eventId,
        Guid guestTypeId,
        InvitationDesignDto design,
        CancellationToken cancellationToken)
    {
        var template = await guests.SaveInvitationAsync(eventId, guestTypeId, design, cancellationToken);
        return Ok(new ApiResponse<GuestTypeInvitationDto>(true, template, "Invitation design saved."));
    }

    [HttpGet("{guestTypeId:guid}/badge")]
    public async Task<ActionResult<ApiResponse<GuestTypeBadgeDto>>> GetBadge(
        Guid eventId,
        Guid guestTypeId,
        CancellationToken cancellationToken)
    {
        var template = await guests.GetBadgeAsync(eventId, guestTypeId, cancellationToken);
        return Ok(new ApiResponse<GuestTypeBadgeDto>(true, template));
    }

    [HttpPut("{guestTypeId:guid}/badge")]
    public async Task<ActionResult<ApiResponse<GuestTypeBadgeDto>>> SaveBadge(
        Guid eventId,
        Guid guestTypeId,
        BadgeDesignDto design,
        CancellationToken cancellationToken)
    {
        var template = await guests.SaveBadgeAsync(eventId, guestTypeId, design, cancellationToken);
        return Ok(new ApiResponse<GuestTypeBadgeDto>(true, template, "Badge design saved."));
    }
}
