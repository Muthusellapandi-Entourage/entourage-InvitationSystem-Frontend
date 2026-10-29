using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Entourage.Application;
using Entourage.Application.Interfaces;
using Entourage.Domain.Entities;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services.Accreditation;

/// <summary>Role groups for [Authorize(Roles = …)]. Administrator can do everything.</summary>
public static class AccRoles
{
    /// <summary>Events, setup, organisations, team.</summary>
    public const string Manage = "Administrator,AccreditationAdmin";

    /// <summary>Approve / reject, move stages, change access, reveal ID numbers.</summary>
    public const string Vet = "Administrator,AccreditationAdmin,SecurityManager";

    /// <summary>See and add / edit applicants and uploads.</summary>
    public const string Work = "Administrator,AccreditationAdmin,SecurityManager,DataEntryClerk";

    /// <summary>Print queue: print, reprint, hand out badges.</summary>
    public const string Print = "Administrator,AccreditationAdmin,SecurityManager,PrintOperator";

    /// <summary>Open photos and documents (staff who vet or print).</summary>
    public const string Files = "Administrator,AccreditationAdmin,SecurityManager,DataEntryClerk,PrintOperator,GateGuard";

    /// <summary>Gate scanning and the live monitor.</summary>
    public const string Scan = "Administrator,AccreditationAdmin,SecurityManager,GateGuard";

    /// <summary>Anyone who works in accreditation (read-only views such as the events list).</summary>
    public const string Any = "Administrator,AccreditationAdmin,SecurityManager,DataEntryClerk,PrintOperator,GateGuard";

    public static readonly UserRole[] TeamRoles =
    [
        UserRole.AccreditationAdmin,
        UserRole.SecurityManager,
        UserRole.DataEntryClerk,
        UserRole.PrintOperator,
        UserRole.GateGuard,
    ];

    public static string Label(UserRole role) => role switch
    {
        UserRole.Administrator => "Administrator",
        UserRole.AccreditationAdmin => "Accreditation admin",
        UserRole.SecurityManager => "Security manager",
        UserRole.DataEntryClerk => "Data entry clerk",
        UserRole.PrintOperator => "Print operator",
        UserRole.GateGuard => "Gate guard",
        _ => role.ToString(),
    };
}

public static class AccJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static T Read<T>(string? json, T fallback)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return fallback;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(json, Options) ?? fallback;
        }
        catch (JsonException)
        {
            return fallback;
        }
    }

    public static string Write<T>(T value) => JsonSerializer.Serialize(value, Options);

    public static Guid[] Ids(string? json) => Read(json, Array.Empty<Guid>());
}

public static class AccDefaults
{
    public static readonly AccStageDto[] Stages =
    [
        new("submitted", "Submitted", "open", "#7a8ea8"),
        new("review", "Under review", "open", "#d19a66"),
        new("approved", "Approved", "approved", "#38b8a2"),
        new("rejected", "Rejected", "rejected", "#e06c75"),
    ];

    public static readonly AccNotificationsDto Notifications = new(
        new AccMailTemplateDto(
            true,
            "We received your accreditation application – {{event}}",
            "Hello {{firstName}},\n\nYour accreditation application for {{event}} has been received and is being reviewed. We will email you when a decision is made.\n\nThank you."),
        new AccMailTemplateDto(
            true,
            "Your accreditation for {{event}} is approved",
            "Hello {{firstName}},\n\nGood news: your accreditation for {{event}} is approved. Your badge number is {{badgeNumber}}.\n\nCollection details will follow."),
        new AccMailTemplateDto(
            true,
            "Your accreditation for {{event}}",
            "Hello {{firstName}},\n\nUnfortunately your accreditation for {{event}} could not be approved.\n\n{{reason}}\n\nIf you think this is a mistake, contact your organisation's coordinator."));

    private static readonly AccDocumentRuleDto IdDocument = new("id", "Passport or national ID", true, true);

    public static IEnumerable<(string Name, AccFieldDto[] Fields, AccDocumentRuleDto[] Documents)> Types()
    {
        yield return ("Workforce / Staff", [new("department", "Department", "text", false, null)], [IdDocument]);
        yield return ("Media", [
            new("outlet", "Media outlet", "text", true, null),
            new("mediaRole", "Media role", "select", true, ["Journalist", "Photographer", "Videographer", "Broadcast crew", "Editor"]),
            new("portfolio", "Portfolio / outlet website", "url", false, null),
        ], [IdDocument, new("pressCard", "Press card or editor's letter", true, true)]);
        yield return ("Vendor / Contractor", [
            new("company", "Company", "text", true, null),
            new("vehiclePlate", "Vehicle plate (if driving in)", "text", false, null),
        ], [IdDocument, new("insurance", "Certificate of insurance", false, true)]);
        yield return ("Talent / Artist", [new("act", "Act / performance", "text", false, null)], [IdDocument]);
    }

    public static string NormalizeStatus(string? status) => status?.Trim().ToLowerInvariant() switch
    {
        "open" => "Open",
        "closed" => "Closed",
        "archived" => "Archived",
        _ => "Draft",
    };
}

/// <summary>Small validation helper: collect errors, then throw once.</summary>
public sealed class AccErrors
{
    private readonly Dictionary<string, List<string>> errors = new();

    public void Add(string field, string message)
    {
        if (!errors.TryGetValue(field, out var list))
        {
            errors[field] = list = [];
        }

        list.Add(message);
    }

    public bool Any => errors.Count > 0;

    public string? First => errors.Values.SelectMany(item => item).FirstOrDefault();

    public void ThrowIfAny()
    {
        if (errors.Count > 0)
        {
            throw AppException.Validation(errors.ToDictionary(item => item.Key, item => item.Value.ToArray()));
        }
    }

    public static AppException One(string field, string message) =>
        AppException.Validation(new Dictionary<string, string[]> { [field] = [message] });
}

public static partial class AccText
{
    public static string? Clean(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = Spaces().Replace(value.Trim(), " ");
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }

    public static string? Email(string? value)
    {
        var email = Clean(value, 256)?.ToLowerInvariant();
        return email;
    }

    public static bool IsEmail(string? value) =>
        !string.IsNullOrWhiteSpace(value) && EmailPattern().IsMatch(value);

    public static bool IsColor(string? value) =>
        !string.IsNullOrWhiteSpace(value) && ColorPattern().IsMatch(value);

    public static string Slug(string? value)
    {
        var lower = (value ?? string.Empty).Trim().ToLowerInvariant();
        var slug = NotSlug().Replace(lower, "-").Trim('-');
        slug = Dashes().Replace(slug, "-");
        return slug.Length <= 120 ? slug : slug[..120].Trim('-');
    }

    public static string Key(string? value)
    {
        var slug = Slug(value).Replace("-", "_");
        return slug.Length <= 40 ? slug : slug[..40];
    }

    public static DateOnly? Date(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        string[] formats = ["yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "d-M-yyyy", "dd.MM.yyyy", "yyyy/MM/dd"];
        if (DateOnly.TryParseExact(value.Trim(), formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            return date;
        }

        // Excel serial dates (e.g. 33604) come through as numbers.
        if (double.TryParse(value.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var serial) && serial is > 1 and < 80000)
        {
            return DateOnly.FromDateTime(new DateTime(1899, 12, 30).AddDays(Math.Floor(serial)));
        }

        return null;
    }

    public static string Html(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailPattern();

    [GeneratedRegex(@"^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")]
    private static partial Regex ColorPattern();

    [GeneratedRegex(@"[^a-z0-9]+")]
    private static partial Regex NotSlug();

    [GeneratedRegex(@"-{2,}")]
    private static partial Regex Dashes();
}

/// <summary>ID numbers: encrypted at rest, masked for display, hashed for duplicate checks.</summary>
public sealed class AccIdProtector(IDataProtectionProvider provider)
{
    private readonly IDataProtector protector = provider.CreateProtector("Entourage.Accreditation.IdNumber.v1");

    public static string Normalize(string value) =>
        new(value.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());

    public (string Protected, string Last4, string Hash)? Protect(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = Normalize(value);
        if (normalized.Length == 0)
        {
            return null;
        }

        var last4 = normalized.Length <= 4 ? normalized : normalized[^4..];
        return (protector.Protect(normalized), last4, Hash(normalized));
    }

    public string? Unprotect(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        try
        {
            return protector.Unprotect(value);
        }
        catch (CryptographicException)
        {
            return null;
        }
    }

    public static string Hash(string normalized) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("entourage-acc-id:" + normalized)));

    public static string? Mask(string? last4) => string.IsNullOrEmpty(last4) ? null : "•••• " + last4;
}

public static class AccTokens
{
    public static string New(int bytes = 32) =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(bytes)).ToLowerInvariant();

    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    /// <summary>Badge QR code: 12 unambiguous characters.</summary>
    public static string Credential()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var bytes = RandomNumberGenerator.GetBytes(12);
        return new string(bytes.Select(item => alphabet[item % alphabet.Length]).ToArray());
    }
}

/// <summary>Who is acting, for the audit log.</summary>
public sealed record AccActor(Guid? UserId, string Name)
{
    public static AccActor Public => new(null, "Public application");

    public static AccActor Portal(string organization, string user) => new(null, $"Portal: {user} ({organization})");
}

/// <summary>Resolves the signed-in staff member as an <see cref="AccActor"/>.</summary>
public sealed class AccActorResolver(AppDbContext db, ICurrentUser currentUser)
{
    private AccActor? cached;

    public async Task<AccActor> CurrentAsync(CancellationToken cancellationToken)
    {
        if (cached is not null)
        {
            return cached;
        }

        var id = currentUser.UserId;
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id, cancellationToken)
            ?? throw AppException.Unauthorized();
        cached = new AccActor(user.Id, $"{user.FirstName} {user.LastName} ({AccRoles.Label(user.Role)})".Trim());
        return cached;
    }
}

public static class AccAudit
{
    /// <summary>Adds an audit row (saved with the caller's SaveChanges). Rows are never changed or removed.</summary>
    public static void Add(AppDbContext db, Guid eventId, Guid? applicantId, AccActor actor, string action, string? detail = null)
    {
        db.AccAuditLogs.Add(new AccAuditLog
        {
            Id = Guid.CreateVersion7(),
            EventId = eventId,
            ApplicantId = applicantId,
            ActorUserId = actor.UserId,
            ActorName = actor.Name.Length <= 200 ? actor.Name : actor.Name[..200],
            Action = action,
            Detail = detail is null ? null : detail.Length <= 2000 ? detail : detail[..2000],
            CreatedOn = DateTime.UtcNow,
        });
    }
}

/// <summary>Sends accreditation emails with the shared mail settings. Failures are logged, never thrown.</summary>
public sealed class AccNotifier(IMailSettingsService mailSettings, IMailTransport transport, ILogger<AccNotifier> logger)
{
    public async Task SendAsync(IReadOnlyList<(string Email, string? Name, string Subject, string Text)> messages, CancellationToken cancellationToken)
    {
        if (messages.Count == 0)
        {
            return;
        }

        try
        {
            var account = await mailSettings.GetAccountAsync(cancellationToken);
            if (account is null)
            {
                logger.LogInformation("Accreditation email skipped: mail is not set up.");
                return;
            }

            var mails = messages
                .Select(item => new OutgoingMail(Guid.NewGuid(), item.Email, item.Name, item.Subject, Wrap(item.Subject, item.Text)))
                .ToList();
            var failures = await transport.SendManyAsync(account, mails, cancellationToken);
            foreach (var failure in failures)
            {
                logger.LogWarning("Accreditation email {Id} failed: {Error}", failure.Key, failure.Value);
            }
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Accreditation email could not be sent.");
        }
    }

    public static string Fill(string template, IReadOnlyDictionary<string, string?> values)
    {
        var result = template;
        foreach (var (key, value) in values)
        {
            result = result.Replace("{{" + key + "}}", value ?? string.Empty, StringComparison.OrdinalIgnoreCase);
        }

        return result;
    }

    /// <summary>Plain text → simple, safe HTML email.</summary>
    public static string Wrap(string subject, string text)
    {
        var paragraphs = text.Replace("\r\n", "\n").Split("\n\n", StringSplitOptions.RemoveEmptyEntries)
            .Select(item => $"<p style=\"margin:0 0 14px\">{Linkify(AccText.Html(item)).Replace("\n", "<br>")}</p>");
        return $"""
            <!doctype html><html><body style="margin:0;background:#f4f5f3;font-family:Segoe UI,Arial,sans-serif;color:#1d1f1b">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
            <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e5e0;border-radius:6px">
            <tr><td style="padding:28px 32px 8px;font-size:18px;font-weight:600">{AccText.Html(subject)}</td></tr>
            <tr><td style="padding:8px 32px 24px;font-size:14px;line-height:1.6">{string.Join("", paragraphs)}</td></tr>
            </table></td></tr></table></body></html>
            """;
    }

    /// <summary>Turns (already HTML-encoded) web addresses into links.</summary>
    private static string Linkify(string encoded) =>
        Regex.Replace(encoded, @"https?://[^\s<]+", match =>
            $"<a href=\"{match.Value}\" style=\"color:#1f8a78;word-break:break-all\">{match.Value}</a>");
}
