using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Entourage.Api.Infrastructure.Data.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20261027120000_AddGraphMail")]
    public partial class AddGraphMail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Provider",
                table: "MailSettings",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "smtp");

            migrationBuilder.AddColumn<string>(
                name: "GraphTenantId",
                table: "MailSettings",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GraphClientId",
                table: "MailSettings",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProtectedGraphSecret",
                table: "MailSettings",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "Provider", table: "MailSettings");
            migrationBuilder.DropColumn(name: "GraphTenantId", table: "MailSettings");
            migrationBuilder.DropColumn(name: "GraphClientId", table: "MailSettings");
            migrationBuilder.DropColumn(name: "ProtectedGraphSecret", table: "MailSettings");
        }
    }
}
