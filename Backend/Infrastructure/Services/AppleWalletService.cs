using System.IO.Compression;
using System.Security.Cryptography;
using System.Security.Cryptography.Pkcs;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using System.Text.RegularExpressions;
using Entourage.Application;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SkiaSharp;

namespace Entourage.Infrastructure.Services;

public sealed record WalletSettingsDto(
    bool Configured,
    string? TeamId,
    string? PassTypeId,
    string? OrganizationName,
    string? CertificateSubject,
    DateTime? CertificateExpiresOn,
    DateTime? UpdatedOn);

/// <summary>What goes on a guest's Wallet pass.</summary>
public sealed record WalletPassData(
    Guid SerialNumber,
    string EventName,
    DateOnly EventDate,
    string GuestName,
    string? Company,
    string? Seat,
    string CheckInCode);

/// <summary>
/// Apple Wallet E-Badge passes (.pkpass). Off until an admin uploads the Pass Type ID certificate (.p12),
/// its password and Apple's WWDR certificate under Settings. Each pass carries the guest's check-in QR.
/// </summary>
public sealed partial class AppleWalletService(
    AppDbContext db,
    IDataProtectionProvider protection,
    IMemoryCache cache,
    ILogger<AppleWalletService> logger)
{
    private const string ReadyKey = "apple-wallet-ready";
    private readonly IDataProtector protector = protection.CreateProtector("Entourage.WalletSettings.Certificate.v1");

    public async Task<WalletSettingsDto> GetAsync(CancellationToken cancellationToken)
    {
        var settings = await db.WalletSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        if (settings is null)
        {
            return new WalletSettingsDto(false, null, null, null, null, null, null);
        }

        string? subject = null;
        try
        {
            using var certificate = LoadCertificate(settings);
            subject = certificate.GetNameInfo(X509NameType.SimpleName, false);
        }
        catch (Exception error) when (error is CryptographicException or AppException)
        {
            logger.LogWarning(error, "The saved Wallet certificate could not be read.");
        }

        return new WalletSettingsDto(true, settings.TeamId, settings.PassTypeId, settings.OrganizationName, subject, settings.CertificateExpiresOn, settings.UpdatedOn);
    }

    /// <param name="certificate">The .p12 file. Optional when one is already saved (only names change).</param>
    /// <param name="wwdr">Apple WWDR intermediate certificate (.cer). Optional when one is already saved.</param>
    public async Task<WalletSettingsDto> SaveAsync(
        string teamId,
        string passTypeId,
        string organizationName,
        byte[]? certificate,
        string? password,
        byte[]? wwdr,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        teamId = (teamId ?? string.Empty).Trim().ToUpperInvariant();
        passTypeId = (passTypeId ?? string.Empty).Trim();
        organizationName = (organizationName ?? string.Empty).Trim();
        if (!TeamIdPattern().IsMatch(teamId)) errors["teamId"] = ["Enter the 10-character Team ID from your Apple Developer account."];
        if (!PassTypePattern().IsMatch(passTypeId)) errors["passTypeId"] = ["Enter the Pass Type ID, e.g. pass.com.entourageintl.invitation."];
        if (organizationName.Length is 0 or > 200) errors["organizationName"] = ["Enter the organisation name shown on passes."];

        var settings = await db.WalletSettings.FirstOrDefaultAsync(cancellationToken);
        if (settings is null && certificate is null) errors["certificate"] = ["Upload the Pass Type ID certificate (.p12)."];
        if (settings is null && wwdr is null) errors["wwdr"] = ["Upload Apple's WWDR certificate (.cer)."];

        DateTime? expires = null;
        if (certificate is not null)
        {
            try
            {
                using var loaded = X509CertificateLoader.LoadPkcs12(certificate, password, KeyFlags);
                if (!loaded.HasPrivateKey) errors["certificate"] = ["This .p12 has no private key. Export it again from Keychain including the key."];
                else if (loaded.NotAfter.ToUniversalTime() < DateTime.UtcNow) errors["certificate"] = ["This certificate has expired. Create a new one in your Apple Developer account."];
                expires = loaded.NotAfter.ToUniversalTime();
            }
            catch (CryptographicException)
            {
                errors["certificate"] = ["The certificate could not be opened. Check the file and its password."];
            }
        }

        if (wwdr is not null)
        {
            try
            {
                using var _ = X509CertificateLoader.LoadCertificate(wwdr);
            }
            catch (CryptographicException)
            {
                errors["wwdr"] = ["The WWDR certificate could not be read. Download the .cer file from Apple again."];
            }
        }

        if (errors.Count > 0)
        {
            throw AppException.Validation(errors);
        }

        settings ??= db.WalletSettings.Add(new WalletSettings { Id = Guid.CreateVersion7() }).Entity;
        settings.TeamId = teamId;
        settings.PassTypeId = passTypeId;
        settings.OrganizationName = organizationName;
        if (certificate is not null)
        {
            settings.ProtectedCertificate = protector.Protect(Convert.ToBase64String(certificate));
            settings.ProtectedCertificatePassword = string.IsNullOrEmpty(password) ? null : protector.Protect(password);
            settings.CertificateExpiresOn = expires!.Value;
        }

        if (wwdr is not null)
        {
            settings.WwdrCertificate = Convert.ToBase64String(wwdr);
        }

        settings.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        cache.Remove(ReadyKey);
        return await GetAsync(cancellationToken);
    }

    public async Task ClearAsync(CancellationToken cancellationToken)
    {
        var settings = await db.WalletSettings.ToListAsync(cancellationToken);
        db.WalletSettings.RemoveRange(settings);
        await db.SaveChangesAsync(cancellationToken);
        cache.Remove(ReadyKey);
    }

    /// <summary>True when passes can be made (settings saved and the certificate not expired). Cached briefly.</summary>
    public async Task<bool> IsReadyAsync(CancellationToken cancellationToken)
    {
        if (cache.TryGetValue(ReadyKey, out bool ready))
        {
            return ready;
        }

        ready = await db.WalletSettings.AsNoTracking().AnyAsync(item => item.CertificateExpiresOn > DateTime.UtcNow, cancellationToken);
        cache.Set(ReadyKey, ready, TimeSpan.FromMinutes(1));
        return ready;
    }

    /// <summary>A signed .pkpass for one guest, or null when Wallet is not set up.</summary>
    public async Task<byte[]?> BuildPassAsync(WalletPassData data, CancellationToken cancellationToken)
    {
        var settings = await db.WalletSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        if (settings is null || settings.CertificateExpiresOn <= DateTime.UtcNow)
        {
            return null;
        }

        using var certificate = LoadCertificate(settings);
        using var wwdr = X509CertificateLoader.LoadCertificate(Convert.FromBase64String(settings.WwdrCertificate));
        return BuildPass(data, settings.TeamId, settings.PassTypeId, settings.OrganizationName, certificate, wwdr);
    }

    /// <summary>Builds and signs the pass package. Separate from storage so it can be tested with a test certificate.</summary>
    public static byte[] BuildPass(WalletPassData data, string teamId, string passTypeId, string organizationName, X509Certificate2 certificate, X509Certificate2 wwdr)
    {
        var files = new Dictionary<string, byte[]>(StringComparer.Ordinal)
        {
            ["pass.json"] = PassJson(data, teamId, passTypeId, organizationName),
            ["icon.png"] = Icon(29),
            ["icon@2x.png"] = Icon(58),
            ["icon@3x.png"] = Icon(87),
        };

        var manifest = JsonSerializer.SerializeToUtf8Bytes(files.ToDictionary(
            file => file.Key,
            file => Convert.ToHexString(SHA1.HashData(file.Value)).ToLowerInvariant()));

        var cms = new SignedCms(new ContentInfo(manifest), detached: true);
        var signer = new CmsSigner(SubjectIdentifierType.IssuerAndSerialNumber, certificate)
        {
            IncludeOption = X509IncludeOption.EndCertOnly,
            DigestAlgorithm = new Oid("2.16.840.1.101.3.4.2.1"), // SHA-256
        };
        signer.Certificates.Add(wwdr);
        signer.SignedAttributes.Add(new Pkcs9SigningTime(DateTime.UtcNow));
        cms.ComputeSignature(signer);

        using var output = new MemoryStream();
        using (var zip = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, bytes) in files)
            {
                Add(zip, name, bytes);
            }

            Add(zip, "manifest.json", manifest);
            Add(zip, "signature", cms.Encode());
        }

        return output.ToArray();
    }

    private static void Add(ZipArchive zip, string name, byte[] bytes)
    {
        var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
        using var stream = entry.Open();
        stream.Write(bytes);
    }

    private static byte[] PassJson(WalletPassData data, string teamId, string passTypeId, string organizationName)
    {
        var auxiliary = new List<object>
        {
            new { key = "date", label = "DATE", value = data.EventDate.ToString("d MMM yyyy", System.Globalization.CultureInfo.InvariantCulture) },
        };
        if (!string.IsNullOrWhiteSpace(data.Seat)) auxiliary.Add(new { key = "seat", label = "SEAT", value = data.Seat });

        var secondary = new List<object> { new { key = "event", label = "EVENT", value = data.EventName } };
        if (!string.IsNullOrWhiteSpace(data.Company)) secondary.Add(new { key = "company", label = "COMPANY", value = data.Company });

        var barcode = new { format = "PKBarcodeFormatQR", message = data.CheckInCode, messageEncoding = "iso-8859-1", altText = "Show at the entrance" };
        var pass = new
        {
            formatVersion = 1,
            passTypeIdentifier = passTypeId,
            serialNumber = data.SerialNumber.ToString("N"),
            teamIdentifier = teamId,
            organizationName,
            description = $"E-Badge · {data.EventName}",
            logoText = data.EventName,
            foregroundColor = "rgb(255, 255, 255)",
            labelColor = "rgb(203, 168, 134)",
            backgroundColor = "rgb(6, 17, 29)",
            sharingProhibited = true,
            barcodes = new[] { barcode },
            barcode,
            eventTicket = new
            {
                primaryFields = new[] { new { key = "guest", label = "GUEST", value = data.GuestName } },
                secondaryFields = secondary,
                auxiliaryFields = auxiliary,
                backFields = new[] { new { key = "note", label = "CHECK-IN", value = "Show this pass at the entrance. It is personal and cannot be shared." } },
            },
        };
        return JsonSerializer.SerializeToUtf8Bytes(pass);
    }

    /// <summary>A simple navy square with a gold "E" (Wallet requires an icon).</summary>
    private static byte[] Icon(int size)
    {
        using var surface = SKSurface.Create(new SKImageInfo(size, size));
        var canvas = surface.Canvas;
        canvas.Clear(new SKColor(6, 17, 29));
        using var typeface = SKTypeface.FromFamilyName("Arial", SKFontStyle.Bold) ?? SKTypeface.Default;
        using var font = new SKFont(typeface, size * 0.62f);
        using var paint = new SKPaint { Color = new SKColor(203, 168, 134), IsAntialias = true };
        var width = font.MeasureText("E");
        var metrics = font.Metrics;
        canvas.DrawText("E", (size - width) / 2, (size - (metrics.Descent - metrics.Ascent)) / 2 - metrics.Ascent, SKTextAlign.Left, font, paint);
        using var image = surface.Snapshot();
        using var png = image.Encode(SKEncodedImageFormat.Png, 100);
        return png.ToArray();
    }

    private X509Certificate2 LoadCertificate(WalletSettings settings)
    {
        try
        {
            var bytes = Convert.FromBase64String(protector.Unprotect(settings.ProtectedCertificate));
            var password = settings.ProtectedCertificatePassword is null ? null : protector.Unprotect(settings.ProtectedCertificatePassword);
            return X509CertificateLoader.LoadPkcs12(bytes, password, KeyFlags);
        }
        catch (CryptographicException error)
        {
            logger.LogError(error, "The saved Wallet certificate could not be decrypted or opened.");
            throw new AppException(
                "The saved Wallet certificate can no longer be read (the server's encryption keys changed). Upload it again under Settings.",
                StatusCodes.Status409Conflict);
        }
    }

    private static X509KeyStorageFlags KeyFlags =>
        OperatingSystem.IsWindows() ? X509KeyStorageFlags.EphemeralKeySet : X509KeyStorageFlags.DefaultKeySet;

    [GeneratedRegex("^[A-Z0-9]{10}$")]
    private static partial Regex TeamIdPattern();

    [GeneratedRegex(@"^pass\.[A-Za-z0-9][A-Za-z0-9.\-]{2,150}$")]
    private static partial Regex PassTypePattern();
}
