using Entourage.Application.DTOs;

namespace Entourage.Application.Interfaces;

public interface IMailSettingsService
{
    Task<MailSettingsDto> GetAsync(CancellationToken cancellationToken);

    Task<MailSettingsDto> SaveAsync(SaveMailSettingsRequest request, CancellationToken cancellationToken);

    Task SendTestAsync(SendTestEmailRequest request, CancellationToken cancellationToken);

    /// <summary>Settings ready to send with, password decrypted. Null when mail is not set up.</summary>
    Task<SmtpAccount?> GetAccountAsync(CancellationToken cancellationToken);
}

public interface IGuestMailer
{
    Task<BulkEmailResult> SendInvitationsAsync(
        Guid eventId,
        GuestIdsRequest request,
        string assetOrigin,
        string appOrigin,
        CancellationToken cancellationToken,
        bool reminder = false);
}

/// <summary>Sends mail. Swapped for a fake in tests so nothing leaves the machine.</summary>
public interface IMailTransport
{
    /// <summary>Sends every message over one connection. Returns an error text per failed message id.</summary>
    Task<IReadOnlyDictionary<Guid, string>> SendManyAsync(
        SmtpAccount account,
        IReadOnlyList<OutgoingMail> messages,
        CancellationToken cancellationToken);
}

/// <summary>
/// Everything needed to send, secrets decrypted. <see cref="Provider"/> picks the transport:
/// "smtp" uses Host/Port/Username/Password; "graph" uses the Microsoft Graph tenant, client and secret.
/// </summary>
public sealed record SmtpAccount(
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

public sealed record OutgoingMail(Guid Id, string ToEmail, string? ToName, string Subject, string HtmlBody);
