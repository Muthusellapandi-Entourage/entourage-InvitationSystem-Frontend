using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/guests")]
public sealed class EventGuestsController(
    IGuestDirectoryService guests,
    IGuestGroupService groups,
    IGuestMailer mailer,
    IConfiguration configuration) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<GuestDto>>>> List(
        Guid eventId,
        [FromQuery] Guid? guestTypeId,
        [FromQuery] bool unassigned,
        [FromQuery] Guid? guestGroupId,
        [FromQuery] bool ungrouped,
        CancellationToken cancellationToken)
    {
        var items = await guests.ListGuestsAsync(eventId, guestTypeId, unassigned, cancellationToken, guestGroupId, ungrouped);
        return Ok(new ApiResponse<IReadOnlyList<GuestDto>>(true, items));
    }

    [HttpDelete("{guestId:guid}")]
    public async Task<ActionResult<ApiResponse<DeleteGuestsResult>>> Delete(
        Guid eventId,
        Guid guestId,
        CancellationToken cancellationToken)
    {
        var result = await groups.DeleteGuestsAsync(eventId, new GuestIdsRequest([guestId]), cancellationToken);
        return Ok(new ApiResponse<DeleteGuestsResult>(true, result, result.Message));
    }

    [HttpPost("delete")]
    public async Task<ActionResult<ApiResponse<DeleteGuestsResult>>> DeleteMany(
        Guid eventId,
        GuestIdsRequest request,
        CancellationToken cancellationToken)
    {
        var result = await groups.DeleteGuestsAsync(eventId, request, cancellationToken);
        return Ok(new ApiResponse<DeleteGuestsResult>(true, result, result.Message));
    }

    /// <summary>Email each guest their invitation through the configured SMTP server.</summary>
    [HttpPost("email")]
    public async Task<ActionResult<ApiResponse<BulkEmailResult>>> Email(
        Guid eventId,
        EmailGuestsRequest request,
        CancellationToken cancellationToken)
    {
        var result = await mailer.SendInvitationsAsync(
            eventId,
            new GuestIdsRequest(request.GuestIds ?? []),
            AssetOrigin(),
            AppOrigin(),
            cancellationToken,
            request.Reminder);
        return Ok(new ApiResponse<BulkEmailResult>(true, result, result.Message));
    }

    [HttpPut("{guestId:guid}/rsvp")]
    public async Task<ActionResult<ApiResponse<GuestActivityDto?>>> SetRsvp(
        Guid eventId,
        Guid guestId,
        SetGuestRsvpRequest request,
        CancellationToken cancellationToken)
    {
        var activity = await groups.SetRsvpAsync(eventId, guestId, request, cancellationToken);
        return Ok(new ApiResponse<GuestActivityDto?>(true, activity, $"Status set to {request.Status}."));
    }

    [HttpGet("{guestId:guid}/activity")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<GuestActivityDto>>>> Activity(
        Guid eventId,
        Guid guestId,
        CancellationToken cancellationToken)
    {
        var items = await groups.ListActivityAsync(eventId, guestId, cancellationToken);
        return Ok(new ApiResponse<IReadOnlyList<GuestActivityDto>>(true, items));
    }

    [HttpPost("{guestId:guid}/activity")]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<ActionResult<ApiResponse<GuestActivityDto>>> LogActivity(
        Guid eventId,
        Guid guestId,
        LogGuestActivityRequest request,
        CancellationToken cancellationToken)
    {
        var item = await groups.LogActivityAsync(eventId, guestId, request, cancellationToken);
        return Ok(new ApiResponse<GuestActivityDto>(true, item));
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

    // Only reads designs, so downloads also work on archived events.
    [Entourage.Api.Filters.AllowOnArchivedEvent]
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
