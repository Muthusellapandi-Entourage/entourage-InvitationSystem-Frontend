using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using SkiaSharp;

namespace Entourage.Infrastructure.Services;

/// <summary>
/// Draws a guest's digital pass as a PNG. Element designs (the free-canvas designer) draw every element with the
/// guest's details, images and brand fonts; older designs fall back to <see cref="BadgeRenderer"/>.
/// </summary>
public sealed class DigitalPassRenderer(AppDbContext db, IEventAssetService assets, IEventFontService fonts, PrintBadgeService badges)
{
    public async Task<byte[]> RenderAsync(Guid eventId, BadgeDesignDto design, Guest guest, CancellationToken cancellationToken)
    {
        if (design.Elements is null)
        {
            byte[]? background = null;
            if (design.BackgroundAssetId is Guid assetId && await assets.OpenAsync(assetId, cancellationToken) is { } file)
            {
                background = await File.ReadAllBytesAsync(file.Path, cancellationToken);
            }

            return BadgeRenderer.Render(design, background, guest.Name, guest.CheckInCode);
        }

        var typeName = guest.GuestTypeId is Guid typeId
            ? await db.GuestTypes.AsNoTracking().Where(item => item.Id == typeId).Select(item => item.Name).FirstOrDefaultAsync(cancellationToken)
            : null;
        var details = await badges.BadgeGuestAsync(guest, typeName, cancellationToken);

        var images = new Dictionary<Guid, byte[]>();
        foreach (var id in design.AssetIds().Distinct())
        {
            if (await assets.OpenAsync(id, cancellationToken) is { } file)
            {
                images[id] = await File.ReadAllBytesAsync(file.Path, cancellationToken);
            }
        }

        // Brand fonts used by the design, by name.
        var wanted = design.Elements.Select(element => element.Font).OfType<string>().Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var typefaces = new Dictionary<string, SKTypeface>(StringComparer.OrdinalIgnoreCase);
        if (wanted.Count > 0)
        {
            foreach (var font in await fonts.ListAsync(eventId, cancellationToken))
            {
                if (!wanted.Contains(font.Name, StringComparer.OrdinalIgnoreCase) || typefaces.ContainsKey(font.Name))
                {
                    continue;
                }

                if (await fonts.ReadAsync(font.Id, cancellationToken) is { } bytes)
                {
                    using var data = SKData.CreateCopy(bytes.Bytes);
                    if (SKTypeface.FromData(data) is { } typeface)
                    {
                        typefaces[font.Name] = typeface;
                    }
                }
            }
        }

        try
        {
            return Draw(design, details, images, typefaces);
        }
        finally
        {
            foreach (var typeface in typefaces.Values)
            {
                typeface.Dispose();
            }
        }
    }

    private static byte[] Draw(BadgeDesignDto design, PrintGuestDto guest, IReadOnlyDictionary<Guid, byte[]> images, IReadOnlyDictionary<string, SKTypeface> typefaces)
    {
        var width = Math.Clamp(design.Width, 200, 2400);
        var height = Math.Clamp(design.Height, 200, 4000);
        using var surface = SKSurface.Create(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul))
            ?? throw new InvalidOperationException("The digital pass could not be drawn.");
        var canvas = surface.Canvas;
        canvas.Clear(BadgeRenderer.SkiaColor(design.BackgroundColor, SKColors.White));

        if (design.BackgroundAssetId is Guid background && images.TryGetValue(background, out var backgroundBytes))
        {
            using var image = SKImage.FromEncodedData(backgroundBytes);
            if (image is not null)
            {
                DrawImage(canvas, image, SKRect.Create(0, 0, width, height), cover: true);
            }
        }

        foreach (var element in design.Elements ?? [])
        {
            if (element.Hidden)
            {
                continue;
            }

            var box = SKRect.Create((float)element.X, (float)element.Y, (float)element.Width, (float)element.Height);
            var radius = (float)Math.Max(0, element.Radius);
            switch (element.Kind)
            {
                case "rect":
                    Fill(canvas, box, radius, BadgeRenderer.SkiaColor(element.Fill ?? element.Color, SKColors.Black));
                    break;
                case "image":
                    if (element.AssetId is Guid assetId && images.TryGetValue(assetId, out var bytes))
                    {
                        using var image = SKImage.FromEncodedData(bytes);
                        if (image is not null)
                        {
                            canvas.Save();
                            if (radius > 0)
                            {
                                canvas.ClipRoundRect(new SKRoundRect(box, radius, radius), antialias: true);
                            }

                            DrawImage(canvas, image, box, cover: false);
                            canvas.Restore();
                        }
                    }

                    break;
                case "qr":
                    if (!string.IsNullOrEmpty(guest.CheckInCode))
                    {
                        using var code = SKImage.FromEncodedData(BadgeRenderer.QrPng(guest.CheckInCode));
                        using var white = new SKPaint { Color = SKColors.White };
                        canvas.DrawRect(box, white);
                        using var paint = new SKPaint { IsAntialias = false };
                        canvas.DrawImage(code, box, new SKSamplingOptions(SKFilterMode.Nearest), paint);
                    }

                    break;
                default:
                    if (element.Fill is not null)
                    {
                        Fill(canvas, box, radius, BadgeRenderer.SkiaColor(element.Fill, SKColors.Transparent));
                    }

                    DrawText(canvas, element, box, TextOf(element, guest), typefaces);
                    break;
            }
        }

        using var snapshot = surface.Snapshot();
        using var png = snapshot.Encode(SKEncodedImageFormat.Png, 100);
        return png.ToArray();
    }

    private static string TextOf(BadgeElementDto element, PrintGuestDto guest)
    {
        var value = element.Kind switch
        {
            "name" => guest.Name,
            "position" => guest.Position,
            "company" => guest.Company,
            "guestType" => guest.GuestType,
            "seat" => guest.Seat,
            "text" => element.Text,
            _ => null,
        };
        var text = value?.Trim() ?? string.Empty;
        return element.Uppercase ? text.ToUpperInvariant() : text;
    }

    private static void Fill(SKCanvas canvas, SKRect box, float radius, SKColor color)
    {
        using var paint = new SKPaint { IsAntialias = true, Color = color };
        if (radius > 0)
        {
            canvas.DrawRoundRect(box, radius, radius, paint);
        }
        else
        {
            canvas.DrawRect(box, paint);
        }
    }

    /// <summary>Contain (logos) or cover (backgrounds) inside the box.</summary>
    private static void DrawImage(SKCanvas canvas, SKImage image, SKRect box, bool cover)
    {
        if (image.Width <= 0 || image.Height <= 0 || box.Width <= 0 || box.Height <= 0)
        {
            return;
        }

        var scale = cover
            ? Math.Max(box.Width / image.Width, box.Height / image.Height)
            : Math.Min(box.Width / image.Width, box.Height / image.Height);
        var width = image.Width * scale;
        var height = image.Height * scale;
        var target = SKRect.Create(box.Left + (box.Width - width) / 2, box.Top + (box.Height - height) / 2, width, height);
        canvas.Save();
        canvas.ClipRect(box);
        using var paint = new SKPaint { IsAntialias = true };
        canvas.DrawImage(image, target, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear), paint);
        canvas.Restore();
    }

    private static void DrawText(SKCanvas canvas, BadgeElementDto element, SKRect box, string text, IReadOnlyDictionary<string, SKTypeface> typefaces)
    {
        if (string.IsNullOrEmpty(text))
        {
            return;
        }

        var bold = element.FontWeight is "bold" or "semibold";
        SKTypeface? owned = null;
        if (element.Font is null || !typefaces.TryGetValue(element.Font, out var typeface))
        {
            var family = element.Font switch
            {
                "Georgia" => "Georgia",
                "Times New Roman" => "Times New Roman",
                "Inter" or null => "Arial",
                _ => "Arial",
            };
            owned = SKTypeface.FromFamilyName(family, bold ? SKFontStyleWeight.Bold : SKFontStyleWeight.Normal, SKFontStyleWidth.Normal, SKFontStyleSlant.Upright) ?? SKTypeface.Default;
            typeface = owned;
        }

        try
        {
            // Shrink long text to fit its box, like the designer preview (down to 55 %).
            var size = (float)Math.Clamp(element.FontSize, 4, 400);
            var minimum = size * 0.55f;
            List<string> lines;
            float lineHeight;
            SKFont font;
            while (true)
            {
                font = new SKFont(typeface, size) { Subpixel = true, Embolden = bold && owned is null };
                var measuring = font;
                lines = BadgeRenderer.Wrap(text.Replace('\n', ' '), box.Width, line => measuring.MeasureText(line));
                lineHeight = size * 1.15f;
                var widest = lines.Max(line => font.MeasureText(line));
                if ((lines.Count * lineHeight <= box.Height + 0.5f && widest <= box.Width + 0.5f) || size <= minimum)
                {
                    break;
                }

                font.Dispose();
                size = Math.Max(minimum, size * 0.92f);
            }

            using (font)
            {
                using var paint = new SKPaint { IsAntialias = true, Color = BadgeRenderer.SkiaColor(element.Color, SKColors.Black) };
                var visible = Math.Max(1, (int)Math.Floor(box.Height / lineHeight));
                lines = lines.Take(visible).ToList();
                var block = lines.Count * lineHeight;
                var offset = element.Valign switch
                {
                    "top" => 0,
                    "bottom" => Math.Max(0, box.Height - block),
                    _ => Math.Max(0, (box.Height - block) / 2),
                };
                canvas.Save();
                canvas.ClipRect(box);
                var metrics = font.Metrics;
                for (var index = 0; index < lines.Count; index++)
                {
                    var lineWidth = font.MeasureText(lines[index]);
                    var x = element.Align switch
                    {
                        "left" => box.Left,
                        "right" => box.Right - lineWidth,
                        _ => box.Left + (box.Width - lineWidth) / 2,
                    };
                    var top = box.Top + offset + index * lineHeight;
                    var baseline = top + (lineHeight - (metrics.Descent - metrics.Ascent)) / 2 - metrics.Ascent;
                    canvas.DrawText(lines[index], x, baseline, SKTextAlign.Left, font, paint);
                }

                canvas.Restore();
            }
        }
        finally
        {
            owned?.Dispose();
        }
    }
}
