using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Entourage.Api.Infrastructure.Data.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20261106090000_AddFrontDeskToken")]
    public partial class AddFrontDeskToken : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FrontDeskToken",
                table: "Events",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Events_FrontDeskToken",
                table: "Events",
                column: "FrontDeskToken",
                unique: true,
                filter: "[FrontDeskToken] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_Events_FrontDeskToken", table: "Events");
            migrationBuilder.DropColumn(name: "FrontDeskToken", table: "Events");
        }
    }
}
