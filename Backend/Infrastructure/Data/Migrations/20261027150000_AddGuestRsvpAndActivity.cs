using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Entourage.Api.Infrastructure.Data.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20261027150000_AddGuestRsvpAndActivity")]
    public partial class AddGuestRsvpAndActivity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RsvpStatus",
                table: "Guests",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Pending");

            migrationBuilder.AddColumn<DateTime>(
                name: "RsvpUpdatedOn",
                table: "Guests",
                type: "datetime2",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GuestActivities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GuestId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Detail = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    CreatedOn = table.Column<DateTime>(type: "datetime2", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GuestActivities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GuestActivities_Guests_GuestId",
                        column: x => x.GuestId,
                        principalTable: "Guests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GuestActivities_GuestId_CreatedOn",
                table: "GuestActivities",
                columns: new[] { "GuestId", "CreatedOn" });

            // Existing guests start with an "Added" entry at the time they were created.
            migrationBuilder.Sql(
                "INSERT INTO GuestActivities (Id, GuestId, Kind, Detail, CreatedOn) " +
                "SELECT NEWID(), Id, 'Added', NULL, CreatedOn FROM Guests;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "GuestActivities");
            migrationBuilder.DropColumn(name: "RsvpStatus", table: "Guests");
            migrationBuilder.DropColumn(name: "RsvpUpdatedOn", table: "Guests");
        }
    }
}
