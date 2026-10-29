using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Entourage.Api.Infrastructure.Data.Migrations
{
    /// <summary>Per-event brand kit (colours and image groups).</summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261113090000_AddEventBrandKit")]
    public partial class AddEventBrandKit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(name: "BrandKitJson", table: "Events", type: "nvarchar(max)", nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "BrandKitJson", table: "Events");
        }
    }
}
