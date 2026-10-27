using System.Security.Cryptography;
using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Application.Validation;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using FluentValidation;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

public sealed class MailSettingsService(
    AppDbContext db,
    IDataProtectionProvider protection,
    IMailTransport transport,
    IValidator<SaveMailSettingsRequest> saveValidator,
    IValidator<SendTestEmailRequest> testValidator) : IMailSettingsService
{
    private readonly IDataProtector protector = protection.CreateProtector("Entourage.MailSettings.Password.v1");

    public async Task<MailSettingsDto> GetAsync(CancellationToken cancellationToken)
    {
        var settings = await db.MailSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        return ToDto(settings);
    }

    public async Task<MailSettingsDto> SaveAsync(SaveMailSettingsRequest request, CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(saveValidator, request, cancellationToken);
        var settings = await db.MailSettings.FirstOrDefaultAsync(cancellationToken);
        if (settings is null)
        {
            settings = new MailSettings { Id = Guid.CreateVersion7() };
            db.MailSettings.Add(settings);
        }

        var graph = request.Provider == MailProviders.Graph;
        if (graph && string.IsNullOrEmpty(request.GraphClientSecret) && string.IsNullOrEmpty(settings.ProtectedGraphSecret))
        {
            throw AppException.Validation(new Dictionary<string, string[]>
            {
                ["graphClientSecret"] = ["Enter the client secret value from the app registration."],
            });
        }

        // Both sets of fields are kept, so switching between SMTP and Graph never loses the other setup.
        settings.Provider = graph ? MailProviders.Graph : MailProviders.Smtp;
        settings.Host = request.Host?.Trim() ?? string.Empty;
        settings.Port = request.Port is >= 1 and <= 65535 ? request.Port : 587;
        settings.EnableSsl = request.EnableSsl;
        settings.Username = Blank(request.Username);
        settings.FromEmail = request.FromEmail.Trim();
        settings.FromName = Blank(request.FromName);
        settings.GraphTenantId = Blank(request.GraphTenantId) ?? settings.GraphTenantId;
        settings.GraphClientId = Blank(request.GraphClientId) ?? settings.GraphClientId;
        // Empty secret boxes mean "keep the saved one"; secrets are never sent back to the browser.
        if (!string.IsNullOrEmpty(request.Password))
        {
            settings.ProtectedPassword = protector.Protect(request.Password);
        }

        if (!string.IsNullOrEmpty(request.GraphClientSecret))
        {
            settings.ProtectedGraphSecret = protector.Protect(request.GraphClientSecret.Trim());
        }

        settings.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(settings);
    }

    public async Task SendTestAsync(SendTestEmailRequest request, CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(testValidator, request, cancellationToken);
        var account = await GetAccountAsync(cancellationToken) ?? throw NotConfigured();
        var id = Guid.NewGuid();
        var via = account.Provider == MailProviders.Graph ? "Microsoft 365 (Graph)" : $"SMTP ({account.Host})";
        var html = "<p>This is a test message from the Entourage Invitation System.</p>"
            + $"<p>It was sent from {System.Net.WebUtility.HtmlEncode(account.FromEmail)} through {System.Net.WebUtility.HtmlEncode(via)}. "
            + "If you can read this, outgoing email is set up correctly and invitations can be sent.</p>";
        var errors = await transport.SendManyAsync(
            account,
            [new OutgoingMail(id, request.To.Trim(), null, "Test email from Entourage", html)],
            cancellationToken);
        if (errors.TryGetValue(id, out var error))
        {
            throw new AppException($"The test email could not be sent: {error}", StatusCodes.Status400BadRequest);
        }
    }

    public async Task<SmtpAccount?> GetAccountAsync(CancellationToken cancellationToken)
    {
        var settings = await db.MailSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken);
        if (settings is null || !IsConfigured(settings))
        {
            return null;
        }

        var password = Unprotect(settings.ProtectedPassword, "email password");
        var secret = Unprotect(settings.ProtectedGraphSecret, "Microsoft 365 client secret");
        return new SmtpAccount(
            settings.Host,
            settings.Port,
            settings.EnableSsl,
            settings.Username,
            password,
            settings.FromEmail,
            settings.FromName,
            settings.Provider,
            settings.GraphTenantId,
            settings.GraphClientId,
            secret);
    }

    public static AppException NotConfigured() => new(
        "Outgoing email is not set up yet. Open Email settings and choose SMTP or Microsoft 365 (Graph).",
        StatusCodes.Status400BadRequest);

    private string? Unprotect(string? value, string label)
    {
        if (string.IsNullOrEmpty(value))
        {
            return null;
        }

        try
        {
            return protector.Unprotect(value);
        }
        catch (CryptographicException)
        {
            // The encryption keys changed (e.g. a new server). The admin has to enter it again.
            throw new AppException(
                $"The saved {label} can no longer be read on this server. Open Email settings and enter it again.",
                StatusCodes.Status400BadRequest);
        }
    }

    private static bool IsConfigured(MailSettings settings) =>
        !string.IsNullOrWhiteSpace(settings.FromEmail)
        && (settings.Provider == MailProviders.Graph
            ? !string.IsNullOrWhiteSpace(settings.GraphTenantId)
                && !string.IsNullOrWhiteSpace(settings.GraphClientId)
                && !string.IsNullOrEmpty(settings.ProtectedGraphSecret)
            : !string.IsNullOrWhiteSpace(settings.Host));

    private static MailSettingsDto ToDto(MailSettings? settings) => settings is null
        ? new MailSettingsDto(false, string.Empty, 587, true, null, false, string.Empty, null, null)
        : new MailSettingsDto(
            IsConfigured(settings),
            settings.Host,
            settings.Port,
            settings.EnableSsl,
            settings.Username,
            !string.IsNullOrEmpty(settings.ProtectedPassword),
            settings.FromEmail,
            settings.FromName,
            settings.UpdatedOn,
            settings.Provider,
            settings.GraphTenantId,
            settings.GraphClientId,
            !string.IsNullOrEmpty(settings.ProtectedGraphSecret));

    private static string? Blank(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrEmpty(trimmed) ? null : trimmed;
    }
}
