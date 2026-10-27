using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Entourage.Api.Infrastructure.Data.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20261030090000_AddGuestCheckIn")]
    public partial class AddGuestCheckIn : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CheckInCount",
                table: "Guests",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "FirstCheckedInOn",
                table: "Guests",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastCheckedInOn",
                table: "Guests",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SeatedOn",
                table: "Guests",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "CheckInCount", table: "Guests");
            migrationBuilder.DropColumn(name: "FirstCheckedInOn", table: "Guests");
            migrationBuilder.DropColumn(name: "LastCheckedInOn", table: "Guests");
            migrationBuilder.DropColumn(name: "SeatedOn", table: "Guests");
        }
    }
}
