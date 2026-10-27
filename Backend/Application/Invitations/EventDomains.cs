using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;

namespace Entourage.Application.Invitations;

/// <summary>
/// Rules and links for an event's own web address (e.g. excellenceawards2026.com). The domain's DNS
/// points at this server; guests open eventdomain/invitation.html?g={token} and reply through
/// eventdomain/rsvp.html. Links always use HTTPS.
/// </summary>
public static partial class EventDomains
{
    public const string InvitationPath = "/invitation.html";
    public const string RsvpPath = "/rsvp.html";
    public const string NameImagePath = "/guest-name.png";
    /// <summary>Reply API behind the confirm button (POST JSON: g, r, reason).</summary>
    public const string ConfirmApiPath = "/rsvp/confirm";
    /// <summary>Shown after confirming Accept: thank-you image, QR, Wallet and E-Badge download.</summary>
    public const string ThankYouPath = "/thank-you.html";
    /// <summary>Shown after confirming Decline.</summary>
    public const string DeclinedPath = "/declined.html";
    /// <summary>The guest's E-Badge page (accepted guests).</summary>
    public const string BadgePath = "/badge.html";
    /// <summary>The guest's E-Badge as a PNG; add download=1 to save it.</summary>
    public const string BadgeImagePath = "/e-badge.png";
    /// <summary>The guest's check-in QR code as a PNG.</summary>
    public const string QrPath = "/check-in-qr.png";
    /// <summary>The guest's Apple Wallet pass.</summary>
    public const string WalletPath = "/e-badge.pkpass";
    /// <summary>Answers with the event's check code so the admin can confirm the domain reaches this server.</summary>
    public const string CheckPath = "/.well-known/entourage-event";

    public static string Origin(string domain) => $"https://{domain}";

    public static string InvitationUrl(string domain, string token) => $"{Origin(domain)}{InvitationPath}?g={token}";

    public static string RsvpUrl(string domain, string token, bool accept) =>
        $"{Origin(domain)}{RsvpPath}?g={token}&r={(accept ? "accept" : "decline")}";

    /// <summary>The code the domain must answer at <see cref="CheckPath"/>.</summary>
    public static string CheckCode(Guid eventId) => $"entourage-event:{eventId:N}";

    /// <summary>
    /// Cleans what the admin typed ("https://www.Example.com/invite" → "www.example.com").
    /// Returns null with a reason when it is not a usable public domain.
    /// </summary>
    public static string? Normalize(string? input, out string? error)
    {
        error = null;
        var value = (input ?? string.Empty).Trim().ToLowerInvariant();
        if (value.Length == 0)
        {
            error = "Enter a domain, for example excellenceawards2026.com.";
            return null;
        }

        foreach (var prefix in new[] { "https://", "http://" })
        {
            if (value.StartsWith(prefix, StringComparison.Ordinal))
            {
                value = value[prefix.Length..];
            }
        }

        var cut = value.IndexOfAny(['/', '?', '#']);
        if (cut >= 0)
        {
            value = value[..cut];
        }

        value = value.TrimEnd('.');
        if (value.Contains(':', StringComparison.Ordinal))
        {
            error = "Leave out the port; the domain must work on the normal web ports (443 and 80).";
            return null;
        }

        if (IPAddress.TryParse(value, out _))
        {
            error = "Enter a domain name, not an IP address.";
            return null;
        }

        try
        {
            value = new IdnMapping().GetAscii(value);
        }
        catch (ArgumentException)
        {
            error = "That is not a valid domain name.";
            return null;
        }

        if (value.Length > 253 || !DomainPattern().IsMatch(value) || value is "localhost" || value.EndsWith(".localhost", StringComparison.Ordinal))
        {
            error = "That is not a valid public domain name. Use something like excellenceawards2026.com or invite.example.com.";
            return null;
        }

        return value;
    }

    // Labels of 1–63 letters, digits or hyphens (not at either end), at least two labels, alphabetic (or punycode) top level.
    [GeneratedRegex(@"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$")]
    private static partial Regex DomainPattern();
}
