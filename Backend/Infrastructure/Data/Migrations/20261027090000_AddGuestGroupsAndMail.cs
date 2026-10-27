using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Entourage.Api.Infrastructure.Data.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20261027090000_AddGuestGroupsAndMail")]
    public partial class AddGuestGroupsAndMail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GuestGroups",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    CreatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuestGroups", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GuestGroups_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GuestGroups_EventId_Name",
                table: "GuestGroups",
                columns: new[] { "EventId", "Name" },
                unique: true);

            migrationBuilder.AddColumn<Guid>(
                name: "GuestGroupId",
                table: "Guests",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Guests_GuestGroupId",
                table: "Guests",
                column: "GuestGroupId");

            migrationBuilder.AddForeignKey(
                name: "FK_Guests_GuestGroups_GuestGroupId",
                table: "Guests",
                column: "GuestGroupId",
                principalTable: "GuestGroups",
                principalColumn: "Id",
                onDelete: ReferentialAction.NoAction);

            migrationBuilder.CreateTable(
                name: "MailSettings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Host = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    Port = table.Column<int>(type: "int", nullable: false),
                    EnableSsl = table.Column<bool>(type: "bit", nullable: false),
                    Username = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    ProtectedPassword = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    FromEmail = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    FromName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    UpdatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MailSettings", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "MailSettings");

            migrationBuilder.DropForeignKey(
                name: "FK_Guests_GuestGroups_GuestGroupId",
                table: "Guests");

            migrationBuilder.DropIndex(
                name: "IX_Guests_GuestGroupId",
                table: "Guests");

            migrationBuilder.DropColumn(
                name: "GuestGroupId",
                table: "Guests");

            migrationBuilder.DropTable(name: "GuestGroups");
        }
    }
}
