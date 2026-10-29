using System.Text.Json;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

internal static class DesignAssetIds
{
    public static async Task<Guid[]> KeepSet(AppDbContext db, Guid eventId, CancellationToken cancellationToken)
    {
        var ids = new HashSet<Guid>();
        var invitation = await db.Invitations.AsNoTracking()
            .FirstOrDefaultAsync(item => item.EventId == eventId, cancellationToken);
        if (invitation is not null)
        {
            Collect(invitation.DesignJson, ids, "headerAssetId", "detailsAssetId", "acceptAssetId", "declineAssetId");
            CollectPass(invitation.BadgeDesignJson, ids);
        }

        var types = await db.GuestTypes.AsNoTracking()
            .Where(item => item.EventId == eventId)
            .Select(item => new { item.InvitationDesignJson, item.BadgeDesignJson, item.PrintBadgeDesignJson })
            .ToListAsync(cancellationToken);
        foreach (var type in types)
        {
            Collect(type.InvitationDesignJson, ids, "headerAssetId", "detailsAssetId", "acceptAssetId", "declineAssetId");
            CollectSlices(type.InvitationDesignJson, ids);
            CollectPass(type.BadgeDesignJson, ids);
            // Printed badge background and pictures.
            foreach (var id in PrintBadgeService.AssetIds(type.PrintBadgeDesignJson))
            {
                ids.Add(id);
            }
        }

        // The thank-you artwork and the RSVP page's background and logo too.
        var rsvp = await db.Events.AsNoTracking()
            .Where(item => item.Id == eventId)
            .Select(item => new { item.ThankYouAssetId, item.RsvpPageJson, item.RegistrationJson, item.KioskJson, item.BrandKitJson })
            .FirstOrDefaultAsync(cancellationToken);
        if (rsvp?.ThankYouAssetId is Guid thankYouId)
        {
            ids.Add(thankYouId);
        }

        // Brand kit images are kept even when no design uses them yet.
        foreach (var id in BrandKitService.AssetIds(rsvp?.BrandKitJson))
        {
            ids.Add(id);
        }

        var page = RsvpPageService.Read(rsvp?.RsvpPageJson);
        foreach (var id in new[] { page.BackgroundAssetId, page.LogoAssetId }.OfType<Guid>())
        {
            ids.Add(id);
        }

        // The self-registration page's background and logo.
        var registration = RegistrationService.Read(rsvp?.RegistrationJson);
        foreach (var id in new[] { registration.BackgroundAssetId, registration.LogoAssetId }.OfType<Guid>())
        {
            ids.Add(id);
        }

        // The self check-in kiosk's background and logo.
        var kiosk = PrintBadgeService.ReadKiosk(rsvp?.KioskJson);
        foreach (var id in new[] { kiosk.BackgroundAssetId, kiosk.LogoAssetId }.OfType<Guid>())
        {
            ids.Add(id);
        }

        // Microsite images must survive invitation and badge saves.
        var microsite = await db.EventMicrosites.AsNoTracking()
            .Where(item => item.EventId == eventId)
            .Select(item => item.DesignJson)
            .FirstOrDefaultAsync(cancellationToken);
        if (!string.IsNullOrWhiteSpace(microsite))
        {
            try
            {
                var design = JsonSerializer.Deserialize<Entourage.Application.DTOs.MicrositeDesignDto>(microsite, Web);
                foreach (var id in MicrositeRenderer.AssetIds(design))
                {
                    ids.Add(id);
                }
            }
            catch (JsonException)
            {
                // A damaged design must not cause its images to be deleted elsewhere; keep nothing extra.
            }
        }

        return ids.ToArray();
    }

    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    /// <summary>Keeps a digital pass's background and image elements.</summary>
    public static void CollectPass(string? json, HashSet<Guid> ids)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return;
        }

        try
        {
            var design = JsonSerializer.Deserialize<Entourage.Application.DTOs.BadgeDesignDto>(json, Web);
            foreach (var id in design?.AssetIds() ?? [])
            {
                ids.Add(id);
            }
        }
        catch (JsonException)
        {
            // A damaged document must not cause another design's images to be deleted.
            Collect(json, ids, "backgroundAssetId");
        }
    }

    /// <summary>Keeps every image a "single image" design uses (source, strips, button pieces).</summary>
    public static void CollectSlices(string? json, HashSet<Guid> ids)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return;
        }

        try
        {
            var design = JsonSerializer.Deserialize<Entourage.Application.DTOs.InvitationDesignDto>(json, Web);
            foreach (var id in Entourage.Application.Invitations.InvitationEmailBuilder.SliceAssetIds(design?.Slices))
            {
                ids.Add(id);
            }
        }
        catch (JsonException)
        {
            // A damaged document must not cause another template's images to be deleted.
        }
    }

    public static void Collect(string? json, HashSet<Guid> ids, params string[] names)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return;
            }

            foreach (var name in names)
            {
                if (!document.RootElement.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String)
                {
                    continue;
                }

                if (Guid.TryParse(value.GetString(), out var id))
                {
                    ids.Add(id);
                }
            }
        }
        catch (JsonException)
        {
            // A damaged document must not cause another template's images to be deleted.
        }
    }
}
