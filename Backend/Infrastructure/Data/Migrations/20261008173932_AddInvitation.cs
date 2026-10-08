using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Entourage.Api.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInvitation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Invitations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Addressee = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    PatronageIntro = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    PatronName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    PatronTitle = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    PatronClosing = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    HostIntro = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    HostName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    BodyIntro = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    OrganizationName = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    OrganizationSubtitle = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Announcement = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    AttendanceLine = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    DateLine = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    HijriDateLine = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    TimeLine = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    VenueLine = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    LocationUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    RsvpNote = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    RsvpDeadline = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    ReplyMode = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    AcceptLabel = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    DeclineLabel = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    UpdatedOn = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Invitations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Invitations_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InvitationResponses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    InvitationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GuestName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    CreatedOn = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvitationResponses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvitationResponses_Invitations_InvitationId",
                        column: x => x.InvitationId,
                        principalTable: "Invitations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InvitationResponses_InvitationId_GuestName",
                table: "InvitationResponses",
                columns: new[] { "InvitationId", "GuestName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Invitations_EventId",
                table: "Invitations",
                column: "EventId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InvitationResponses");

            migrationBuilder.DropTable(
                name: "Invitations");
        }
    }
}
