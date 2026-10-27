using System.Text.Json;
using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using SkiaSharp;

namespace Entourage.Infrastructure.Services;

/// <summary>Uploaded TTF / OTF fonts for drawing guest names. Files live under App_Data/fonts/{event}/.</summary>
public sealed class EventFontService(AppDbContext db, IWebHostEnvironment environment) : IEventFontService
{
    private const int MaxBytes = 10 * 1024 * 1024;

    public async Task<IReadOnlyList<EventFontDto>> ListAsync(Guid eventId, CancellationToken cancellationToken)
    {
        await EnsureEventAsync(eventId, cancellationToken);
        var fonts = await db.EventFonts.AsNoTracking()
            .Where(item => item.EventId == eventId)
            .OrderBy(item => item.Name)
            .ToListAsync(cancellationToken);
        return fonts.Select(ToDto).ToList();
    }

    public async Task<EventFontDto> UploadAsync(Guid eventId, Stream content, string fileName, string? name, CancellationToken cancellationToken)
    {
        await EnsureEventAsync(eventId, cancellationToken);
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (extension is ".woff" or ".woff2")
        {
            throw Invalid("WOFF fonts are for websites and cannot be used here. Upload the .ttf or .otf version of the font.");
        }

        if (extension is not (".ttf" or ".otf"))
        {
            throw Invalid("Upload a TrueType (.ttf) or OpenType (.otf) font file.");
        }

        using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, cancellationToken);
        if (buffer.Length == 0)
        {
            throw Invalid("Choose a font file to upload.");
        }

        if (buffer.Length > MaxBytes)
        {
            throw Invalid("The font must be 10 MB or smaller.");
        }

        var bytes = buffer.ToArray();
        if (!HasFontSignature(bytes))
        {
            throw Invalid("That file is not a valid TrueType or OpenType font.");
        }

        // Make sure the drawing engine can actually use it, and read its family name.
        string? family;
        using (var data = SKData.CreateCopy(bytes))
        using (var typeface = SKTypeface.FromData(data))
        {
            if (typeface is null)
            {
                throw Invalid("This font could not be read. Try a different .ttf or .otf file.");
            }

            family = typeface.FamilyName;
        }

        var id = Guid.CreateVersion7();
        var relative = $"{eventId:N}/{id:N}{extension}";
        var physical = PhysicalPath(relative);
        Directory.CreateDirectory(Path.GetDirectoryName(physical)!);
        await File.WriteAllBytesAsync(physical, bytes, cancellationToken);

        var displayName = string.IsNullOrWhiteSpace(name)
            ? string.IsNullOrWhiteSpace(family) ? Path.GetFileNameWithoutExtension(fileName) : family
            : name.Trim();
        var font = new EventFont
        {
            Id = id,
            EventId = eventId,
            Name = displayName.Length <= 120 ? displayName : displayName[..120],
            FileName = SafeFileName(fileName),
            RelativePath = relative,
            ContentType = extension == ".otf" ? "font/otf" : "font/ttf",
            SizeBytes = bytes.LongLength,
            CreatedOn = DateTime.UtcNow,
        };
        db.EventFonts.Add(font);
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(font);
    }

    public async Task DeleteAsync(Guid eventId, Guid fontId, CancellationToken cancellationToken)
    {
        var font = await db.EventFonts.FirstOrDefaultAsync(item => item.Id == fontId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Font not found on this event.");
        var inUse = await IsUsedAsync(eventId, fontId, cancellationToken);
        if (inUse is not null)
        {
            throw AppException.Conflict($"{font.Name} is used by the {inUse} invitation. Choose another font there first.", "font", "Font in use.");
        }

        var path = PhysicalPath(font.RelativePath);
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        db.EventFonts.Remove(font);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<(byte[] Bytes, string ContentType, Guid EventId)?> ReadAsync(Guid fontId, CancellationToken cancellationToken)
    {
        var font = await db.EventFonts.AsNoTracking().FirstOrDefaultAsync(item => item.Id == fontId, cancellationToken);
        if (font is null)
        {
            return null;
        }

        var path = PhysicalPath(font.RelativePath);
        return File.Exists(path) ? (await File.ReadAllBytesAsync(path, cancellationToken), font.ContentType, font.EventId) : null;
    }

    /// <summary>Name of the guest type whose saved single-image design uses this font, or null.</summary>
    private async Task<string?> IsUsedAsync(Guid eventId, Guid fontId, CancellationToken cancellationToken)
    {
        var id = fontId.ToString();
        var types = await db.GuestTypes.AsNoTracking()
            .Where(item => item.EventId == eventId && item.InvitationDesignJson != null)
            .Select(item => new { item.Name, item.InvitationDesignJson })
            .ToListAsync(cancellationToken);
        foreach (var type in types)
        {
            try
            {
                using var document = JsonDocument.Parse(type.InvitationDesignJson!);
                if (document.RootElement.TryGetProperty("slices", out var slices)
                    && slices.ValueKind == JsonValueKind.Object
                    && slices.TryGetProperty("name", out var nameSettings)
                    && nameSettings.ValueKind == JsonValueKind.Object
                    && (Matches(nameSettings, "fontId", id) || Matches(nameSettings, "positionFontId", id)))
                {
                    return type.Name;
                }
            }
            catch (JsonException)
            {
            }
        }

        return null;
    }

    private static bool Matches(JsonElement element, string property, string id) =>
        element.TryGetProperty(property, out var value)
        && value.ValueKind == JsonValueKind.String
        && string.Equals(value.GetString(), id, StringComparison.OrdinalIgnoreCase);

    private async Task EnsureEventAsync(Guid eventId, CancellationToken cancellationToken)
    {
        if (!await db.Events.AsNoTracking().AnyAsync(item => item.Id == eventId, cancellationToken))
        {
            throw AppException.NotFound("Event not found.");
        }
    }

    /// <summary>TrueType (00 01 00 00 / "true"), OpenType CFF ("OTTO") or a TrueType collection ("ttcf").</summary>
    private static bool HasFontSignature(byte[] bytes)
    {
        if (bytes.Length < 12)
        {
            return false;
        }

        var tag = System.Text.Encoding.ASCII.GetString(bytes, 0, 4);
        return (bytes[0] == 0x00 && bytes[1] == 0x01 && bytes[2] == 0x00 && bytes[3] == 0x00) || tag is "OTTO" or "true" or "ttcf";
    }

    private string Root => Path.GetFullPath(Path.Combine(environment.ContentRootPath, "App_Data", "fonts"));

    private string PhysicalPath(string relative)
    {
        var full = Path.GetFullPath(Path.Combine(Root, relative.Replace('/', Path.DirectorySeparatorChar)));
        var root = Root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase))
        {
            throw AppException.NotFound("Font not found.");
        }

        return full;
    }

    private static string SafeFileName(string fileName)
    {
        var name = new string(Path.GetFileName(fileName).Where(character => !Path.GetInvalidFileNameChars().Contains(character)).ToArray()).Trim();
        if (string.IsNullOrEmpty(name))
        {
            return "font.ttf";
        }

        return name.Length <= 180 ? name : name[..180];
    }

    private static EventFontDto ToDto(EventFont font) =>
        new(font.Id, font.Name, font.FileName, font.SizeBytes, $"/api/public/fonts/{font.Id}", DateTime.SpecifyKind(font.CreatedOn, DateTimeKind.Utc));

    private static AppException Invalid(string message) =>
        AppException.Validation(new Dictionary<string, string[]> { ["file"] = [message] });
}
