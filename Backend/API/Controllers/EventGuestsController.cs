using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/guests")]
public sealed class EventGuestsController(IGuestDirectoryService guests, IConfiguration configuration) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<GuestDto>>>> List(
        Guid eventId,
        [FromQuery] Guid? guestTypeId,
        [FromQuery] bool unassigned,
        CancellationToken cancellationToken)
    {
        var items = await guests.ListGuestsAsync(eventId, guestTypeId, unassigned, cancellationToken);
        return Ok(new ApiResponse<IReadOnlyList<GuestDto>>(true, items));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<GuestDto>>> Create(
        Guid eventId,
        SaveGuestRequest request,
        CancellationToken cancellationToken)
    {
        var guest = await guests.CreateGuestAsync(eventId, request, cancellationToken);
        return Ok(new ApiResponse<GuestDto>(true, guest, "Guest added."));
    }

    [HttpPut("{guestId:guid}")]
    public async Task<ActionResult<ApiResponse<GuestDto>>> Update(
        Guid eventId,
        Guid guestId,
        SaveGuestRequest request,
        CancellationToken cancellationToken)
    {
        var guest = await guests.UpdateGuestAsync(eventId, guestId, request, cancellationToken);
        return Ok(new ApiResponse<GuestDto>(true, guest, "Guest saved."));
    }

    [HttpPost("reassign")]
    public async Task<ActionResult<ApiResponse<GuestOperationResult>>> Reassign(
        Guid eventId,
        ReassignGuestsRequest request,
        CancellationToken cancellationToken)
    {
        var result = await guests.ReassignGuestsAsync(eventId, request, cancellationToken);
        return Ok(new ApiResponse<GuestOperationResult>(true, result, result.Message));
    }

    [HttpPost("import")]
    public async Task<ActionResult<ApiResponse<ImportGuestsResultDto>>> Import(
        Guid eventId,
        ImportGuestsRequest request,
        CancellationToken cancellationToken)
    {
        var result = await guests.ImportGuestsAsync(eventId, request, cancellationToken);
        return Ok(new ApiResponse<ImportGuestsResultDto>(true, result, result.Message));
    }

    [HttpPost("invitations")]
    public async Task<ActionResult<ApiResponse<GuestOperationResult>>> IssueInvitations(
        Guid eventId,
        GuestIdsRequest request,
        CancellationToken cancellationToken)
    {
        var result = await guests.IssueInvitationsAsync(eventId, request, AssetOrigin(), AppOrigin(), cancellationToken);
        return Ok(new ApiResponse<GuestOperationResult>(true, result, result.Message));
    }

    [HttpPost("badges/prepare")]
    public async Task<ActionResult<ApiResponse<BadgeBatchDto>>> PrepareBadges(
        Guid eventId,
        GuestIdsRequest request,
        CancellationToken cancellationToken)
    {
        var result = await guests.PrepareBadgesAsync(eventId, request, cancellationToken);
        return Ok(new ApiResponse<BadgeBatchDto>(true, result, result.Message));
    }

    [HttpPost("badges")]
    public async Task<ActionResult<ApiResponse<GuestOperationResult>>> CommitBadges(
        Guid eventId,
        GuestIdsRequest request,
        CancellationToken cancellationToken)
    {
        var result = await guests.CommitBadgesAsync(eventId, request, cancellationToken);
        return Ok(new ApiResponse<GuestOperationResult>(true, result, result.Message));
    }

    private string AssetOrigin() => $"{Request.Scheme}://{Request.Host}";

    private string AppOrigin()
    {
        var origin = Request.Headers.Origin.ToString();
        if (Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https")
        {
            return uri.GetLeftPart(UriPartial.Authority);
        }

        return configuration["InvitationPreview:AppOrigin"] ?? "http://localhost:5173";
    }
}
