using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

/// <summary>Door check-in for the EventPass scanner page.</summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/check-in")]
public sealed class EventCheckInController(CheckInService checkIn) : ControllerBase
{
    /// <summary>Live attendance board: totals and the latest scans, newest first. Polled every few seconds.</summary>
    [HttpGet("live")]
    public async Task<ActionResult<ApiResponse<LiveAttendanceDto>>> Live(
        Guid eventId,
        [FromQuery] int take,
        CancellationToken cancellationToken)
    {
        var live = await checkIn.LiveAsync(eventId, take == 0 ? 100 : take, cancellationToken);
        return Ok(new ApiResponse<LiveAttendanceDto>(true, live));
    }

    [HttpGet("live-share")]
    public async Task<ActionResult<ApiResponse<LiveShareDto>>> GetShare(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<LiveShareDto>(true, await checkIn.GetShareAsync(eventId, cancellationToken)));

    /// <summary>Creates the read-only viewer link, or replaces it so the old one stops working.</summary>
    [HttpPost("live-share")]
    public async Task<ActionResult<ApiResponse<LiveShareDto>>> RenewShare(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<LiveShareDto>(true, await checkIn.RenewShareAsync(eventId, cancellationToken), "Viewer link ready."));

    [HttpDelete("live-share")]
    public async Task<ActionResult<ApiResponse<LiveShareDto>>> DisableShare(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<LiveShareDto>(true, await checkIn.DisableShareAsync(eventId, cancellationToken), "Viewer link turned off."));

    [HttpPost("scan")]
    public async Task<ActionResult<ApiResponse<CheckInResultDto>>> Scan(
        Guid eventId,
        CheckInScanRequest request,
        CancellationToken cancellationToken)
    {
        var result = await checkIn.ScanAsync(eventId, request, cancellationToken);
        return Ok(new ApiResponse<CheckInResultDto>(true, result, result.Message));
    }

    [HttpPost("guests/{guestId:guid}/seated")]
    public async Task<ActionResult<ApiResponse<CheckInGuestDto>>> MarkSeated(
        Guid eventId,
        Guid guestId,
        CancellationToken cancellationToken)
    {
        var guest = await checkIn.MarkSeatedAsync(eventId, guestId, cancellationToken);
        return Ok(new ApiResponse<CheckInGuestDto>(true, guest, "Marked as seated."));
    }
}
