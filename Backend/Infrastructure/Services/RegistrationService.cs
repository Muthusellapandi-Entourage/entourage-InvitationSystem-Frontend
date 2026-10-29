using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Entourage.Application;
using Entourage.Application.Invitations;
using Entourage.Domain.Entities;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

/* ---------------- DTOs ---------------- */

/// <summary>A built-in form field: name, position, company, email, phone.</summary>
public sealed record RegistrationFieldDto(string Key, string Label, bool Enabled, bool Required);

/// <summary>A custom question. Type: text, textarea, select, yesno.</summary>
public sealed record RegistrationQuestionDto(string Id, string Label, string Type, bool Required, string[]? Options = null, string? Placeholder = null);

/// <summary>Everything about the event's public self-registration page.</summary>
public sealed record RegistrationSettingsDto(
    bool Open = false,
    DateTime? ClosesOn = null,
    int? Capacity = null,
    Guid? GuestTypeId = null,
    Guid? GuestGroupId = null,
    RegistrationFieldDto[]? Fields = null,
    RegistrationQuestionDto[]? Questions = null,
    string Title = "Register your attendance",
    string Intro = "Please fill in your details to confirm your place.",
    string SubmitButton = "Register",
    string SuccessTitle = "Thank you for registering",
    string SuccessText = "Your place is confirmed. Keep the QR code below; it is your entry pass.",
    string ClosedText = "Registration for this event is closed.",
    string DownloadButton = "Download digital pass",
    string WalletButton = "Add to Apple Wallet",
    Guid? BackgroundAssetId = null,
    Guid? LogoAssetId = null,
    Guid? FontId = null,
    string BackgroundColor = "#111210",
    string CardColor = "#1D1F1B",
    string TextColor = "#F4F4F5",
    string AccentColor = "#38B8A2",
    string AccentTextColor = "#111210");

/// <summary>Admin view: settings plus where the page lives and how many signed up.</summary>
public sealed record RegistrationInfoDto(RegistrationSettingsDto Settings, string PublicUrl, bool OnEventDomain, bool EventActive, int Registrations, bool AcceptingNow, string StateText);

/// <summary>What the public form sends: built-in fields by key, custom answers by question id.</summary>
public sealed record PublicRegistrationRequest(Dictionary<string, string?>? Fields, Dictionary<string, string?>? Answers, string? Website);

public sealed record PublicRegistrationResult(bool Ok, string Message, string? Token = null, bool HasBadge = false, bool WalletReady = false, Dictionary<string, string>? Errors = null);

/// <summary>One stored answer on a guest (company and custom questions).</summary>
public sealed record RegistrationAnswerDto(string Label, string Value);

/// <summary>
/// The event's public self-registration page (eventdomain.com/register, or /api/public/register/{slug} on the
/// app's address). A guest fills in the form; we add them to the guest list as Accepted (or update the guest
/// with the same email or phone) and show their QR / E-Badge straight away.
/// </summary>
public sealed class RegistrationService(AppDbContext db, AppleWalletService? wallet = null)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public const string ApiBase = "/api/public/register";
    public const string DomainPath = "/register";
    public const string DefaultGroupName = "Self-registered";

    private static readonly string[] FieldKeys = ["name", "position", "company", "email", "phone"];
    private static readonly string[] QuestionTypes = ["text", "textarea", "select", "yesno"];
    private static readonly Regex EmailPattern = new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled);

    public static RegistrationFieldDto[] DefaultFields() =>
    [
        new("name", "Full name", true, true),
        new("position", "Position / title", true, false),
        new("company", "Company / organisation", true, false),
        new("email", "Email", true, true),
        new("phone", "Mobile number", true, true),
    ];

    /* ---------------- admin ---------------- */

    public async Task<RegistrationInfoDto> GetInfoAsync(Guid eventId, string apiOrigin, CancellationToken cancellationToken)
    {
        var item = await db.Events.AsNoTracking().FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        return await InfoAsync(item, Read(item.RegistrationJson), apiOrigin, cancellationToken);
    }

    public async Task<RegistrationInfoDto> SaveAsync(Guid eventId, RegistrationSettingsDto input, string apiOrigin, CancellationToken cancellationToken)
    {
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken) ?? throw AppException.NotFound("Event not found.");
        var settings = Clean(input);
        var errors = new Dictionary<string, string[]>();

        if (settings.GuestTypeId is Guid typeId && !await db.GuestTypes.AnyAsync(type => type.Id == typeId && type.EventId == eventId, cancellationToken))
        {
            errors["guestTypeId"] = ["That guest category is not on this event."];
        }

        if (settings.GuestGroupId is Guid groupId && !await db.GuestGroups.AnyAsync(group => group.Id == groupId && group.EventId == eventId, cancellationToken))
        {
            errors["guestGroupId"] = ["That group is not on this event."];
        }

        if (settings.FontId is Guid fontId && !await db.EventFonts.AnyAsync(font => font.Id == fontId && font.EventId == eventId, cancellationToken))
        {
            errors["fontId"] = ["That font is not on this event. Upload it again."];
        }

        if (errors.Count > 0)
        {
            throw AppException.Validation(errors);
        }

        // Images removed meanwhile are dropped instead of blocking the save.
        var images = new[] { settings.BackgroundAssetId, settings.LogoAssetId }.OfType<Guid>().ToArray();
        var present = images.Length == 0
            ? []
            : await db.EventAssets.AsNoTracking().Where(asset => asset.EventId == eventId && images.Contains(asset.Id)).Select(asset => asset.Id).ToListAsync(cancellationToken);
        settings = settings with
        {
            BackgroundAssetId = settings.BackgroundAssetId is Guid background && present.Contains(background) ? background : null,
            LogoAssetId = settings.LogoAssetId is Guid logo && present.Contains(logo) ? logo : null,
        };

        item.RegistrationJson = JsonSerializer.Serialize(settings, Json);
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return await InfoAsync(item, settings, apiOrigin, cancellationToken);
    }

    /// <summary>Admin preview with the unsaved settings. view: "form", "done" or "closed".</summary>
    public async Task<string> PreviewAsync(Guid eventId, RegistrationSettingsDto settings, string? view, CancellationToken cancellationToken)
    {
        var item = await db.Events.AsNoTracking().FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken) ?? throw AppException.NotFound("Event not found.");
        var clean = Clean(settings);
        return view == "closed"
            ? RenderClosed(clean, item, clean.ClosedText)
            : Render(clean, item, preview: view == "done" ? "done" : "form");
    }

    /// <summary>QR code (PNG) that opens the public page, for posters and invitations.</summary>
    public async Task<byte[]> QrAsync(Guid eventId, string apiOrigin, CancellationToken cancellationToken)
    {
        var item = await db.Events.AsNoTracking().FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken) ?? throw AppException.NotFound("Event not found.");
        return BadgeRenderer.QrPng(PublicUrl(item, apiOrigin).Url, 16);
    }

    private async Task<RegistrationInfoDto> InfoAsync(Event item, RegistrationSettingsDto settings, string apiOrigin, CancellationToken cancellationToken)
    {
        var count = await db.Guests.CountAsync(guest => guest.EventId == item.Id && guest.RegisteredOn != null, cancellationToken);
        var (url, onDomain) = PublicUrl(item, apiOrigin);
        var reason = ClosedReason(item, settings, count);
        return new RegistrationInfoDto(settings, url, onDomain, item.Status == EventStatus.Active, count, reason is null, reason ?? "Open: guests can register now.");
    }

    private static (string Url, bool OnDomain) PublicUrl(Event item, string apiOrigin) =>
        item.CustomDomainVerifiedOn is not null && !string.IsNullOrWhiteSpace(item.CustomDomain)
            ? ($"{EventDomains.Origin(item.CustomDomain)}{DomainPath}", true)
            : ($"{apiOrigin.TrimEnd('/')}{ApiBase}/{item.Slug}", false);

    /// <summary>Why the form is not taking sign-ups right now, or null when it is.</summary>
    private static string? ClosedReason(Event item, RegistrationSettingsDto settings, int count)
    {
        if (item.Status == EventStatus.Draft) return "Not live: the event is still being set up (not Live yet). Make the event Live to open registration.";
        if (item.Status == EventStatus.Archived) return "Closed: the event is finished.";
        if (!settings.Open) return "Not published: turn on 'Accept registrations' to open the page.";
        if (settings.ClosesOn is DateTime closes && DateTime.UtcNow > closes) return "Closed: the closing date has passed.";
        if (settings.Capacity is int capacity && count >= capacity) return $"Full: {count} of {capacity} places taken.";
        return null;
    }

    /* ---------------- settings JSON ---------------- */

    public static RegistrationSettingsDto Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Clean(new RegistrationSettingsDto());
        }

        try
        {
            return Clean(JsonSerializer.Deserialize<RegistrationSettingsDto>(json, Json) ?? new RegistrationSettingsDto());
        }
        catch (JsonException)
        {
            return Clean(new RegistrationSettingsDto());
        }
    }

    private static RegistrationSettingsDto Clean(RegistrationSettingsDto input)
    {
        var defaults = new RegistrationSettingsDto();
        static string Limit(string value, int max) => value.Length <= max ? value : value[..max];
        string Text(string? value, string fallback, int max = 1000) => string.IsNullOrWhiteSpace(value) ? fallback : Limit(value.Trim(), max);
        string Colour(string? value, string fallback) => MicrositeRenderer.Color(value) ?? fallback;

        // Built-in fields: always all five, in this order; full name is always shown and required.
        var given = (input.Fields ?? [])
            .Where(field => field is not null && !string.IsNullOrWhiteSpace(field.Key))
            .GroupBy(field => field.Key, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        var fields = DefaultFields()
            .Select(field =>
            {
                if (!given.TryGetValue(field.Key, out var set)) return field;
                var label = Text(set.Label, field.Label, 80);
                return field.Key == "name" ? field with { Label = label } : field with { Label = label, Enabled = set.Enabled, Required = set.Enabled && set.Required };
            })
            .ToArray();

        var questions = (input.Questions ?? [])
            .Where(question => question is not null && !string.IsNullOrWhiteSpace(question.Label))
            .Take(20)
            .Select(question =>
            {
                var type = QuestionTypes.Contains(question.Type) ? question.Type : "text";
                var options = type == "select"
                    ? (question.Options ?? []).Select(option => option?.Trim() ?? string.Empty).Where(option => option.Length > 0).Select(option => Limit(option, 120)).Distinct().Take(30).ToArray()
                    : null;
                var id = string.IsNullOrWhiteSpace(question.Id) || question.Id.Length > 40 ? Guid.NewGuid().ToString("N")[..12] : question.Id.Trim();
                return new RegistrationQuestionDto(id, Limit(question.Label.Trim(), 160), type, question.Required, options, string.IsNullOrWhiteSpace(question.Placeholder) ? null : Limit(question.Placeholder.Trim(), 120));
            })
            .Where(question => question.Type != "select" || question.Options is { Length: > 0 })
            .GroupBy(question => question.Id)
            .Select(group => group.First())
            .ToArray();

        return new RegistrationSettingsDto(
            input.Open,
            input.ClosesOn is DateTime closes ? (DateTime?)DateTime.SpecifyKind(closes, closes.Kind == DateTimeKind.Unspecified ? DateTimeKind.Utc : closes.Kind).ToUniversalTime() : null,
            input.Capacity is int capacity && capacity > 0 ? Math.Min(capacity, 100_000) : null,
            input.GuestTypeId,
            input.GuestGroupId,
            fields,
            questions,
            Text(input.Title, defaults.Title, 200),
            Text(input.Intro, defaults.Intro),
            Text(input.SubmitButton, defaults.SubmitButton, 60),
            Text(input.SuccessTitle, defaults.SuccessTitle, 200),
            Text(input.SuccessText, defaults.SuccessText),
            Text(input.ClosedText, defaults.ClosedText),
            Text(input.DownloadButton, defaults.DownloadButton, 60),
            Text(input.WalletButton, defaults.WalletButton, 60),
            input.BackgroundAssetId,
            input.LogoAssetId,
            input.FontId,
            Colour(input.BackgroundColor, defaults.BackgroundColor),
            Colour(input.CardColor, defaults.CardColor),
            Colour(input.TextColor, defaults.TextColor),
            Colour(input.AccentColor, defaults.AccentColor),
            Colour(input.AccentTextColor, defaults.AccentTextColor));
    }

    /* ---------------- public ---------------- */

    private async Task<Event?> FindAsync(string? key, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 120)
        {
            return null;
        }

        var value = key.Trim().ToLowerInvariant();
        return Guid.TryParse(value, out var id)
            ? await db.Events.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id, cancellationToken)
            : await db.Events.AsNoTracking().FirstOrDefaultAsync(item => item.Slug == value, cancellationToken);
    }

    /// <summary>The public page for an event (by slug or id).</summary>
    public async Task<(int Status, string Html)> PageAsync(string? key, CancellationToken cancellationToken)
    {
        var item = await FindAsync(key, cancellationToken);
        return item is null ? (404, Notice("Page not found", "Check the link or scan the QR code again.")) : await PageAsync(item.Id, cancellationToken);
    }

    /// <summary>The public page for an event (used on the event's own domain).</summary>
    public async Task<(int Status, string Html)> PageAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await db.Events.AsNoTracking().FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken);
        if (item is null)
        {
            return (404, Notice("Page not found", "Check the link or scan the QR code again."));
        }

        var settings = Read(item.RegistrationJson);
        var count = await db.Guests.CountAsync(guest => guest.EventId == item.Id && guest.RegisteredOn != null, cancellationToken);
        var reason = ClosedReason(item, settings, count);
        if (reason is not null)
        {
            var text = item.Status == EventStatus.Draft || !settings.Open && item.RegistrationJson is null
                ? "Registration is not open yet. Please check back soon."
                : settings.Capacity is int capacity && count >= capacity ? "All places have been taken. Thank you for your interest." : settings.ClosedText;
            return (200, RenderClosed(settings, item, text));
        }

        return (200, Render(settings, item, preview: null));
    }

    public async Task<(int Status, PublicRegistrationResult Result)> SubmitAsync(string? key, PublicRegistrationRequest request, CancellationToken cancellationToken)
    {
        var item = await FindAsync(key, cancellationToken);
        if (item is null)
        {
            return (404, new PublicRegistrationResult(false, "This registration page does not exist."));
        }

        return await SubmitAsync(item, request, cancellationToken);
    }

    private async Task<(int Status, PublicRegistrationResult Result)> SubmitAsync(Event item, PublicRegistrationRequest request, CancellationToken cancellationToken)
    {
        var settings = Read(item.RegistrationJson);
        var registered = await db.Guests.CountAsync(guest => guest.EventId == item.Id && guest.RegisteredOn != null, cancellationToken);
        var reason = ClosedReason(item, settings, registered);
        if (reason is not null)
        {
            return (409, new PublicRegistrationResult(false, settings.Capacity is int capacity && registered >= capacity ? "All places have been taken." : settings.ClosedText));
        }

        // Bots fill every field, including the hidden one.
        if (!string.IsNullOrWhiteSpace(request.Website))
        {
            return (200, new PublicRegistrationResult(true, settings.SuccessText));
        }

        string? Field(string name) => request.Fields is not null && request.Fields.TryGetValue(name, out var value) && !string.IsNullOrWhiteSpace(value) ? value.Trim() : null;
        string? Answer(string id) => request.Answers is not null && request.Answers.TryGetValue(id, out var value) && !string.IsNullOrWhiteSpace(value) ? value.Trim() : null;

        var errors = new Dictionary<string, string>();
        var values = new Dictionary<string, string?>();
        foreach (var field in settings.Fields ?? DefaultFields())
        {
            if (!field.Enabled) continue;
            var value = Field(field.Key);
            var max = field.Key switch { "name" => 120, "email" => 256, "phone" => 40, _ => 200 };
            if (value is not null && value.Length > max) value = value[..max];
            if (value is null && field.Required) errors[field.Key] = $"Please enter your {field.Label.ToLowerInvariant()}.";
            values[field.Key] = value;
        }

        var email = values.GetValueOrDefault("email")?.ToLowerInvariant();
        if (email is not null && !EmailPattern.IsMatch(email)) errors["email"] = "Please enter a valid email address.";
        var phone = values.GetValueOrDefault("phone");
        var phoneDigits = Digits(phone);
        if (phone is not null && (phoneDigits.Length < 6 || phoneDigits.Length > 16 || !Regex.IsMatch(phone, @"^[0-9+()\-\s.]+$"))) errors["phone"] = "Please enter a valid mobile number.";

        var answers = new List<RegistrationAnswerDto>();
        if (values.GetValueOrDefault("company") is { } company)
        {
            var label = (settings.Fields ?? DefaultFields()).First(field => field.Key == "company").Label;
            answers.Add(new RegistrationAnswerDto(label, company));
        }

        foreach (var question in settings.Questions ?? [])
        {
            var value = Answer(question.Id);
            if (value is not null && value.Length > 1000) value = value[..1000];
            if (question.Type == "select" && value is not null && !(question.Options ?? []).Contains(value)) value = null;
            if (question.Type == "yesno" && value is not null && value is not ("Yes" or "No")) value = null;
            if (value is null)
            {
                if (question.Required) errors[$"q:{question.Id}"] = "Please answer this question.";
                continue;
            }

            answers.Add(new RegistrationAnswerDto(question.Label, value));
        }

        if (errors.Count > 0)
        {
            return (400, new PublicRegistrationResult(false, "Please check the highlighted fields.", Errors: errors));
        }

        var name = values.GetValueOrDefault("name")!;
        var now = DateTime.UtcNow;

        // Same email (then same phone) = the same guest: update instead of adding a duplicate.
        Guest? guest = null;
        if (email is not null)
        {
            guest = await db.Guests.FirstOrDefaultAsync(entry => entry.EventId == item.Id && entry.Email != null && entry.Email.ToLower() == email, cancellationToken);
        }

        if (guest is null && phoneDigits.Length >= 6)
        {
            var withPhones = await db.Guests.Where(entry => entry.EventId == item.Id && entry.Phone != null).ToListAsync(cancellationToken);
            guest = withPhones.FirstOrDefault(entry => Digits(entry.Phone) == phoneDigits);
        }

        var groupId = settings.GuestGroupId is Guid chosen && await db.GuestGroups.AnyAsync(group => group.Id == chosen && group.EventId == item.Id, cancellationToken)
            ? chosen
            : await DefaultGroupAsync(item.Id, now, cancellationToken);
        var typeId = settings.GuestTypeId is Guid type && await db.GuestTypes.AnyAsync(entry => entry.Id == type && entry.EventId == item.Id, cancellationToken)
            ? type
            : (Guid?)null;

        var answersJson = answers.Count == 0 ? null : JsonSerializer.Serialize(answers, Json);
        if (guest is null)
        {
            guest = new Guest
            {
                Id = Guid.CreateVersion7(),
                EventId = item.Id,
                GuestTypeId = typeId,
                GuestGroupId = groupId,
                Name = name,
                Email = email,
                Position = values.GetValueOrDefault("position"),
                Phone = phone,
                RsvpStatus = GuestRsvp.Accepted,
                RsvpUpdatedOn = now,
                RegisteredOn = now,
                RegistrationAnswersJson = answersJson,
                CheckInCode = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(16)).ToLowerInvariant(),
                CreatedOn = now,
                UpdatedOn = now,
            };
            db.Guests.Add(guest);
            GuestActivityLog.Add(db, guest.Id, GuestActivityKinds.Added, "Signed up on the registration page", now);
            GuestActivityLog.Add(db, guest.Id, GuestActivityKinds.SelfRegistered, "Accepted on registration", now);
        }
        else
        {
            var previous = guest.RsvpStatus;
            guest.Name = name;
            guest.Email = email ?? guest.Email;
            guest.Position = values.GetValueOrDefault("position") ?? guest.Position;
            guest.Phone = phone ?? guest.Phone;
            guest.GuestTypeId ??= typeId;
            guest.GuestGroupId ??= groupId;
            guest.RsvpStatus = GuestRsvp.Accepted;
            guest.DeclineReason = null;
            guest.RsvpUpdatedOn = now;
            guest.RegisteredOn ??= now;
            guest.RegistrationAnswersJson = answersJson ?? guest.RegistrationAnswersJson;
            guest.UpdatedOn = now;
            GuestActivityLog.Add(db, guest.Id, GuestActivityKinds.SelfRegistered, previous == GuestRsvp.Accepted ? "Registered again (details updated)" : $"{previous} → Accepted (registration page)", now);
        }

        await db.SaveChangesAsync(cancellationToken);

        var hasBadge = guest.GuestTypeId is Guid badgeType
            && await db.GuestTypes.AsNoTracking().AnyAsync(entry => entry.Id == badgeType && entry.BadgeDesignJson != null && entry.BadgeDesignJson != "", cancellationToken);
        var walletReady = wallet is not null && await wallet.IsReadyAsync(cancellationToken);
        return (200, new PublicRegistrationResult(true, settings.SuccessText, guest.InviteToken, hasBadge, walletReady));
    }

    private async Task<Guid> DefaultGroupAsync(Guid eventId, DateTime now, CancellationToken cancellationToken)
    {
        var existing = await db.GuestGroups.Where(group => group.EventId == eventId && group.Name == DefaultGroupName).Select(group => (Guid?)group.Id).FirstOrDefaultAsync(cancellationToken);
        if (existing is Guid id)
        {
            return id;
        }

        var created = new GuestGroup { Id = Guid.CreateVersion7(), EventId = eventId, Name = DefaultGroupName, CreatedOn = now, UpdatedOn = now };
        db.GuestGroups.Add(created);
        return created.Id;
    }

    private static string Digits(string? value) => new((value ?? string.Empty).Where(char.IsDigit).ToArray());

    /* ---------------- the page ---------------- */

    private static string E(string value) => WebUtility.HtmlEncode(value);

    private static string Styles(RegistrationSettingsDto settings)
    {
        var fontFace = settings.FontId is Guid fontId ? $"@font-face{{font-family:'RegFont';src:url('/api/public/fonts/{fontId}');font-display:swap;}}" : string.Empty;
        var background = settings.BackgroundAssetId is Guid backgroundId ? $"url('/api/public/assets/{backgroundId}')" : "none";
        return $$"""
            {{fontFace}}
            :root{--bg:{{settings.BackgroundColor}};--card:{{settings.CardColor}};--text:{{settings.TextColor}};--accent:{{settings.AccentColor}};--on-accent:{{settings.AccentTextColor}};}
            *{box-sizing:border-box;margin:0;padding:0}
            html,body{min-height:100%}
            body{font-family:'RegFont',Inter,'Segoe UI',Tahoma,system-ui,sans-serif;color:var(--text);background:var(--bg) {{background}} center/cover no-repeat fixed;min-height:100vh;min-height:100dvh;display:flex;align-items:flex-start;justify-content:center;padding:clamp(1rem,4vw,3rem) 1rem}
            .card{width:min(100%,560px);background:var(--card);border:1px solid color-mix(in srgb,var(--text) 14%,transparent);border-radius:8px;padding:clamp(1.25rem,4vw,2.25rem)}
            .logo{display:flex;justify-content:center;margin-bottom:1.25rem}.logo img{max-height:72px;max-width:70%;object-fit:contain}
            .event{font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;opacity:.7;text-align:center}
            h1{font-size:clamp(1.4rem,4vw,1.8rem);line-height:1.25;margin:.35rem 0 .6rem;text-align:center}
            .intro{opacity:.85;line-height:1.6;text-align:center;margin-bottom:1.5rem}
            form{display:grid;gap:1rem}
            label{display:grid;gap:.4rem;font-size:.9rem;font-weight:600}
            .req{color:var(--accent);margin-left:.15rem}
            input,select,textarea{width:100%;font:inherit;font-weight:400;color:var(--text);background:color-mix(in srgb,var(--bg) 70%,var(--card));border:1px solid color-mix(in srgb,var(--text) 22%,transparent);border-radius:6px;padding:.75rem .85rem;min-height:46px}
            textarea{min-height:96px;resize:vertical}
            input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
            .choice{display:flex;gap:.6rem}.choice label{flex:1;display:flex;align-items:center;gap:.5rem;font-weight:500;border:1px solid color-mix(in srgb,var(--text) 22%,transparent);border-radius:6px;padding:.7rem .85rem;cursor:pointer}
            .choice input{width:auto;min-height:0;accent-color:var(--accent)}
            .error{color:#ff8a8f;font-size:.8rem;font-weight:500;min-height:0}
            .invalid{border-color:#ff8a8f!important}
            .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
            button,.btn{appearance:none;border:0;border-radius:6px;background:var(--accent);color:var(--on-accent);font:inherit;font-weight:700;padding:.9rem 1.25rem;min-height:48px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:.5rem;width:100%}
            .btn.secondary{background:transparent;color:var(--text);border:1px solid color-mix(in srgb,var(--text) 30%,transparent)}
            button:disabled{opacity:.6;cursor:wait}
            .form-error{color:#ff8a8f;text-align:center;font-size:.9rem;min-height:1.2rem}
            .done{display:none;text-align:center}.done h2{font-size:1.5rem;margin-bottom:.5rem}.done p{opacity:.85;line-height:1.6}
            .qr{background:#fff;display:inline-block;padding:.75rem;border-radius:6px;margin:1.25rem auto}.qr img{display:block;width:min(220px,60vw);height:auto;image-rendering:pixelated}
            .actions{display:grid;gap:.6rem;margin-top:.5rem}
            .foot{margin-top:1.5rem;text-align:center;font-size:.75rem;opacity:.55}
            """;
    }

    private static string FieldHtml(RegistrationFieldDto field)
    {
        var type = field.Key switch { "email" => "email", "phone" => "tel", _ => "text" };
        var auto = field.Key switch { "name" => "name", "email" => "email", "phone" => "tel", "position" => "organization-title", "company" => "organization", _ => "off" };
        var mode = field.Key == "phone" ? " inputmode=\"tel\"" : field.Key == "email" ? " inputmode=\"email\"" : string.Empty;
        return $"""
            <label>{E(field.Label)}{(field.Required ? "<span class=\"req\">*</span>" : string.Empty)}
              <input type="{type}" name="f:{field.Key}" autocomplete="{auto}"{mode}{(field.Required ? " required" : string.Empty)} maxlength="{(field.Key == "email" ? 256 : field.Key == "name" ? 120 : 200)}" />
              <span class="error" data-for="{field.Key}"></span>
            </label>
            """;
    }

    private static string QuestionHtml(RegistrationQuestionDto question)
    {
        var name = $"q:{question.Id}";
        var required = question.Required ? " required" : string.Empty;
        var star = question.Required ? "<span class=\"req\">*</span>" : string.Empty;
        var placeholder = question.Placeholder is null ? string.Empty : $" placeholder=\"{E(question.Placeholder)}\"";
        var control = question.Type switch
        {
            "textarea" => $"<textarea name=\"{name}\" maxlength=\"1000\"{placeholder}{required}></textarea>",
            "select" => $"<select name=\"{name}\"{required}><option value=\"\">Choose…</option>{string.Concat((question.Options ?? []).Select(option => $"<option>{E(option)}</option>"))}</select>",
            "yesno" => $"<span class=\"choice\"><label><input type=\"radio\" name=\"{name}\" value=\"Yes\"{required}> Yes</label><label><input type=\"radio\" name=\"{name}\" value=\"No\"> No</label></span>",
            _ => $"<input type=\"text\" name=\"{name}\" maxlength=\"1000\"{placeholder}{required} />",
        };
        return $"<label>{E(question.Label)}{star}{control}<span class=\"error\" data-for=\"q:{E(question.Id)}\"></span></label>";
    }

    /// <param name="preview">"form" or "done" for the admin preview (nothing is sent); null for the live page.</param>
    private static string Render(RegistrationSettingsDto settings, Event item, string? preview)
    {
        var logo = settings.LogoAssetId is Guid logoId ? $"<div class=\"logo\"><img src=\"/api/public/assets/{logoId}\" alt=\"{E(item.Name)}\" /></div>" : string.Empty;
        var fields = string.Concat((settings.Fields ?? DefaultFields()).Where(field => field.Enabled).Select(FieldHtml));
        var questions = string.Concat((settings.Questions ?? []).Select(QuestionHtml));
        var api = $"{ApiBase}/{item.Slug}";
        return $$"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
            <meta name="robots" content="noindex, nofollow" />
            <title>{{E(settings.Title)}} | {{E(item.Name)}}</title>
            <style>{{Styles(settings)}}</style>
            </head>
            <body data-preview="{{preview ?? string.Empty}}" data-api="{{api}}">
            <main class="card">
              {{logo}}
              <section id="formView">
                <p class="event">{{E(item.Name)}}</p>
                <h1>{{E(settings.Title)}}</h1>
                <p class="intro">{{E(settings.Intro)}}</p>
                <form id="form" novalidate>
                  {{fields}}
                  {{questions}}
                  <div class="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off" /></label></div>
                  <p class="form-error" id="formError" role="alert"></p>
                  <button type="submit" id="submit">{{E(settings.SubmitButton)}}</button>
                </form>
              </section>
              <section id="doneView" class="done" aria-live="polite">
                <h2>{{E(settings.SuccessTitle)}}</h2>
                <p id="doneText">{{E(settings.SuccessText)}}</p>
                <div class="qr" id="qrBox"><img id="qr" alt="Your entry QR code" /></div>
                <div class="actions">
                  <a class="btn" id="badge" href="#" style="display:none">{{E(settings.DownloadButton)}}</a>
                  <a class="btn secondary" id="wallet" href="#" style="display:none">{{E(settings.WalletButton)}}</a>
                </div>
              </section>
              <p class="foot">Your details are used for this event only.</p>
            </main>
            <script>
            (function () {
              var body = document.body, form = document.getElementById('form'), submit = document.getElementById('submit');
              var preview = body.getAttribute('data-preview'), api = body.getAttribute('data-api');
              var formError = document.getElementById('formError');
              function show(token, hasBadge, walletReady, text) {
                document.getElementById('formView').style.display = 'none';
                document.getElementById('doneView').style.display = 'block';
                if (text) document.getElementById('doneText').textContent = text;
                var qr = document.getElementById('qr');
                if (token) {
                  qr.src = '/api/public/rsvp/qr?g=' + encodeURIComponent(token);
                  var badge = document.getElementById('badge');
                  if (hasBadge) { badge.href = '/api/public/rsvp/e-badge?g=' + encodeURIComponent(token) + '&download=1'; badge.style.display = ''; }
                  var wallet = document.getElementById('wallet');
                  if (walletReady) { wallet.href = '/api/public/rsvp/wallet?g=' + encodeURIComponent(token); wallet.style.display = ''; }
                } else if (preview) {
                  qr.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><rect width="21" height="21" fill="#fff"/><path d="M1 1h7v7H1zM13 1h7v7h-7zM1 13h7v7H1z" fill="none" stroke="#111" stroke-width="1"/><path d="M3 3h3v3H3zM15 3h3v3h-3zM3 15h3v3H3zM10 2h1v2h-1zM10 10h2v1h-2zM14 12h2v2h-2zM17 16h2v2h-2zM12 17h1v3h-1z" fill="#111"/></svg>');
                  document.getElementById('badge').style.display = '';
                } else {
                  document.getElementById('qrBox').style.display = 'none';
                }
                window.scrollTo(0, 0);
              }
              if (preview === 'done') { show(null, true, false); return; }
              form.addEventListener('submit', function (event) {
                event.preventDefault();
                if (preview) return;
                document.querySelectorAll('.error').forEach(function (node) { node.textContent = ''; });
                document.querySelectorAll('.invalid').forEach(function (node) { node.classList.remove('invalid'); });
                formError.textContent = '';
                var fields = {}, answers = {};
                new FormData(form).forEach(function (value, key) {
                  if (key.indexOf('f:') === 0) fields[key.slice(2)] = String(value);
                  else if (key.indexOf('q:') === 0) answers[key.slice(2)] = String(value);
                });
                var website = form.querySelector('[name="website"]').value;
                submit.disabled = true;
                fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: fields, answers: answers, website: website }) })
                  .then(function (response) { return response.json().catch(function () { return { ok: false, message: 'Something went wrong. Please try again.' }; }); })
                  .then(function (result) {
                    submit.disabled = false;
                    if (result.ok) { show(result.token, result.hasBadge, result.walletReady, result.message); return; }
                    formError.textContent = result.message || 'Something went wrong. Please try again.';
                    var errors = result.errors || {};
                    Object.keys(errors).forEach(function (key) {
                      var slot = document.querySelector('.error[data-for="' + key + '"]');
                      if (slot) slot.textContent = errors[key];
                      var input = form.querySelector('[name="' + (key.indexOf('q:') === 0 ? key : 'f:' + key) + '"]');
                      if (input) input.classList.add('invalid');
                    });
                    var first = form.querySelector('.invalid');
                    if (first) first.focus();
                  })
                  .catch(function () { submit.disabled = false; formError.textContent = 'Could not reach the server. Check your connection and try again.'; });
              });
            })();
            </script>
            </body>
            </html>
            """;
    }

    private static string RenderClosed(RegistrationSettingsDto settings, Event item, string text)
    {
        var logo = settings.LogoAssetId is Guid logoId ? $"<div class=\"logo\"><img src=\"/api/public/assets/{logoId}\" alt=\"{E(item.Name)}\" /></div>" : string.Empty;
        return $$"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <meta name="robots" content="noindex, nofollow" />
            <title>{{E(item.Name)}}</title>
            <style>{{Styles(settings)}}</style>
            </head>
            <body>
            <main class="card" style="text-align:center">
              {{logo}}
              <p class="event">{{E(item.Name)}}</p>
              <h1>{{E(settings.Title)}}</h1>
              <p class="intro" style="margin-bottom:0">{{E(text)}}</p>
            </main>
            </body>
            </html>
            """;
    }

    private static string Notice(string title, string text) =>
        $$"""
        <!DOCTYPE html>
        <html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="robots" content="noindex, nofollow"><title>{{E(title)}}</title>
        <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#111210;color:#f4f4f5;font-family:Inter,'Segoe UI',sans-serif;text-align:center;padding:24px;box-sizing:border-box}h1{font-size:1.4rem;margin:0 0 .5rem}p{opacity:.8}</style>
        </head><body><main><h1>{{E(title)}}</h1><p>{{E(text)}}</p></main></body></html>
        """;
}
