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
    DateTime UpdatedOn,
    string? CustomDomain = null,
    DateTime? CustomDomainVerifiedOn = null);

/// <summary>The event's own web address and how to point it at this server.</summary>
/// <param name="Domain">e.g. "excellenceawards2026.com"; null when none is set.</param>
/// <param name="VerifiedOn">When the domain was last confirmed to reach this server.</param>
/// <param name="InUse">True when invitations use the domain (it is set and confirmed).</param>
/// <param name="DnsTarget">What the domain's DNS should point to (a host name for CNAME, or an IP address for an A record).</param>
/// <param name="ExampleUrl">A sample personal invitation link on the domain.</param>
public sealed record EventDomainDto(
    string? Domain,
    DateTime? VerifiedOn,
    bool InUse,
    string? DnsTarget,
    string? DnsRecordType,
    string? ExampleUrl);

public sealed record SetEventDomainRequest(string Domain);

/// <param name="Reachable">The domain answered with this event's check code.</param>
/// <param name="Secure">It answered over HTTPS (http only otherwise).</param>
public sealed record EventDomainCheckDto(bool Reachable, bool Secure, string Message, EventDomainDto Domain);
