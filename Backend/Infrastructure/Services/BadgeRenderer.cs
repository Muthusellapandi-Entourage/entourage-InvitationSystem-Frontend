using Entourage.Application.DTOs;
using QRCoder;
using SkiaSharp;

namespace Entourage.Infrastructure.Services;

/// <summary>
/// Draws a guest's E-Badge on the server, the same way the designer's preview does: background image,
/// the guest's name (wrapped, aligned, clipped to its box) and their check-in QR code.
/// </summary>
public static class BadgeRenderer
{
    /// <summary>"#RRGGBB" or "#RRGGBBAA" (CSS order) as a Skia colour. Skia's own parser reads 8 digits as AARRGGBB.</summary>
    public static SKColor SkiaColor(string? hex, SKColor fallback) =>
        Entourage.Application.HexColor.TryParse(hex, out var red, out var green, out var blue, out var alpha)
            ? new SKColor((byte)red, (byte)green, (byte)blue, (byte)alpha)
            : fallback;

    private const float LineHeightRatio = 1.35f;

    /// <summary>A crisp QR code PNG for a value (the check-in code), with a white quiet zone.</summary>
    public static byte[] QrPng(string value, int pixelsPerModule = 12)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(value, QRCodeGenerator.ECCLevel.M);
        return new PngByteQRCode(data).GetGraphic(pixelsPerModule);
    }

    /// <param name="background">The badge background image bytes, or null when the design has none.</param>
    public static byte[] Render(BadgeDesignDto design, byte[]? background, string name, string qrValue)
    {
        var width = Math.Clamp(design.Width, 200, 2400);
        var height = Math.Clamp(design.Height, 200, 4000);
        using var surface = SKSurface.Create(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul))
            ?? throw new InvalidOperationException("The badge could not be drawn.");
        var canvas = surface.Canvas;
        canvas.Clear(SKColors.White);

        if (background is not null && design.Background is { } placement)
        {
            using var image = SKImage.FromEncodedData(background);
            if (image is not null)
            {
                var boxHeight = placement.Height ?? (image.Width > 0 ? (int)Math.Round(placement.Width * (double)image.Height / image.Width) : placement.Width);
                using var paint = new SKPaint { IsAntialias = true };
                canvas.DrawImage(image, SKRect.Create(placement.X, placement.Y, placement.Width, boxHeight), new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear), paint);
            }
        }

        if (design.Name is { } text)
        {
            DrawName(canvas, text, string.IsNullOrWhiteSpace(name) ? "Guest" : name.Trim());
        }

        if (design.Qr is { } qr && !string.IsNullOrEmpty(qrValue))
        {
            using var code = SKImage.FromEncodedData(QrPng(qrValue));
            var size = qr.Height ?? qr.Width;
            var box = SKRect.Create(qr.X, qr.Y, qr.Width, size);
            using var white = new SKPaint { Color = SKColors.White };
            canvas.DrawRect(box, white);
            using var paint = new SKPaint { IsAntialias = false };
            // Nearest-neighbour keeps the modules sharp when scaled.
            canvas.DrawImage(code, box, new SKSamplingOptions(SKFilterMode.Nearest), paint);
        }

        using var snapshot = surface.Snapshot();
        using var png = snapshot.Encode(SKEncodedImageFormat.Png, 100);
        return png.ToArray();
    }

    private static void DrawName(SKCanvas canvas, BadgeTextDto text, string name)
    {
        var bold = text.Weight == "bold" || (text.Weight != "regular" && text.Font == "Manifa Bold");
        var italic = text.Font == "Manifa Italic";
        var family = text.Font switch
        {
            "Manifa Bold" or "Manifa Italic" => "Georgia",
            "Times New Roman" => "Times New Roman",
            "Georgia" => "Georgia",
            _ => "Arial",
        };
        using var typeface = SKTypeface.FromFamilyName(
            family,
            bold ? SKFontStyleWeight.Bold : SKFontStyleWeight.Normal,
            SKFontStyleWidth.Normal,
            italic ? SKFontStyleSlant.Italic : SKFontStyleSlant.Upright) ?? SKTypeface.Default;
        using var font = new SKFont(typeface, Math.Clamp(text.FontSize, 8, 160)) { Subpixel = true };
        using var paint = new SKPaint { IsAntialias = true, Color = SkiaColor(text.Color, SKColors.Black) };

        var lines = Wrap(name, text.Width, line => font.MeasureText(line));
        var lineHeight = font.Size * LineHeightRatio;
        var visibleCount = Math.Max(1, (int)Math.Floor(text.Height / lineHeight));
        lines = lines.Take(visibleCount).ToList();
        var block = lines.Count * lineHeight;
        var offset = text.Valign switch
        {
            "middle" => Math.Max(0, (text.Height - block) / 2),
            "bottom" => Math.Max(0, text.Height - block),
            _ => 0,
        };

        canvas.Save();
        canvas.ClipRect(SKRect.Create(text.X, text.Y, text.Width, text.Height));
        var metrics = font.Metrics;
        for (var index = 0; index < lines.Count; index++)
        {
            var width = font.MeasureText(lines[index]);
            var x = text.Align switch
            {
                "center" => text.X + (text.Width - width) / 2,
                "right" => text.X + text.Width - width,
                _ => text.X,
            };
            // Centre the glyphs in each line box, like CSS line-height does.
            var top = text.Y + offset + index * lineHeight;
            var baseline = top + (lineHeight - (metrics.Descent - metrics.Ascent)) / 2 - metrics.Ascent;
            canvas.DrawText(lines[index], x, baseline, SKTextAlign.Left, font, paint);
        }

        canvas.Restore();
    }

    public static List<string> Wrap(string value, float maxWidth, Func<string, float> measure)
    {
        var words = value.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var lines = new List<string>();
        var current = string.Empty;
        foreach (var word in words)
        {
            var next = current.Length == 0 ? word : $"{current} {word}";
            if (current.Length == 0 || measure(next) <= maxWidth)
            {
                current = next;
                continue;
            }

            lines.Add(current);
            current = word;
        }

        if (current.Length > 0)
        {
            lines.Add(current);
        }

        return lines.Count == 0 ? [string.Empty] : lines;
    }
}
