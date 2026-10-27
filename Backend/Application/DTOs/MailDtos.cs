namespace Entourage.Application.DTOs;

/// <summary>Outgoing mail settings as shown to the admin. Passwords and secrets are never returned.</summary>
public sealed record MailSettingsDto(
    bool Configured,
    string Host,
    int Port,
    bool EnableSsl,
    string? Username,
    bool HasPassword,
    string FromEmail,
    string? FromName,
    DateTime? UpdatedOn,
    string Provider = "smtp",
    string? GraphTenantId = null,
    string? GraphClientId = null,
    bool HasGraphSecret = false);

/// <param name="Provider">"smtp" or "graph" (Microsoft 365 through Microsoft Graph).</param>
/// <param name="Password">SMTP password. Leave empty to keep the saved one.</param>
/// <param name="GraphClientSecret">Graph client secret. Leave empty to keep the saved one.</param>
public sealed record SaveMailSettingsRequest(
    string Host,
    int Port,
    bool EnableSsl,
    string? Username,
    string? Password,
    string FromEmail,
    string? FromName,
    string Provider = "smtp",
    string? GraphTenantId = null,
    string? GraphClientId = null,
    string? GraphClientSecret = null);

public sealed record SendTestEmailRequest(string To);

public sealed record GuestMailItem(Guid GuestId, string Name, string Email);

public sealed record BulkEmailResult(
    bool Complete,
    GuestMailItem[] Sent,
    GuestBlockDto[] Failed,
    GuestBlockDto[] Skipped,
    string Message);
