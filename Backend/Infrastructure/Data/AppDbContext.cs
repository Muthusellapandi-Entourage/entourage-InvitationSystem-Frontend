using Entourage.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Entourage.Infrastructure.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    public DbSet<Event> Events => Set<Event>();

    public DbSet<Invitation> Invitations => Set<Invitation>();

    public DbSet<InvitationResponse> InvitationResponses => Set<InvitationResponse>();

    public DbSet<EventAsset> EventAssets => Set<EventAsset>();

    public DbSet<GuestType> GuestTypes => Set<GuestType>();

    public DbSet<Guest> Guests => Set<Guest>();

    public DbSet<GuestInvitationIssue> GuestInvitationIssues => Set<GuestInvitationIssue>();

    public DbSet<GuestBadgeIssue> GuestBadgeIssues => Set<GuestBadgeIssue>();

    public DbSet<SeatingPlan> SeatingPlans => Set<SeatingPlan>();

    public DbSet<GuestGroup> GuestGroups => Set<GuestGroup>();

    public DbSet<MailSettings> MailSettings => Set<MailSettings>();

    public DbSet<WalletSettings> WalletSettings => Set<WalletSettings>();

    public DbSet<EventMicrosite> EventMicrosites => Set<EventMicrosite>();

    public DbSet<GuestActivity> GuestActivities => Set<GuestActivity>();

    public DbSet<EventFont> EventFonts => Set<EventFont>();

    /* ---------------- Accreditation (separate from invitations) ---------------- */

    public DbSet<AccEvent> AccEvents => Set<AccEvent>();

    public DbSet<AccZone> AccZones => Set<AccZone>();

    public DbSet<AccAccessProfile> AccAccessProfiles => Set<AccAccessProfile>();

    public DbSet<AccApplicantType> AccApplicantTypes => Set<AccApplicantType>();

    public DbSet<AccOrganization> AccOrganizations => Set<AccOrganization>();

    public DbSet<AccOrgUser> AccOrgUsers => Set<AccOrgUser>();

    public DbSet<AccPortalSession> AccPortalSessions => Set<AccPortalSession>();

    public DbSet<AccApplicant> AccApplicants => Set<AccApplicant>();

    public DbSet<AccDocument> AccDocuments => Set<AccDocument>();

    public DbSet<AccFile> AccFiles => Set<AccFile>();

    public DbSet<AccAuditLog> AccAuditLogs => Set<AccAuditLog>();

    public DbSet<AccBadgeTemplate> AccBadgeTemplates => Set<AccBadgeTemplate>();

    public DbSet<AccRevokedCredential> AccRevokedCredentials => Set<AccRevokedCredential>();

    private static void ConfigureAccreditation(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AccBadgeTemplate>(entity =>
        {
            entity.ToTable("AccBadgeTemplates");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId);
            entity.Property(item => item.Name).HasMaxLength(120).IsRequired();
            entity.Property(item => item.DesignJson).IsRequired();
            entity.Property(item => item.ApplicantTypeIdsJson).IsRequired();
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Event).WithMany().HasForeignKey(item => item.EventId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AccRevokedCredential>(entity =>
        {
            entity.ToTable("AccRevokedCredentials");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.EventId, item.Code }).IsUnique();
            entity.HasIndex(item => item.ApplicantId);
            entity.Property(item => item.Code).HasMaxLength(32).IsRequired();
            entity.Property(item => item.Reason).HasMaxLength(500).IsRequired();
            entity.Property(item => item.RevokedOn).HasConversion(UtcDateTimeConverter.Instance);
        });

        modelBuilder.Entity<AccEvent>(entity =>
        {
            entity.ToTable("AccEvents");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.Slug).IsUnique();
            // One accreditation per event. No foreign key on purpose: the two systems stay independent.
            entity.HasIndex(item => item.EventId).IsUnique().HasFilter("[EventId] IS NOT NULL");
            entity.Property(item => item.Name).HasMaxLength(200).IsRequired();
            entity.Property(item => item.Slug).HasMaxLength(120).IsRequired();
            entity.Property(item => item.Venue).HasMaxLength(200);
            entity.Property(item => item.Timezone).HasMaxLength(100).IsRequired();
            entity.Property(item => item.Status).HasMaxLength(20).IsRequired();
            entity.Property(item => item.StagesJson).IsRequired();
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
        });

        modelBuilder.Entity<AccZone>(entity =>
        {
            entity.ToTable("AccZones");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId);
            entity.Property(item => item.Code).HasMaxLength(20).IsRequired();
            entity.Property(item => item.Name).HasMaxLength(120).IsRequired();
            entity.Property(item => item.Color).HasMaxLength(9).IsRequired();
            entity.HasOne(item => item.Event).WithMany().HasForeignKey(item => item.EventId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AccAccessProfile>(entity =>
        {
            entity.ToTable("AccAccessProfiles");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId);
            entity.Property(item => item.Name).HasMaxLength(120).IsRequired();
            entity.Property(item => item.Color).HasMaxLength(9).IsRequired();
            entity.Property(item => item.ZoneIdsJson).IsRequired();
            entity.HasOne(item => item.Event).WithMany().HasForeignKey(item => item.EventId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AccApplicantType>(entity =>
        {
            entity.ToTable("AccApplicantTypes");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId);
            entity.Property(item => item.Name).HasMaxLength(120).IsRequired();
            entity.Property(item => item.FieldsJson).IsRequired();
            entity.Property(item => item.DocumentsJson).IsRequired();
            entity.HasOne(item => item.Event).WithMany().HasForeignKey(item => item.EventId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AccOrganization>(entity =>
        {
            entity.ToTable("AccOrganizations");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId);
            entity.Property(item => item.Name).HasMaxLength(200).IsRequired();
            entity.Property(item => item.ContactName).HasMaxLength(200);
            entity.Property(item => item.ContactEmail).HasMaxLength(256);
            entity.Property(item => item.ContactPhone).HasMaxLength(40);
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Event).WithMany().HasForeignKey(item => item.EventId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AccOrgUser>(entity =>
        {
            entity.ToTable("AccOrgUsers");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.OrganizationId);
            entity.HasIndex(item => item.Email);
            entity.Property(item => item.Email).HasMaxLength(256).IsRequired();
            entity.Property(item => item.Name).HasMaxLength(200).IsRequired();
            entity.Property(item => item.PasswordHash).HasMaxLength(500).IsRequired();
            entity.Property(item => item.InviteTokenHash).HasMaxLength(64);
            entity.Property(item => item.InviteExpiresOn).HasConversion(UtcNullableDateTimeConverter.Instance);
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(item => item.LastLoginOn).HasConversion(UtcNullableDateTimeConverter.Instance);
            entity.HasOne(item => item.Organization).WithMany().HasForeignKey(item => item.OrganizationId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AccPortalSession>(entity =>
        {
            entity.ToTable("AccPortalSessions");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.TokenHash).IsUnique();
            entity.Property(item => item.TokenHash).HasMaxLength(64).IsRequired();
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(item => item.ExpiresOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.OrgUser).WithMany().HasForeignKey(item => item.OrgUserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AccApplicant>(entity =>
        {
            entity.ToTable("AccApplicants");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId);
            entity.HasIndex(item => item.OrganizationId);
            entity.HasIndex(item => new { item.EventId, item.IdNumberHash });
            entity.HasIndex(item => item.CredentialCode).IsUnique();
            entity.Property(item => item.FirstName).HasMaxLength(100).IsRequired();
            entity.Property(item => item.LastName).HasMaxLength(100).IsRequired();
            entity.Property(item => item.Email).HasMaxLength(256);
            entity.Property(item => item.Phone).HasMaxLength(40);
            entity.Property(item => item.JobTitle).HasMaxLength(200);
            entity.Property(item => item.Nationality).HasMaxLength(80);
            entity.Property(item => item.IdNumberProtected).HasMaxLength(1000);
            entity.Property(item => item.IdNumberLast4).HasMaxLength(4);
            entity.Property(item => item.IdNumberHash).HasMaxLength(64);
            entity.Property(item => item.CustomFieldsJson).IsRequired();
            entity.Property(item => item.StageKey).HasMaxLength(40).IsRequired();
            entity.Property(item => item.ExtraZoneIdsJson).IsRequired();
            entity.Property(item => item.Source).HasMaxLength(20).IsRequired();
            entity.Property(item => item.RejectionReason).HasMaxLength(1000);
            entity.Property(item => item.CredentialCode).HasMaxLength(32).IsRequired();
            entity.Property(item => item.SubmittedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(item => item.LastPrintedOn).HasConversion(UtcNullableDateTimeConverter.Instance);
            entity.Property(item => item.CollectedOn).HasConversion(UtcNullableDateTimeConverter.Instance);
            entity.Property(item => item.DecidedOn).HasConversion(UtcNullableDateTimeConverter.Instance);
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Event).WithMany().HasForeignKey(item => item.EventId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AccDocument>(entity =>
        {
            entity.ToTable("AccDocuments");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.ApplicantId);
            entity.Property(item => item.Kind).HasMaxLength(60).IsRequired();
            entity.Property(item => item.Label).HasMaxLength(200).IsRequired();
            entity.Property(item => item.Status).HasMaxLength(20).IsRequired();
            entity.Property(item => item.UploadedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Applicant).WithMany().HasForeignKey(item => item.ApplicantId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AccFile>(entity =>
        {
            entity.ToTable("AccFiles");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId);
            entity.Property(item => item.FileName).HasMaxLength(200).IsRequired();
            entity.Property(item => item.ContentType).HasMaxLength(100).IsRequired();
            entity.Property(item => item.RelativePath).HasMaxLength(400).IsRequired();
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
        });

        modelBuilder.Entity<AccAuditLog>(entity =>
        {
            entity.ToTable("AccAuditLogs");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.EventId, item.CreatedOn });
            entity.HasIndex(item => item.ApplicantId);
            entity.Property(item => item.ActorName).HasMaxLength(200).IsRequired();
            entity.Property(item => item.Action).HasMaxLength(100).IsRequired();
            entity.Property(item => item.Detail).HasMaxLength(2000);
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
        });
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ConfigureAccreditation(modelBuilder);

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(user => user.Id);
            entity.HasIndex(user => user.Email).IsUnique();
            entity.Property(user => user.FirstName).HasMaxLength(100).IsRequired();
            entity.Property(user => user.LastName).HasMaxLength(100).IsRequired();
            entity.Property(user => user.Email).HasMaxLength(256).IsRequired();
            entity.Property(user => user.PasswordHash).HasMaxLength(500).IsRequired();
            entity.Property(user => user.SecurityStamp).HasMaxLength(64).IsRequired();
            entity.Property(user => user.Role).HasConversion<string>().HasMaxLength(50);
            entity.Property(user => user.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(user => user.LastLoginOn).HasConversion(UtcNullableDateTimeConverter.Instance);
        });

        modelBuilder.Entity<Event>(entity =>
        {
            entity.ToTable("Events");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.Slug).IsUnique();
            entity.HasIndex(item => item.Status);
            entity.HasIndex(item => item.CreatedOn);
            entity.Property(item => item.Name).HasMaxLength(200).IsRequired();
            entity.Property(item => item.Slug).HasMaxLength(80).IsRequired();
            entity.Property(item => item.Description).HasMaxLength(2000);
            entity.Property(item => item.Timezone).HasMaxLength(100).IsRequired();
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(item => item.CustomDomain).HasMaxLength(253);
            entity.HasIndex(item => item.CustomDomain).IsUnique().HasFilter("[CustomDomain] IS NOT NULL");
            entity.Property(item => item.CustomDomainVerifiedOn).HasConversion(UtcNullableDateTimeConverter.Instance);
            entity.Property(item => item.LiveShareToken).HasMaxLength(32);
            entity.HasIndex(item => item.LiveShareToken).IsUnique().HasFilter("[LiveShareToken] IS NOT NULL");
            entity.Property(item => item.FrontDeskToken).HasMaxLength(32);
            entity.HasIndex(item => item.FrontDeskToken).IsUnique().HasFilter("[FrontDeskToken] IS NOT NULL");
            entity.Property(item => item.KioskToken).HasMaxLength(32);
            entity.HasIndex(item => item.KioskToken).IsUnique().HasFilter("[KioskToken] IS NOT NULL");
            entity.HasOne(item => item.Creator)
                .WithMany()
                .HasForeignKey(item => item.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Invitation>(entity =>
        {
            entity.ToTable("Invitations");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId).IsUnique();
            entity.Property(item => item.Addressee).HasMaxLength(300);
            entity.Property(item => item.PatronageIntro).HasMaxLength(500);
            entity.Property(item => item.PatronName).HasMaxLength(300);
            entity.Property(item => item.PatronTitle).HasMaxLength(300);
            entity.Property(item => item.PatronClosing).HasMaxLength(100);
            entity.Property(item => item.HostIntro).HasMaxLength(500);
            entity.Property(item => item.HostName).HasMaxLength(300);
            entity.Property(item => item.BodyIntro).HasMaxLength(500);
            entity.Property(item => item.OrganizationName).HasMaxLength(300).IsRequired();
            entity.Property(item => item.OrganizationSubtitle).HasMaxLength(300);
            entity.Property(item => item.Announcement).HasMaxLength(2000);
            entity.Property(item => item.AttendanceLine).HasMaxLength(500);
            entity.Property(item => item.DateLine).HasMaxLength(200).IsRequired();
            entity.Property(item => item.HijriDateLine).HasMaxLength(200);
            entity.Property(item => item.TimeLine).HasMaxLength(100);
            entity.Property(item => item.VenueLine).HasMaxLength(300).IsRequired();
            entity.Property(item => item.LocationUrl).HasMaxLength(500);
            entity.Property(item => item.RsvpNote).HasMaxLength(2000);
            entity.Property(item => item.RsvpDeadline).HasMaxLength(300);
            entity.Property(item => item.ReplyMode).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.AcceptLabel).HasMaxLength(40);
            entity.Property(item => item.DeclineLabel).HasMaxLength(40);
            entity.Property(item => item.DesignJson);
            entity.Property(item => item.BadgeDesignJson);
            entity.Property(item => item.Html);
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Event)
                .WithMany()
                .HasForeignKey(item => item.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<InvitationResponse>(entity =>
        {
            entity.ToTable("InvitationResponses");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.InvitationId, item.GuestName }).IsUnique();
            entity.Property(item => item.GuestName).HasMaxLength(120).IsRequired();
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne<Invitation>()
                .WithMany()
                .HasForeignKey(item => item.InvitationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EventAsset>(entity =>
        {
            entity.ToTable("EventAssets");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId);
            entity.Property(item => item.FileName).HasMaxLength(180).IsRequired();
            entity.Property(item => item.ContentType).HasMaxLength(100).IsRequired();
            entity.Property(item => item.RelativePath).HasMaxLength(300).IsRequired();
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Event)
                .WithMany()
                .HasForeignKey(item => item.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GuestType>(entity =>
        {
            entity.ToTable("GuestTypes");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.EventId, item.Name }).IsUnique();
            entity.HasIndex(item => new { item.EventId, item.SortOrder });
            entity.Property(item => item.Name).HasMaxLength(80).IsRequired();
            entity.Property(item => item.InvitationDesignJson);
            entity.Property(item => item.InvitationHtml);
            entity.Property(item => item.BadgeDesignJson);
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Event)
                .WithMany()
                .HasForeignKey(item => item.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Guest>(entity =>
        {
            entity.ToTable("Guests");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId);
            entity.HasIndex(item => item.GuestTypeId);
            entity.HasIndex(item => item.CheckInCode).IsUnique();
            entity.Property(item => item.Name).HasMaxLength(120).IsRequired();
            entity.Property(item => item.Email).HasMaxLength(256);
            entity.Property(item => item.Position).HasMaxLength(200);
            entity.Property(item => item.CheckInCode).HasMaxLength(64).IsRequired();
            entity.Property(item => item.InviteToken).HasMaxLength(32).IsRequired();
            entity.HasIndex(item => item.InviteToken).IsUnique();
            entity.Property(item => item.FirstCheckedInOn).HasConversion(UtcNullableDateTimeConverter.Instance);
            entity.Property(item => item.LastCheckedInOn).HasConversion(UtcNullableDateTimeConverter.Instance);
            entity.Property(item => item.SeatedOn).HasConversion(UtcNullableDateTimeConverter.Instance);
            entity.Property(item => item.DeclineReason).HasMaxLength(500);
            entity.Property(item => item.Phone).HasMaxLength(40);
            entity.Property(item => item.RegisteredOn).HasConversion(UtcNullableDateTimeConverter.Instance);
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Event)
                .WithMany()
                .HasForeignKey(item => item.EventId)
                .OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.GuestType)
                .WithMany()
                .HasForeignKey(item => item.GuestTypeId)
                .OnDelete(DeleteBehavior.NoAction);
            entity.Property(item => item.RsvpStatus).HasMaxLength(20).IsRequired();
            entity.Property(item => item.RsvpUpdatedOn).HasConversion(UtcNullableDateTimeConverter.Instance);
            entity.HasIndex(item => item.GuestGroupId);
            // Deleting a group is handled in the service (keep guests ungrouped, or delete them),
            // so the database never removes guests on its own.
            entity.HasOne(item => item.GuestGroup)
                .WithMany()
                .HasForeignKey(item => item.GuestGroupId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<GuestGroup>(entity =>
        {
            entity.ToTable("GuestGroups");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.EventId, item.Name }).IsUnique();
            entity.Property(item => item.Name).HasMaxLength(120).IsRequired();
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Event)
                .WithMany()
                .HasForeignKey(item => item.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GuestActivity>(entity =>
        {
            entity.ToTable("GuestActivities");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.GuestId, item.CreatedOn });
            entity.Property(item => item.Kind).HasMaxLength(60).IsRequired();
            entity.Property(item => item.Detail).HasMaxLength(300);
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Guest)
                .WithMany()
                .HasForeignKey(item => item.GuestId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EventFont>(entity =>
        {
            entity.ToTable("EventFonts");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId);
            entity.Property(item => item.Name).HasMaxLength(120).IsRequired();
            entity.Property(item => item.FileName).HasMaxLength(180).IsRequired();
            entity.Property(item => item.RelativePath).HasMaxLength(300).IsRequired();
            entity.Property(item => item.ContentType).HasMaxLength(40).IsRequired();
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Event)
                .WithMany()
                .HasForeignKey(item => item.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EventMicrosite>(entity =>
        {
            entity.ToTable("EventMicrosites");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId).IsUnique();
            entity.Property(item => item.DesignJson).IsRequired();
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Event)
                .WithMany()
                .HasForeignKey(item => item.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<WalletSettings>(entity =>
        {
            entity.ToTable("WalletSettings");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.TeamId).HasMaxLength(20).IsRequired();
            entity.Property(item => item.PassTypeId).HasMaxLength(200).IsRequired();
            entity.Property(item => item.OrganizationName).HasMaxLength(200).IsRequired();
            entity.Property(item => item.ProtectedCertificate).IsRequired();
            entity.Property(item => item.ProtectedCertificatePassword).HasMaxLength(2000);
            entity.Property(item => item.WwdrCertificate).IsRequired();
            entity.Property(item => item.CertificateExpiresOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
        });

        modelBuilder.Entity<MailSettings>(entity =>
        {
            entity.ToTable("MailSettings");
            entity.HasKey(item => item.Id);
            entity.Property(item => item.Provider).HasMaxLength(20).IsRequired();
            entity.Property(item => item.GraphTenantId).HasMaxLength(100);
            entity.Property(item => item.GraphClientId).HasMaxLength(100);
            entity.Property(item => item.ProtectedGraphSecret).HasMaxLength(2000);
            entity.Property(item => item.Host).HasMaxLength(255).IsRequired();
            entity.Property(item => item.Username).HasMaxLength(256);
            entity.Property(item => item.ProtectedPassword).HasMaxLength(2000);
            entity.Property(item => item.FromEmail).HasMaxLength(256).IsRequired();
            entity.Property(item => item.FromName).HasMaxLength(200);
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
        });

        modelBuilder.Entity<GuestInvitationIssue>(entity =>
        {
            entity.ToTable("GuestInvitationIssues");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.GuestId);
            entity.Property(item => item.GuestTypeName).HasMaxLength(80).IsRequired();
            entity.Property(item => item.Html).IsRequired();
            entity.Property(item => item.IssuedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Guest)
                .WithMany()
                .HasForeignKey(item => item.GuestId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GuestBadgeIssue>(entity =>
        {
            entity.ToTable("GuestBadgeIssues");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.GuestId);
            entity.Property(item => item.GuestTypeName).HasMaxLength(80).IsRequired();
            entity.Property(item => item.QrPayload).HasMaxLength(64).IsRequired();
            entity.Property(item => item.GeneratedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Guest)
                .WithMany()
                .HasForeignKey(item => item.GuestId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SeatingPlan>(entity =>
        {
            entity.ToTable("SeatingPlans");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId).IsUnique();
            entity.Property(item => item.DesignJson).IsRequired();
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Event)
                .WithMany()
                .HasForeignKey(item => item.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}

file sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    value => value,
    value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
{
    public static UtcDateTimeConverter Instance { get; } = new();
}

file sealed class UtcNullableDateTimeConverter() : ValueConverter<DateTime?, DateTime?>(
    value => value,
    value => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : value)
{
    public static UtcNullableDateTimeConverter Instance { get; } = new();
}
