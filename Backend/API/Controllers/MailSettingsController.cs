using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/settings/mail")]
public sealed class MailSettingsController(IMailSettingsService mail) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<MailSettingsDto>>> Get(CancellationToken cancellationToken)
    {
        return Ok(new ApiResponse<MailSettingsDto>(true, await mail.GetAsync(cancellationToken)));
    }

    [HttpPut]
    public async Task<ActionResult<ApiResponse<MailSettingsDto>>> Save(SaveMailSettingsRequest request, CancellationToken cancellationToken)
    {
        var saved = await mail.SaveAsync(request, cancellationToken);
        return Ok(new ApiResponse<MailSettingsDto>(true, saved, "Email settings saved."));
    }

    [HttpPost("test")]
    public async Task<ActionResult<ApiResponse<object>>> Test(SendTestEmailRequest request, CancellationToken cancellationToken)
    {
        await mail.SendTestAsync(request, cancellationToken);
        return Ok(new ApiResponse<object>(true, null, $"Test email sent to {request.To.Trim()}."));
    }
}
