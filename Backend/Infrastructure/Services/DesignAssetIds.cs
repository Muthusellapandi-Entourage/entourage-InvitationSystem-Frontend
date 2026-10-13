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
            Collect(invitation.BadgeDesignJson, ids, "backgroundAssetId");
        }

        var types = await db.GuestTypes.AsNoTracking()
            .Where(item => item.EventId == eventId)
            .Select(item => new { item.InvitationDesignJson, item.BadgeDesignJson })
            .ToListAsync(cancellationToken);
        foreach (var type in types)
        {
            Collect(type.InvitationDesignJson, ids, "headerAssetId", "detailsAssetId", "acceptAssetId", "declineAssetId");
            Collect(type.BadgeDesignJson, ids, "backgroundAssetId");
        }

        return ids.ToArray();
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
