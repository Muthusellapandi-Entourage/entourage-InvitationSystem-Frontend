using System.Text.Json;
using System.Text.RegularExpressions;
using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

public sealed record BrandColorDto(string Name, string Hex);

public sealed record BrandItemDto(Guid AssetId, string Name);

/// <param name="Kind">"logos", "backgrounds" or "custom".</param>
public sealed record BrandGroupDto(string Id, string Name, string Kind, BrandItemDto[] Items);

/// <summary>What is saved.</summary>
public sealed record BrandKitDto(BrandColorDto[] Colors, BrandGroupDto[] Groups);

public sealed record BrandItemViewDto(Guid AssetId, string Name, string Url);

public sealed record BrandGroupViewDto(string Id, string Name, string Kind, BrandItemViewDto[] Items);

/// <summary>What designers read: colours, image groups with links, and the event's fonts.</summary>
public sealed record BrandKitViewDto(BrandColorDto[] Colors, BrandGroupViewDto[] Groups, IReadOnlyList<EventFontDto> Fonts);

/// <summary>
/// The event's brand kit: colours (shown in every colour picker), logos, backgrounds and custom image
/// groups (offered in every designer), and fonts (the event's uploaded fonts).
/// </summary>
public sealed partial class BrandKitService(AppDbContext db, IEventAssetService assets, IEventFontService fonts)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static BrandKitDto Read(string? json)
    {
        BrandKitDto? kit = null;
        if (!string.IsNullOrWhiteSpace(json))
        {
            try
            {
                kit = JsonSerializer.Deserialize<BrandKitDto>(json, Json);
            }
            catch (JsonException)
            {
                kit = null;
            }
        }

        var groups = (kit?.Groups ?? []).ToList();
        // Logos and Backgrounds always exist, first.
        if (!groups.Any(item => item.Kind == "logos"))
        {
            groups.Insert(0, new BrandGroupDto("logos", "Logos", "logos", []));
        }

        if (!groups.Any(item => item.Kind == "backgrounds"))
        {
            groups.Insert(1, new BrandGroupDto("backgrounds", "Backgrounds", "backgrounds", []));
        }

        return new BrandKitDto(kit?.Colors ?? [], [.. groups]);
    }

    /// <summary>Every image the brand kit holds (kept when unused images are cleaned up).</summary>
    public static IEnumerable<Guid> AssetIds(string? json) =>
        Read(json).Groups.SelectMany(group => group.Items ?? []).Select(item => item.AssetId);

    public async Task<BrandKitViewDto> GetAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var json = await db.Events.AsNoTracking().Where(item => item.Id == eventId).Select(item => new { item.BrandKitJson }).FirstOrDefaultAsync(cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        var kit = Read(json.BrandKitJson);
        var ids = kit.Groups.SelectMany(group => group.Items ?? []).Select(item => item.AssetId).ToList();
        var existing = (await db.EventAssets.AsNoTracking().Where(item => item.EventId == eventId && ids.Contains(item.Id)).Select(item => item.Id).ToListAsync(cancellationToken)).ToHashSet();
        return new BrandKitViewDto(
            kit.Colors,
            [.. kit.Groups.Select(group => new BrandGroupViewDto(
                group.Id,
                group.Name,
                group.Kind,
                [.. (group.Items ?? []).Where(item => existing.Contains(item.AssetId)).Select(item => new BrandItemViewDto(item.AssetId, item.Name, $"/api/public/assets/{item.AssetId}"))]))],
            await fonts.ListAsync(eventId, cancellationToken));
    }

    public async Task<BrandKitViewDto> SaveAsync(Guid eventId, BrandKitDto request, CancellationToken cancellationToken)
    {
        var entity = await db.Events.FirstOrDefaultAsync(item => item.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        var errors = new Dictionary<string, string[]>();

        var colors = new List<BrandColorDto>();
        foreach (var color in (request.Colors ?? []).Take(40))
        {
            var hex = color.Hex?.Trim().ToUpperInvariant() ?? string.Empty;
            if (!HexPattern().IsMatch(hex))
            {
                errors["colors"] = [$"\"{color.Hex}\" is not a colour. Use #RRGGBB or #RRGGBBAA."];
                continue;
            }

            colors.Add(new BrandColorDto(Clean(color.Name, 40) ?? hex, hex));
        }

        var groups = new List<BrandGroupDto>();
        var groupIds = new HashSet<string>();
        foreach (var group in (request.Groups ?? []).Take(30))
        {
            var kind = group.Kind is "logos" or "backgrounds" ? group.Kind : "custom";
            var name = Clean(group.Name, 60);
            if (name is null)
            {
                errors["groups"] = ["Every image group needs a name."];
                continue;
            }

            var id = kind == "custom" ? (Clean(group.Id, 40) ?? Guid.NewGuid().ToString("N")[..10]) : kind;
            if (!groupIds.Add(id))
            {
                id = Guid.NewGuid().ToString("N")[..10];
                groupIds.Add(id);
            }

            var items = (group.Items ?? [])
                .GroupBy(item => item.AssetId)
                .Select(item => item.First())
                .Take(200)
                .Select(item => new BrandItemDto(item.AssetId, Clean(item.Name, 120) ?? "Image"))
                .ToArray();
            groups.Add(new BrandGroupDto(id, name, kind, items));
        }

        if (errors.Count > 0)
        {
            throw AppException.Validation(errors);
        }

        await assets.EnsureOwnedAsync(eventId, groups.SelectMany(group => group.Items).Select(item => item.AssetId).Distinct().ToList(), cancellationToken);
        entity.BrandKitJson = JsonSerializer.Serialize(new BrandKitDto([.. colors], [.. groups]), Json);
        entity.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(eventId, cancellationToken);
    }

    private static string? Clean(string? value, int max)
    {
        var text = value?.Trim();
        if (string.IsNullOrEmpty(text))
        {
            return null;
        }

        return text.Length <= max ? text : text[..max];
    }

    [GeneratedRegex("^#([0-9A-F]{6}|[0-9A-F]{8})$")]
    private static partial Regex HexPattern();
}
