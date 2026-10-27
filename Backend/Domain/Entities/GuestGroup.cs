namespace Entourage.Domain.Entities;

/// <summary>
/// A named list of guests on one event (for example a company or a delegation).
/// Independent of <see cref="GuestType"/>: the type decides the invitation and badge design,
/// the group is how guests are organised, imported, downloaded and emailed together.
/// A guest belongs to at most one group.
/// </summary>
public sealed class GuestGroup
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public string Name { get; set; } = string.Empty;

    public DateTime CreatedOn { get; set; }

    public DateTime UpdatedOn { get; set; }

    public Event? Event { get; set; }
}
