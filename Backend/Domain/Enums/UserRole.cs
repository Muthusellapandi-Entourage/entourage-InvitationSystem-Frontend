namespace Entourage.Domain.Enums;

public enum UserRole
{
    /// <summary>Everything: invitations and accreditation.</summary>
    Administrator = 1,

    /* Accreditation only (no access to the invitation system). */

    /// <summary>Full control of accreditation events, settings, applicants and the team.</summary>
    AccreditationAdmin = 10,

    /// <summary>Vets applications: moves stages, approves/rejects, changes access profiles and zones.</summary>
    SecurityManager = 11,

    /// <summary>Adds and edits applicants and uploads; cannot approve or change access.</summary>
    DataEntryClerk = 12,

    /// <summary>Badge printing only (print queue, phase 2).</summary>
    PrintOperator = 13,

    /// <summary>Gate scanning only (phase 3).</summary>
    GateGuard = 14,
}
