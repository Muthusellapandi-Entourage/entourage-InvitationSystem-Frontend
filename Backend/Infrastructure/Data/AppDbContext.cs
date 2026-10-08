using Entourage.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Entourage.Infrastructure.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    public DbSet<Event> Events => Set<Event>();

    public DbSet<Invitation> Invitations => Set<Invitation>();

    public DbSet<InvitationResponse> InvitationResponses => Set<InvitationResponse>();

    public DbSet<EventAsset> EventAssets => Set<EventAsset>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(user => user.Id);
            entity.HasIndex(user => user.Email).IsUnique();
            entity.Property(user => user.FirstName).HasMaxLength(100).IsRequired();
            entity.Property(user => user.LastName).HasMaxLength(100).IsRequired();
            entity.Property(user => user.Email).HasMaxLength(256).IsRequired();
            entity.Property(user => user.PasswordHash).HasMaxLength(500).IsRequired();
            entity.Property(user => user.SecurityStamp).HasMaxLength(64).IsRequired();
            entity.Property(user => user.Role).HasConversion<string>().HasMaxLength(50);
            entity.Property(user => user.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(user => user.LastLoginOn).HasConversion(UtcNullableDateTimeConverter.Instance);
        });

        modelBuilder.Entity<Event>(entity =>
        {
            entity.ToTable("Events");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.Slug).IsUnique();
            entity.HasIndex(item => item.Status);
            entity.HasIndex(item => item.CreatedOn);
            entity.Property(item => item.Name).HasMaxLength(200).IsRequired();
            entity.Property(item => item.Slug).HasMaxLength(80).IsRequired();
            entity.Property(item => item.Description).HasMaxLength(2000);
            entity.Property(item => item.Timezone).HasMaxLength(100).IsRequired();
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Creator)
                .WithMany()
                .HasForeignKey(item => item.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Invitation>(entity =>
        {
            entity.ToTable("Invitations");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId).IsUnique();
            entity.Property(item => item.Addressee).HasMaxLength(300);
            entity.Property(item => item.PatronageIntro).HasMaxLength(500);
            entity.Property(item => item.PatronName).HasMaxLength(300);
            entity.Property(item => item.PatronTitle).HasMaxLength(300);
            entity.Property(item => item.PatronClosing).HasMaxLength(100);
            entity.Property(item => item.HostIntro).HasMaxLength(500);
            entity.Property(item => item.HostName).HasMaxLength(300);
            entity.Property(item => item.BodyIntro).HasMaxLength(500);
            entity.Property(item => item.OrganizationName).HasMaxLength(300).IsRequired();
            entity.Property(item => item.OrganizationSubtitle).HasMaxLength(300);
            entity.Property(item => item.Announcement).HasMaxLength(2000);
            entity.Property(item => item.AttendanceLine).HasMaxLength(500);
            entity.Property(item => item.DateLine).HasMaxLength(200).IsRequired();
            entity.Property(item => item.HijriDateLine).HasMaxLength(200);
            entity.Property(item => item.TimeLine).HasMaxLength(100);
            entity.Property(item => item.VenueLine).HasMaxLength(300).IsRequired();
            entity.Property(item => item.LocationUrl).HasMaxLength(500);
            entity.Property(item => item.RsvpNote).HasMaxLength(2000);
            entity.Property(item => item.RsvpDeadline).HasMaxLength(300);
            entity.Property(item => item.ReplyMode).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.AcceptLabel).HasMaxLength(40);
            entity.Property(item => item.DeclineLabel).HasMaxLength(40);
            entity.Property(item => item.DesignJson);
            entity.Property(item => item.Html);
            entity.Property(item => item.UpdatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Event)
                .WithMany()
                .HasForeignKey(item => item.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<InvitationResponse>(entity =>
        {
            entity.ToTable("InvitationResponses");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => new { item.InvitationId, item.GuestName }).IsUnique();
            entity.Property(item => item.GuestName).HasMaxLength(120).IsRequired();
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne<Invitation>()
                .WithMany()
                .HasForeignKey(item => item.InvitationId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EventAsset>(entity =>
        {
            entity.ToTable("EventAssets");
            entity.HasKey(item => item.Id);
            entity.HasIndex(item => item.EventId);
            entity.Property(item => item.FileName).HasMaxLength(180).IsRequired();
            entity.Property(item => item.ContentType).HasMaxLength(100).IsRequired();
            entity.Property(item => item.RelativePath).HasMaxLength(300).IsRequired();
            entity.Property(item => item.CreatedOn).HasConversion(UtcDateTimeConverter.Instance);
            entity.HasOne(item => item.Event)
                .WithMany()
                .HasForeignKey(item => item.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}

file sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    value => value,
    value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
{
    public static UtcDateTimeConverter Instance { get; } = new();
}

file sealed class UtcNullableDateTimeConverter() : ValueConverter<DateTime?, DateTime?>(
    value => value,
    value => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : value)
{
    public static UtcNullableDateTimeConverter Instance { get; } = new();
}
