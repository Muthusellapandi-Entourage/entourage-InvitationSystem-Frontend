namespace Entourage.Domain.Entities;

/// <summary>
/// Outgoing mail (SMTP) settings for the whole application. There is at most one row.
/// The password is stored encrypted with ASP.NET Core Data Protection, never in plain text.
/// </summary>
public sealed class MailSettings
{
    public Guid Id { get; set; }

    /// <summary>"smtp" (any SMTP server) or "graph" (Microsoft 365 through Microsoft Graph).</summary>
    public string Provider { get; set; } = MailProviders.Smtp;

    /// <summary>Microsoft Entra (Azure AD) tenant ID or domain, for Graph.</summary>
    public string? GraphTenantId { get; set; }

    /// <summary>Application (client) ID of the app registration, for Graph.</summary>
    public string? GraphClientId { get; set; }

    /// <summary>Client secret of the app registration, encrypted with Data Protection.</summary>
    public string? ProtectedGraphSecret { get; set; }

    public string Host { get; set; } = string.Empty;

    public int Port { get; set; }

    /// <summary>Use STARTTLS (port 587 on Office 365 and Gmail).</summary>
    public bool EnableSsl { get; set; }

    public string? Username { get; set; }

    public string? ProtectedPassword { get; set; }

    /// <summary>The address guests see the invitation coming from.</summary>
    public string FromEmail { get; set; } = string.Empty;

    public string? FromName { get; set; }

    public DateTime UpdatedOn { get; set; }
}

public static class MailProviders
{
    public const string Smtp = "smtp";

    public const string Graph = "graph";
}
