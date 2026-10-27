namespace Entourage.Application.DTOs;

/// <summary>What the door scanner read: a check-in code, a GUID, or a link carrying one.</summary>
public sealed record CheckInScanRequest(string? Code);

/// <param name="Status">"CheckedIn" (first scan), "AlreadyCheckedIn", "NotFound" or "Invalid".</param>
public sealed record CheckInResultDto(string Status, string Message, CheckInGuestDto? Guest);

/// <param name="Company">The guest's group (companies are usually imported as groups).</param>
public sealed record CheckInGuestDto(
    Guid Id,
    string Name,
    string? Company,
    string? Position,
    string? GuestTypeName,
    string RsvpStatus,
    int CheckInCount,
    DateTime? FirstCheckedInOn,
    DateTime? LastCheckedInOn,
    DateTime? SeatedOn,
    CheckInHistoryItemDto[] History);

/// <summary>The live attendance board: totals and the most recent door scans, newest first.</summary>
public sealed record LiveAttendanceDto(int TotalGuests, int CheckedIn, int Seated, LiveScanDto[] Scans);

/// <param name="Code">The guest's check-in code (what the E-Badge QR holds).</param>
/// <param name="FirstScan">True for the guest's first check-in; false for a repeat scan.</param>
public sealed record LiveScanDto(
    Guid Id,
    Guid GuestId,
    string Name,
    string? Position,
    string? Company,
    string? GuestTypeName,
    string Code,
    bool FirstScan,
    bool IsSeated,
    DateTime At,
    string? Seat = null);

/// <summary>What the shared, read-only live attendance link shows.</summary>
/// <param name="Status">"Draft", "Active" or "Archived".</param>
public sealed record PublicLiveAttendanceDto(string EventName, string Timezone, string Status, LiveAttendanceDto Live);

/// <param name="Token">The secret part of the viewer link (/live/{token}); null when sharing is off.</param>
public sealed record LiveShareDto(string? Token);

/// <param name="Kind">"Checked in" or "Seated".</param>
public sealed record CheckInHistoryItemDto(string Kind, DateTime At);
