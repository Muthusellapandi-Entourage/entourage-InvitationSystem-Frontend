using System;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Entourage.Api.Infrastructure.Data.Migrations
{
    /// <summary>An accreditation can belong to an event (one per event).</summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261111090000_LinkAccreditationToEvents")]
    public partial class LinkAccreditationToEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(name: "EventId", table: "AccEvents", type: "uniqueidentifier", nullable: true);
            migrationBuilder.CreateIndex(name: "IX_AccEvents_EventId", table: "AccEvents", column: "EventId", unique: true, filter: "[EventId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_AccEvents_EventId", table: "AccEvents");
            migrationBuilder.DropColumn(name: "EventId", table: "AccEvents");
        }
    }
}
