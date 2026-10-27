using Entourage.Application;
using Entourage.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Entourage.Api.Controllers;

/// <summary>Apple Wallet pass settings: the Pass Type ID certificate and names shown on passes.</summary>
[ApiController]
[Authorize(Roles = "Administrator")]
[Route("api/settings/wallet")]
public sealed class WalletSettingsController(AppleWalletService wallet) : ControllerBase
{
    private const long MaxFileBytes = 512 * 1024;

    [HttpGet]
    public async Task<ActionResult<ApiResponse<WalletSettingsDto>>> Get(CancellationToken cancellationToken) =>
        Ok(new ApiResponse<WalletSettingsDto>(true, await wallet.GetAsync(cancellationToken)));

    /// <summary>Multipart form: teamId, passTypeId, organizationName, certificate (.p12, optional on update), password, wwdr (.cer, optional on update).</summary>
    [HttpPut]
    [RequestSizeLimit(2 * 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<WalletSettingsDto>>> Save(
        [FromForm] string teamId,
        [FromForm] string passTypeId,
        [FromForm] string organizationName,
        [FromForm] string? password,
        IFormFile? certificate,
        IFormFile? wwdr,
        CancellationToken cancellationToken)
    {
        var saved = await wallet.SaveAsync(
            teamId,
            passTypeId,
            organizationName,
            await ReadAsync(certificate, "certificate", cancellationToken),
            password,
            await ReadAsync(wwdr, "wwdr", cancellationToken),
            cancellationToken);
        return Ok(new ApiResponse<WalletSettingsDto>(true, saved, "Apple Wallet settings saved."));
    }

    [HttpDelete]
    public async Task<ActionResult<ApiResponse<object>>> Clear(CancellationToken cancellationToken)
    {
        await wallet.ClearAsync(cancellationToken);
        return Ok(new ApiResponse<object>(true, null, "Apple Wallet turned off."));
    }

    private static async Task<byte[]?> ReadAsync(IFormFile? file, string field, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return null;
        }

        if (file.Length > MaxFileBytes)
        {
            throw AppException.Validation(new Dictionary<string, string[]> { [field] = ["That file is too large to be a certificate."] });
        }

        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, cancellationToken);
        return buffer.ToArray();
    }
}
