using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/invitation")]
public sealed class EventInvitationController(IInvitationService invitationService) : ControllerBase
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

    [HttpGet("responses")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<InvitationResponseDto>>>> Responses(
        Guid eventId,
        CancellationToken cancellationToken)
    {
        var responses = await invitationService.ListResponsesAsync(eventId, cancellationToken);
        return Ok(new ApiResponse<IReadOnlyList<InvitationResponseDto>>(true, responses));
    }
}
