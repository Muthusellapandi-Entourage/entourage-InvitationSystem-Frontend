using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/assets")]
public sealed class EventAssetsController(IEventAssetService assets) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(6 * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 6 * 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<EventAssetDto>>> Upload(
        Guid eventId,
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            throw AppException.Validation(new Dictionary<string, string[]>
            {
                ["file"] = ["Choose an image to upload."],
            });
        }

        await using var stream = file.OpenReadStream();
        var asset = await assets.SaveAsync(eventId, stream, file.ContentType, file.FileName, cancellationToken);
        return Ok(new ApiResponse<EventAssetDto>(true, asset, "Image uploaded."));
    }
}
