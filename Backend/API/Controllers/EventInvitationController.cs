using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/invitation")]
public sealed class EventInvitationController(
    IInvitationService invitationService,
    IInvitationPreviewStore previews,
    IConfiguration configuration) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<InvitationDto>>> Get(Guid eventId, CancellationToken cancellationToken)
    {
        var invitation = await invitationService.GetAsync(eventId, cancellationToken);
        return Ok(new ApiResponse<InvitationDto>(true, invitation));
    }

    [HttpPut]
    public async Task<ActionResult<ApiResponse<InvitationDto>>> Save(
        Guid eventId,
        InvitationWriteRequest request,
        CancellationToken cancellationToken)
    {
        var invitation = await invitationService.SaveAsync(eventId, request, cancellationToken);
        return Ok(new ApiResponse<InvitationDto>(true, invitation, "Invitation saved."));
    }

    [HttpGet("template")]
    public async Task<ActionResult<ApiResponse<InvitationTemplateDto>>> GetTemplate(
        Guid eventId,
        CancellationToken cancellationToken)
    {
        var template = await invitationService.GetTemplateAsync(eventId, cancellationToken);
        return Ok(new ApiResponse<InvitationTemplateDto>(true, template));
    }

    [HttpPut("template")]
    public async Task<ActionResult<ApiResponse<InvitationTemplateDto>>> SaveTemplate(
        Guid eventId,
        InvitationDesignDto design,
        CancellationToken cancellationToken)
    {
        var template = await invitationService.SaveTemplateAsync(eventId, design, cancellationToken);
        return Ok(new ApiResponse<InvitationTemplateDto>(true, template, "Invitation template saved."));
    }

    [HttpPost("previews")]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<ActionResult<ApiResponse<InvitationPreviewDto>>> CreatePreview(
        Guid eventId,
        InvitationDesignDto design,
        CancellationToken cancellationToken)
    {
        var minutes = configuration.GetValue("InvitationPreview:Minutes", 45);
        if (minutes < 5) minutes = 5;
        if (minutes > 240) minutes = 240;
        var appOrigin = SafeOrigin(Request.Headers.Origin.ToString())
            ?? configuration["InvitationPreview:AppOrigin"]
            ?? "http://localhost:5173";
        var assetOrigin = $"{Request.Scheme}://{Request.Host}";
        var html = await invitationService.BuildPreviewHtmlAsync(eventId, design, assetOrigin, appOrigin, cancellationToken);
        var (token, expiresOn) = previews.Create(html, TimeSpan.FromMinutes(minutes));
        var url = $"{assetOrigin}/api/public/previews/{token}";
        return Ok(new ApiResponse<InvitationPreviewDto>(true, new InvitationPreviewDto(url, expiresOn, html)));
    }

    [HttpGet("responses")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<InvitationResponseDto>>>> Responses(
        Guid eventId,
        CancellationToken cancellationToken)
    {
        var responses = await invitationService.ListResponsesAsync(eventId, cancellationToken);
        return Ok(new ApiResponse<IReadOnlyList<InvitationResponseDto>>(true, responses));
    }

    private static string? SafeOrigin(string? origin)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme is not ("http" or "https")) return null;
        return uri.GetLeftPart(UriPartial.Authority);
    }
}
