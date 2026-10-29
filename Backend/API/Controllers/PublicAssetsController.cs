using Entourage.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[AllowAnonymous]
public sealed class PublicAssetsController(IEventAssetService assets) : ControllerBase
{
    [HttpGet("/api/public/assets/{assetId:guid}")]
    public async Task<IActionResult> Get(Guid assetId, CancellationToken cancellationToken)
    {
        var file = await assets.OpenAsync(assetId, cancellationToken);
        if (file is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "public, max-age=86400";
        Response.Headers.XContentTypeOptions = "nosniff";
        // Public images: readable by the app's scripts too (e.g. "use from brand kit"), even from the browser
        // cache filled by an ordinary <img>. Same as the public font files.
        Response.Headers.AccessControlAllowOrigin = "*";
        Response.Headers["Cross-Origin-Resource-Policy"] = "cross-origin";
        return PhysicalFile(file.Path, file.ContentType);
    }
}
