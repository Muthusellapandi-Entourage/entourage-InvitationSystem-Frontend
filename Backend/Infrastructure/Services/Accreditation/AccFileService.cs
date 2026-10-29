using Entourage.Application;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services.Accreditation;

/// <summary>
/// Photos and documents for accreditation, stored under App_Data/accreditation/{eventId}/.
/// Never public: only staff (and the owning organisation through the portal) can open them.
/// </summary>
public sealed class AccFileService(AppDbContext db, IWebHostEnvironment environment)
{
    public const long MaxBytes = 10 * 1024 * 1024;

    public async Task<AccFileDto> SaveAsync(Guid eventId, IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            throw AccErrors.One("file", "Choose a file to upload.");
        }

        if (file.Length > MaxBytes)
        {
            throw AccErrors.One("file", "Files must be 10 MB or smaller.");
        }

        if (!await db.AccEvents.AsNoTracking().AnyAsync(item => item.Id == eventId, cancellationToken))
        {
            throw AppException.NotFound("Accreditation event not found.");
        }

        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer, cancellationToken);
        var bytes = buffer.ToArray();
        var kind = Detect(bytes);
        if (kind is null)
        {
            throw AccErrors.One("file", "Upload a JPG, PNG or WEBP image, or a PDF.");
        }

        var id = Guid.CreateVersion7();
        var relative = $"{eventId:N}/{id:N}{kind.Value.Extension}";
        var physical = PhysicalPath(relative);
        Directory.CreateDirectory(Path.GetDirectoryName(physical)!);
        await File.WriteAllBytesAsync(physical, bytes, cancellationToken);

        var entity = new AccFile
        {
            Id = id,
            EventId = eventId,
            FileName = SafeName(file.FileName, kind.Value.Extension),
            ContentType = kind.Value.ContentType,
            Size = bytes.LongLength,
            RelativePath = relative,
            CreatedOn = DateTime.UtcNow,
        };
        db.AccFiles.Add(entity);
        await db.SaveChangesAsync(cancellationToken);
        return new AccFileDto(entity.Id, entity.FileName, entity.ContentType, entity.Size);
    }

    /// <summary>Opens a file that belongs to the given event.</summary>
    public async Task<(string Path, string ContentType, string FileName)> OpenAsync(Guid eventId, Guid fileId, CancellationToken cancellationToken)
    {
        var file = await db.AccFiles.AsNoTracking().FirstOrDefaultAsync(item => item.Id == fileId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("File not found.");
        var path = PhysicalPath(file.RelativePath);
        if (!File.Exists(path))
        {
            throw AppException.NotFound("File not found.");
        }

        return (path, file.ContentType, file.FileName);
    }

    /// <summary>Checks that every id is a file of this event.</summary>
    public async Task EnsureOwnedAsync(Guid eventId, IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken)
    {
        var distinct = ids.Distinct().ToList();
        if (distinct.Count == 0)
        {
            return;
        }

        var found = await db.AccFiles.AsNoTracking().CountAsync(item => item.EventId == eventId && distinct.Contains(item.Id), cancellationToken);
        if (found != distinct.Count)
        {
            throw AccErrors.One("file", "One of the uploads was not found. Upload it again.");
        }
    }

    public async Task EnsureImageAsync(Guid eventId, Guid fileId, CancellationToken cancellationToken)
    {
        var file = await db.AccFiles.AsNoTracking().FirstOrDefaultAsync(item => item.Id == fileId && item.EventId == eventId, cancellationToken)
            ?? throw AccErrors.One("photoFileId", "The photo was not found. Upload it again.");
        if (!file.ContentType.StartsWith("image/", StringComparison.Ordinal))
        {
            throw AccErrors.One("photoFileId", "The photo must be a JPG, PNG or WEBP image.");
        }
    }

    private string Root => Path.GetFullPath(Path.Combine(environment.ContentRootPath, "App_Data", "accreditation"));

    private string PhysicalPath(string relative)
    {
        var full = Path.GetFullPath(Path.Combine(Root, relative.Replace('/', Path.DirectorySeparatorChar)));
        var root = Root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase))
        {
            throw AppException.NotFound("File not found.");
        }

        return full;
    }

    private static (string Extension, string ContentType)? Detect(byte[] bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
        {
            return (".jpg", "image/jpeg");
        }

        if (bytes.Length >= 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47)
        {
            return (".png", "image/png");
        }

        if (bytes.Length >= 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
            && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P')
        {
            return (".webp", "image/webp");
        }

        if (bytes.Length >= 5 && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F' && bytes[4] == '-')
        {
            return (".pdf", "application/pdf");
        }

        return null;
    }

    private static string SafeName(string? original, string extension)
    {
        var name = Path.GetFileName(original ?? string.Empty).Trim();
        var cleaned = new string(name.Where(character => !Path.GetInvalidFileNameChars().Contains(character)).ToArray());
        if (string.IsNullOrWhiteSpace(cleaned))
        {
            cleaned = "file" + extension;
        }

        return cleaned.Length <= 180 ? cleaned : cleaned[..180];
    }
}
