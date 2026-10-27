using System.Globalization;
using System.Net;
using System.Text;
using Entourage.Application.DTOs;

namespace Entourage.Application.Invitations;

public static class InvitationEmailBuilder
{
    public static string Build(InvitationDesignDto design, IReadOnlyDictionary<Guid, string> assetUrls)
    {
        var table = BuildTable(design, assetUrls);
        var media = new StringBuilder();
        if (design.GuestName.Enabled)
        {
            media.Append(".inv-guest-name{font-size:")
                .Append(design.GuestName.MobileFontSize)
                .Append("px !important;}");
        }

        if (design.GuestPosition.Enabled)
        {
            media.Append(".inv-guest-position{font-size:")
                .Append(design.GuestPosition.MobileFontSize)
                .Append("px !important;}");
        }

        var style = media.Length == 0
            ? string.Empty
            : $"<style>@media only screen and (max-width:600px){{{media}}}</style>";

        return $"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Invitation</title>
            {style}
            </head>
            <body style="margin:0;padding:32px 16px;background:#e8e8e4;">
            {table}
            </body>
            </html>
            """;
    }

    /// <summary>
    /// The invitation background. Outlook honours the bgcolor attribute, other
    /// clients use the inline style; both are emitted on every section cell so
    /// the colour reaches all four edges without extra padding.
    /// </summary>
    private readonly record struct CanvasFill(string Attribute, string Style, string MixBase)
    {
        public const string Default = "#313131";
        public const string Transparent = "transparent";

        public static CanvasFill From(InvitationDesignDto design)
        {
            var value = design.BackgroundColor;
            if (string.Equals(value, Transparent, StringComparison.OrdinalIgnoreCase))
            {
                return new CanvasFill(string.Empty, string.Empty, "#E8E8E4");
            }

            var color = value is not null && TryParseHex(value, out _, out _, out _) ? value.ToUpperInvariant() : Default;
            return new CanvasFill($" bgcolor=\"{color}\"", $"background-color:{color};", color);
        }
    }

    /// <summary>Placeholder for the per-guest name image URL in a sliced invitation.</summary>
    public const string GuestNameImageToken = "{{GuestNameImage}}";

    /// <summary>Placeholder for the name image's alt text ("Dear Salman K Juma,"), shown when images are blocked.</summary>
    public const string GuestNameAltToken = "{{GuestNameAlt}}";

    /// <summary>
    /// A "single image" invitation: each strip is one full-width image row; the name strip is the guest's
    /// own generated image; the buttons strip is split into pieces with Accept / Decline as links.
    /// Widths are scaled from the source pixels to the email width and always add up exactly.
    /// </summary>
    private static string BuildSlicedTable(InvitationDesignDto design, SliceDesignDto slices, IReadOnlyDictionary<Guid, string> assetUrls)
    {
        var width = design.Width is >= 200 and <= 2400 ? design.Width.Value : 600;
        var scale = width / (double)slices.SourceWidth;
        var html = new StringBuilder();
        html.Append("<table data-invitation-canvas=\"true\" data-sliced=\"true\" role=\"presentation\" width=\"").Append(width)
            .Append("\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" align=\"center\" style=\"width:").Append(width)
            .Append("px;max-width:100%;border-collapse:collapse;margin:0 auto;\">");
        foreach (var strip in slices.Strips)
        {
            var rowHeight = Math.Max(1, (int)Math.Round(strip.Height * scale, MidpointRounding.AwayFromZero));
            html.Append("<tr><td style=\"padding:0;line-height:0;font-size:0;\">");
            if (strip.Role == "name")
            {
                html.Append("<img data-guest-name-image=\"true\" src=\"").Append(GuestNameImageToken)
                    .Append("\" alt=\"").Append(GuestNameAltToken).Append("\" width=\"").Append(width).Append("\" height=\"").Append(rowHeight)
                    .Append("\" style=\"display:block;width:100%;max-width:").Append(width)
                    .Append("px;height:auto;border:0;color:#FFFFFF;font:600 18px Arial,sans-serif;\" />");
            }
            else if (strip.Role == "buttons" && strip.Pieces is { Length: > 0 } pieces)
            {
                html.Append("<table role=\"presentation\" width=\"").Append(width)
                    .Append("\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:").Append(width)
                    .Append("px;border-collapse:collapse;table-layout:fixed;\"><tr data-rsvp-row=\"true\">");
                // Round each edge rather than each width, so the pieces always add up to the full width.
                // Every piece gets the same exact pixel height: with height:auto, narrow pieces round to a
                // different height than wide ones and the Accept / Decline row looks out of line.
                foreach (var piece in pieces)
                {
                    var left = (int)Math.Round(piece.X * scale, MidpointRounding.AwayFromZero);
                    var right = (int)Math.Round((piece.X + piece.Width) * scale, MidpointRounding.AwayFromZero);
                    var pieceWidth = Math.Max(1, right - left);
                    var src = WebUtility.HtmlEncode(assetUrls.TryGetValue(piece.AssetId, out var url) ? url : string.Empty);
                    var image = $"<img src=\"{src}\" alt=\"{(piece.Kind == "accept" ? "Accept invitation" : piece.Kind == "decline" ? "Decline invitation" : string.Empty)}\" width=\"{pieceWidth}\" height=\"{rowHeight}\" style=\"display:block;width:{pieceWidth}px;height:{rowHeight}px;border:0;\" />";
                    html.Append("<td width=\"").Append(pieceWidth).Append("\" height=\"").Append(rowHeight).Append("\" valign=\"top\" style=\"width:").Append(pieceWidth)
                        .Append("px;height:").Append(rowHeight).Append("px;padding:0;line-height:0;font-size:0;vertical-align:top;\">");
                    if (piece.Kind == "accept" || piece.Kind == "decline")
                    {
                        html.Append("<a href=\"").Append(piece.Kind == "accept" ? "{{AcceptUrl}}" : "{{DeclineUrl}}")
                            .Append("\" target=\"_top\" style=\"display:block;text-decoration:none;line-height:0;font-size:0;\" data-image-slot=\"").Append(piece.Kind).Append("\">")
                            .Append(image).Append("</a>");
                    }
                    else
                    {
                        html.Append(image);
                    }

                    html.Append("</td>");
                }

                html.Append("</tr></table>");
            }
            else if (strip.AssetId is Guid assetId && assetUrls.TryGetValue(assetId, out var stripUrl))
            {
                html.Append("<img src=\"").Append(WebUtility.HtmlEncode(stripUrl)).Append("\" alt=\"\" width=\"").Append(width)
                    .Append("\" height=\"").Append(rowHeight).Append("\" style=\"display:block;width:100%;max-width:").Append(width)
                    .Append("px;height:auto;border:0;\" />");
            }

            html.Append("</td></tr>");
        }

        html.Append("</table>");
        return html.ToString();
    }

    /// <summary>Every uploaded image a design references, for ownership checks and public URLs.</summary>
    public static Guid[] AllAssetIds(InvitationDesignDto design) =>
        new[] { design.HeaderAssetId, design.DetailsAssetId, design.AcceptAssetId, design.DeclineAssetId }
            .OfType<Guid>()
            .Concat(SliceAssetIds(design.Slices))
            .Distinct()
            .ToArray();

    /// <summary>Every image a sliced design uses: the source, each strip and each button piece.</summary>
    public static IEnumerable<Guid> SliceAssetIds(SliceDesignDto? slices)
    {
        if (slices is null)
        {
            yield break;
        }

        yield return slices.SourceAssetId;
        foreach (var strip in slices.Strips ?? [])
        {
            if (strip.AssetId is Guid id)
            {
                yield return id;
            }

            foreach (var piece in strip.Pieces ?? [])
            {
                yield return piece.AssetId;
            }
        }
    }

    public static string BuildTable(InvitationDesignDto design, IReadOnlyDictionary<Guid, string> assetUrls)
    {
        if (design.Slices is { } slices)
        {
            return BuildSlicedTable(design, slices, assetUrls);
        }

        var width = design.Width is >= 200 and <= 2400 ? design.Width.Value : 560;
        int? height = design.Height is >= 200 and <= 4000 ? design.Height : null;
        var fill = CanvasFill.From(design);
        var html = new StringBuilder();
        var heightAttribute = height is null ? string.Empty : $" height=\"{height}\"";
        var heightStyle = height is null ? string.Empty : $"height:{height}px;";
        var shrink = height is null ? "max-width:100%;" : string.Empty;
        html.Append("<table data-invitation-canvas=\"true\" role=\"presentation\" width=\"").Append(width).Append('"').Append(heightAttribute);
        html.Append(" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" align=\"center\"").Append(fill.Attribute).Append(" style=\"width:")
            .Append(width).Append("px;").Append(heightStyle).Append(shrink)
            .Append("border-collapse:collapse;").Append(fill.Style).Append("margin:0 auto;\">");

        var sections = 0;
        sections += AppendImage(html, Url(design.HeaderAssetId, assetUrls), "Header", width, "header", design.HeaderImage, fill);
        var guest = AppendGuest(html, design, fill);
        sections += guest;
        sections += AppendImage(html, Url(design.DetailsAssetId, assetUrls), "Event information", width, "details", design.DetailsImage, fill);
        sections += AppendButtons(html, design, assetUrls, fill);

        if (sections == 0)
        {
            var filler = height is null ? "120px" : "100%";
            html.Append("<tr><td").Append(fill.Attribute).Append(" style=\"height:").Append(filler).Append(';').Append(fill.Style)
                .Append("font-size:0;line-height:0;\">&nbsp;</td></tr>");
        }
        else if (height is not null && guest == 0)
        {
            html.Append("<tr><td").Append(fill.Attribute).Append(" height=\"100%\" style=\"height:100%;").Append(fill.Style)
                .Append("font-size:0;line-height:0;\">&nbsp;</td></tr>");
        }

        html.Append("</table>");
        return html.ToString();
    }

    private static int AppendImage(
        StringBuilder html,
        string? src,
        string alt,
        int canvasWidth,
        string slot,
        ImagePlacementDto? placement,
        CanvasFill fill)
    {
        if (string.IsNullOrEmpty(src))
        {
            return 0;
        }

        var frame = EffectiveImage(placement, canvasWidth, canvasWidth);
        html.Append("<tr data-image-slot=\"").Append(slot).Append("\"><td").Append(fill.Attribute)
            .Append(" style=\"").Append(fill.Style).Append("padding:0;line-height:0;font-size:0;\">");
        html.Append("<table role=\"presentation\" width=\"").Append(canvasWidth)
            .Append("\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:").Append(canvasWidth)
            .Append("px;border-collapse:collapse;\"><tr><td data-image-y=\"").Append(slot)
            .Append("\" colspan=\"3\" height=\"").Append(frame.Y).Append("\" style=\"height:").Append(frame.Y)
            .Append("px;font-size:0;line-height:0;mso-line-height-rule:exactly;\">&nbsp;</td></tr><tr><td data-image-x=\"")
            .Append(slot).Append("\" width=\"").Append(frame.X).Append("\" style=\"width:").Append(frame.X)
            .Append("px;font-size:0;line-height:0;\">&nbsp;</td><td width=\"").Append(frame.Width)
            .Append("\" style=\"width:").Append(frame.Width).Append("px;\">");
        AppendSizedImage(html, src, alt, slot, frame);
        html.Append("</td><td style=\"font-size:0;line-height:0;\">&nbsp;</td></tr></table></td></tr>");
        return 1;
    }

    private static int AppendGuest(StringBuilder html, InvitationDesignDto design, CanvasFill fill)
    {
        if (!design.GuestName.Enabled && !design.GuestPosition.Enabled)
        {
            return 0;
        }

        var band = EffectiveBand(design);
        var width = design.Width is >= 200 and <= 2400 ? design.Width.Value : 560;
        html.Append("<tr data-guest-band=\"spacer\"><td height=\"").Append(band.Y)
            .Append("\" style=\"height:").Append(band.Y)
            .Append("px;font-size:0;line-height:0;mso-line-height-rule:exactly;\">&nbsp;</td></tr>");
        html.Append("<tr data-guest-band=\"true\"><td data-guest-band-cell=\"true\" width=\"").Append(width)
            .Append("\" height=\"").Append(band.Height).Append("\" align=\"").Append(band.Align)
            .Append("\" valign=\"").Append(band.Valign).Append("\" style=\"width:").Append(width)
            .Append("px;height:").Append(band.Height).Append("px;\"><table role=\"presentation\" width=\"")
            .Append(width).Append("\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" align=\"center\" style=\"width:")
            .Append(width).Append("px;border-collapse:collapse;\">");

        if (design.GuestName.Enabled)
        {
            AppendGuestLine(html, design.GuestName, band, 0, "guest-name", "inv-guest-name",
                "Dear <span data-dynamic-tag=\"GuestName\">{{GuestName}}</span>,", fill.MixBase);
        }

        if (design.GuestPosition.Enabled)
        {
            AppendGuestLine(html, design.GuestPosition, band, band.Spacing, "guest-position", "inv-guest-position",
                "{{GuestPosition}}", fill.MixBase);
        }

        html.Append("</table></td></tr>");
        return 1;
    }

    private static GuestBandDto EffectiveBand(InvitationDesignDto design)
    {
        if (design.GuestBand is not null)
        {
            return design.GuestBand;
        }

        var align = design.GroupAlign is "center" or "right" ? design.GroupAlign : "left";
        var spacing = design.GuestPosition.Enabled ? Math.Clamp(design.GuestPosition.TopSpacing, 0, 80) : 0;
        var nameLine = (int)Math.Round(design.GuestName.FontSize * 1.35, MidpointRounding.AwayFromZero);
        var positionLine = design.GuestPosition.Enabled
            ? (int)Math.Round(design.GuestPosition.FontSize * 1.35, MidpointRounding.AwayFromZero)
            : 0;
        var height = Math.Clamp(nameLine + positionLine + spacing + 16, 48, 800);
        return new GuestBandDto(
            Math.Clamp(design.GuestName.TopSpacing, 0, 2000),
            height,
            align,
            "top",
            spacing,
            Math.Clamp(design.GuestName.LeftPadding, 0, 120));
    }

    private static void AppendGuestLine(
        StringBuilder html,
        GuestFieldDto field,
        GuestBandDto band,
        int spacing,
        string marker,
        string cssClass,
        string content,
        string mixBase)
    {
        var position = marker == "guest-position";
        var tagAttribute = position ? " data-dynamic-tag=\"GuestPosition\"" : string.Empty;
        if (position)
        {
            html.Append("<tr data-guest-position=\"true\">");
        }
        else
        {
            html.Append("<tr>");
        }

        html.Append("<td data-").Append(marker).Append("=\"true\" align=\"").Append(band.Align)
            .Append("\" style=\"padding:").Append(spacing).Append("px ").Append(band.Inset)
            .Append("px 0;text-align:").Append(band.Align).Append(";\">");
        var fill = !position && field.NameBackground == true ? NameFill(field, mixBase) : null;
        if (fill is not null)
        {
            html.Append("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" align=\"")
                .Append(band.Align).Append("\" style=\"border-collapse:collapse;\"><tr><td bgcolor=\"")
                .Append(fill.Value.Solid).Append("\" style=\"background-color:").Append(fill.Value.Css)
                .Append(";padding:").Append(field.PadY ?? 0).Append("px ").Append(field.PadX ?? 0).Append("px;\">");
        }

        html.Append("<span class=\"").Append(cssClass).Append('"').Append(tagAttribute)
            .Append(" style=\"").Append(FontStyle(field)).Append("\">")
            .Append(content).Append("</span>");
        if (fill is not null)
        {
            html.Append("</td></tr></table>");
        }

        html.Append("</td></tr>");
    }

    private static (string Solid, string Css)? NameFill(GuestFieldDto field, string mixBase)
    {
        if (field.NameBackground != true || string.IsNullOrEmpty(field.BackgroundColor) || field.BackgroundOpacity is <= 0)
        {
            return null;
        }

        var opacity = Math.Clamp(field.BackgroundOpacity ?? 100, 0, 100);
        if (opacity == 0)
        {
            return null;
        }

        if (!TryParseHex(field.BackgroundColor, out var red, out var green, out var blue))
        {
            return null;
        }

        if (opacity >= 100)
        {
            return (field.BackgroundColor, field.BackgroundColor);
        }

        if (!TryParseHex(mixBase, out var baseRed, out var baseGreen, out var baseBlue))
        {
            (baseRed, baseGreen, baseBlue) = (0x31, 0x31, 0x31);
        }

        var amount = opacity / 100d;
        int Mix(int channel, int under) => (int)Math.Round(channel * amount + under * (1 - amount), MidpointRounding.AwayFromZero);
        var solid = string.Create(CultureInfo.InvariantCulture, $"#{Mix(red, baseRed):X2}{Mix(green, baseGreen):X2}{Mix(blue, baseBlue):X2}");
        var css = string.Create(CultureInfo.InvariantCulture, $"rgba({red},{green},{blue},{amount:0.##})");
        return (solid, css);
    }

    private static bool TryParseHex(string hex, out int red, out int green, out int blue)
    {
        red = green = blue = 0;
        if (hex.Length != 7 || hex[0] != '#')
        {
            return false;
        }

        return int.TryParse(hex.AsSpan(1, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out red)
            && int.TryParse(hex.AsSpan(3, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out green)
            && int.TryParse(hex.AsSpan(5, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out blue);
    }

    private static ImagePlacementDto EffectiveImage(ImagePlacementDto? placement, int canvasWidth, int fallbackWidth)
    {
        if (placement is null)
        {
            return new ImagePlacementDto(0, 0, Math.Min(canvasWidth, fallbackWidth), null, true);
        }

        var width = Math.Clamp(placement.Width, 20, 2400);
        return new ImagePlacementDto(
            Math.Clamp(placement.X, 0, Math.Max(0, canvasWidth)),
            Math.Clamp(placement.Y, 0, 2000),
            width,
            placement.Height is null ? null : Math.Clamp(placement.Height.Value, 20, 4000),
            placement.LockRatio);
    }

    private static int AppendButtons(
        StringBuilder html,
        InvitationDesignDto design,
        IReadOnlyDictionary<Guid, string> assetUrls,
        CanvasFill fill)
    {
        var width = design.Width is >= 200 and <= 2400 ? design.Width.Value : 560;
        var acceptSrc = Url(design.AcceptAssetId, assetUrls);
        var declineSrc = Url(design.DeclineAssetId, assetUrls);
        var frames = RsvpFrames(width, acceptSrc is not null, declineSrc is not null, design.AcceptImage, design.DeclineImage);
        var items = new List<(string Slot, string Src, string Href, string Alt, ImagePlacementDto Frame)>();
        if (frames.Accept is not null && acceptSrc is not null)
        {
            items.Add(("accept", acceptSrc, "{{AcceptUrl}}", "Accept invitation", frames.Accept));
        }

        if (frames.Decline is not null && declineSrc is not null)
        {
            items.Add(("decline", declineSrc, "{{DeclineUrl}}", "Decline invitation", frames.Decline));
        }

        if (items.Count == 0)
        {
            return 0;
        }

        items.Sort((left, right) =>
        {
            var byX = left.Frame.X.CompareTo(right.Frame.X);
            return byX != 0 ? byX : string.Compare(left.Slot, right.Slot, StringComparison.Ordinal);
        });

        html.Append("<tr><td").Append(fill.Attribute).Append(" style=\"").Append(fill.Style)
            .Append("padding:0;line-height:0;font-size:0;\"><table role=\"presentation\" width=\"")
            .Append(width)
            .Append("\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:")
            .Append(width)
            .Append("px;border-collapse:collapse;\"><tr data-rsvp-row=\"true\">");
        var cursor = 0;
        foreach (var item in items)
        {
            var gap = Math.Max(0, item.Frame.X - cursor);
            cursor += gap + item.Frame.Width;
            var heightStyle = item.Frame.Height is null ? "height:auto;" : $"height:{item.Frame.Height}px;";
            html.Append("<td data-image-gap=\"").Append(item.Slot).Append("\" width=\"").Append(gap)
                .Append("\" style=\"width:").Append(gap).Append("px;font-size:0;line-height:0;\">&nbsp;</td>");
            html.Append("<td data-image-pad=\"").Append(item.Slot).Append("\" width=\"").Append(item.Frame.Width)
                .Append("\" valign=\"top\" style=\"width:").Append(item.Frame.Width).Append("px;padding:")
                .Append(item.Frame.Y).Append("px 0 0 0;line-height:0;font-size:0;\"><a href=\"").Append(item.Href)
                .Append("\" target=\"_top\" style=\"text-decoration:none;\"><img data-image-slot=\"").Append(item.Slot)
                .Append("\" data-canvas-x=\"").Append(item.Frame.X).Append("\" data-canvas-y=\"").Append(item.Frame.Y)
                .Append("\" src=\"").Append(WebUtility.HtmlEncode(item.Src)).Append("\" alt=\"").Append(WebUtility.HtmlEncode(item.Alt))
                .Append("\" width=\"").Append(item.Frame.Width).Append('"');
            if (item.Frame.Height is not null)
            {
                html.Append(" height=\"").Append(item.Frame.Height).Append('"');
            }

            html.Append(" style=\"display:block;width:").Append(item.Frame.Width).Append("px;").Append(heightStyle)
                .Append("border:0;\" /></a></td>");
        }

        html.Append("<td style=\"font-size:0;line-height:0;\">&nbsp;</td></tr></table></td></tr>");
        return 1;
    }

    private static (ImagePlacementDto? Accept, ImagePlacementDto? Decline) RsvpFrames(
        int canvas,
        bool acceptOn,
        bool declineOn,
        ImagePlacementDto? acceptImage,
        ImagePlacementDto? declineImage)
    {
        const int gap = 20;
        var acceptWidth = Math.Min(220, canvas);
        var declineWidth = Math.Min(220, canvas);
        var pair = (acceptOn ? acceptImage?.Width ?? acceptWidth : 0)
            + (acceptOn && declineOn ? gap : 0)
            + (declineOn ? declineImage?.Width ?? declineWidth : 0);
        var start = Math.Max(0, (int)Math.Round((canvas - Math.Min(pair, canvas)) / 2d, MidpointRounding.AwayFromZero));
        var accept = acceptOn
            ? acceptImage is null
                ? new ImagePlacementDto(start, 0, acceptWidth, null, true)
                : EffectiveImage(acceptImage, canvas, 220)
            : null;
        var declineX = accept is null ? start : accept.X + accept.Width + gap;
        var decline = declineOn
            ? declineImage is null
                ? new ImagePlacementDto(declineX, 0, declineWidth, null, true)
                : EffectiveImage(declineImage, canvas, 220)
            : null;
        return (accept, decline);
    }

    private static void AppendSizedImage(StringBuilder html, string src, string alt, string slot, ImagePlacementDto frame)
    {
        var heightAttribute = frame.Height is null ? string.Empty : $" height=\"{frame.Height}\"";
        var heightStyle = frame.Height is null ? "height:auto;" : $"height:{frame.Height}px;";
        html.Append("<img data-image-slot=\"").Append(slot).Append("\" src=\"").Append(WebUtility.HtmlEncode(src));
        html.Append("\" alt=\"").Append(WebUtility.HtmlEncode(alt)).Append("\" width=\"").Append(frame.Width).Append('"');
        html.Append(heightAttribute).Append(" style=\"display:block;width:").Append(frame.Width).Append("px;max-width:100%;");
        html.Append(heightStyle).Append("border:0;\" />");
    }

    private static string FontStyle(GuestFieldDto field)
    {
        var (family, presetWeight, slant) = field.Font switch
        {
            "Manifa Bold" => ("'Manifa Bold',Georgia,serif", "700", "normal"),
            "Manifa Italic" => ("'Manifa Italic',Georgia,serif", "400", "italic"),
            "Arial" => ("Arial,Helvetica,sans-serif", "400", "normal"),
            "Georgia" => ("Georgia,serif", "400", "normal"),
            "Times New Roman" => ("'Times New Roman',Times,serif", "400", "normal"),
            _ => ("Georgia,serif", "400", "normal"),
        };
        var weight = field.Weight switch
        {
            "bold" => "700",
            "regular" => "400",
            _ => presetWeight,
        };

        return $"font-family:{family};font-size:{field.FontSize}px;font-weight:{weight};font-style:{slant};color:{field.Color};line-height:1.35;";
    }

    private static string? Url(Guid? id, IReadOnlyDictionary<Guid, string> assetUrls)
    {
        if (id is null)
        {
            return null;
        }

        return assetUrls.TryGetValue(id.Value, out var url) ? url : null;
    }
}
