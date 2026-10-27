namespace Entourage.Infrastructure.Authentication;

/// <summary>
/// "Sign in with Microsoft" (Microsoft Entra ID). Off until IT registers the app and fills in
/// TenantId and ClientId. Only accounts from that one directory, with an allowed email domain
/// (and, when set, in an allowed group) can sign in.
/// </summary>
public sealed class MicrosoftAuthOptions
{
    public const string SectionName = "MicrosoftAuth";

    public bool Enabled { get; set; }

    /// <summary>Directory (tenant) ID from the app registration.</summary>
    public string TenantId { get; set; } = string.Empty;

    /// <summary>Application (client) ID from the app registration.</summary>
    public string ClientId { get; set; } = string.Empty;

    /// <summary>Email domains that may sign in, e.g. "entourageintl.com".</summary>
    public string[] AllowedDomains { get; set; } = ["entourageintl.com"];

    /// <summary>Optional: only members of these Entra group object IDs may sign in. Empty = anyone in the allowed domains.</summary>
    public string[] AllowedGroupIds { get; set; } = [];

    /// <summary>Create the user on their first Microsoft sign-in. Off = an admin must add them first.</summary>
    public bool AutoCreateUsers { get; set; } = true;

    /// <summary>Keep email + password sign-in. Turn off once Microsoft sign-in works for everyone.</summary>
    public bool PasswordLogin { get; set; } = true;

    public bool IsConfigured =>
        Enabled && Guid.TryParse(TenantId, out _) && Guid.TryParse(ClientId, out _);
}
