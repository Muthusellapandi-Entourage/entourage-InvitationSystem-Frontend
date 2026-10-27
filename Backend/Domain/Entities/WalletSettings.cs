namespace Entourage.Domain.Entities;

/// <summary>
/// Apple Wallet settings for the whole application (at most one row). The pass signing certificate
/// (.p12) and its password are stored encrypted with ASP.NET Core Data Protection.
/// </summary>
public sealed class WalletSettings
{
    public Guid Id { get; set; }

    /// <summary>Apple Developer Team ID, e.g. "A1B2C3D4E5".</summary>
    public string TeamId { get; set; } = string.Empty;

    /// <summary>Pass Type ID, e.g. "pass.com.entourageintl.invitation".</summary>
    public string PassTypeId { get; set; } = string.Empty;

    /// <summary>Shown on the pass and in Wallet, e.g. "Entourage International".</summary>
    public string OrganizationName { get; set; } = string.Empty;

    /// <summary>The Pass Type ID certificate with its private key (.p12), encrypted.</summary>
    public string ProtectedCertificate { get; set; } = string.Empty;

    public string? ProtectedCertificatePassword { get; set; }

    /// <summary>Apple's WWDR intermediate certificate (public), base64 DER.</summary>
    public string WwdrCertificate { get; set; } = string.Empty;

    public DateTime CertificateExpiresOn { get; set; }

    public DateTime UpdatedOn { get; set; }
}
