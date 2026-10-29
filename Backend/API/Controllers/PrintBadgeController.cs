using Entourage.Application;
using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

/// <summary>Admin: the printed badge design of a guest type (separate from the E-Badge).</summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/guest-types/{guestTypeId:guid}/print-badge")]
public sealed class PrintBadgeController(PrintBadgeService printBadges) : ControllerBase
{
    [HttpGet]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<ActionResult<ApiResponse<PrintBadgeTemplateDto>>> Get(Guid eventId, Guid guestTypeId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<PrintBadgeTemplateDto>(true, await printBadges.GetDesignAsync(eventId, guestTypeId, cancellationToken)));

    [HttpPut]
    public async Task<ActionResult<ApiResponse<PrintBadgeTemplateDto>>> Save(Guid eventId, Guid guestTypeId, PrintBadgeDesignDto design, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<PrintBadgeTemplateDto>(true, await printBadges.SaveDesignAsync(eventId, guestTypeId, design, cancellationToken), "Print badge saved."));
}

/// <summary>Admin: print one guest's badge from the guest list.</summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/guests/{guestId:guid}/print-badge")]
public sealed class GuestPrintBadgeController(PrintBadgeService printBadges) : ControllerBase
{
    [HttpGet]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<ActionResult<ApiResponse<PrintPayloadDto>>> Get(Guid eventId, Guid guestId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<PrintPayloadDto>(true, await printBadges.PayloadAsync(eventId, guestId, cancellationToken) ?? throw AppException.NotFound("Guest not found.")));

    [HttpPost("printed")]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<IActionResult> Printed(Guid eventId, Guid guestId, CancellationToken cancellationToken)
    {
        await printBadges.LogPrintedAsync(eventId, guestId, "admin", cancellationToken);
        return NoContent();
    }
}

/// <summary>Admin: the self check-in kiosk's look and its secret link.</summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/kiosk")]
public sealed class KioskController(PrintBadgeService printBadges) : ControllerBase
{
    [HttpGet]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<ActionResult<ApiResponse<KioskSettingsDto>>> Get(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<KioskSettingsDto>(true, await printBadges.GetKioskSettingsAsync(eventId, cancellationToken)));

    [HttpPut]
    public async Task<ActionResult<ApiResponse<KioskSettingsDto>>> Save(Guid eventId, KioskSettingsDto settings, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<KioskSettingsDto>(true, await printBadges.SaveKioskSettingsAsync(eventId, settings, cancellationToken), "Self check-in screen saved."));

    [HttpGet("share")]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<ActionResult<ApiResponse<KioskShareDto>>> Share(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<KioskShareDto>(true, await printBadges.GetKioskShareAsync(eventId, cancellationToken)));

    [HttpPost("share")]
    public async Task<ActionResult<ApiResponse<KioskShareDto>>> Renew(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<KioskShareDto>(true, await printBadges.RenewKioskShareAsync(eventId, cancellationToken), "Self check-in screen link ready."));

    [HttpDelete("share")]
    public async Task<ActionResult<ApiResponse<KioskShareDto>>> Disable(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<KioskShareDto>(true, await printBadges.DisableKioskShareAsync(eventId, cancellationToken), "Self check-in screen link turned off."));
}

public sealed record KioskCodeRequest(string? Code);

/// <summary>The self check-in kiosk behind its secret link. No sign-in.</summary>
[ApiController]
[AllowAnonymous]
[Route("api/public/kiosk/{token}")]
public sealed class PublicKioskController(PrintBadgeService printBadges) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<KioskInfoDto>>> Get(string token, CancellationToken cancellationToken)
    {
        NoStore();
        return Ok(new ApiResponse<KioskInfoDto>(true, await printBadges.KioskAsync(token, cancellationToken)));
    }

    [HttpPost("lookup")]
    public async Task<ActionResult<ApiResponse<KioskLookupDto>>> Lookup(string token, KioskCodeRequest request, CancellationToken cancellationToken)
    {
        NoStore();
        return Ok(new ApiResponse<KioskLookupDto>(true, await printBadges.LookupAsync(token, request.Code, cancellationToken)));
    }

    [HttpPost("confirm")]
    public async Task<ActionResult<ApiResponse<KioskConfirmDto>>> Confirm(string token, KioskCodeRequest request, CancellationToken cancellationToken)
    {
        NoStore();
        return Ok(new ApiResponse<KioskConfirmDto>(true, await printBadges.ConfirmAsync(token, request.Code, cancellationToken)));
    }

    [HttpPost("guests/{guestId:guid}/printed")]
    public async Task<IActionResult> Printed(string token, Guid guestId, CancellationToken cancellationToken)
    {
        NoStore();
        await printBadges.KioskPrintedAsync(token, guestId, cancellationToken);
        return NoContent();
    }

    private void NoStore()
    {
        Response.Headers.CacheControl = "no-store";
        Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
    }
}
