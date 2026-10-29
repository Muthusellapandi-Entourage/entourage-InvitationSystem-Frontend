namespace Entourage.Infrastructure.Services.Accreditation;

/* ---------------- Setup ---------------- */

/// <summary>A pipeline stage. Kind: "open" (still being vetted), "approved" or "rejected".</summary>
public sealed record AccStageDto(string Key, string Name, string Kind, string Color);

/// <summary>Extra form field on an applicant type. Type: text, textarea, select, date, url.</summary>
public sealed record AccFieldDto(string Key, string Label, string Type, bool Required, string[]? Options);

/// <summary>Upload asked of an applicant type.</summary>
public sealed record AccDocumentRuleDto(string Key, string Label, bool Required, bool NeedsExpiry);

/// <summary>One email template. Placeholders: {{firstName}} {{lastName}} {{event}} {{organization}} {{badgeNumber}} {{reason}} {{stage}}.</summary>
public sealed record AccMailTemplateDto(bool Enabled, string Subject, string Body);

public sealed record AccNotificationsDto(AccMailTemplateDto Submitted, AccMailTemplateDto Approved, AccMailTemplateDto Rejected);

public sealed record AccEventSummaryDto(
    Guid Id,
    string Name,
    string Slug,
    string? Venue,
    DateOnly StartDate,
    DateOnly EndDate,
    string Timezone,
    string Status,
    bool PublicApplyEnabled,
    int Applicants,
    int Pending,
    int Approved,
    int Rejected,
    int Organizations,
    DateTime UpdatedOn,
    Guid? EventId = null);

public sealed record AccEventWriteRequest(
    string? Name,
    string? Slug,
    string? Venue,
    DateOnly? StartDate,
    DateOnly? EndDate,
    string? Timezone,
    string? Status,
    bool PublicApplyEnabled);

public sealed record AccCloneRequest(string? Name, string? Slug, DateOnly? StartDate, DateOnly? EndDate);

public sealed record AccZoneDto(Guid? Id, string Code, string Name, string Color, int? Capacity);

public sealed record AccProfileDto(Guid? Id, string Name, string Color, Guid[] ZoneIds);

public sealed record AccApplicantTypeDto(Guid? Id, string Name, AccFieldDto[] Fields, AccDocumentRuleDto[] Documents, Guid? DefaultProfileId);

public sealed record AccSetupDto(
    AccEventSummaryDto Event,
    AccZoneDto[] Zones,
    AccProfileDto[] Profiles,
    AccApplicantTypeDto[] Types,
    AccStageDto[] Stages,
    AccNotificationsDto Notifications,
    string PublicApplyPath);

/* ---------------- Organisations ---------------- */

public sealed record AccOrgUserDto(Guid Id, string Name, string Email, bool IsActive, bool InvitePending, DateTime? InviteExpiresOn, DateTime? LastLoginOn);

public sealed record AccOrganizationDto(
    Guid Id,
    string Name,
    Guid? ApplicantTypeId,
    string? ContactName,
    string? ContactEmail,
    string? ContactPhone,
    int? Quota,
    int Applicants,
    int Pending,
    int Approved,
    int Rejected,
    AccOrgUserDto[] Users);

public sealed record AccOrganizationWriteRequest(
    string? Name,
    Guid? ApplicantTypeId,
    string? ContactName,
    string? ContactEmail,
    string? ContactPhone,
    int? Quota);

public sealed record AccInviteRequest(string? Name, string? Email);

public sealed record AccActiveRequest(bool IsActive);

/// <summary>After an invitation: the updated list and the link (to copy when email is not set up).</summary>
public sealed record AccInviteResultDto(AccOrganizationDto[] Organizations, string Link);

/* ---------------- Applicants ---------------- */

public sealed record AccDocumentInput(string? Kind, string? Label, Guid FileId, DateOnly? ExpiresOn);

/// <summary>Create / update an applicant. IdNumber left null on update keeps the stored one.</summary>
public sealed record AccApplicantWriteRequest(
    Guid? OrganizationId,
    Guid? ApplicantTypeId,
    string? FirstName,
    string? LastName,
    string? Email,
    string? Phone,
    string? JobTitle,
    string? Nationality,
    DateOnly? DateOfBirth,
    string? IdNumber,
    Guid? PhotoFileId,
    Dictionary<string, string?>? CustomFields,
    AccDocumentInput[]? Documents);

public sealed record AccApplicantRowDto(
    Guid Id,
    string FirstName,
    string LastName,
    string? Email,
    string? JobTitle,
    string? Nationality,
    Guid? OrganizationId,
    string? Organization,
    Guid? ApplicantTypeId,
    string? ApplicantType,
    string StageKey,
    Guid? AccessProfileId,
    string? AccessProfile,
    int? BadgeNumber,
    Guid? PhotoFileId,
    string? IdNumberMasked,
    string Source,
    int DuplicateCount,
    int DocumentsPending,
    DateTime SubmittedOn,
    DateTime UpdatedOn);

public sealed record AccDocumentDto(Guid Id, string Kind, string Label, Guid FileId, string FileName, string ContentType, DateOnly? ExpiresOn, string Status, bool Expired, DateTime UploadedOn);

public sealed record AccDuplicateDto(Guid Id, string Name, string? Organization, string StageKey, string[] Reasons);

public sealed record AccAuditDto(Guid Id, Guid? ApplicantId, string? ApplicantName, string ActorName, string Action, string? Detail, DateTime CreatedOn);

public sealed record AccApplicantDetailDto(
    AccApplicantRowDto Summary,
    string? Phone,
    DateOnly? DateOfBirth,
    Dictionary<string, string?> CustomFields,
    Guid[] ExtraZoneIds,
    Guid[] EffectiveZoneIds,
    string? RejectionReason,
    string CredentialCode,
    DateTime? DecidedOn,
    string? DecidedByName,
    AccDocumentDto[] Documents,
    AccDuplicateDto[] Duplicates,
    AccAuditDto[] History);

public sealed record AccStageRequest(string? StageKey, string? Reason);

public sealed record AccBulkStageRequest(Guid[] Ids, string? StageKey, string? Reason);

public sealed record AccAccessRequest(Guid? AccessProfileId, Guid[]? ExtraZoneIds);

public sealed record AccDocumentStatusRequest(string? Status);

/// <summary>Result of a decision: what changed and any zone capacity warnings (capacity is warn-only).</summary>
public sealed record AccDecisionResult(int Updated, string[] Warnings, string[] Skipped);

public sealed record AccBulkRow(
    string? FirstName,
    string? LastName,
    string? Email,
    string? Phone,
    string? JobTitle,
    string? Nationality,
    string? DateOfBirth,
    string? IdNumber,
    string? ApplicantType,
    Guid? PhotoFileId,
    Dictionary<string, string?>? CustomFields);

public sealed record AccBulkRequest(Guid? OrganizationId, AccBulkRow[] Rows);

public sealed record AccBulkRowError(int Row, string Message);

public sealed record AccBulkResult(int Created, AccBulkRowError[] Errors);

public sealed record AccRevealDto(string? IdNumber);

public sealed record AccFileDto(Guid Id, string FileName, string ContentType, long Size);

/* ---------------- Overview ---------------- */

public sealed record AccCountDto(string Key, string Label, int Count, string? Color = null);

public sealed record AccZoneUsageDto(Guid Id, string Code, string Name, string Color, int? Capacity, int Used);

public sealed record AccOverviewDto(
    AccEventSummaryDto Event,
    AccCountDto[] ByStage,
    AccCountDto[] ByType,
    AccCountDto[] ByOrganization,
    AccZoneUsageDto[] Zones,
    int DuplicatesFlagged,
    int DocumentsPending,
    int DocumentsExpired,
    AccAuditDto[] Recent);

/* ---------------- Team ---------------- */

public sealed record AccTeamMemberDto(Guid Id, string FirstName, string LastName, string Email, string Role, bool IsActive, DateTime? LastLoginOn);

public sealed record AccTeamWriteRequest(string? FirstName, string? LastName, string? Email, string? Role, string? Password, bool IsActive);

/* ---------------- Portal / public ---------------- */

public sealed record AccInviteInfoDto(string Email, string Name, string Organization, string Event);

public sealed record AccAcceptInviteRequest(string? Name, string? Password);

public sealed record AccPortalLoginRequest(string? Email, string? Password, Guid? AccountId);

public sealed record AccPortalChoiceDto(Guid AccountId, string Organization, string Event);

/// <summary>Either a session token or, when one email has several organisations, the choices.</summary>
public sealed record AccPortalLoginResult(string? Token, DateTime? ExpiresOn, AccPortalChoiceDto[]? Choices);

public sealed record AccPortalTypeDto(Guid Id, string Name, AccFieldDto[] Fields, AccDocumentRuleDto[] Documents);

public sealed record AccPortalMeDto(
    string UserName,
    string UserEmail,
    Guid OrganizationId,
    string Organization,
    string Event,
    string? Venue,
    DateOnly StartDate,
    DateOnly EndDate,
    string EventStatus,
    bool AcceptingApplications,
    int? Quota,
    int Used,
    Guid? DefaultTypeId,
    AccPortalTypeDto[] Types,
    AccStageDto[] Stages);

public sealed record AccPublicApplyInfoDto(
    string Event,
    string? Venue,
    DateOnly StartDate,
    DateOnly EndDate,
    bool Open,
    AccPortalTypeDto[] Types);

public sealed record AccPublicApplyRequest(AccApplicantWriteRequest Applicant, string? Website);
