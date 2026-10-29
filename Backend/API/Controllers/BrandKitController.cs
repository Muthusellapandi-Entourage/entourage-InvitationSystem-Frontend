using Entourage.Application;
using Entourage.Application.Interfaces;
using Entourage.Infrastructure.Data;
using Entourage.Infrastructure.Services;
using Entourage.Infrastructure.Services.Accreditation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Api.Controllers;

/// <summary>The event's brand kit: colours, logos, backgrounds, custom image groups (fonts are the event fonts).</summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/events/{eventId:guid}/brand-kit")]
public sealed class BrandKitController(BrandKitService brandKit) : ControllerBase
{
    [HttpGet]
    [Entourage.Api.Filters.AllowOnArchivedEvent]
    public async Task<ActionResult<ApiResponse<BrandKitViewDto>>> Get(Guid eventId, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<BrandKitViewDto>(true, await brandKit.GetAsync(eventId, cancellationToken)));

    [HttpPut]
    public async Task<ActionResult<ApiResponse<BrandKitViewDto>>> Save(Guid eventId, BrandKitDto request, CancellationToken cancellationToken) =>
        Ok(new ApiResponse<BrandKitViewDto>(true, await brandKit.SaveAsync(eventId, request, cancellationToken), "Brand kit saved."));
}

/// <summary>
/// The brand kit of the event an accreditation belongs to. Images are copied into accreditation storage
/// when used, so the two systems keep their own files.
/// </summary>
[ApiController]
[Route("api/accreditation/events/{accEventId:guid}/brand-kit")]
public sealed class AccBrandKitController(AppDbContext db, BrandKitService brandKit, IEventAssetService assets, AccFileService files) : ControllerBase
{
    [HttpGet]
    [Authorize(Roles = AccRoles.Any)]
    public async Task<ActionResult<ApiResponse<BrandKitViewDto>>> Get(Guid accEventId, CancellationToken cancellationToken)
    {
        var eventId = await LinkedEventAsync(accEventId, cancellationToken);
        var kit = eventId is { } id
            ? await brandKit.GetAsync(id, cancellationToken)
            : new BrandKitViewDto([], [], []);
        return Ok(new ApiResponse<BrandKitViewDto>(true, kit));
    }

    public sealed record ImportRequest(Guid AssetId);

    [HttpPost("import")]
    [Authorize(Roles = AccRoles.Manage)]
    public async Task<ActionResult<ApiResponse<AccFileDto>>> Import(Guid accEventId, ImportRequest request, CancellationToken cancellationToken)
    {
        var eventId = await LinkedEventAsync(accEventId, cancellationToken)
            ?? throw AppException.NotFound("This accreditation is not linked to an event with a brand kit.");
        var asset = await db.EventAssets.AsNoTracking().FirstOrDefaultAsync(item => item.Id == request.AssetId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Brand image not found.");
        var file = await assets.OpenAsync(asset.Id, cancellationToken)
            ?? throw AppException.NotFound("Brand image not found.");
        var bytes = await System.IO.File.ReadAllBytesAsync(file.Path, cancellationToken);
        return Ok(new ApiResponse<AccFileDto>(true, await files.SaveBytesAsync(accEventId, bytes, asset.FileName, cancellationToken)));
    }

    private async Task<Guid?> LinkedEventAsync(Guid accEventId, CancellationToken cancellationToken)
    {
        var accEvent = await db.AccEvents.AsNoTracking().Where(item => item.Id == accEventId).Select(item => new { item.EventId }).FirstOrDefaultAsync(cancellationToken)
            ?? throw AppException.NotFound("Accreditation event not found.");
        return accEvent.EventId;
    }
}
