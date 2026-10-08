using Entourage.Domain.Enums;

namespace Entourage.Application.DTOs;

public sealed class EventWriteRequest
{
    public string Name { get; set; } = string.Empty;

    public string Slug { get; set; } = string.Empty;

    public string? Description { get; set; }

    public DateOnly StartDate { get; set; }

    public DateOnly EndDate { get; set; }

    public string Timezone { get; set; } = string.Empty;

    public EventStatus Status { get; set; } = EventStatus.Draft;
}

public sealed class UpdateEventStatusRequest
{
    public EventStatus? Status { get; set; }
}

public sealed record EventDto(
    Guid Id,
    string Name,
    string Slug,
    string? Description,
    DateOnly StartDate,
    DateOnly EndDate,
    string Timezone,
    EventStatus Status,
    bool IsActive,
    Guid CreatedBy,
    DateTime CreatedOn,
    DateTime UpdatedOn);
