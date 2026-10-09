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

    public static string BuildTable(InvitationDesignDto design, IReadOnlyDictionary<Guid, string> assetUrls)
    {
        var width = design.Width is >= 200 and <= 2400 ? design.Width.Value : 560;
        int? height = design.Height is >= 200 and <= 4000 ? design.Height : null;
        var html = new StringBuilder();
        var heightAttribute = height is null ? string.Empty : $" height=\"{height}\"";
        var heightStyle = height is null ? string.Empty : $"height:{height}px;";
        var shrink = height is null ? "max-width:100%;" : string.Empty;
        html.Append("<table data-invitation-canvas=\"true\" role=\"presentation\" width=\"").Append(width).Append('"').Append(heightAttribute);
        html.Append(" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" align=\"center\" style=\"width:")
            .Append(width).Append("px;").Append(heightStyle).Append(shrink)
            .Append("border-collapse:collapse;background:#313131;margin:0 auto;\">");

        var sections = 0;
        sections += AppendImage(html, Url(design.HeaderAssetId, assetUrls), "Header", width);
        var guest = AppendGuest(html, design);
        sections += guest;
        sections += AppendImage(html, Url(design.DetailsAssetId, assetUrls), "Event information", width);
        sections += AppendButtons(html, design, assetUrls);

        if (sections == 0)
        {
            var filler = height is null ? "120px" : "100%";
            html.Append("<tr><td style=\"height:").Append(filler).Append(";background:#313131;font-size:0;line-height:0;\">&nbsp;</td></tr>");
        }
        else if (height is not null && guest == 0)
        {
            html.Append("""<tr><td height="100%" style="height:100%;background:#313131;font-size:0;line-height:0;">&nbsp;</td></tr>""");
        }

        html.Append("</table>");
        return html.ToString();
    }

    private static int AppendImage(StringBuilder html, string? src, string alt, int width)
    {
        if (string.IsNullOrEmpty(src))
        {
            return 0;
        }

        html.Append("""<tr><td style="background:#313131;padding:0;line-height:0;font-size:0;">""");
        html.Append("<img src=\"").Append(WebUtility.HtmlEncode(src)).Append("\" alt=\"").Append(WebUtility.HtmlEncode(alt));
        html.Append("\" width=\"").Append(width);
        html.Append("\" style=\"display:block;width:100%;max-width:").Append(width).Append("px;height:auto;border:0;\" />");
        html.Append("</td></tr>");
        return 1;
    }

    private static int AppendGuest(StringBuilder html, InvitationDesignDto design)
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
                "Dear <span data-dynamic-tag=\"GuestName\">{{GuestName}}</span>,");
        }

        if (design.GuestPosition.Enabled)
        {
            AppendGuestLine(html, design.GuestPosition, band, band.Spacing, "guest-position", "inv-guest-position",
                "{{GuestPosition}}");
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
        string content)
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
        html.Append("<span class=\"").Append(cssClass).Append('"').Append(tagAttribute)
            .Append(" style=\"").Append(FontStyle(field)).Append("\">")
            .Append(content).Append("</span></td></tr>");
    }

    private static int AppendButtons(
        StringBuilder html,
        InvitationDesignDto design,
        IReadOnlyDictionary<Guid, string> assetUrls)
    {
        var accept = Url(design.AcceptAssetId, assetUrls);
        var decline = Url(design.DeclineAssetId, assetUrls);
        if (accept is null && decline is null)
        {
            return 0;
        }

        html.Append("""
            <tr><td style="background:#313131;padding:28px 16px 36px;text-align:center;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tr>
            """);

        AppendButton(html, accept, "{{AcceptUrl}}", "Accept invitation");
        AppendButton(html, decline, "{{DeclineUrl}}", "Decline invitation");
        html.Append("</tr></table></td></tr>");
        return 1;
    }

    private static void AppendButton(StringBuilder html, string? src, string href, string alt)
    {
        if (string.IsNullOrEmpty(src))
        {
            return;
        }

        html.Append("<td style=\"padding:0 10px;\"><a href=\"").Append(href);
        html.Append("\" target=\"_top\" style=\"text-decoration:none;\"><img src=\"").Append(WebUtility.HtmlEncode(src));
        html.Append("\" alt=\"").Append(WebUtility.HtmlEncode(alt));
        html.Append("\" style=\"display:block;border:0;height:auto;max-width:220px;\" /></a></td>");
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
