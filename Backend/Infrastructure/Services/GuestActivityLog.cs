using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;

namespace Entourage.Infrastructure.Services;

/// <summary>Adds lines to a guest's activity history. Saved with the caller's SaveChanges.</summary>
public static class GuestActivityLog
{
    public static void Add(AppDbContext db, Guid guestId, string kind, string? detail = null, DateTime? at = null)
    {
        db.GuestActivities.Add(new GuestActivity
        {
            Id = Guid.CreateVersion7(),
            GuestId = guestId,
            Kind = kind,
            Detail = detail is { Length: > 300 } ? detail[..300] : detail,
            CreatedOn = at ?? DateTime.UtcNow,
        });
    }
}
