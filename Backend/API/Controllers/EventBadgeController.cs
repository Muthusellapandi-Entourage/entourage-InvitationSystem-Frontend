using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/badge")]
public sealed class EventBadgeController(IInvitationService invitationService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<BadgeTemplateDto>>> Get(Guid eventId, CancellationToken cancellationToken)
    {
        var template = await invitationService.GetBadgeAsync(eventId, cancellationToken);
        return Ok(new ApiResponse<BadgeTemplateDto>(true, template));
    }

    [HttpPut]
    public async Task<ActionResult<ApiResponse<BadgeTemplateDto>>> Save(
        Guid eventId,
        BadgeDesignDto design,
        CancellationToken cancellationToken)
    {
        var template = await invitationService.SaveBadgeAsync(eventId, design, cancellationToken);
        return Ok(new ApiResponse<BadgeTemplateDto>(true, template, "Badge template saved."));
    }
}
