using System.Security.Cryptography;
using System.Text.Json;
using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Domain.Entities;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

/* ---------------- print badge design ---------------- */

/// <summary>
/// One element on the printed badge, positioned in millimetres from the top-left of the paper.
/// Kind: name, position, company, guestType, seat, text (fixed text), qr (check-in QR), image (uploaded picture).
/// </summary>
public sealed record PrintBadgeElementDto(
    string Id,
    string Kind,
    double X,
    double Y,
    double Width,
    double Height,
    double FontSize = 14,
    string FontWeight = "bold",
    string Color = "#111111",
    string Align = "center",
    string Valign = "middle",
    bool Uppercase = false,
    string? Text = null,
    string? Font = null,
    Guid? AssetId = null);

/// <summary>The printed badge for a guest type: paper size in mm, background, and the elements on it.</summary>
public sealed record PrintBadgeDesignDto(
    double WidthMm,
    double HeightMm,
    string BackgroundColor,
    Guid? BackgroundAssetId,
    PrintBadgeElementDto[] Elements);

public sealed record PrintBadgeTemplateDto(Guid GuestTypeId, string GuestTypeName, bool Configured, PrintBadgeDesignDto Design);

/// <summary>What goes on one guest's printed badge.</summary>
public sealed record PrintGuestDto(Guid Id, string Name, string? Position, string? Company, string? GuestType, string? Seat, string CheckInCode);

/// <summary>Everything the browser needs to print a guest's badge (the standard badge when their type has no print design yet).</summary>
public sealed record PrintPayloadDto(PrintBadgeDesignDto? Design, PrintGuestDto Guest);

/* ---------------- kiosk ---------------- */

/// <summary>Look and wording of the self check-in kiosk.</summary>
public sealed record KioskSettingsDto(
    string WelcomeTitle = "Welcome",
    string WelcomeText = "Scan the QR code on your digital pass to check in and print your badge.",
    string ConfirmTitle = "Is this you?",
    string ConfirmButton = "Confirm & print badge",
    string CancelButton = "Not me",
    string PrintingText = "Printing your badge…",
    string DoneTitle = "You're checked in",
    string DoneText = "Please collect your badge from the printer. Enjoy the event!",
    string AlreadyText = "You are already checked in.",
    string DeclinedText = "We could not check you in here. Please see the front desk.",
    string NotFoundText = "We could not find this badge. Please see the front desk.",
    bool AllowReprint = true,
    bool ShowSeat = true,
    bool UseCamera = false,
    int ResetSeconds = 8,
    Guid? BackgroundAssetId = null,
    Guid? LogoAssetId = null,
    string BackgroundColor = "#111210",
    string CardColor = "#1D1F1B",
    string TextColor = "#F4F4F5",
    string AccentColor = "#38B8A2",
    string AccentTextColor = "#111210");

public sealed record KioskShareDto(string? Token);

public sealed record KioskInfoDto(string EventName, string Status, KioskSettingsDto Settings);

/// <summary>The guest found for a scanned code, shown on the kiosk's "Is this you?" step.</summary>
public sealed record KioskLookupDto(string Status, string Message, PrintGuestDto? Guest, bool AlreadyCheckedIn);

/// <summary>Result of confirming at the kiosk: the check-in outcome plus what to print.</summary>
public sealed record KioskConfirmDto(string Status, string Message, PrintPayloadDto? Print);

/// <summary>
/// Printed badges (a design per guest type, separate from the E-Badge), the data to print one, and the
/// self check-in kiosk (/kiosk/{token}): scan → "Is this you?" → check in and print.
/// </summary>
public sealed class PrintBadgeService(AppDbContext db, CheckInService checkIn)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly string[] Kinds = ["name", "position", "company", "guestType", "seat", "text", "qr", "image"];
    private const string KioskSource = "self check-in";

    /// <summary>A 4 × 3 inch badge with name, position, company and QR code, used until the type is designed.</summary>
    public static PrintBadgeDesignDto DefaultDesign() => new(
        101.6,
        76.2,
        "#FFFFFF",
        null,
        [
            new("name", "name", 6, 14, 89.6, 16, 22, "bold", "#111111", "center", "middle", false),
            new("position", "position", 6, 31, 89.6, 8, 11, "regular", "#444444", "center", "middle", false),
            new("company", "company", 6, 39, 89.6, 8, 11, "bold", "#38B8A2", "center", "middle", true),
            new("qr", "qr", 38.3, 50, 25, 25, Color: "#000000"),
        ]);

    /* ---------------- design (admin) ---------------- */

    public async Task<PrintBadgeTemplateDto> GetDesignAsync(Guid eventId, Guid guestTypeId, CancellationToken cancellationToken)
    {
        var type = await db.GuestTypes.AsNoTracking().FirstOrDefaultAsync(item => item.Id == guestTypeId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Guest category not found.");
        var design = Read(type.PrintBadgeDesignJson);
        return new PrintBadgeTemplateDto(type.Id, type.Name, design is not null, design ?? DefaultDesign());
    }

    public async Task<PrintBadgeTemplateDto> SaveDesignAsync(Guid eventId, Guid guestTypeId, PrintBadgeDesignDto input, CancellationToken cancellationToken)
    {
        var type = await db.GuestTypes.FirstOrDefaultAsync(item => item.Id == guestTypeId && item.EventId == eventId, cancellationToken)
            ?? throw AppException.NotFound("Guest category not found.");
        var design = Clean(input);
        var images = design.Elements.Select(element => element.AssetId).Append(design.BackgroundAssetId).OfType<Guid>().Distinct().ToArray();
        var present = images.Length == 0
            ? []
            : await db.EventAssets.AsNoTracking().Where(asset => asset.EventId == eventId && images.Contains(asset.Id)).Select(asset => asset.Id).ToListAsync(cancellationToken);
        design = design with
        {
            BackgroundAssetId = design.BackgroundAssetId is Guid background && present.Contains(background) ? background : null,
            Elements = design.Elements.Where(element => element.Kind != "image" || element.AssetId is Guid asset && present.Contains(asset)).ToArray(),
        };

        type.PrintBadgeDesignJson = JsonSerializer.Serialize(design, Json);
        type.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return new PrintBadgeTemplateDto(type.Id, type.Name, true, design);
    }

    public static PrintBadgeDesignDto? Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return null;
        }

        try
        {
            var design = JsonSerializer.Deserialize<PrintBadgeDesignDto>(json, Json);
            return design is null ? null : Clean(design);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>Images a print badge design uses, so they are kept when other designs are saved.</summary>
    public static IEnumerable<Guid> AssetIds(string? json)
    {
        var design = Read(json);
        if (design is null)
        {
            return [];
        }

        return design.Elements.Select(element => element.AssetId).Append(design.BackgroundAssetId).OfType<Guid>();
    }

    private static PrintBadgeDesignDto Clean(PrintBadgeDesignDto input)
    {
        static double Clamp(double value, double min, double max) => double.IsFinite(value) ? Math.Round(Math.Clamp(value, min, max), 2) : min;
        var width = Clamp(input.WidthMm, 20, 300);
        var height = Clamp(input.HeightMm, 20, 300);
        var elements = (input.Elements ?? [])
            .Where(element => element is not null && Kinds.Contains(element.Kind))
            .Take(40)
            .Select((element, index) =>
            {
                var x = Clamp(element.X, -width, width);
                var y = Clamp(element.Y, -height, height);
                return element with
                {
                    Id = string.IsNullOrWhiteSpace(element.Id) || element.Id.Length > 40 ? $"e{index}" : element.Id,
                    X = x,
                    Y = y,
                    Width = Clamp(element.Width, 2, 300),
                    Height = Clamp(element.Height, 2, 300),
                    FontSize = Clamp(element.FontSize, 4, 120),
                    FontWeight = element.FontWeight is "regular" or "bold" or "semibold" ? element.FontWeight : "bold",
                    Color = HexColor.TryParse(element.Color, out _, out _, out _, out _) ? element.Color.ToUpperInvariant() : "#111111",
                    Align = element.Align is "left" or "center" or "right" ? element.Align : "center",
                    Valign = element.Valign is "top" or "middle" or "bottom" ? element.Valign : "middle",
                    Text = element.Kind == "text" ? (element.Text ?? string.Empty).Trim() is { Length: > 0 } text ? text[..Math.Min(text.Length, 300)] : "Text" : null,
                    Font = string.IsNullOrWhiteSpace(element.Font) ? null : element.Font.Trim()[..Math.Min(element.Font.Trim().Length, 60)],
                    AssetId = element.Kind == "image" ? element.AssetId : null,
                };
            })
            .ToArray();
        return new PrintBadgeDesignDto(
            width,
            height,
            HexColor.TryParse(input.BackgroundColor, out _, out _, out _, out _) ? input.BackgroundColor.ToUpperInvariant() : "#FFFFFF",
            input.BackgroundAssetId,
            elements);
    }

    /* ---------------- printing ---------------- */

    /// <summary>The guest's badge data and their type's print design (null when not designed yet).</summary>
    public async Task<PrintPayloadDto?> PayloadAsync(Guid eventId, Guid guestId, CancellationToken cancellationToken)
    {
        var guest = await db.Guests.AsNoTracking().FirstOrDefaultAsync(item => item.Id == guestId && item.EventId == eventId, cancellationToken);
        return guest is null ? null : await PayloadAsync(guest, cancellationToken);
    }

    private async Task<PrintPayloadDto> PayloadAsync(Guest guest, CancellationToken cancellationToken)
    {
        var type = guest.GuestTypeId is Guid typeId
            ? await db.GuestTypes.AsNoTracking().Where(item => item.Id == typeId).Select(item => new { item.Name, item.PrintBadgeDesignJson }).FirstOrDefaultAsync(cancellationToken)
            : null;
        // No saved print design yet (or no guest type): use the standard 4 × 3 in badge so printing always works.
        return new PrintPayloadDto(Read(type?.PrintBadgeDesignJson) ?? DefaultDesign(), await GuestAsync(guest, type?.Name, cancellationToken));
    }

    private async Task<PrintGuestDto> GuestAsync(Guest guest, string? typeName, CancellationToken cancellationToken)
    {
        var plan = await db.SeatingPlans.AsNoTracking().Where(item => item.EventId == guest.EventId).Select(item => item.DesignJson).FirstOrDefaultAsync(cancellationToken);
        return new PrintGuestDto(
            guest.Id,
            guest.Name,
            guest.Position,
            await CompanyAsync(guest, cancellationToken),
            typeName,
            SeatLabels.FromDesignJson(plan).GetValueOrDefault(guest.Id),
            guest.CheckInCode);
    }

    /// <summary>Company: the registration form's company answer, else the guest's group (not the automatic "Self-registered" one).</summary>
    private async Task<string?> CompanyAsync(Guest guest, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(guest.RegistrationAnswersJson))
        {
            try
            {
                var answers = JsonSerializer.Deserialize<List<RegistrationAnswerDto>>(guest.RegistrationAnswersJson, Json) ?? [];
                var company = answers.FirstOrDefault(answer => answer.Label.Contains("compan", StringComparison.OrdinalIgnoreCase) || answer.Label.Contains("organi", StringComparison.OrdinalIgnoreCase));
                if (!string.IsNullOrWhiteSpace(company?.Value)) return company.Value;
            }
            catch (JsonException)
            {
                // Fall back to the group.
            }
        }

        if (guest.GuestGroupId is not Guid groupId)
        {
            return null;
        }

        var name = await db.GuestGroups.AsNoTracking().Where(item => item.Id == groupId).Select(item => item.Name).FirstOrDefaultAsync(cancellationToken);
        return name is null || name == RegistrationService.DefaultGroupName ? null : name;
    }

    /// <summary>Notes a printed badge in the guest's history.</summary>
    public async Task LogPrintedAsync(Guid eventId, Guid guestId, string source, CancellationToken cancellationToken)
    {
        var exists = await db.Guests.AnyAsync(item => item.Id == guestId && item.EventId == eventId, cancellationToken);
        if (!exists)
        {
            throw AppException.NotFound("Guest not found.");
        }

        GuestActivityLog.Add(db, guestId, GuestActivityKinds.BadgePrinted, source, DateTime.UtcNow);
        await db.SaveChangesAsync(cancellationToken);
    }

    /* ---------------- kiosk (admin) ---------------- */

    public async Task<KioskSettingsDto> GetKioskSettingsAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var json = await db.Events.AsNoTracking().Where(item => item.Id == eventId).Select(item => new { item.KioskJson }).FirstOrDefaultAsync(cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        return ReadKiosk(json.KioskJson);
    }

    public async Task<KioskSettingsDto> SaveKioskSettingsAsync(Guid eventId, KioskSettingsDto input, CancellationToken cancellationToken)
    {
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken) ?? throw AppException.NotFound("Event not found.");
        var settings = CleanKiosk(input);
        var images = new[] { settings.BackgroundAssetId, settings.LogoAssetId }.OfType<Guid>().ToArray();
        var present = images.Length == 0
            ? []
            : await db.EventAssets.AsNoTracking().Where(asset => asset.EventId == eventId && images.Contains(asset.Id)).Select(asset => asset.Id).ToListAsync(cancellationToken);
        settings = settings with
        {
            BackgroundAssetId = settings.BackgroundAssetId is Guid background && present.Contains(background) ? background : null,
            LogoAssetId = settings.LogoAssetId is Guid logo && present.Contains(logo) ? logo : null,
        };
        item.KioskJson = JsonSerializer.Serialize(settings, Json);
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return settings;
    }

    public async Task<KioskShareDto> GetKioskShareAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var token = await db.Events.AsNoTracking().Where(item => item.Id == eventId).Select(item => new { item.KioskToken }).FirstOrDefaultAsync(cancellationToken)
            ?? throw AppException.NotFound("Event not found.");
        return new KioskShareDto(token.KioskToken);
    }

    public async Task<KioskShareDto> RenewKioskShareAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken) ?? throw AppException.NotFound("Event not found.");
        item.KioskToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return new KioskShareDto(item.KioskToken);
    }

    public async Task<KioskShareDto> DisableKioskShareAsync(Guid eventId, CancellationToken cancellationToken)
    {
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == eventId, cancellationToken) ?? throw AppException.NotFound("Event not found.");
        item.KioskToken = null;
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return new KioskShareDto(null);
    }

    public static KioskSettingsDto ReadKiosk(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new KioskSettingsDto();
        }

        try
        {
            return CleanKiosk(JsonSerializer.Deserialize<KioskSettingsDto>(json, Json) ?? new KioskSettingsDto());
        }
        catch (JsonException)
        {
            return new KioskSettingsDto();
        }
    }

    private static KioskSettingsDto CleanKiosk(KioskSettingsDto input)
    {
        var defaults = new KioskSettingsDto();
        static string Limit(string value, int max) => value.Length <= max ? value : value[..max];
        string Text(string? value, string fallback, int max = 300) => string.IsNullOrWhiteSpace(value) ? fallback : Limit(value.Trim(), max);
        string Colour(string? value, string fallback) => MicrositeRenderer.Color(value) ?? fallback;
        return new KioskSettingsDto(
            Text(input.WelcomeTitle, defaults.WelcomeTitle, 120),
            Text(input.WelcomeText, defaults.WelcomeText),
            Text(input.ConfirmTitle, defaults.ConfirmTitle, 120),
            Text(input.ConfirmButton, defaults.ConfirmButton, 60),
            Text(input.CancelButton, defaults.CancelButton, 60),
            Text(input.PrintingText, defaults.PrintingText, 120),
            Text(input.DoneTitle, defaults.DoneTitle, 120),
            Text(input.DoneText, defaults.DoneText),
            Text(input.AlreadyText, defaults.AlreadyText),
            Text(input.DeclinedText, defaults.DeclinedText),
            Text(input.NotFoundText, defaults.NotFoundText),
            input.AllowReprint,
            input.ShowSeat,
            input.UseCamera,
            Math.Clamp(input.ResetSeconds, 3, 60),
            input.BackgroundAssetId,
            input.LogoAssetId,
            Colour(input.BackgroundColor, defaults.BackgroundColor),
            Colour(input.CardColor, defaults.CardColor),
            Colour(input.TextColor, defaults.TextColor),
            Colour(input.AccentColor, defaults.AccentColor),
            Colour(input.AccentTextColor, defaults.AccentTextColor));
    }

    /* ---------------- kiosk (public) ---------------- */

    private async Task<Event> FindKioskAsync(string token, CancellationToken cancellationToken)
    {
        var key = (token ?? string.Empty).Trim().ToLowerInvariant();
        if (key.Length != 32 || !key.All(char.IsAsciiHexDigit))
        {
            throw AppException.NotFound("This self check-in screen link is not valid.");
        }

        var item = await db.Events.AsNoTracking().FirstOrDefaultAsync(entry => entry.KioskToken == key, cancellationToken)
            ?? throw AppException.NotFound("This self check-in screen link is not valid or has been turned off.");
        if (item.Status == EventStatus.Archived)
        {
            throw new AppException("This event has ended.", StatusCodes.Status410Gone);
        }

        return item;
    }

    public async Task<KioskInfoDto> KioskAsync(string token, CancellationToken cancellationToken)
    {
        var item = await FindKioskAsync(token, cancellationToken);
        return new KioskInfoDto(item.Name, item.Status.ToString(), ReadKiosk(item.KioskJson));
    }

    /// <summary>Step 1 at the kiosk: who is this? Nothing is recorded yet.</summary>
    public async Task<KioskLookupDto> LookupAsync(string token, string? raw, CancellationToken cancellationToken)
    {
        var item = await FindKioskAsync(token, cancellationToken);
        var settings = ReadKiosk(item.KioskJson);
        if (item.Status != EventStatus.Active)
        {
            return new KioskLookupDto(CheckInService.Closed, "Check-in has not opened yet.", null, false);
        }

        var code = CheckInService.ReadCode(raw);
        var guest = code is null
            ? null
            : await db.Guests.AsNoTracking().FirstOrDefaultAsync(entry => entry.EventId == item.Id && (entry.CheckInCode == code || entry.InviteToken == code), cancellationToken);
        if (guest is null)
        {
            return new KioskLookupDto(CheckInService.NotFound, settings.NotFoundText, null, false);
        }

        if (guest.RsvpStatus == GuestRsvp.Declined)
        {
            return new KioskLookupDto("Declined", settings.DeclinedText, null, false);
        }

        var typeName = guest.GuestTypeId is Guid typeId ? await db.GuestTypes.AsNoTracking().Where(entry => entry.Id == typeId).Select(entry => entry.Name).FirstOrDefaultAsync(cancellationToken) : null;
        var already = guest.FirstCheckedInOn is not null;
        return new KioskLookupDto(already ? CheckInService.AlreadyCheckedIn : "Found", already ? settings.AlreadyText : string.Empty, await GuestAsync(guest, typeName, cancellationToken), already);
    }

    /// <summary>Step 2 at the kiosk: check in and get the badge to print (a repeat print only when reprints are allowed).</summary>
    public async Task<KioskConfirmDto> ConfirmAsync(string token, string? raw, CancellationToken cancellationToken)
    {
        var item = await FindKioskAsync(token, cancellationToken);
        var settings = ReadKiosk(item.KioskJson);
        var lookup = await LookupAsync(token, raw, cancellationToken);
        if (lookup.Guest is null)
        {
            return new KioskConfirmDto(lookup.Status, lookup.Message, null);
        }

        if (lookup.AlreadyCheckedIn && !settings.AllowReprint)
        {
            return new KioskConfirmDto(CheckInService.AlreadyCheckedIn, $"{settings.AlreadyText} Please see the front desk for a new badge.", null);
        }

        var result = await checkIn.ScanAsync(item.Id, new CheckInScanRequest(raw), cancellationToken, KioskSource);
        if (result.Guest is null)
        {
            return new KioskConfirmDto(result.Status, result.Message, null);
        }

        return new KioskConfirmDto(result.Status, result.Message, await PayloadAsync(item.Id, result.Guest.Id, cancellationToken));
    }

    public async Task KioskPrintedAsync(string token, Guid guestId, CancellationToken cancellationToken)
    {
        var item = await FindKioskAsync(token, cancellationToken);
        await LogPrintedAsync(item.Id, guestId, KioskSource, cancellationToken);
    }
}
