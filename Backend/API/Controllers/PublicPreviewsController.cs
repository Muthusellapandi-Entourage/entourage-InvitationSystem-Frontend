using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/public/previews")]
public sealed class PublicPreviewsController(IInvitationPreviewStore previews) : ControllerBase
{
    [HttpGet("{token}")]
    public IActionResult Get(string token)
    {
        if (token.Length is < 16 or > 80 || token.Any(character => !char.IsAsciiLetterOrDigit(character)))
        {
            return Expired();
        }

        var html = previews.Find(token);
        if (string.IsNullOrEmpty(html))
        {
            return Expired();
        }

        return Content(html, "text/html");
    }

    private ContentResult Expired()
    {
        return new ContentResult
        {
            StatusCode = StatusCodes.Status404NotFound,
            ContentType = "text/html",
            Content = """
                <!DOCTYPE html>
                <html lang="en">
                <head><meta charset="utf-8"><title>Preview expired</title></head>
                <body style="font-family:Georgia,serif;padding:48px 24px;">
                <h1>This preview link has expired</h1>
                <p>Open the invitation designer and click Preview again.</p>
                </body>
                </html>
                """,
        };
    }
}
