using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Entourage.Api.Infrastructure.Data.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20261029090000_AddEventDomains")]
    public partial class AddEventDomains : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CustomDomain",
                table: "Events",
                type: "nvarchar(253)",
                maxLength: 253,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CustomDomainVerifiedOn",
                table: "Events",
                type: "datetime2",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Events_CustomDomain",
                table: "Events",
                column: "CustomDomain",
                unique: true,
                filter: "[CustomDomain] IS NOT NULL");

            // Existing guests get a random personal link code: 16 hex characters from a fresh GUID.
            migrationBuilder.AddColumn<string>(
                name: "InviteToken",
                table: "Guests",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.Sql(
                "UPDATE [Guests] SET [InviteToken] = LOWER(LEFT(REPLACE(CONVERT(nvarchar(36), NEWID()), '-', ''), 16)) WHERE [InviteToken] IS NULL;");

            migrationBuilder.AlterColumn<string>(
                name: "InviteToken",
                table: "Guests",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Guests_InviteToken",
                table: "Guests",
                column: "InviteToken",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_Guests_InviteToken", table: "Guests");
            migrationBuilder.DropColumn(name: "InviteToken", table: "Guests");
            migrationBuilder.DropIndex(name: "IX_Events_CustomDomain", table: "Events");
            migrationBuilder.DropColumn(name: "CustomDomainVerifiedOn", table: "Events");
            migrationBuilder.DropColumn(name: "CustomDomain", table: "Events");
        }
    }
}
