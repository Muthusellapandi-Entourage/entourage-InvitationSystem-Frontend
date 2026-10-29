using System;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Entourage.Api.Infrastructure.Data.Migrations
{
    /// <summary>Accreditation phase 2: badge templates, print status, revoked badge codes.</summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261110090000_AddAccreditationBadges")]
    public partial class AddAccreditationBadges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(name: "PrintCount", table: "AccApplicants", type: "int", nullable: false, defaultValue: 0);
            migrationBuilder.AddColumn<DateTime>(name: "LastPrintedOn", table: "AccApplicants", type: "datetime2", nullable: true);
            migrationBuilder.AddColumn<DateTime>(name: "CollectedOn", table: "AccApplicants", type: "datetime2", nullable: true);

            migrationBuilder.CreateTable(
                name: "AccBadgeTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    DesignJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ApplicantTypeIdsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsDefault = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    UpdatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccBadgeTemplates", x => x.Id);
                    table.ForeignKey("FK_AccBadgeTemplates_AccEvents_EventId", x => x.EventId, "AccEvents", "Id", onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AccRevokedCredentials",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ApplicantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    RevokedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                },
                constraints: table => table.PrimaryKey("PK_AccRevokedCredentials", x => x.Id));

            migrationBuilder.CreateIndex(name: "IX_AccBadgeTemplates_EventId", table: "AccBadgeTemplates", column: "EventId");
            migrationBuilder.CreateIndex(name: "IX_AccRevokedCredentials_ApplicantId", table: "AccRevokedCredentials", column: "ApplicantId");
            migrationBuilder.CreateIndex(name: "IX_AccRevokedCredentials_EventId_Code", table: "AccRevokedCredentials", columns: new[] { "EventId", "Code" }, unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "AccRevokedCredentials");
            migrationBuilder.DropTable(name: "AccBadgeTemplates");
            migrationBuilder.DropColumn(name: "CollectedOn", table: "AccApplicants");
            migrationBuilder.DropColumn(name: "LastPrintedOn", table: "AccApplicants");
            migrationBuilder.DropColumn(name: "PrintCount", table: "AccApplicants");
        }
    }
}
