using System;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Entourage.Api.Infrastructure.Data.Migrations
{
    /// <summary>Accreditation phase 3: gate scan log.</summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261112090000_AddAccreditationScanning")]
    public partial class AddAccreditationScanning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AccScanLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ApplicantId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Code = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ZoneId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    GateName = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Direction = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Result = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ScannedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ScannedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    ScannedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                },
                constraints: table => table.PrimaryKey("PK_AccScanLogs", x => x.Id));

            migrationBuilder.CreateIndex(name: "IX_AccScanLogs_ApplicantId", table: "AccScanLogs", column: "ApplicantId");
            migrationBuilder.CreateIndex(name: "IX_AccScanLogs_EventId_ScannedOn", table: "AccScanLogs", columns: new[] { "EventId", "ScannedOn" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "AccScanLogs");
        }
    }
}
