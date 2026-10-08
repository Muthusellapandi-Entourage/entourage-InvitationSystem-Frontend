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
        return PhysicalFile(file.Path, file.ContentType);
    }
}
