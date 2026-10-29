using Entourage.Application;
using Entourage.Infrastructure.Services.Accreditation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

/*
 * Event Accreditation (EAMS). Separate from the invitation system: own routes (api/accreditation…),
 * own tables and own roles. Route values use "accEventId" so invitation-only filters never apply.
 */

internal static class AccOrigins
{
    public static string App(HttpRequest request, IConfiguration configuration)
    {
        var origin = request.Headers.Origin.ToString();
        if (Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https")
        {
            return uri.GetLeftPart(UriPartial.Authority);
        }

        return configuration["InvitationPreview:AppOrigin"] ?? "http://localhost:5173";
    }

    public static ApiResponse<T> Ok<T>(T data, string? message = null) => new(true, data, message);
}

/// <summary>Accreditation events and their setup.</summary>
[ApiController]
[Route("api/accreditation/events")]
public sealed class AccEventsController(AccSetupService setup) : ControllerBase
{
    [HttpGet]
    [Authorize(Roles = AccRoles.Any)]
    public async Task<ActionResult<ApiResponse<AccEventSummaryDto[]>>> List(CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.ListAsync(cancellationToken)));

    [HttpPost]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccEventSummaryDto>>> Create(AccEventWriteRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.CreateAsync(request, cancellationToken), "Accreditation event created."));

    [HttpGet("{accEventId:guid}")]
    [Authorize(Roles = AccRoles.Any)]
    public async Task<ActionResult<ApiResponse<AccEventSummaryDto>>> Get(Guid accEventId, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.GetAsync(accEventId, cancellationToken)));

    [HttpPut("{accEventId:guid}")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccEventSummaryDto>>> Update(Guid accEventId, AccEventWriteRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.UpdateAsync(accEventId, request, cancellationToken), "Event saved."));

    [HttpPost("{accEventId:guid}/clone")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccEventSummaryDto>>> Clone(Guid accEventId, AccCloneRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.CloneAsync(accEventId, request, cancellationToken), "Event cloned."));

    [HttpGet("{accEventId:guid}/overview")]
    [Authorize(Roles = AccRoles.Work)]
    public async Task<ActionResult<ApiResponse<AccOverviewDto>>> Overview(Guid accEventId, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.OverviewAsync(accEventId, cancellationToken)));

    [HttpGet("{accEventId:guid}/setup")]
    [Authorize(Roles = AccRoles.Any)]
    public async Task<ActionResult<ApiResponse<AccSetupDto>>> Setup(Guid accEventId, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.GetSetupAsync(accEventId, cancellationToken)));

    [HttpPut("{accEventId:guid}/zones")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccSetupDto>>> Zones(Guid accEventId, AccZoneDto[] zones, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.SaveZonesAsync(accEventId, zones, cancellationToken), "Zones saved."));

    [HttpPut("{accEventId:guid}/profiles")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccSetupDto>>> Profiles(Guid accEventId, AccProfileDto[] profiles, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.SaveProfilesAsync(accEventId, profiles, cancellationToken), "Access profiles saved."));

    [HttpPut("{accEventId:guid}/types")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccSetupDto>>> Types(Guid accEventId, AccApplicantTypeDto[] types, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.SaveTypesAsync(accEventId, types, cancellationToken), "Applicant types saved."));

    [HttpPut("{accEventId:guid}/stages")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccSetupDto>>> Stages(Guid accEventId, AccStageDto[] stages, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.SaveStagesAsync(accEventId, stages, cancellationToken), "Stages saved."));

    [HttpPut("{accEventId:guid}/notifications")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccSetupDto>>> Notifications(Guid accEventId, AccNotificationsDto notifications, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.SaveNotificationsAsync(accEventId, notifications, cancellationToken), "Emails saved."));

    [HttpGet("{accEventId:guid}/audit")]
    [Authorize(Roles = AccRoles.Vet)]
    public async Task<ActionResult<ApiResponse<AccAuditDto[]>>> Audit(Guid accEventId, [FromQuery] Guid? applicantId, [FromQuery] int take, [FromQuery] DateTime? before, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.AuditAsync(accEventId, applicantId, take <= 0 ? 100 : take, before, cancellationToken)));
}

/// <summary>From the event page: find or start this event's accreditation (opened in its own browser tab).</summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/accreditation")]
public sealed class EventAccreditationLinkController(AccSetupService setup) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<AccEventSummaryDto?>>> Get(Guid eventId, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.ForEventAsync(eventId, cancellationToken)));

    [HttpPost]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<ActionResult<ApiResponse<AccEventSummaryDto>>> Start(Guid eventId, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await setup.CreateForEventAsync(eventId, cancellationToken), "Accreditation started for this event."));
}

/// <summary>Organisations and their portal managers.</summary>
[ApiController]
[Route("api/accreditation/events/{accEventId:guid}/organizations")]
public sealed class AccOrganizationsController(AccOrganizationService organizations, IConfiguration configuration) : ControllerBase
{
    [HttpGet]
    [Authorize(Roles = AccRoles.Work)]
    public async Task<ActionResult<ApiResponse<AccOrganizationDto[]>>> List(Guid accEventId, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await organizations.ListAsync(accEventId, cancellationToken)));

    [HttpPost]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccOrganizationDto[]>>> Create(Guid accEventId, AccOrganizationWriteRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await organizations.CreateAsync(accEventId, request, cancellationToken), "Organisation added."));

    [HttpPut("{organizationId:guid}")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccOrganizationDto[]>>> Update(Guid accEventId, Guid organizationId, AccOrganizationWriteRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await organizations.UpdateAsync(accEventId, organizationId, request, cancellationToken), "Organisation saved."));

    [HttpDelete("{organizationId:guid}")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccOrganizationDto[]>>> Delete(Guid accEventId, Guid organizationId, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await organizations.DeleteAsync(accEventId, organizationId, cancellationToken), "Organisation removed."));

    [HttpPost("{organizationId:guid}/users")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccInviteResultDto>>> Invite(Guid accEventId, Guid organizationId, AccInviteRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await organizations.InviteAsync(accEventId, organizationId, request, AccOrigins.App(Request, configuration), cancellationToken), "Invitation sent."));

    [HttpPost("users/{userId:guid}/resend")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccInviteResultDto>>> Resend(Guid accEventId, Guid userId, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await organizations.ResendAsync(accEventId, userId, AccOrigins.App(Request, configuration), cancellationToken), "Invitation sent again."));

    [HttpPut("users/{userId:guid}/active")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccOrganizationDto[]>>> Active(Guid accEventId, Guid userId, AccActiveRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await organizations.SetActiveAsync(accEventId, userId, request.IsActive, cancellationToken)));
}

/// <summary>Applicants: list, details, create/edit, pipeline, access, documents, bulk upload.</summary>
[ApiController]
[Route("api/accreditation/events/{accEventId:guid}/applicants")]
public sealed class AccApplicantsController(AccApplicantService applicants, AccActorResolver actors) : ControllerBase
{
    [HttpGet]
    [Authorize(Roles = AccRoles.Work)]
    public async Task<ActionResult<ApiResponse<AccApplicantRowDto[]>>> List(
        Guid accEventId,
        [FromQuery] string? stage,
        [FromQuery] Guid? organizationId,
        [FromQuery] Guid? typeId,
        [FromQuery] string? search,
        [FromQuery] bool duplicates,
        CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await applicants.ListAsync(accEventId, stage, organizationId, typeId, search, duplicates, cancellationToken)));

    [HttpGet("{applicantId:guid}")]
    [Authorize(Roles = AccRoles.Work)]
    public async Task<ActionResult<ApiResponse<AccApplicantDetailDto>>> Get(Guid accEventId, Guid applicantId, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await applicants.DetailAsync(accEventId, applicantId, includeHistory: true, cancellationToken)));

    [HttpPost]
    [Authorize(Roles = AccRoles.Work)]
    public async Task<ActionResult<ApiResponse<AccApplicantDetailDto>>> Create(Guid accEventId, AccApplicantWriteRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await applicants.CreateAsync(accEventId, request, await StaffAsync(cancellationToken), cancellationToken), "Applicant added."));

    [HttpPut("{applicantId:guid}")]
    [Authorize(Roles = AccRoles.Work)]
    public async Task<ActionResult<ApiResponse<AccApplicantDetailDto>>> Update(Guid accEventId, Guid applicantId, AccApplicantWriteRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await applicants.UpdateAsync(accEventId, applicantId, request, await StaffAsync(cancellationToken), cancellationToken), "Applicant saved."));

    [HttpPost("bulk")]
    [Authorize(Roles = AccRoles.Work)]
    public async Task<ActionResult<ApiResponse<AccBulkResult>>> Bulk(Guid accEventId, AccBulkRequest request, CancellationToken cancellationToken)
    {
        var context = await StaffAsync(cancellationToken) with { Source = "bulk" };
        var result = await applicants.BulkAsync(accEventId, request, context, cancellationToken);
        return Ok(AccOrigins.Ok(result, $"{result.Created} added{(result.Errors.Length > 0 ? $", {result.Errors.Length} skipped" : string.Empty)}."));
    }

    [HttpPost("{applicantId:guid}/stage")]
    [Authorize(Roles = AccRoles.Vet)]
    public async Task<ActionResult<ApiResponse<AccDecisionResult>>> Stage(Guid accEventId, Guid applicantId, AccStageRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await applicants.MoveAsync(accEventId, [applicantId], request.StageKey, request.Reason, await actors.CurrentAsync(cancellationToken), cancellationToken)));

    [HttpPost("stage")]
    [Authorize(Roles = AccRoles.Vet)]
    public async Task<ActionResult<ApiResponse<AccDecisionResult>>> BulkStage(Guid accEventId, AccBulkStageRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await applicants.MoveAsync(accEventId, request.Ids ?? [], request.StageKey, request.Reason, await actors.CurrentAsync(cancellationToken), cancellationToken)));

    [HttpPut("{applicantId:guid}/access")]
    [Authorize(Roles = AccRoles.Vet)]
    public async Task<ActionResult<ApiResponse<AccDecisionResult>>> Access(Guid accEventId, Guid applicantId, AccAccessRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await applicants.SetAccessAsync(accEventId, applicantId, request, await actors.CurrentAsync(cancellationToken), cancellationToken), "Access saved."));

    [HttpPost("{applicantId:guid}/reveal-id")]
    [Authorize(Roles = AccRoles.Vet)]
    public async Task<ActionResult<ApiResponse<AccRevealDto>>> RevealId(Guid accEventId, Guid applicantId, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(new AccRevealDto(await applicants.RevealIdAsync(accEventId, applicantId, await actors.CurrentAsync(cancellationToken), cancellationToken))));

    [HttpPost("{applicantId:guid}/documents")]
    [Authorize(Roles = AccRoles.Work)]
    public async Task<ActionResult<ApiResponse<AccApplicantDetailDto>>> AddDocument(Guid accEventId, Guid applicantId, AccDocumentInput request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await applicants.AddDocumentAsync(accEventId, applicantId, request, await actors.CurrentAsync(cancellationToken), cancellationToken), "Document added."));

    [HttpPut("{applicantId:guid}/documents/{documentId:guid}")]
    [Authorize(Roles = AccRoles.Vet)]
    public async Task<ActionResult<ApiResponse<AccApplicantDetailDto>>> DocumentStatus(Guid accEventId, Guid applicantId, Guid documentId, AccDocumentStatusRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await applicants.SetDocumentStatusAsync(accEventId, applicantId, documentId, request.Status, await actors.CurrentAsync(cancellationToken), cancellationToken)));

    private async Task<AccApplicantService.SubmitContext> StaffAsync(CancellationToken cancellationToken) =>
        new("admin", await actors.CurrentAsync(cancellationToken), null, StrictDocuments: false, RequireEmail: false, EnforceQuota: false);
}

/// <summary>Photo / document uploads and downloads for staff.</summary>
[ApiController]
[Route("api/accreditation/events/{accEventId:guid}/files")]
public sealed class AccFilesController(AccFileService files) : ControllerBase
{
    [HttpPost]
    [Authorize(Roles = AccRoles.Work)]
    [RequestSizeLimit(AccFileService.MaxBytes + 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<AccFileDto>>> Upload(Guid accEventId, IFormFile? file, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await files.SaveAsync(accEventId, file, cancellationToken)));

    [HttpGet("{fileId:guid}")]
    [Authorize(Roles = AccRoles.Files)]
    public async Task<IActionResult> Download(Guid accEventId, Guid fileId, CancellationToken cancellationToken)
    {
        var (path, contentType, fileName) = await files.OpenAsync(accEventId, fileId, cancellationToken);
        Response.Headers.CacheControl = "private, no-store";
        return PhysicalFile(path, contentType, contentType == "application/pdf" ? fileName : null);
    }
}

/// <summary>Badge templates (designer) and the print queue.</summary>
[ApiController]
[Route("api/accreditation/events/{accEventId:guid}/badges")]
public sealed class AccBadgesController(AccBadgeService badges, AccActorResolver actors) : ControllerBase
{
    [HttpGet("templates")]
    [Authorize(Roles = AccRoles.Print)]
    public async Task<ActionResult<ApiResponse<AccBadgeTemplateDto[]>>> Templates(Guid accEventId, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await badges.TemplatesAsync(accEventId, cancellationToken)));

    [HttpPost("templates")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccBadgeTemplateDto>>> Create(Guid accEventId, AccBadgeTemplateWrite request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await badges.CreateAsync(accEventId, request, await actors.CurrentAsync(cancellationToken), cancellationToken), "Badge template added."));

    [HttpPut("templates/{templateId:guid}")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccBadgeTemplateDto>>> Update(Guid accEventId, Guid templateId, AccBadgeTemplateWrite request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await badges.UpdateAsync(accEventId, templateId, request, await actors.CurrentAsync(cancellationToken), cancellationToken), "Badge template saved."));

    [HttpDelete("templates/{templateId:guid}")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid accEventId, Guid templateId, CancellationToken cancellationToken)
    {
        await badges.DeleteAsync(accEventId, templateId, await actors.CurrentAsync(cancellationToken), cancellationToken);
        return Ok(new ApiResponse<object>(true, null, "Badge template removed."));
    }

    [HttpGet("queue")]
    [Authorize(Roles = AccRoles.Print)]
    public async Task<ActionResult<ApiResponse<AccPrintQueueDto>>> Queue(
        Guid accEventId,
        [FromQuery] string? status,
        [FromQuery] Guid? organizationId,
        [FromQuery] Guid? typeId,
        [FromQuery] string? search,
        CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await badges.QueueAsync(accEventId, status, organizationId, typeId, search, cancellationToken)));

    [HttpPost("printed")]
    [Authorize(Roles = AccRoles.Print)]
    public async Task<ActionResult<ApiResponse<int>>> Printed(Guid accEventId, AccIdsRequest request, CancellationToken cancellationToken)
    {
        var count = await badges.MarkPrintedAsync(accEventId, request.Ids, await actors.CurrentAsync(cancellationToken), cancellationToken);
        return Ok(AccOrigins.Ok(count, $"{count} badge(s) marked as printed."));
    }

    [HttpPost("collected")]
    [Authorize(Roles = AccRoles.Print)]
    public async Task<ActionResult<ApiResponse<int>>> Collected(Guid accEventId, AccCollectedRequest request, CancellationToken cancellationToken)
    {
        var count = await badges.SetCollectedAsync(accEventId, request.Ids, request.Collected, await actors.CurrentAsync(cancellationToken), cancellationToken);
        return Ok(AccOrigins.Ok(count, request.Collected ? $"{count} badge(s) handed out." : "Collection undone."));
    }

    [HttpPost("reprint")]
    [Authorize(Roles = AccRoles.Print)]
    public async Task<ActionResult<ApiResponse<int>>> Reprint(Guid accEventId, AccReprintRequest request, CancellationToken cancellationToken)
    {
        // Revoking a badge code is a security decision.
        if (request.Revoke && !(User.IsInRole("Administrator") || User.IsInRole("AccreditationAdmin") || User.IsInRole("SecurityManager")))
        {
            throw AppException.Forbidden("Only a security manager or accreditation admin can revoke a badge.");
        }

        var count = await badges.ReprintAsync(accEventId, request.Ids, request.Reason, request.Revoke, await actors.CurrentAsync(cancellationToken), cancellationToken);
        return Ok(AccOrigins.Ok(count, request.Revoke ? $"{count} badge(s) revoked and queued for reprint." : $"{count} badge(s) queued for reprint."));
    }
}

/// <summary>Accreditation staff accounts.</summary>
[ApiController]
[Route("api/accreditation/team")]
[Authorize(Roles = AccRoles.Manage)]
public sealed class AccTeamController(AccTeamService team) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<AccTeamMemberDto[]>>> List(CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await team.ListAsync(cancellationToken)));

    [HttpPost]
    public async Task<ActionResult<ApiResponse<AccTeamMemberDto[]>>> Create(AccTeamWriteRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await team.CreateAsync(request, cancellationToken), "Team member added."));

    [HttpPut("{userId:guid}")]
    public async Task<ActionResult<ApiResponse<AccTeamMemberDto[]>>> Update(Guid userId, AccTeamWriteRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await team.UpdateAsync(userId, request, cancellationToken), "Team member saved."));
}

/// <summary>The organisation portal (signed in with the X-Portal-Token header, not staff sign-in).</summary>
[ApiController]
[AllowAnonymous]
[Route("api/portal")]
public sealed class AccPortalController(AccPortalService portal, AccFileService files) : ControllerBase
{
    private string? Token => Request.Headers[AccPortalService.HeaderName].FirstOrDefault();

    [HttpGet("invite/{token}")]
    public async Task<ActionResult<ApiResponse<AccInviteInfoDto>>> InviteInfo(string token, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await portal.InviteInfoAsync(token, cancellationToken)));

    [HttpPost("invite/{token}")]
    public async Task<ActionResult<ApiResponse<AccPortalLoginResult>>> AcceptInvite(string token, AccAcceptInviteRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await portal.AcceptInviteAsync(token, request, cancellationToken)));

    [HttpPost("login")]
    public async Task<ActionResult<ApiResponse<AccPortalLoginResult>>> Login(AccPortalLoginRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await portal.LoginAsync(request, cancellationToken)));

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        await portal.LogoutAsync(Token, cancellationToken);
        return Ok(AccOrigins.Ok<object?>(null));
    }

    [HttpGet("me")]
    public async Task<ActionResult<ApiResponse<AccPortalMeDto>>> Me(CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await portal.MeAsync(await SignedInAsync(cancellationToken), cancellationToken)));

    [HttpGet("applicants")]
    public async Task<ActionResult<ApiResponse<AccApplicantRowDto[]>>> List(CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await portal.ListAsync(await SignedInAsync(cancellationToken), cancellationToken)));

    [HttpGet("applicants/{applicantId:guid}")]
    public async Task<ActionResult<ApiResponse<AccApplicantDetailDto>>> Get(Guid applicantId, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await portal.DetailAsync(await SignedInAsync(cancellationToken), applicantId, cancellationToken)));

    [HttpPost("applicants")]
    public async Task<ActionResult<ApiResponse<AccApplicantDetailDto>>> Create(AccApplicantWriteRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await portal.CreateAsync(await SignedInAsync(cancellationToken), request, cancellationToken), "Person submitted."));

    [HttpPut("applicants/{applicantId:guid}")]
    public async Task<ActionResult<ApiResponse<AccApplicantDetailDto>>> Update(Guid applicantId, AccApplicantWriteRequest request, CancellationToken cancellationToken) =>
        Ok(AccOrigins.Ok(await portal.UpdateAsync(await SignedInAsync(cancellationToken), applicantId, request, cancellationToken), "Changes saved."));

    [HttpPost("applicants/bulk")]
    public async Task<ActionResult<ApiResponse<AccBulkResult>>> Bulk(AccBulkRequest request, CancellationToken cancellationToken)
    {
        var result = await portal.BulkAsync(await SignedInAsync(cancellationToken), request.Rows ?? [], cancellationToken);
        return Ok(AccOrigins.Ok(result, $"{result.Created} submitted{(result.Errors.Length > 0 ? $", {result.Errors.Length} skipped" : string.Empty)}."));
    }

    [HttpPost("files")]
    [RequestSizeLimit(AccFileService.MaxBytes + 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<AccFileDto>>> Upload(IFormFile? file, CancellationToken cancellationToken)
    {
        var signedIn = await SignedInAsync(cancellationToken);
        return Ok(AccOrigins.Ok(await files.SaveAsync(signedIn.Event.Id, file, cancellationToken)));
    }

    [HttpGet("files/{fileId:guid}")]
    public async Task<IActionResult> Download(Guid fileId, CancellationToken cancellationToken)
    {
        var signedIn = await SignedInAsync(cancellationToken);
        await portal.EnsureFileVisibleAsync(signedIn, fileId, cancellationToken);
        var (path, contentType, fileName) = await files.OpenAsync(signedIn.Event.Id, fileId, cancellationToken);
        Response.Headers.CacheControl = "private, no-store";
        return PhysicalFile(path, contentType, contentType == "application/pdf" ? fileName : null);
    }

    private Task<AccPortalService.PortalUser> SignedInAsync(CancellationToken cancellationToken) =>
        portal.AuthenticateAsync(Token, cancellationToken);
}

/// <summary>Optional public application link: /apply/{slug}.</summary>
[ApiController]
[AllowAnonymous]
[Route("api/public/apply/{slug}")]
public sealed class AccPublicApplyController(AccPortalService portal, AccFileService files) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<AccPublicApplyInfoDto>>> Info(string slug, CancellationToken cancellationToken)
    {
        Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
        return Ok(AccOrigins.Ok(await portal.PublicInfoAsync(slug, cancellationToken)));
    }

    [HttpPost("files")]
    [RequestSizeLimit(AccFileService.MaxBytes + 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<AccFileDto>>> Upload(string slug, IFormFile? file, CancellationToken cancellationToken)
    {
        var accEvent = await portal.PublicEventAsync(slug, cancellationToken);
        if (accEvent.Status != "Open")
        {
            throw AppException.Forbidden("Applications for this event are closed.");
        }

        // The public never reads files back; the id is only used in the application that follows.
        return Ok(AccOrigins.Ok(await files.SaveAsync(accEvent.Id, file, cancellationToken)));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<object>>> Submit(string slug, AccPublicApplyRequest request, CancellationToken cancellationToken)
    {
        await portal.PublicSubmitAsync(slug, request, cancellationToken);
        return Ok(new ApiResponse<object>(true, null, "Application received."));
    }
}
