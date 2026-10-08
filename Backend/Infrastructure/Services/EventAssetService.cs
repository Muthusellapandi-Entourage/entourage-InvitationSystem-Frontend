using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

public sealed class EventAssetService(AppDbContext db, IWebHostEnvironment environment) : IEventAssetService
{
    private const int MaxBytes = 5 * 1024 * 1024;

    public async Task<EventAssetDto> SaveAsync(
        Guid eventId,
        Stream content,
        string contentType,
        string originalFileName,
        CancellationToken cancellationToken)
    {
        var exists = await db.Events.AsNoTracking().AnyAsync(item => item.Id == eventId, cancellationToken);
        if (!exists)
        {
            throw AppException.NotFound("Event not found.");
        }

        var extension = ExtensionFor(contentType) ?? ExtensionForFileName(originalFileName);
        if (extension is null)
        {
            throw AppException.Validation(new Dictionary<string, string[]>
            {
                ["file"] = ["Upload a WEBP, PNG, or JPG image."],
            });
        }

        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        long total = 0;
        int read;
        while ((read = await content.ReadAsync(chunk, cancellationToken)) > 0)
        {
            total += read;
            if (total > MaxBytes)
            {
                throw AppException.Validation(new Dictionary<string, string[]>
                {
                    ["file"] = ["Image must be 5 MB or smaller."],
                });
            }

            buffer.Write(chunk, 0, read);
        }

        if (total == 0)
        {
            throw AppException.Validation(new Dictionary<string, string[]>
            {
                ["file"] = ["Choose an image to upload."],
            });
        }

        var bytes = buffer.ToArray();
        if (!HasImageSignature(bytes, extension))
        {
            throw AppException.Validation(new Dictionary<string, string[]>
            {
                ["file"] = ["That file is not a valid WEBP, PNG, or JPG image."],
            });
        }

        var id = Guid.CreateVersion7();
        var relative = $"{eventId:N}/{id:N}{extension}";
        var physical = PhysicalPath(relative);
        Directory.CreateDirectory(Path.GetDirectoryName(physical)!);
        await File.WriteAllBytesAsync(physical, bytes, cancellationToken);

        var asset = new EventAsset
        {
            Id = id,
            EventId = eventId,
            FileName = SanitizeFileName(originalFileName),
            ContentType = extension switch
            {
                ".png" => "image/png",
                ".webp" => "image/webp",
                _ => "image/jpeg",
            },
            RelativePath = relative,
            CreatedOn = DateTime.UtcNow,
        };
        db.EventAssets.Add(asset);
        await db.SaveChangesAsync(cancellationToken);
        return new EventAssetDto(id, asset.FileName, $"/api/public/assets/{id}");
    }

    public async Task EnsureOwnedAsync(
        Guid eventId,
        IReadOnlyCollection<Guid> assetIds,
        CancellationToken cancellationToken)
    {
        if (assetIds.Count == 0)
        {
            return;
        }

        var found = await db.EventAssets.AsNoTracking()
            .CountAsync(item => item.EventId == eventId && assetIds.Contains(item.Id), cancellationToken);
        if (found != assetIds.Count)
        {
            throw AppException.Validation(new Dictionary<string, string[]>
            {
                ["file"] = ["One of the images no longer belongs to this event. Upload it again."],
            });
        }
    }

    public async Task DeleteUnreferencedAsync(
        Guid eventId,
        IReadOnlyCollection<Guid> keep,
        CancellationToken cancellationToken)
    {
        var extras = await db.EventAssets
            .Where(item => item.EventId == eventId && !keep.Contains(item.Id))
            .ToListAsync(cancellationToken);
        if (extras.Count == 0)
        {
            return;
        }

        foreach (var asset in extras)
        {
            var path = PhysicalPath(asset.RelativePath);
            if (File.Exists(path))
            {
                File.Delete(path);
            }

            db.EventAssets.Remove(asset);
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<EventAssetFile?> OpenAsync(Guid assetId, CancellationToken cancellationToken)
    {
        var asset = await db.EventAssets.AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == assetId, cancellationToken);
        if (asset is null)
        {
            return null;
        }

        var path = PhysicalPath(asset.RelativePath);
        if (!File.Exists(path))
        {
            return null;
        }

        return new EventAssetFile(path, asset.ContentType);
    }

    private string Root => Path.GetFullPath(Path.Combine(environment.ContentRootPath, "App_Data", "assets"));

    private string PhysicalPath(string relative)
    {
        var normalized = relative.Replace('/', Path.DirectorySeparatorChar);
        var full = Path.GetFullPath(Path.Combine(Root, normalized));
        var root = Root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase))
        {
            throw AppException.NotFound("Image not found.");
        }

        return full;
    }

    private static string? ExtensionFor(string contentType)
    {
        var normalized = contentType.Split(';')[0].Trim().ToLowerInvariant();
        return normalized switch
        {
            "image/jpeg" or "image/jpg" or "image/pjpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => null,
        };
    }

    private static string? ExtensionForFileName(string originalFileName)
    {
        return Path.GetExtension(originalFileName).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => ".jpg",
            ".png" => ".png",
            ".webp" => ".webp",
            _ => null,
        };
    }

    private static bool HasImageSignature(byte[] bytes, string extension)
    {
        if (extension == ".jpg")
        {
            return bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF;
        }

        if (extension == ".png")
        {
            return bytes.Length >= 8
                && bytes[0] == 0x89
                && bytes[1] == 0x50
                && bytes[2] == 0x4E
                && bytes[3] == 0x47
                && bytes[4] == 0x0D
                && bytes[5] == 0x0A
                && bytes[6] == 0x1A
                && bytes[7] == 0x0A;
        }

        return bytes.Length >= 12
            && bytes[0] == (byte)'R'
            && bytes[1] == (byte)'I'
            && bytes[2] == (byte)'F'
            && bytes[3] == (byte)'F'
            && bytes[8] == (byte)'W'
            && bytes[9] == (byte)'E'
            && bytes[10] == (byte)'B'
            && bytes[11] == (byte)'P';
    }

    private static string SanitizeFileName(string originalFileName)
    {
        var name = Path.GetFileName(originalFileName).Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            return "image";
        }

        var cleaned = new string(name.Where(character => !Path.GetInvalidFileNameChars().Contains(character)).ToArray());
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            return "image";
        }

        return cleaned.Length <= 180 ? cleaned : cleaned[..180];
    }
}
