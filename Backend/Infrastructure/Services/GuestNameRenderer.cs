using Entourage.Application.DTOs;
using SkiaSharp;
using SkiaSharp.HarfBuzz;

namespace Entourage.Infrastructure.Services;

/// <summary>
/// Draws a guest's greeting ("Dear Salman K Juma,") and optional position onto the invitation's
/// name strip and returns a PNG. Works in the strip's own pixels, so the result lines up exactly
/// with the rest of the sliced design. Text is shaped with HarfBuzz, so Arabic letters join correctly.
/// </summary>
public static class GuestNameRenderer
{
    private static readonly string[] BuiltInFonts = ["Arial", "Georgia", "Times New Roman"];

    /// <param name="background">The name strip image (PNG / JPG / WEBP).</param>
    /// <param name="fontFor">Bytes of an uploaded font by id, or null when missing.</param>
    public static byte[] Render(
        byte[] background,
        GuestNameImageDto settings,
        string name,
        string? position,
        Func<Guid, byte[]?> fontFor)
    {
        using var decoded = SKBitmap.Decode(background) ?? throw new InvalidOperationException("The name strip image could not be read.");
        using var bitmap = decoded.ColorType == SKColorType.Rgba8888 || decoded.ColorType == SKColorType.Bgra8888
            ? decoded.Copy()
            : decoded.Copy(SKColorType.Rgba8888);
        using var canvas = new SKCanvas(bitmap);

        var width = bitmap.Width;
        var height = bitmap.Height;
        var paddingX = Math.Clamp(settings.PaddingX, 0, Math.Max(0, width / 2 - 1));
        var available = Math.Max(10, width - paddingX * 2);

        var greeting = Greeting(settings.Template, name);
        using var nameTypeface = Typeface(settings.FontId, settings.Font, fontFor);
        using var nameFont = Fit(nameTypeface, settings.FontSize, greeting, available);

        var showPosition = settings.PositionEnabled && !string.IsNullOrWhiteSpace(position);
        using var positionTypeface = showPosition ? Typeface(settings.PositionFontId, settings.PositionFont, fontFor) : null;
        using var positionFont = showPosition ? Fit(positionTypeface!, settings.PositionFontSize, position!.Trim(), available) : null;

        var nameHeight = LineHeight(nameFont);
        var positionHeight = positionFont is null ? 0 : LineHeight(positionFont);
        var gap = positionFont is null ? 0 : Math.Max(0, settings.LineGap);
        var block = nameHeight + gap + positionHeight;
        var top = settings.Valign switch
        {
            "middle" => (height - block) / 2f,
            "bottom" => height - block,
            _ => 0f,
        } + settings.OffsetY;

        DrawLine(canvas, greeting, nameFont, Color(settings.Color), settings.Align, paddingX, width, top);
        if (positionFont is not null)
        {
            DrawLine(canvas, position!.Trim(), positionFont, Color(settings.PositionColor), settings.Align, paddingX, width, top + nameHeight + gap);
        }

        canvas.Flush();
        using var image = SKImage.FromBitmap(bitmap);
        using var png = image.Encode(SKEncodedImageFormat.Png, 100);
        return png.ToArray();
    }

    /// <summary>"Dear {name}," → "Dear Salman K Juma,". Without a placeholder the name goes at the end.</summary>
    public static string Greeting(string? template, string name)
    {
        var clean = name.Trim();
        var pattern = string.IsNullOrWhiteSpace(template) ? "Dear {name}," : template;
        return pattern.Contains("{name}", StringComparison.OrdinalIgnoreCase)
            ? pattern.Replace("{name}", clean, StringComparison.OrdinalIgnoreCase)
            : $"{pattern.TrimEnd()} {clean}";
    }

    private static void DrawLine(SKCanvas canvas, string text, SKFont font, SKColor color, string align, int paddingX, int width, float top)
    {
        using var paint = new SKPaint { Color = color, IsAntialias = true };
        var textWidth = font.MeasureText(text);
        var x = align switch
        {
            "center" => (width - textWidth) / 2f,
            "right" => width - paddingX - textWidth,
            _ => paddingX,
        };
        var baseline = top - font.Metrics.Ascent;
        using var shaper = new SKShaper(font.Typeface);
        canvas.DrawShapedText(shaper, text, x, baseline, font, paint);
    }

    /// <summary>Uses the requested size, shrinking it only when a long name would not fit the strip.</summary>
    private static SKFont Fit(SKTypeface typeface, int size, string text, int available)
    {
        var font = new SKFont(typeface, Math.Clamp(size, 6, 400)) { Edging = SKFontEdging.SubpixelAntialias, Subpixel = true };
        var measured = font.MeasureText(text);
        if (measured > available && measured > 0)
        {
            font.Size = Math.Max(6, font.Size * available / measured);
        }

        return font;
    }

    private static float LineHeight(SKFont font) => font.Metrics.Descent - font.Metrics.Ascent;

    private static SKTypeface Typeface(Guid? fontId, string? builtIn, Func<Guid, byte[]?> fontFor)
    {
        if (fontId is Guid id && fontFor(id) is { Length: > 0 } bytes)
        {
            using var data = SKData.CreateCopy(bytes);
            var uploaded = SKTypeface.FromData(data);
            if (uploaded is not null)
            {
                return uploaded;
            }
        }

        var family = BuiltInFonts.FirstOrDefault(item => string.Equals(item, builtIn, StringComparison.OrdinalIgnoreCase)) ?? "Arial";
        return SKTypeface.FromFamilyName(family) ?? SKTypeface.Default;
    }

    private static SKColor Color(string? hex) =>
        hex is { Length: 7 } && hex[0] == '#' && SKColor.TryParse(hex, out var color) ? color : SKColors.White;
}
