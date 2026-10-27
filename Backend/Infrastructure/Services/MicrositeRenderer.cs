using System.Globalization;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Entourage.Application.DTOs;
using Entourage.Application.Invitations;
using Entourage.Domain.Entities;

namespace Entourage.Infrastructure.Services;

/// <summary>Who the microsite is shown to. Null guest = the public version.</summary>
public sealed record MicrositeViewer(
    string EventName,
    string? GuestName = null,
    string? Position = null,
    string? Company = null,
    string? RsvpStatus = null,
    string? Token = null)
{
    public bool IsGuest => Token is not null;
}

/// <summary>Extra context for the reply pages.</summary>
/// <param name="Reply">"accept" or "decline" on a confirm page: the page becomes the reply form.</param>
/// <param name="AskReason">Show the decline reason box.</param>
/// <param name="HasBadge">The guest's type has an E-Badge design (download button).</param>
/// <param name="WalletReady">Apple Wallet is set up (Wallet button, Apple devices only).</param>
public sealed record MicrositeRenderOptions(string? Reply = null, bool AskReason = false, bool HasBadge = false, bool WalletReady = false);

/// <summary>
/// Turns a microsite page into HTML: the desktop layout (1200 px) on wide screens, the phone layout
/// (390 px) on narrow ones, each scaled to the screen. Every value from the design is checked or escaped.
/// </summary>
public static partial class MicrositeRenderer
{
    public static readonly string[] BuiltInFonts = ["Arial", "Georgia", "Times New Roman", "Helvetica", "Verdana", "Trebuchet MS"];

    /// <summary>
    /// Sends a confirm form to the reply API, then opens the next page. Works for the built-in confirm page
    /// and for designed pages (which repeat the reason box and button in both layouts: the visible one counts).
    /// Without JavaScript the form posts normally.
    /// </summary>
    public const string ConfirmScript = """
        <script>
        (function () {
          var form = document.getElementById('rsvp-form');
          var error = document.getElementById('rsvp-error');
          if (!form || !window.fetch) return;
          function visible(list) {
            for (var i = 0; i < list.length; i++) { if (list[i].offsetParent !== null) return list[i]; }
            return list[0] || null;
          }
          form.addEventListener('submit', function (event) {
            event.preventDefault();
            var buttons = form.querySelectorAll('button[type=submit]');
            var labels = [];
            buttons.forEach(function (button, index) { labels[index] = button.textContent; button.disabled = true; button.textContent = 'Saving…'; });
            if (error) error.hidden = true;
            var reason = visible(form.querySelectorAll('textarea[name=reason]'));
            fetch('/rsvp/confirm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify({ g: form.g.value, r: form.r.value, reason: reason ? reason.value : null })
            })
              .then(function (response) {
                return response.json().then(function (data) { return { ok: response.ok, data: data }; });
              })
              .then(function (result) {
                if (result.ok && result.data.next) {
                  window.location.replace(result.data.next);
                  return;
                }
                throw new Error(result.data && result.data.message ? result.data.message : 'Your reply could not be saved.');
              })
              .catch(function (problem) {
                if (error) {
                  error.textContent = problem && problem.message ? problem.message : 'Your reply could not be saved. Check your connection and try again.';
                  error.hidden = false;
                }
                buttons.forEach(function (button, index) { button.disabled = false; button.textContent = labels[index]; });
              });
          });
        })();
        </script>
        """;

    /// <summary>Shows elements marked for Apple devices only (the Wallet button).</summary>
    private const string AppleScript = """
        <script>
        (function () {
          if (!/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)) return;
          document.querySelectorAll('[data-apple-only]').forEach(function (el) { el.hidden = false; });
        })();
        </script>
        """;

    /// <summary>The home page.</summary>
    public static string Body(MicrositeDesignDto design, MicrositeViewer viewer, string assetOrigin, IReadOnlySet<Guid> fontIds) =>
        Body(design.HomePage(), viewer, assetOrigin, fontIds, new MicrositeRenderOptions());

    /// <param name="assetOrigin">Prefix for images and fonts: "" on the event domain, the API address in previews.</param>
    /// <param name="fontIds">Uploaded fonts that belong to the event (others are ignored).</param>
    public static string Body(MicrositePageDto page, MicrositeViewer viewer, string assetOrigin, IReadOnlySet<Guid> fontIds, MicrositeRenderOptions options)
    {
        var html = new StringBuilder();
        var fonts = page.Elements
            .Select(element => FontId(element.Font))
            .OfType<Guid>()
            .Where(fontIds.Contains)
            .Distinct()
            .ToArray();
        html.Append("<style>");
        foreach (var font in fonts)
        {
            html.Append(CultureInfo.InvariantCulture, $"@font-face{{font-family:'ms-{font:N}';src:url('{assetOrigin}/api/public/fonts/{font}');font-display:swap;}}");
        }

        var background = Color(page.Background) ?? "#FFFFFF";
        html.Append(CultureInfo.InvariantCulture, $$"""
            body{margin:0;background:{{background}};}
            .ms{position:relative;margin:0 auto;overflow:hidden;background:{{background}};}
            .ms-m{display:none}
            @media (max-width:760px){.ms-d{display:none}.ms-m{display:block} }
            .ms .e{position:absolute;box-sizing:border-box;}
            .ms .t{white-space:pre-wrap;overflow-wrap:anywhere;}
            .ms img.i{display:block;width:100%;height:100%;}
            .ms .b{display:flex;align-items:center;justify-content:center;text-align:center;text-decoration:none;cursor:pointer;border:0;padding:0;margin:0;}
            .ms .b[hidden]{display:none;}
            .ms .b:disabled{opacity:.6;cursor:wait;}
            .ms .b:focus-visible,.ms textarea:focus-visible{outline:3px solid #2563eb;outline-offset:2px;}
            .ms img.q{display:block;width:100%;height:100%;image-rendering:pixelated;background:#fff;}
            .ms textarea.r{resize:none;padding:10px 12px;background:#fff;}
            #rsvp-error{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:10;max-width:90vw;margin:0;padding:10px 14px;
              border-radius:10px;background:#fdecec;color:#8d2f2f;font:14px/1.4 Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.15);}
            """);
        html.Append("</style>");

        var form = options.Reply is "accept" or "decline" && viewer.Token is not null;
        if (form)
        {
            html.Append(CultureInfo.InvariantCulture, $"<form id=\"rsvp-form\" method=\"post\" action=\"{EventDomains.RsvpPath}\">");
            html.Append(CultureInfo.InvariantCulture, $"<input type=\"hidden\" name=\"g\" value=\"{viewer.Token}\"><input type=\"hidden\" name=\"r\" value=\"{options.Reply}\">");
            html.Append("<p id=\"rsvp-error\" role=\"alert\" hidden></p>");
        }

        html.Append(Layout(page, viewer, assetOrigin, fontIds, options, mobile: false));
        html.Append(Layout(page, viewer, assetOrigin, fontIds, options, mobile: true));
        if (form)
        {
            html.Append("</form>");
            html.Append(ConfirmScript);
        }

        if (options.WalletReady)
        {
            html.Append(AppleScript);
        }

        html.Append("""
            <script>
            (function () {
              function fit() {
                document.querySelectorAll('.ms').forEach(function (page) {
                  var width = parseInt(page.getAttribute('data-w'), 10);
                  var mobile = page.classList.contains('ms-m');
                  var scale = mobile ? window.innerWidth / width : Math.min(1, window.innerWidth / width);
                  page.style.zoom = String(scale);
                });
              }
              window.addEventListener('resize', fit);
              fit();
            })();
            </script>
            """);
        return html.ToString();
    }

    private static string Layout(MicrositePageDto page, MicrositeViewer viewer, string assetOrigin, IReadOnlySet<Guid> fontIds, MicrositeRenderOptions options, bool mobile)
    {
        var width = mobile ? MicrositeDesignDto.MobileWidth : MicrositeDesignDto.DesktopWidth;
        var height = Math.Clamp(mobile ? page.MobileHeight : page.DesktopHeight, 200, 20000);
        var html = new StringBuilder();
        var image = page.BackgroundAssetId is Guid backgroundId
            ? $"background-image:url('{assetOrigin}/api/public/assets/{backgroundId}');background-size:100% auto;background-repeat:no-repeat;background-position:top center;"
            : string.Empty;
        html.Append(CultureInfo.InvariantCulture, $"<div class=\"ms {(mobile ? "ms-m" : "ms-d")}\" data-w=\"{width}\" style=\"width:{width}px;height:{height}px;{image}\">");
        foreach (var element in page.Elements.Take(400))
        {
            var frame = mobile ? element.Mobile : element.Desktop;
            if (frame.Hidden || !Visible(element, viewer))
            {
                continue;
            }

            html.Append(Element(element, frame, viewer, assetOrigin, fontIds, options));
        }

        html.Append("</div>");
        return html.ToString();
    }

    /// <summary>Visibility rule plus guest-only elements (names, QR and reply buttons) on the public page.</summary>
    public static bool Visible(MicrositeElementDto element, MicrositeViewer viewer)
    {
        var guestOnly = element.Kind is "guestName" or "qr" or "reasonBox"
            || (element.Kind == "button" && element.Action is "accept" or "decline" or "badge" or "invitation" or "confirm" or "download" or "wallet" or "home");
        if (!viewer.IsGuest && guestOnly)
        {
            return false;
        }

        var acceptedOnly = element.Kind == "qr" || (element.Kind == "button" && element.Action is "badge" or "download" or "wallet");
        return (element.Show ?? "always") switch
        {
            "public" => !viewer.IsGuest,
            "pending" => viewer.IsGuest && (viewer.RsvpStatus ?? GuestRsvp.Pending) == GuestRsvp.Pending,
            "accepted" => viewer.IsGuest && viewer.RsvpStatus == GuestRsvp.Accepted,
            "declined" => viewer.IsGuest && viewer.RsvpStatus == GuestRsvp.Declined,
            _ => !acceptedOnly || viewer.RsvpStatus == GuestRsvp.Accepted,
        };
    }

    private static string Element(MicrositeElementDto element, MicrositeFrameDto frame, MicrositeViewer viewer, string assetOrigin, IReadOnlySet<Guid> fontIds, MicrositeRenderOptions options)
    {
        var box = string.Create(
            CultureInfo.InvariantCulture,
            $"left:{Num(frame.X)}px;top:{Num(frame.Y)}px;width:{Num(Math.Max(1, frame.W))}px;height:{Num(Math.Max(1, frame.H))}px;");
        var opacity = element.Opacity is double value && value is >= 0 and < 1 ? string.Create(CultureInfo.InvariantCulture, $"opacity:{value:0.##};") : string.Empty;
        var radius = element.Radius is double r && r > 0 ? string.Create(CultureInfo.InvariantCulture, $"border-radius:{Num(r)}px;overflow:hidden;") : string.Empty;
        var border = Color(element.BorderColor) is { } borderColor && element.BorderWidth is double borderWidth && borderWidth > 0
            ? string.Create(CultureInfo.InvariantCulture, $"border:{Num(Math.Min(borderWidth, 40))}px solid {borderColor};")
            : string.Empty;
        var fill = Color(element.Background) is { } background ? $"background:{background};" : string.Empty;

        switch (element.Kind)
        {
            case "text":
            case "guestName":
            {
                var text = Fill(element.Text ?? string.Empty, viewer);
                return $"<div class=\"e t\" style=\"{box}{TextStyle(element, frame, fontIds)}{opacity}\">{WebUtility.HtmlEncode(text)}</div>";
            }

            case "image" when element.AssetId is Guid assetId:
            {
                var fit = element.Fit is "contain" or "fill" ? element.Fit : "cover";
                return $"<div class=\"e\" style=\"{box}{radius}{opacity}\"><img class=\"i\" src=\"{assetOrigin}/api/public/assets/{assetId}\" alt=\"\" style=\"object-fit:{fit};\"></div>";
            }

            case "qr" when viewer.Token is not null:
                return $"<div class=\"e\" style=\"{box}{radius}{opacity}\"><img class=\"q\" src=\"{EventDomains.QrPath}?g={viewer.Token}\" alt=\"Your check-in QR code\"></div>";

            case "reasonBox" when options.Reply == "decline" && options.AskReason:
            {
                var placeholder = WebUtility.HtmlEncode(element.Text ?? "Let us know why you can't attend (optional)");
                var reasonBorder = border.Length > 0 ? border : "border:1px solid #D6D3CC;";
                return $"<textarea class=\"e r\" name=\"reason\" maxlength=\"500\" aria-label=\"Reason (optional)\" placeholder=\"{placeholder}\" style=\"{box}{reasonBorder}{radius}{TextStyle(element, frame, fontIds)}{opacity}\"></textarea>";
            }

            case "button" when element.Action == "confirm":
            {
                if (options.Reply is not ("accept" or "decline"))
                {
                    return string.Empty;
                }

                return $"<button type=\"submit\" class=\"e b\" style=\"{box}{fill}{border}{radius}{TextStyle(element, frame, fontIds)}{opacity}\">{WebUtility.HtmlEncode(Fill(element.Label ?? "Confirm", viewer))}</button>";
            }

            case "button":
            {
                if (element.Action == "download" && !options.HasBadge)
                {
                    return string.Empty;
                }

                if (element.Action == "wallet" && !options.WalletReady)
                {
                    return string.Empty;
                }

                var href = Href(element, viewer);
                if (href is null)
                {
                    return string.Empty;
                }

                var external = element.Action == "link" ? " target=\"_blank\" rel=\"noopener noreferrer\"" : string.Empty;
                var apple = element.Action == "wallet" ? " hidden data-apple-only" : string.Empty;
                return $"<a class=\"e b\" href=\"{WebUtility.HtmlEncode(href)}\"{external}{apple} style=\"{box}{fill}{border}{radius}{TextStyle(element, frame, fontIds)}{opacity}\">{WebUtility.HtmlEncode(Fill(element.Label ?? "Button", viewer))}</a>";
            }

            case "shape":
                return $"<div class=\"e\" style=\"{box}{fill}{border}{radius}{opacity}\"></div>";

            default:
                return string.Empty;
        }
    }

    private static string? Href(MicrositeElementDto element, MicrositeViewer viewer)
    {
        var token = viewer.Token;
        return element.Action switch
        {
            "accept" when token is not null => $"{EventDomains.RsvpPath}?g={token}&r=accept",
            "decline" when token is not null => $"{EventDomains.RsvpPath}?g={token}&r=decline",
            "badge" when token is not null => $"{EventDomains.BadgePath}?g={token}",
            "invitation" when token is not null => $"{EventDomains.InvitationPath}?g={token}&view=invitation",
            "download" when token is not null => $"{EventDomains.BadgeImagePath}?g={token}&download=1",
            "wallet" when token is not null => $"{EventDomains.WalletPath}?g={token}",
            "home" when token is not null => $"{EventDomains.InvitationPath}?g={token}",
            "link" => SafeUrl(element.Url),
            _ => null,
        };
    }

    /// <summary>Only web, email and phone links; anything else (javascript:, data:) is dropped.</summary>
    public static string? SafeUrl(string? url)
    {
        var value = url?.Trim();
        if (string.IsNullOrEmpty(value) || value.Length > 2000)
        {
            return null;
        }

        if (value.StartsWith('/') && !value.StartsWith("//", StringComparison.Ordinal))
        {
            return value;
        }

        return Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" or "mailto" or "tel" ? uri.AbsoluteUri : null;
    }

    private static string TextStyle(MicrositeElementDto element, MicrositeFrameDto frame, IReadOnlySet<Guid> fontIds)
    {
        var size = Math.Clamp(frame.FontSize ?? element.FontSize ?? 18, 6, 400);
        var weight = element.FontWeight is "bold" or "700" ? "700" : element.FontWeight is "600" or "semibold" ? "600" : element.FontWeight is "300" or "light" ? "300" : "400";
        var align = element.Align is "center" or "right" or "justify" ? element.Align : "left";
        var lineHeight = element.LineHeight is double line && line is > 0.5 and < 4 ? line : 1.35;
        var spacing = element.LetterSpacing is double letter && letter is > -10 and < 50 ? letter : 0;
        var color = Color(element.Color) ?? "#111111";
        var italic = element.Italic == true ? "font-style:italic;" : string.Empty;
        return string.Create(
            CultureInfo.InvariantCulture,
            $"font-family:{FontFamily(element.Font, fontIds)};font-size:{Num(size)}px;font-weight:{weight};{italic}color:{color};text-align:{align};line-height:{lineHeight:0.###};letter-spacing:{Num(spacing)}px;");
    }

    private static string FontFamily(string? font, IReadOnlySet<Guid> fontIds)
    {
        if (FontId(font) is Guid id && fontIds.Contains(id))
        {
            return $"'ms-{id:N}',Arial,sans-serif";
        }

        var name = BuiltInFonts.FirstOrDefault(item => string.Equals(item, font, StringComparison.OrdinalIgnoreCase)) ?? "Arial";
        return $"'{name}',Arial,sans-serif";
    }

    public static Guid? FontId(string? font) =>
        font is not null && font.StartsWith("font:", StringComparison.Ordinal) && Guid.TryParse(font[5..], out var id) ? id : null;

    private static string Fill(string template, MicrositeViewer viewer) =>
        template
            .Replace("{name}", viewer.GuestName ?? string.Empty, StringComparison.Ordinal)
            .Replace("{position}", viewer.Position ?? string.Empty, StringComparison.Ordinal)
            .Replace("{company}", viewer.Company ?? string.Empty, StringComparison.Ordinal)
            .Replace("{event}", viewer.EventName, StringComparison.Ordinal);

    public static string? Color(string? value) => value is not null && HexColor().IsMatch(value) ? value.ToUpperInvariant() : null;

    private static string Num(double value) => Math.Round(value, 2).ToString(CultureInfo.InvariantCulture);

    /// <summary>Every uploaded image the design uses, on every page (for ownership checks and keeping the files).</summary>
    public static IEnumerable<Guid> AssetIds(MicrositeDesignDto? design)
    {
        if (design is null)
        {
            yield break;
        }

        foreach (var page in new[] { design.HomePage() }.Concat(design.Pages ?? []))
        {
            if (page.BackgroundAssetId is Guid background)
            {
                yield return background;
            }

            foreach (var element in page.Elements ?? [])
            {
                if (element.AssetId is Guid id)
                {
                    yield return id;
                }
            }
        }
    }

    [GeneratedRegex("^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$")]
    private static partial Regex HexColor();
}
