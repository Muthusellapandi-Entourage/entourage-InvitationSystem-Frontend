using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/public/invitations")]
public sealed class PublicInvitationsController(IInvitationService invitationService) : ControllerBase
{
    [HttpGet("{slug}")]
    public async Task<ActionResult<ApiResponse<PublicInvitationDto>>> Get(string slug, CancellationToken cancellationToken)
    {
        var invitation = await invitationService.GetPublicAsync(slug, cancellationToken);
        return Ok(new ApiResponse<PublicInvitationDto>(true, invitation));
    }

    [HttpPost("{slug}/responses")]
    public async Task<ActionResult<ApiResponse<InvitationResponseDto>>> Respond(
        string slug,
        RecordInvitationResponseRequest request,
        CancellationToken cancellationToken)
    {
        var response = await invitationService.RecordResponseAsync(slug, request, cancellationToken);
        return Ok(new ApiResponse<InvitationResponseDto>(true, response, "Reply recorded."));
    }
}
