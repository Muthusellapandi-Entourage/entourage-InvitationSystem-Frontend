namespace Entourage.Application.DTOs;

public sealed record GuestTypeDto(
    Guid Id,
    string Name,
    int SortOrder,
    bool IsEnabled,
    int GuestCount,
    bool InvitationConfigured,
    bool BadgeConfigured,
    DateTime UpdatedOn);

public sealed record CreateGuestTypeRequest(string Name);

public sealed record UpdateGuestTypeRequest(string Name, bool IsEnabled);

public sealed record ReorderGuestTypesRequest(Guid[] Ids);

public sealed record DuplicateDesignRequest(string Category, Guid DestinationGuestTypeId, bool Replace);

public sealed record GuestTypeInvitationDto(
    InvitationDesignDto Design,
    string? Html,
    DateTime? UpdatedOn,
    bool Configured);

public sealed record GuestTypeBadgeDto(BadgeDesignDto Design, DateTime? UpdatedOn, bool Configured);

public sealed record GuestDto(
    Guid Id,
    string Name,
    string? Email,
    string? Position,
    Guid? GuestTypeId,
    string? GuestTypeName,
    bool? GuestTypeEnabled,
    string CheckInCode,
    int InvitationCount,
    int BadgeCount,
    DateTime? LastInvitationOn,
    string? LastInvitationTypeName,
    DateTime? LastBadgeOn,
    string? LastBadgeTypeName);

public sealed record SaveGuestRequest(
    string Name,
    string? Email,
    string? Position,
    Guid? GuestTypeId,
    bool AcknowledgeTypeChange);

public sealed record ReassignGuestsRequest(Guid[] GuestIds, Guid GuestTypeId, bool AcknowledgeTypeChange);

public sealed record GuestIdsRequest(Guid[] GuestIds);

public sealed record ImportGuestRowDto(int Row, string? Name, string? Email, string? Position, string? GuestType);

public sealed record ImportTypeMapping(string Value, Guid? GuestTypeId, bool Create);

public sealed record ImportGuestsRequest(
    ImportGuestRowDto[] Rows,
    ImportTypeMapping[]? Mappings,
    bool Commit);

public sealed record ImportRowErrorDto(int Row, string Message);

public sealed record ImportGuestsResultDto(
    bool Complete,
    int ReadyCount,
    int CreatedCount,
    ImportRowErrorDto[] Errors,
    string[] UnmatchedTypes,
    string Message);

public sealed record GuestBlockDto(Guid GuestId, string Name, string Reason);

public sealed record GuestOperationItem(Guid GuestId, string Name, string GuestTypeName);

public sealed record GuestOperationResult(
    bool Complete,
    GuestOperationItem[] Issued,
    GuestBlockDto[] Blocked,
    string Message);

public sealed record BadgeGenerationDto(
    Guid GuestId,
    Guid GuestTypeId,
    string Name,
    string GuestTypeName,
    string QrPayload,
    BadgeDesignDto Design);

public sealed record BadgeBatchDto(
    bool Complete,
    BadgeGenerationDto[] Ready,
    GuestBlockDto[] Blocked,
    string Message);
