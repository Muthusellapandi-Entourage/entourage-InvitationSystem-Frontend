using System.Globalization;

namespace Entourage.Application;

/// <summary>
/// Colours as hex: "#RRGGBB" (opaque) or "#RRGGBBAA" (CSS order, AA = alpha 00–FF).
/// One place to validate, read and convert them (for CSS, email clients and image rendering).
/// </summary>
public static class HexColor
{
    /// <summary>Validation pattern: #RRGGBB or #RRGGBBAA.</summary>
    public const string Pattern = "^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$";

    public static bool TryParse(string? hex, out int red, out int green, out int blue, out int alpha)
    {
        red = green = blue = 0;
        alpha = 255;
        if (hex is not { Length: 7 or 9 } || hex[0] != '#')
        {
            return false;
        }

        static bool Channel(string value, int start, out int channel) =>
            int.TryParse(value.AsSpan(start, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out channel);

        if (!Channel(hex, 1, out red) || !Channel(hex, 3, out green) || !Channel(hex, 5, out blue))
        {
            return false;
        }

        return hex.Length == 7 || Channel(hex, 7, out alpha);
    }

    /// <summary>For CSS: "#RRGGBB" when opaque, otherwise "rgba(r,g,b,a)" (works in every browser and most email clients).</summary>
    public static string ToCss(string? hex, string fallback = "#000000")
    {
        if (!TryParse(hex, out var red, out var green, out var blue, out var alpha))
        {
            return fallback;
        }

        return alpha >= 255
            ? string.Create(CultureInfo.InvariantCulture, $"#{red:X2}{green:X2}{blue:X2}")
            : string.Create(CultureInfo.InvariantCulture, $"rgba({red},{green},{blue},{alpha / 255d:0.###})");
    }

    /// <summary>The colour blended over <paramref name="under"/> as an opaque "#RRGGBB" (for HTML attributes like bgcolor).</summary>
    public static string Flatten(string? hex, string under = "#FFFFFF")
    {
        if (!TryParse(hex, out var red, out var green, out var blue, out var alpha))
        {
            return under;
        }

        if (alpha >= 255)
        {
            return string.Create(CultureInfo.InvariantCulture, $"#{red:X2}{green:X2}{blue:X2}");
        }

        TryParse(under, out var baseRed, out var baseGreen, out var baseBlue, out _);
        var amount = alpha / 255d;
        int Mix(int channel, int below) => (int)Math.Round(channel * amount + below * (1 - amount), MidpointRounding.AwayFromZero);
        return string.Create(CultureInfo.InvariantCulture, $"#{Mix(red, baseRed):X2}{Mix(green, baseGreen):X2}{Mix(blue, baseBlue):X2}");
    }
}
