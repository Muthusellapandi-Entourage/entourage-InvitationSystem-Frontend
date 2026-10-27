using System.Text.Json;

namespace Entourage.Infrastructure.Services;

/// <summary>
/// Reads guest seats out of the saved seating plan (the designer's JSON), labelled the same way as the
/// designer: "Table 1 · Seat 7" or "Block A · Row 2 · Seat 14". Only the active floor counts.
/// </summary>
public static class SeatLabels
{
    private static readonly Dictionary<string, string> KindNames = new(StringComparer.Ordinal)
    {
        ["round"] = "Round table",
        ["square"] = "Square table",
        ["rect"] = "Rectangular table",
        ["oval"] = "Oval table",
        ["crescent"] = "Half-round",
        ["ushape"] = "U-shape",
        ["row"] = "Seats",
        ["stage"] = "Stage",
    };

    /// <summary>Guest id → seat label. Empty when there is no plan or it cannot be read.</summary>
    public static Dictionary<Guid, string> FromDesignJson(string? json)
    {
        var seats = new Dictionary<Guid, string>();
        if (string.IsNullOrWhiteSpace(json))
        {
            return seats;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("layouts", out var layouts) || layouts.ValueKind != JsonValueKind.Array)
            {
                return seats;
            }

            var activeId = root.TryGetProperty("activeLayoutId", out var active) && active.ValueKind == JsonValueKind.String ? active.GetString() : null;
            JsonElement? layout = null;
            foreach (var item in layouts.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object) continue;
                layout ??= item;
                if (activeId is not null && Text(item, "id") == activeId)
                {
                    layout = item;
                    break;
                }
            }

            if (layout is not { } floor || !floor.TryGetProperty("arrangements", out var arrangements) || arrangements.ValueKind != JsonValueKind.Array)
            {
                return seats;
            }

            foreach (var arrangement in arrangements.EnumerateArray())
            {
                if (arrangement.ValueKind != JsonValueKind.Object || !arrangement.TryGetProperty("seats", out var list) || list.ValueKind != JsonValueKind.Array)
                {
                    continue;
                }

                var name = Text(arrangement, "name")?.Trim();
                if (string.IsNullOrEmpty(name))
                {
                    name = KindNames.GetValueOrDefault(Text(arrangement, "kind") ?? string.Empty, "Round table");
                }

                foreach (var seat in list.EnumerateArray())
                {
                    if (seat.ValueKind != JsonValueKind.Object || !Guid.TryParse(Text(seat, "guestId"), out var guestId))
                    {
                        continue;
                    }

                    var label = Text(seat, "label") ?? string.Empty;
                    var row = Text(seat, "row")?.Trim();
                    seats.TryAdd(guestId, string.IsNullOrEmpty(row) ? $"{name} · Seat {label}" : $"{name} · {row} · Seat {label}");
                }
            }
        }
        catch (JsonException)
        {
            // A damaged plan shows no seats rather than failing the page.
        }

        return seats;
    }

    private static string? Text(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
