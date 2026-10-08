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
        var html = new StringBuilder();
        html.Append("""
            <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" align="center" style="width:560px;max-width:100%;border-collapse:collapse;background:#313131;margin:0 auto;">
            """);

        var sections = 0;
        sections += AppendImage(html, Url(design.HeaderAssetId, assetUrls), "Header", 560);
        sections += AppendGuest(html, design);
        sections += AppendImage(html, Url(design.DetailsAssetId, assetUrls), "Event information", 560);
        sections += AppendButtons(html, design, assetUrls);

        if (sections == 0)
        {
            html.Append("""<tr><td style="height:120px;background:#313131;font-size:0;line-height:0;">&nbsp;</td></tr>""");
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

        html.Append("""<tr><td style="background:#313131;padding:0 0 28px;">""");
        if (design.GuestName.Enabled)
        {
            var field = design.GuestName;
            html.Append("<div data-guest-name=\"true\" style=\"padding:")
                .Append(field.TopSpacing)
                .Append("px 32px 0 ")
                .Append(field.LeftPadding)
                .Append("px;text-align:")
                .Append(field.Alignment)
                .Append(";\"><span class=\"inv-guest-name\" style=\"display:block;")
                .Append(FontStyle(field))
                .Append("\">Dear <span data-dynamic-tag=\"GuestName\">{{GuestName}}</span>,</span></div>");
        }

        if (design.GuestPosition.Enabled)
        {
            var field = design.GuestPosition;
            html.Append("<div data-guest-position=\"true\" style=\"padding:")
                .Append(field.TopSpacing)
                .Append("px 32px 0 ")
                .Append(field.LeftPadding)
                .Append("px;text-align:")
                .Append(field.Alignment)
                .Append(";\"><span class=\"inv-guest-position\" data-dynamic-tag=\"GuestPosition\" style=\"display:block;")
                .Append(FontStyle(field))
                .Append("\">{{GuestPosition}}</span></div>");
        }

        html.Append("</td></tr>");
        return 1;
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
        var (family, weight, slant) = field.Font switch
        {
            "Manifa Bold" => ("'Manifa Bold',Georgia,serif", "700", "normal"),
            "Manifa Italic" => ("'Manifa Italic',Georgia,serif", "400", "italic"),
            "Arial" => ("Arial,Helvetica,sans-serif", "400", "normal"),
            "Georgia" => ("Georgia,serif", "400", "normal"),
            "Times New Roman" => ("'Times New Roman',Times,serif", "400", "normal"),
            _ => ("Georgia,serif", "400", "normal"),
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
