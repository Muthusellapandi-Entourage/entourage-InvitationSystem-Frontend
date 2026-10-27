using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;

namespace Entourage.Infrastructure.Services;

/// <summary>
/// Makes the per-guest name image for "single image" invitations and stores it where email
/// clients can load it: App_Data/name-images/{event}/{file}.png, served at
/// /api/public/name-images/{event}/{file}. File names are random, so they cannot be guessed.
/// </summary>
public sealed class GuestNameImageService(
    IEventAssetService assets,
    IEventFontService fonts,
    IWebHostEnvironment environment)
{
    /// <summary>Draws the name (and position) onto the design's name strip. Null when the design has no name strip.</summary>
    public async Task<byte[]?> RenderAsync(
        Guid eventId,
        InvitationDesignDto design,
        string name,
        string? position,
        CancellationToken cancellationToken)
    {
        var slices = design.Slices;
        var strip = slices?.Strips.FirstOrDefault(item => item.Role == "name");
        if (slices is null || strip?.AssetId is not Guid stripId)
        {
            return null;
        }

        var file = await assets.OpenAsync(stripId, cancellationToken)
            ?? throw new AppException("The name strip image is missing. Open the invitation designer and save the slices again.", StatusCodes.Status400BadRequest);
        var background = await File.ReadAllBytesAsync(file.Path, cancellationToken);

        // Load the fonts this design uses, only if they belong to the same event.
        var wanted = new[] { slices.Name.FontId, slices.Name.PositionFontId }.OfType<Guid>().Distinct().ToArray();
        var loaded = new Dictionary<Guid, byte[]>();
        foreach (var id in wanted)
        {
            var font = await fonts.ReadAsync(id, cancellationToken);
            if (font is { } found && found.EventId == eventId)
            {
                loaded[id] = found.Bytes;
            }
        }

        try
        {
            return GuestNameRenderer.Render(background, slices.Name, name, position, id => loaded.GetValueOrDefault(id));
        }
        catch (InvalidOperationException error)
        {
            throw new AppException(error.Message, StatusCodes.Status400BadRequest);
        }
    }

    /// <summary>Saves a rendered name image and returns its public path (relative to the API origin).</summary>
    public async Task<string> SaveAsync(Guid eventId, byte[] png, CancellationToken cancellationToken)
    {
        var fileId = Guid.NewGuid();
        var path = PhysicalPath(eventId, fileId);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllBytesAsync(path, png, cancellationToken);
        return $"/api/public/name-images/{eventId:N}/{fileId:N}";
    }

    /// <summary>Path of a saved name image, or null when it does not exist.</summary>
    public string? Open(Guid eventId, Guid fileId)
    {
        var path = PhysicalPath(eventId, fileId);
        return File.Exists(path) ? path : null;
    }

    private string PhysicalPath(Guid eventId, Guid fileId) =>
        Path.Combine(environment.ContentRootPath, "App_Data", "name-images", eventId.ToString("N"), $"{fileId:N}.png");
}
