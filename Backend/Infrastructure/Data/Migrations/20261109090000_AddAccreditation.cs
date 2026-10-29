using System;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Entourage.Api.Infrastructure.Data.Migrations
{
    /// <summary>Accreditation (EAMS) tables. Separate from the invitation tables; all prefixed "Acc".</summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261109090000_AddAccreditation")]
    public partial class AddAccreditation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AccEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Slug = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Venue = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Timezone = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    StagesJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    NotificationsJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PublicApplyEnabled = table.Column<bool>(type: "bit", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                },
                constraints: table => table.PrimaryKey("PK_AccEvents", x => x.Id));

            migrationBuilder.CreateTable(
                name: "AccFiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Size = table.Column<long>(type: "bigint", nullable: false),
                    RelativePath = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    CreatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                },
                constraints: table => table.PrimaryKey("PK_AccFiles", x => x.Id));

            migrationBuilder.CreateTable(
                name: "AccAuditLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ApplicantId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ActorUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ActorName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Action = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Detail = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    CreatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                },
                constraints: table => table.PrimaryKey("PK_AccAuditLogs", x => x.Id));

            migrationBuilder.CreateTable(
                name: "AccZones",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Color = table.Column<string>(type: "nvarchar(9)", maxLength: 9, nullable: false),
                    Capacity = table.Column<int>(type: "int", nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccZones", x => x.Id);
                    table.ForeignKey("FK_AccZones_AccEvents_EventId", x => x.EventId, "AccEvents", "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AccAccessProfiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Color = table.Column<string>(type: "nvarchar(9)", maxLength: 9, nullable: false),
                    ZoneIdsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccAccessProfiles", x => x.Id);
                    table.ForeignKey("FK_AccAccessProfiles_AccEvents_EventId", x => x.EventId, "AccEvents", "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AccApplicantTypes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    FieldsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DocumentsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DefaultProfileId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccApplicantTypes", x => x.Id);
                    table.ForeignKey("FK_AccApplicantTypes_AccEvents_EventId", x => x.EventId, "AccEvents", "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AccOrganizations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ApplicantTypeId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ContactName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ContactEmail = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    ContactPhone = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    Quota = table.Column<int>(type: "int", nullable: true),
                    CreatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccOrganizations", x => x.Id);
                    table.ForeignKey("FK_AccOrganizations_AccEvents_EventId", x => x.EventId, "AccEvents", "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AccApplicants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ApplicantTypeId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FirstName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    LastName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Email = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    Phone = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    JobTitle = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Nationality = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: true),
                    DateOfBirth = table.Column<DateOnly>(type: "date", nullable: true),
                    IdNumberProtected = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    IdNumberLast4 = table.Column<string>(type: "nvarchar(4)", maxLength: 4, nullable: true),
                    IdNumberHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    PhotoFileId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CustomFieldsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    StageKey = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    AccessProfileId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ExtraZoneIdsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Source = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    RejectionReason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    BadgeNumber = table.Column<int>(type: "int", nullable: true),
                    CredentialCode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SubmittedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DecidedOn = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DecidedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccApplicants", x => x.Id);
                    table.ForeignKey("FK_AccApplicants_AccEvents_EventId", x => x.EventId, "AccEvents", "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AccOrgUsers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    PasswordHash = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    InviteTokenHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    InviteExpiresOn = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastLoginOn = table.Column<DateTime>(type: "datetime2", nullable: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccOrgUsers", x => x.Id);
                    table.ForeignKey("FK_AccOrgUsers_AccOrganizations_OrganizationId", x => x.OrganizationId, "AccOrganizations", "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AccDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ApplicantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Label = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    FileId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ExpiresOn = table.Column<DateOnly>(type: "date", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    UploadedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccDocuments", x => x.Id);
                    table.ForeignKey("FK_AccDocuments_AccApplicants_ApplicantId", x => x.ApplicantId, "AccApplicants", "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AccPortalSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrgUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TokenHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    CreatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccPortalSessions", x => x.Id);
                    table.ForeignKey("FK_AccPortalSessions_AccOrgUsers_OrgUserId", x => x.OrgUserId, "AccOrgUsers", "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(name: "IX_AccEvents_Slug", table: "AccEvents", column: "Slug", unique: true);
            migrationBuilder.CreateIndex(name: "IX_AccFiles_EventId", table: "AccFiles", column: "EventId");
            migrationBuilder.CreateIndex(name: "IX_AccAuditLogs_EventId_CreatedOn", table: "AccAuditLogs", columns: new[] { "EventId", "CreatedOn" });
            migrationBuilder.CreateIndex(name: "IX_AccAuditLogs_ApplicantId", table: "AccAuditLogs", column: "ApplicantId");
            migrationBuilder.CreateIndex(name: "IX_AccZones_EventId", table: "AccZones", column: "EventId");
            migrationBuilder.CreateIndex(name: "IX_AccAccessProfiles_EventId", table: "AccAccessProfiles", column: "EventId");
            migrationBuilder.CreateIndex(name: "IX_AccApplicantTypes_EventId", table: "AccApplicantTypes", column: "EventId");
            migrationBuilder.CreateIndex(name: "IX_AccOrganizations_EventId", table: "AccOrganizations", column: "EventId");
            migrationBuilder.CreateIndex(name: "IX_AccApplicants_EventId", table: "AccApplicants", column: "EventId");
            migrationBuilder.CreateIndex(name: "IX_AccApplicants_OrganizationId", table: "AccApplicants", column: "OrganizationId");
            migrationBuilder.CreateIndex(name: "IX_AccApplicants_EventId_IdNumberHash", table: "AccApplicants", columns: new[] { "EventId", "IdNumberHash" });
            migrationBuilder.CreateIndex(name: "IX_AccApplicants_CredentialCode", table: "AccApplicants", column: "CredentialCode", unique: true);
            migrationBuilder.CreateIndex(name: "IX_AccOrgUsers_OrganizationId", table: "AccOrgUsers", column: "OrganizationId");
            migrationBuilder.CreateIndex(name: "IX_AccOrgUsers_Email", table: "AccOrgUsers", column: "Email");
            migrationBuilder.CreateIndex(name: "IX_AccDocuments_ApplicantId", table: "AccDocuments", column: "ApplicantId");
            migrationBuilder.CreateIndex(name: "IX_AccPortalSessions_OrgUserId", table: "AccPortalSessions", column: "OrgUserId");
            migrationBuilder.CreateIndex(name: "IX_AccPortalSessions_TokenHash", table: "AccPortalSessions", column: "TokenHash", unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "AccPortalSessions");
            migrationBuilder.DropTable(name: "AccDocuments");
            migrationBuilder.DropTable(name: "AccOrgUsers");
            migrationBuilder.DropTable(name: "AccApplicants");
            migrationBuilder.DropTable(name: "AccOrganizations");
            migrationBuilder.DropTable(name: "AccApplicantTypes");
            migrationBuilder.DropTable(name: "AccAccessProfiles");
            migrationBuilder.DropTable(name: "AccZones");
            migrationBuilder.DropTable(name: "AccAuditLogs");
            migrationBuilder.DropTable(name: "AccFiles");
            migrationBuilder.DropTable(name: "AccEvents");
        }
    }
}
