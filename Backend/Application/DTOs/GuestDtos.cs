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
    string? LastBadgeTypeName,
    Guid? GuestGroupId = null,
    string? GuestGroupName = null,
    string RsvpStatus = "Pending",
    DateTime? RsvpUpdatedOn = null,
    DateTime? LastEmailedOn = null,
    string? InvitationUrl = null,
    string? DeclineReason = null,
    string? InviteToken = null);

public sealed record GuestActivityDto(Guid Id, string Kind, string? Detail, DateTime CreatedOn);

/// <param name="Status">"Pending", "Accepted" or "Declined".</param>
public sealed record SetGuestRsvpRequest(string Status);

/// <summary>Something done in the browser that should show in the guest's history, e.g. a PDF download.</summary>
public sealed record LogGuestActivityRequest(string Kind, string? Detail);

/// <param name="Reminder">True sends a "Reminder" email of the same invitation.</param>
public sealed record EmailGuestsRequest(Guid[] GuestIds, bool Reminder = false);

public sealed record SaveGuestRequest(
    string Name,
    string? Email,
    string? Position,
    Guid? GuestTypeId,
    bool AcknowledgeTypeChange,
    Guid? GuestGroupId = null);

public sealed record GuestGroupDto(Guid Id, string Name, int GuestCount, DateTime CreatedOn, DateTime UpdatedOn);

public sealed record SaveGuestGroupRequest(string Name);

/// <summary>Move guests into a group, or out of every group when <see cref="GuestGroupId"/> is null.</summary>
public sealed record MoveGuestsToGroupRequest(Guid[] GuestIds, Guid? GuestGroupId);

public sealed record DeleteGuestGroupResult(string GroupName, int GuestsDeleted, int GuestsUngrouped, string Message);

public sealed record DeleteGuestsResult(int Deleted, int SeatsCleared, string Message);

public sealed record ReassignGuestsRequest(Guid[] GuestIds, Guid GuestTypeId, bool AcknowledgeTypeChange);

public sealed record GuestIdsRequest(Guid[] GuestIds);

/// <param name="Group">Optional group name from a "Group" column. Unknown names are created on import.</param>
public sealed record ImportGuestRowDto(int Row, string? Name, string? Email, string? Position, string? GuestType, string? Group = null);

public sealed record ImportTypeMapping(string Value, Guid? GuestTypeId, bool Create);

/// <param name="GuestGroupId">Put every imported guest in this group (a row's own Group column wins).</param>
public sealed record ImportGuestsRequest(
    ImportGuestRowDto[] Rows,
    ImportTypeMapping[]? Mappings,
    bool Commit,
    Guid? GuestGroupId = null);

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
