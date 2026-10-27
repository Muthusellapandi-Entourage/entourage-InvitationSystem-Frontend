using System.IO.Compression;
using System.Security.Cryptography;
using System.Security.Cryptography.Pkcs;
using System.Security.Cryptography.X509Certificates;
using Entourage.Application.DTOs;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Services;
using SkiaSharp;
using Xunit;

namespace Entourage.Tests;

public sealed class GuestJourneyTests
{
    [Fact]
    public void Badge_is_drawn_at_the_design_size_with_a_readable_qr()
    {
        var design = new BadgeDesignDto(
            600,
            900,
            null,
            null,
            new ImagePlacementDto(200, 650, 200, 200, true),
            new BadgeTextDto(40, 80, 520, 120, "Arial", 40, "bold", "#111111", "center", "middle"),
            null);

        var png = BadgeRenderer.Render(design, null, "Salman K Juma", "3f2a9c1ed7b84e0f9a1b2c3d4e5f6a7b");

        using var bitmap = SKBitmap.Decode(png);
        Assert.Equal(600, bitmap.Width);
        Assert.Equal(900, bitmap.Height);
        // The QR area has dark modules; the margin above the name stays white.
        Assert.Contains(Enumerable.Range(200, 200), x => bitmap.GetPixel(x, 750).Red < 60);
        Assert.Equal(SKColors.White, bitmap.GetPixel(5, 5));
    }

    [Fact]
    public void Long_names_wrap_on_word_boundaries()
    {
        var lines = BadgeRenderer.Wrap("Abdulla Ahmed Al Owaid", 100, text => text.Length * 10);
        Assert.Equal(new[] { "Abdulla", "Ahmed Al", "Owaid" }, lines);
    }

    [Fact]
    public void Wallet_pass_is_a_signed_package_with_the_check_in_code()
    {
        using var key = RSA.Create(2048);
        var request = new CertificateRequest("CN=Pass Type ID: pass.test.example", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));
        using var wwdrKey = RSA.Create(2048);
        using var wwdr = new CertificateRequest("CN=Test WWDR", wwdrKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)
            .CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));

        var bytes = AppleWalletService.BuildPass(
            new WalletPassData(Guid.NewGuid(), "Excellence Awards", new DateOnly(2026, 11, 5), "Salman K Juma", "Sample Company", "Table 1 · Seat 7", "code123456789"),
            "A1B2C3D4E5",
            "pass.test.example",
            "Entourage",
            certificate,
            wwdr);

        using var zip = new ZipArchive(new MemoryStream(bytes));
        var names = zip.Entries.Select(entry => entry.FullName).ToHashSet();
        Assert.Superset(new HashSet<string> { "pass.json", "manifest.json", "signature", "icon.png", "icon@2x.png" }, names);

        var passJson = Read(zip, "pass.json");
        Assert.Contains("code123456789", System.Text.Encoding.UTF8.GetString(passJson));

        var cms = new SignedCms(new ContentInfo(Read(zip, "manifest.json")), detached: true);
        cms.Decode(Read(zip, "signature"));
        cms.CheckSignature(verifySignatureOnly: true);
    }

    private static byte[] Read(ZipArchive zip, string name)
    {
        using var stream = zip.GetEntry(name)!.Open();
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return buffer.ToArray();
    }

    private static MicrositeDesignDto Site(params MicrositeElementDto[] elements) => new("Awards", "#FFFFFF", null, 1000, 1000, elements);

    private static MicrositeFrameDto Frame => new(10, 10, 200, 50);

    [Fact]
    public void Public_microsite_hides_names_and_rsvp_buttons_and_guests_get_their_own_links()
    {
        var design = Site(
            new MicrositeElementDto("a", "guestName", Frame, Frame, Text: "Dear {name},"),
            new MicrositeElementDto("b", "button", Frame, Frame, Label: "Accept", Action: "accept"),
            new MicrositeElementDto("c", "text", Frame, Frame, Text: "Welcome to {event}"));

        var publicPage = MicrositeRenderer.Body(design, new MicrositeViewer("Awards"), string.Empty, new HashSet<Guid>());
        Assert.DoesNotContain("Dear", publicPage, StringComparison.Ordinal);
        Assert.DoesNotContain("rsvp.html", publicPage, StringComparison.Ordinal);
        Assert.Contains("Welcome to Awards", publicPage, StringComparison.Ordinal);

        var guestPage = MicrositeRenderer.Body(
            design,
            new MicrositeViewer("Awards", "Lina <b>Haddad</b>", null, null, GuestRsvp.Pending, "a1b2c3d4e5f60718"),
            string.Empty,
            new HashSet<Guid>());
        Assert.Contains("Dear Lina &lt;b&gt;Haddad&lt;/b&gt;,", guestPage, StringComparison.Ordinal);
        Assert.Contains("/rsvp.html?g=a1b2c3d4e5f60718&amp;r=accept", guestPage, StringComparison.Ordinal);
    }

    [Fact]
    public void Designed_reply_pages_become_the_reply_form_and_the_thank_you_page()
    {
        var page = new MicrositePageDto(
            "decline",
            null,
            null,
            900,
            1000,
            [
                new MicrositeElementDto("r", "reasonBox", Frame, Frame, Text: "Why?"),
                new MicrositeElementDto("c", "button", Frame, Frame, Label: "I cannot attend", Action: "confirm"),
            ]);
        var guest = new MicrositeViewer("Awards", "Lina", null, null, GuestRsvp.Pending, "a1b2c3d4e5f60718");

        var confirm = MicrositeRenderer.Body(page, guest, string.Empty, new HashSet<Guid>(), new MicrositeRenderOptions("decline", AskReason: true));
        Assert.Contains("id=\"rsvp-form\"", confirm, StringComparison.Ordinal);
        Assert.Contains("name=\"r\" value=\"decline\"", confirm, StringComparison.Ordinal);
        Assert.Contains("textarea class=\"e r\" name=\"reason\"", confirm, StringComparison.Ordinal);
        Assert.Contains("button type=\"submit\"", confirm, StringComparison.Ordinal);
        Assert.Contains("/rsvp/confirm", confirm, StringComparison.Ordinal);

        // Without "ask for a reason" the box is left out.
        Assert.DoesNotContain("name=\"reason\"", MicrositeRenderer.Body(page, guest, string.Empty, new HashSet<Guid>(), new MicrositeRenderOptions("decline")), StringComparison.Ordinal);

        var thanks = page with
        {
            Key = "thanks",
            Elements =
            [
                new MicrositeElementDto("q", "qr", Frame, Frame),
                new MicrositeElementDto("d", "button", Frame, Frame, Label: "Download", Action: "download"),
                new MicrositeElementDto("w", "button", Frame, Frame, Label: "Wallet", Action: "wallet"),
            ],
        };
        var accepted = guest with { RsvpStatus = GuestRsvp.Accepted };
        var shown = MicrositeRenderer.Body(thanks, accepted, string.Empty, new HashSet<Guid>(), new MicrositeRenderOptions(HasBadge: true, WalletReady: true));
        Assert.Contains("/check-in-qr.png?g=a1b2c3d4e5f60718", shown, StringComparison.Ordinal);
        Assert.Contains("/e-badge.png?g=a1b2c3d4e5f60718&amp;download=1", shown, StringComparison.Ordinal);
        Assert.Contains("data-apple-only", shown, StringComparison.Ordinal);
        // The QR is never shown before the guest accepts.
        Assert.DoesNotContain("check-in-qr", MicrositeRenderer.Body(thanks, guest, string.Empty, new HashSet<Guid>(), new MicrositeRenderOptions()), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("javascript:alert(1)", null)]
    [InlineData("data:text/html,hi", null)]
    [InlineData("//evil.example.com", null)]
    [InlineData("https://maps.google.com/?q=Ithra", "https://maps.google.com/?q=Ithra")]
    [InlineData("/badge.html", "/badge.html")]
    public void Microsite_links_only_allow_web_addresses(string input, string? expected)
    {
        Assert.Equal(expected, MicrositeRenderer.SafeUrl(input));
    }

    [Fact]
    public void Microsite_design_is_cleaned_before_saving()
    {
        var dirty = Site(new MicrositeElementDto("x", "script", Frame, Frame), new MicrositeElementDto("y", "shape", Frame, Frame, Background: "red;background:url(x)"));
        var clean = MicrositeService.Validate(dirty);
        Assert.Single(clean.Elements);
        Assert.Null(clean.Elements[0].Background);
    }

    [Fact]
    public void Decline_reasons_are_trimmed_and_capped()
    {
        Assert.Null(EventSiteService.CleanReason("   "));
        Assert.Equal("Travelling", EventSiteService.CleanReason("  Travelling \u0007 "));
        Assert.Equal(500, EventSiteService.CleanReason(new string('a', 900))!.Length);
    }
}
