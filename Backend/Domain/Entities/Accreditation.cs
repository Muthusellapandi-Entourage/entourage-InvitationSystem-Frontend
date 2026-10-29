namespace Entourage.Domain.Entities;

/*
 * Event Accreditation (EAMS): vetting, zones and access for non-ticketed personnel
 * (workforce, media, vendors, talent…). Completely separate from the invitation system:
 * its own events, people, files and audit log. Tables are prefixed "Acc".
 */

/// <summary>An accreditation event (not an invitation event).</summary>
public sealed class AccEvent
{
    public Guid Id { get; set; }

    /// <summary>The event this accreditation belongs to (opened from the event page). Null = accreditation-only event.</summary>
    public Guid? EventId { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Lower-case URL name, unique, e.g. "f1-grand-prix-2026" (used by the public application link).</summary>
    public string Slug { get; set; } = string.Empty;

    public string? Venue { get; set; }

    public DateOnly StartDate { get; set; }

    public DateOnly EndDate { get; set; }

    public string Timezone { get; set; } = "Asia/Dubai";

    /// <summary>"Draft", "Open" (taking applications), "Closed" (no new applications) or "Archived".</summary>
    public string Status { get; set; } = "Draft";

    /// <summary>Pipeline stages as JSON: [{ key, name, kind: "open" | "approved" | "rejected", color }].</summary>
    public string StagesJson { get; set; } = string.Empty;

    /// <summary>Email templates per trigger as JSON.</summary>
    public string? NotificationsJson { get; set; }

    /// <summary>When true, anyone can apply individually at /apply/{slug}.</summary>
    public bool PublicApplyEnabled { get; set; }

    public Guid CreatedBy { get; set; }

    public DateTime CreatedOn { get; set; }

    public DateTime UpdatedOn { get; set; }
}

/// <summary>A physical area of the venue, e.g. "Backstage" (Zone 3, red).</summary>
public sealed class AccZone
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    /// <summary>Short code printed on badges, e.g. "3" or "BS".</summary>
    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Color { get; set; } = "#38B8A2";

    /// <summary>Most credentials that should give access here. Null = no limit.</summary>
    public int? Capacity { get; set; }

    public int SortOrder { get; set; }

    public AccEvent? Event { get; set; }
}

/// <summary>A bundle of zones, e.g. "Media Pass" = Media Center + Press Pit.</summary>
public sealed class AccAccessProfile
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Color { get; set; } = "#38B8A2";

    /// <summary>Zone ids as JSON array.</summary>
    public string ZoneIdsJson { get; set; } = "[]";

    public int SortOrder { get; set; }

    public AccEvent? Event { get; set; }
}

/// <summary>A kind of applicant (Media, Vendor…) with its own form fields and required documents.</summary>
public sealed class AccApplicantType
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Extra form fields as JSON: [{ key, label, type: text|textarea|select|date|url, required, options }].</summary>
    public string FieldsJson { get; set; } = "[]";

    /// <summary>Required uploads as JSON: [{ key, label, required, needsExpiry }].</summary>
    public string DocumentsJson { get; set; } = "[]";

    /// <summary>Access profile suggested when this type is approved.</summary>
    public Guid? DefaultProfileId { get; set; }

    public int SortOrder { get; set; }

    public AccEvent? Event { get; set; }
}

/// <summary>An external organisation (media house, caterer, vendor) supplying people.</summary>
public sealed class AccOrganization
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Default applicant type for this organisation's people.</summary>
    public Guid? ApplicantTypeId { get; set; }

    public string? ContactName { get; set; }

    public string? ContactEmail { get; set; }

    public string? ContactPhone { get; set; }

    /// <summary>Most people this organisation may submit. Null = no limit.</summary>
    public int? Quota { get; set; }

    public DateTime CreatedOn { get; set; }

    public DateTime UpdatedOn { get; set; }

    public AccEvent? Event { get; set; }
}

/// <summary>An organisation manager's portal login (invited by email).</summary>
public sealed class AccOrgUser
{
    public Guid Id { get; set; }

    public Guid OrganizationId { get; set; }

    public string Email { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    /// <summary>Empty until the manager accepts the invitation and sets a password.</summary>
    public string PasswordHash { get; set; } = string.Empty;

    /// <summary>SHA-256 of the invitation code; null once used.</summary>
    public string? InviteTokenHash { get; set; }

    public DateTime? InviteExpiresOn { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedOn { get; set; }

    public DateTime? LastLoginOn { get; set; }

    public AccOrganization? Organization { get; set; }
}

/// <summary>A signed-in portal session (the browser keeps the code; we keep its hash).</summary>
public sealed class AccPortalSession
{
    public Guid Id { get; set; }

    public Guid OrgUserId { get; set; }

    public string TokenHash { get; set; } = string.Empty;

    public DateTime CreatedOn { get; set; }

    public DateTime ExpiresOn { get; set; }

    public AccOrgUser? OrgUser { get; set; }
}

/// <summary>A person applying for accreditation.</summary>
public sealed class AccApplicant
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public Guid? OrganizationId { get; set; }

    public Guid? ApplicantTypeId { get; set; }

    public string FirstName { get; set; } = string.Empty;

    public string LastName { get; set; } = string.Empty;

    public string? Email { get; set; }

    public string? Phone { get; set; }

    /// <summary>Role or job title at the event, e.g. "Photographer".</summary>
    public string? JobTitle { get; set; }

    public string? Nationality { get; set; }

    public DateOnly? DateOfBirth { get; set; }

    /// <summary>ID / passport number, encrypted.</summary>
    public string? IdNumberProtected { get; set; }

    /// <summary>Last 4 characters for display (•••• 1234).</summary>
    public string? IdNumberLast4 { get; set; }

    /// <summary>Hash of the normalised ID number, for duplicate detection.</summary>
    public string? IdNumberHash { get; set; }

    public Guid? PhotoFileId { get; set; }

    /// <summary>Answers to the applicant type's extra fields as JSON object.</summary>
    public string CustomFieldsJson { get; set; } = "{}";

    /// <summary>Current pipeline stage key (see <see cref="AccEvent.StagesJson"/>).</summary>
    public string StageKey { get; set; } = "submitted";

    public Guid? AccessProfileId { get; set; }

    /// <summary>Zones granted on top of the access profile, as JSON array of ids.</summary>
    public string ExtraZoneIdsJson { get; set; } = "[]";

    /// <summary>"admin", "portal", "bulk" or "public".</summary>
    public string Source { get; set; } = "admin";

    public string? RejectionReason { get; set; }

    /// <summary>Sequential badge number per event, given on approval (e.g. 1042).</summary>
    public int? BadgeNumber { get; set; }

    /// <summary>Random code for the badge QR (used by scanning in a later phase).</summary>
    public string CredentialCode { get; set; } = string.Empty;

    /// <summary>How many times the badge has been printed (reprints included).</summary>
    public int PrintCount { get; set; }

    /// <summary>Last print. Null = waiting in the print queue (never printed, or a reprint is needed).</summary>
    public DateTime? LastPrintedOn { get; set; }

    /// <summary>When the person collected the printed badge.</summary>
    public DateTime? CollectedOn { get; set; }

    public DateTime SubmittedOn { get; set; }

    public DateTime? DecidedOn { get; set; }

    public Guid? DecidedBy { get; set; }

    public DateTime CreatedOn { get; set; }

    public DateTime UpdatedOn { get; set; }

    public AccEvent? Event { get; set; }
}

/// <summary>An uploaded document in the vault (passport, waiver, COI…).</summary>
public sealed class AccDocument
{
    public Guid Id { get; set; }

    public Guid ApplicantId { get; set; }

    /// <summary>Document key from the applicant type, e.g. "passport", or "other".</summary>
    public string Kind { get; set; } = string.Empty;

    public string Label { get; set; } = string.Empty;

    public Guid FileId { get; set; }

    public DateOnly? ExpiresOn { get; set; }

    /// <summary>"Pending", "Verified" or "Rejected".</summary>
    public string Status { get; set; } = "Pending";

    public DateTime UploadedOn { get; set; }

    public AccApplicant? Applicant { get; set; }
}

/// <summary>A stored file (photo or document). Never public; served only to signed-in staff or the owning organisation.</summary>
public sealed class AccFile
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public string FileName { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;

    public long Size { get; set; }

    public string RelativePath { get; set; } = string.Empty;

    public DateTime CreatedOn { get; set; }
}

/// <summary>A physical badge layout. Applies to the listed applicant types, or to everyone when it is the default.</summary>
public sealed class AccBadgeTemplate
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>Layout as JSON: { widthMm, heightMm, backgroundColor, backgroundFileId, elements: [...] }.</summary>
    public string DesignJson { get; set; } = string.Empty;

    /// <summary>Applicant type ids this template is used for, as JSON array.</summary>
    public string ApplicantTypeIdsJson { get; set; } = "[]";

    /// <summary>Used for anyone whose type has no template of its own.</summary>
    public bool IsDefault { get; set; }

    public int SortOrder { get; set; }

    public DateTime UpdatedOn { get; set; }

    public AccEvent? Event { get; set; }
}

/// <summary>A badge code that no longer works (lost / stolen badge replaced). Scanning shows it as revoked.</summary>
public sealed class AccRevokedCredential
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public Guid ApplicantId { get; set; }

    public string Code { get; set; } = string.Empty;

    public string Reason { get; set; } = string.Empty;

    public DateTime RevokedOn { get; set; }
}

/// <summary>One scan at a gate (append-only). Guest check-ins at a mixed door are logged here too, without an applicant.</summary>
public sealed class AccScanLog
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    /// <summary>The badge holder, when the code matched one (also for revoked codes).</summary>
    public Guid? ApplicantId { get; set; }

    /// <summary>What was scanned (trimmed to 64 characters).</summary>
    public string Code { get; set; } = string.Empty;

    /// <summary>The zone the gate controls; null for a venue entrance (any approved badge).</summary>
    public Guid? ZoneId { get; set; }

    public string GateName { get; set; } = string.Empty;

    /// <summary>"in" or "out".</summary>
    public string Direction { get; set; } = "in";

    /// <summary>"green", "yellow" or "red".</summary>
    public string Result { get; set; } = string.Empty;

    /// <summary>Short reason code: granted, wrong_zone, unknown, revoked, not_approved, guest, guest_not_allowed, closed.</summary>
    public string Reason { get; set; } = string.Empty;

    public Guid? ScannedBy { get; set; }

    public string ScannedByName { get; set; } = string.Empty;

    public DateTime ScannedOn { get; set; }
}

/// <summary>Append-only audit trail: who did what to whom, when. Never edited or deleted.</summary>
public sealed class AccAuditLog
{
    public Guid Id { get; set; }

    public Guid EventId { get; set; }

    public Guid? ApplicantId { get; set; }

    /// <summary>Staff user id, or null for portal / public actions.</summary>
    public Guid? ActorUserId { get; set; }

    /// <summary>Who, as shown: "Sara Ahmed (Security Manager)", "Portal: Gulf News", "Public application".</summary>
    public string ActorName { get; set; } = string.Empty;

    public string Action { get; set; } = string.Empty;

    public string? Detail { get; set; }

    public DateTime CreatedOn { get; set; }
}
