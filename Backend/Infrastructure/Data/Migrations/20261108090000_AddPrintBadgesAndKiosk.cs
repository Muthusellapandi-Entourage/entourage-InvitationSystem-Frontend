using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Entourage.Api.Infrastructure.Data.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20261108090000_AddPrintBadgesAndKiosk")]
    public partial class AddPrintBadgesAndKiosk : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PrintBadgeDesignJson",
                table: "GuestTypes",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "KioskJson",
                table: "Events",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "KioskToken",
                table: "Events",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Events_KioskToken",
                table: "Events",
                column: "KioskToken",
                unique: true,
                filter: "[KioskToken] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_Events_KioskToken", table: "Events");
            migrationBuilder.DropColumn(name: "KioskToken", table: "Events");
            migrationBuilder.DropColumn(name: "KioskJson", table: "Events");
            migrationBuilder.DropColumn(name: "PrintBadgeDesignJson", table: "GuestTypes");
        }
    }
}
