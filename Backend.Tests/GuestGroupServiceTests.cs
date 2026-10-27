using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Application.Validation;
using Entourage.Domain.Entities;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using Entourage.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Entourage.Tests;

public sealed class GuestGroupServiceTests
{
    [Fact]
    public async Task Group_names_are_unique_per_event_and_guests_can_be_filtered_by_group()
    {
        await using var scope = await Scope.CreateAsync();
        var finance = await scope.Groups.CreateAsync(scope.EventId, new SaveGuestGroupRequest("Ministry of Finance"), CancellationToken.None);
        var error = await Assert.ThrowsAsync<AppException>(() =>
            scope.Groups.CreateAsync(scope.EventId, new SaveGuestGroupRequest("  ministry of finance "), CancellationToken.None));
        Assert.Equal(409, error.StatusCode);

        await scope.Guests.CreateGuestAsync(scope.EventId, new SaveGuestRequest("Lina", null, null, null, false, finance.Id), CancellationToken.None);
        await scope.Guests.CreateGuestAsync(scope.EventId, new SaveGuestRequest("Omar", null, null, null, false), CancellationToken.None);

        var inGroup = await scope.Guests.ListGuestsAsync(scope.EventId, null, false, CancellationToken.None, finance.Id);
        var ungrouped = await scope.Guests.ListGuestsAsync(scope.EventId, null, false, CancellationToken.None, null, true);
        Assert.Equal("Lina", Assert.Single(inGroup).Name);
        Assert.Equal("Ministry of Finance", inGroup[0].GuestGroupName);
        Assert.Equal("Omar", Assert.Single(ungrouped).Name);
        Assert.Equal(1, (await scope.Groups.ListAsync(scope.EventId, CancellationToken.None)).Single().GuestCount);
    }

    [Fact]
    public async Task A_guest_cannot_be_put_in_another_events_group()
    {
        await using var scope = await Scope.CreateAsync();
        var foreign = await scope.Groups.CreateAsync(scope.OtherEventId, new SaveGuestGroupRequest("Press"), CancellationToken.None);
        await Assert.ThrowsAsync<AppException>(() =>
            scope.Guests.CreateGuestAsync(scope.EventId, new SaveGuestRequest("Lina", null, null, null, false, foreign.Id), CancellationToken.None));
    }

    [Fact]
    public async Task Import_into_a_group_and_from_a_group_column()
    {
        await using var scope = await Scope.CreateAsync();
        var target = await scope.Groups.CreateAsync(scope.EventId, new SaveGuestGroupRequest("Delegation A"), CancellationToken.None);
        var result = await scope.Guests.ImportGuestsAsync(scope.EventId, new ImportGuestsRequest(
        [
            new ImportGuestRowDto(2, "Lina", "lina@example.com", null, null),
            new ImportGuestRowDto(3, "Omar", "omar@example.com", null, null, "Press Corps"),
        ],
        null,
        true,
        target.Id), CancellationToken.None);

        Assert.True(result.Complete);
        var guests = await scope.Guests.ListGuestsAsync(scope.EventId, null, false, CancellationToken.None);
        Assert.Equal("Delegation A", guests.Single(guest => guest.Name == "Lina").GuestGroupName);
        // A Group column wins over the chosen group, and unknown names become new groups.
        Assert.Equal("Press Corps", guests.Single(guest => guest.Name == "Omar").GuestGroupName);
        Assert.Equal(2, await scope.Db.GuestGroups.CountAsync(item => item.EventId == scope.EventId));
    }

    [Fact]
    public async Task Deleting_a_group_can_keep_or_delete_its_guests_and_frees_their_seats()
    {
        await using var scope = await Scope.CreateAsync();
        var keep = await scope.Groups.CreateAsync(scope.EventId, new SaveGuestGroupRequest("Keep"), CancellationToken.None);
        var drop = await scope.Groups.CreateAsync(scope.EventId, new SaveGuestGroupRequest("Drop"), CancellationToken.None);
        var kept = await scope.Guests.CreateGuestAsync(scope.EventId, new SaveGuestRequest("Kept", null, null, null, false, keep.Id), CancellationToken.None);
        var dropped = await scope.Guests.CreateGuestAsync(scope.EventId, new SaveGuestRequest("Dropped", null, null, null, false, drop.Id), CancellationToken.None);
        scope.Db.SeatingPlans.Add(new SeatingPlan
        {
            Id = Guid.CreateVersion7(),
            EventId = scope.EventId,
            DesignJson = $$"""
                {"layouts":[{"id":"l1","arrangements":[{"id":"a1","seats":[
                  {"id":"s1","label":"1","guestId":"{{kept.Id}}"},
                  {"id":"s2","label":"2","guestId":"{{dropped.Id}}"}
                ]}]}]}
                """,
            UpdatedOn = DateTime.UtcNow,
        });
        await scope.Db.SaveChangesAsync();

        var keepResult = await scope.Groups.DeleteAsync(scope.EventId, keep.Id, false, CancellationToken.None);
        Assert.Equal(1, keepResult.GuestsUngrouped);
        var stillThere = await scope.Db.Guests.AsNoTracking().SingleAsync(item => item.Id == kept.Id);
        Assert.Null(stillThere.GuestGroupId);

        var dropResult = await scope.Groups.DeleteAsync(scope.EventId, drop.Id, true, CancellationToken.None);
        Assert.Equal(1, dropResult.GuestsDeleted);
        Assert.False(await scope.Db.Guests.AnyAsync(item => item.Id == dropped.Id));
        Assert.Equal(0, await scope.Db.GuestGroups.CountAsync(item => item.EventId == scope.EventId));

        var plan = await scope.Db.SeatingPlans.AsNoTracking().SingleAsync();
        Assert.Contains(kept.Id.ToString(), plan.DesignJson);
        Assert.DoesNotContain(dropped.Id.ToString(), plan.DesignJson);
    }

    [Fact]
    public async Task Deleting_guests_removes_their_history()
    {
        await using var scope = await Scope.CreateAsync();
        var guest = await scope.Guests.CreateGuestAsync(scope.EventId, new SaveGuestRequest("Lina", "lina@example.com", null, null, false), CancellationToken.None);
        scope.Db.GuestBadgeIssues.Add(new GuestBadgeIssue
        {
            Id = Guid.CreateVersion7(),
            GuestId = guest.Id,
            GuestTypeName = "VIP",
            QrPayload = guest.CheckInCode,
            GeneratedOn = DateTime.UtcNow,
        });
        await scope.Db.SaveChangesAsync();

        var result = await scope.Groups.DeleteGuestsAsync(scope.EventId, new GuestIdsRequest([guest.Id]), CancellationToken.None);

        Assert.Equal(1, result.Deleted);
        Assert.False(await scope.Db.Guests.AnyAsync());
        Assert.False(await scope.Db.GuestBadgeIssues.AnyAsync());
    }

    [Fact]
    public async Task Deleting_guests_twice_or_with_already_deleted_ids_does_not_fail()
    {
        await using var scope = await Scope.CreateAsync();
        var lina = await scope.Guests.CreateGuestAsync(scope.EventId, new SaveGuestRequest("Lina", null, null, null, false), CancellationToken.None);
        var omar = await scope.Guests.CreateGuestAsync(scope.EventId, new SaveGuestRequest("Omar", null, null, null, false), CancellationToken.None);
        await scope.Groups.DeleteGuestsAsync(scope.EventId, new GuestIdsRequest([lina.Id]), CancellationToken.None);

        // "Delete all" from a list that still shows Lina.
        var result = await scope.Groups.DeleteGuestsAsync(scope.EventId, new GuestIdsRequest([lina.Id, omar.Id]), CancellationToken.None);
        Assert.Equal(1, result.Deleted);
        Assert.False(await scope.Db.Guests.AnyAsync());

        var again = await scope.Groups.DeleteGuestsAsync(scope.EventId, new GuestIdsRequest([lina.Id, omar.Id]), CancellationToken.None);
        Assert.Equal(0, again.Deleted);
    }

    [Fact]
    public async Task Bulk_email_sends_each_guest_their_own_invitation_and_skips_guests_without_email()
    {
        await using var scope = await Scope.CreateAsync();
        var vip = await scope.Guests.CreateTypeAsync(scope.EventId, new CreateGuestTypeRequest("VIP"), CancellationToken.None);
        await scope.Guests.SaveInvitationAsync(scope.EventId, vip.Id, InvitationDesignDto.CreateDefault(), CancellationToken.None);
        var lina = await scope.Guests.CreateGuestAsync(scope.EventId, new SaveGuestRequest("Lina Haddad", "lina@example.com", null, vip.Id, false), CancellationToken.None);
        var noEmail = await scope.Guests.CreateGuestAsync(scope.EventId, new SaveGuestRequest("No Email", null, null, vip.Id, false), CancellationToken.None);
        var transport = new FakeTransport();
        var mailer = new GuestMailer(scope.Db, scope.Guests, new FakeSettings(), transport, new GuestIdsRequestValidator());

        var result = await mailer.SendInvitationsAsync(
            scope.EventId,
            new GuestIdsRequest([lina.Id, noEmail.Id]),
            "https://api.example.com",
            "https://app.example.com",
            CancellationToken.None);

        var sent = Assert.Single(transport.Sent);
        Assert.Equal("lina@example.com", sent.ToEmail);
        Assert.Contains("Lina Haddad", sent.HtmlBody);
        Assert.Equal(lina.Id, Assert.Single(result.Sent).GuestId);
        Assert.Equal(noEmail.Id, Assert.Single(result.Skipped).GuestId);
        Assert.False(result.Complete);
    }

    [Fact]
    public async Task Status_changes_and_actions_are_kept_in_the_guest_history()
    {
        await using var scope = await Scope.CreateAsync();
        var guest = await scope.Guests.CreateGuestAsync(scope.EventId, new SaveGuestRequest("Lina", "lina@example.com", null, null, false), CancellationToken.None);

        var changed = await scope.Groups.SetRsvpAsync(scope.EventId, guest.Id, new SetGuestRsvpRequest("Accepted"), CancellationToken.None);
        var unchanged = await scope.Groups.SetRsvpAsync(scope.EventId, guest.Id, new SetGuestRsvpRequest("Accepted"), CancellationToken.None);
        await scope.Groups.LogActivityAsync(scope.EventId, guest.Id, new LogGuestActivityRequest("Downloaded", "Invite-card PDF (VIP)"), CancellationToken.None);

        Assert.NotNull(changed);
        Assert.Equal("Pending → Accepted (by admin)", changed!.Detail);
        Assert.Null(unchanged);
        var listed = (await scope.Guests.ListGuestsAsync(scope.EventId, null, false, CancellationToken.None)).Single();
        Assert.Equal("Accepted", listed.RsvpStatus);
        Assert.NotNull(listed.RsvpUpdatedOn);

        var history = await scope.Groups.ListActivityAsync(scope.EventId, guest.Id, CancellationToken.None);
        Assert.Equal(["Downloaded", "Status changed", "Added"], history.Select(item => item.Kind).ToArray());

        // Only browser-side downloads may be logged by the client.
        await Assert.ThrowsAsync<AppException>(() =>
            scope.Groups.LogActivityAsync(scope.EventId, guest.Id, new LogGuestActivityRequest("Invitation emailed", null), CancellationToken.None));
    }

    [Fact]
    public async Task Bulk_email_changes_nothing_when_mail_is_not_set_up()
    {
        await using var scope = await Scope.CreateAsync();
        var guest = await scope.Guests.CreateGuestAsync(scope.EventId, new SaveGuestRequest("Lina", "lina@example.com", null, null, false), CancellationToken.None);
        var mailer = new GuestMailer(scope.Db, scope.Guests, new FakeSettings(configured: false), new FakeTransport(), new GuestIdsRequestValidator());

        await Assert.ThrowsAsync<AppException>(() => mailer.SendInvitationsAsync(
            scope.EventId, new GuestIdsRequest([guest.Id]), "https://api.example.com", "https://app.example.com", CancellationToken.None));
        Assert.False(await scope.Db.GuestInvitationIssues.AnyAsync());
    }

    private sealed class FakeTransport : IMailTransport
    {
        public List<OutgoingMail> Sent { get; } = [];

        public Task<IReadOnlyDictionary<Guid, string>> SendManyAsync(SmtpAccount account, IReadOnlyList<OutgoingMail> messages, CancellationToken cancellationToken)
        {
            Sent.AddRange(messages);
            return Task.FromResult<IReadOnlyDictionary<Guid, string>>(new Dictionary<Guid, string>());
        }
    }

    private sealed class FakeSettings(bool configured = true) : IMailSettingsService
    {
        public Task<MailSettingsDto> GetAsync(CancellationToken cancellationToken) => throw new NotSupportedException();

        public Task<MailSettingsDto> SaveAsync(SaveMailSettingsRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();

        public Task SendTestAsync(SendTestEmailRequest request, CancellationToken cancellationToken) => throw new NotSupportedException();

        public Task<SmtpAccount?> GetAccountAsync(CancellationToken cancellationToken) => Task.FromResult(
            configured ? new SmtpAccount("smtp.example.com", 587, true, "user", "secret", "events@example.com", "Events") : null);
    }

    private sealed class Scope : IAsyncDisposable
    {
        private readonly SqliteConnection connection;

        private Scope(SqliteConnection connection, AppDbContext db, Guid eventId, Guid otherEventId)
        {
            this.connection = connection;
            Db = db;
            EventId = eventId;
            OtherEventId = otherEventId;
            Guests = new GuestDirectoryService(
                db,
                new CreateGuestTypeRequestValidator(),
                new UpdateGuestTypeRequestValidator(),
                new ReorderGuestTypesRequestValidator(),
                new DuplicateDesignRequestValidator(),
                new SaveGuestRequestValidator(),
                new ReassignGuestsRequestValidator(),
                new GuestIdsRequestValidator(),
                new ImportGuestsRequestValidator(),
                new InvitationDesignValidator(),
                new BadgeDesignValidator(),
                new NoAssets());
            Groups = new GuestGroupService(
                db,
                new SaveGuestGroupRequestValidator(),
                new MoveGuestsToGroupRequestValidator(),
                new GuestIdsRequestValidator(),
                new SetGuestRsvpRequestValidator(),
                new LogGuestActivityRequestValidator());
        }

        public AppDbContext Db { get; }

        public Guid EventId { get; }

        public Guid OtherEventId { get; }

        public GuestDirectoryService Guests { get; }

        public GuestGroupService Groups { get; }

        public static async Task<Scope> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
            await db.Database.EnsureCreatedAsync();
            var userId = Guid.CreateVersion7();
            db.Users.Add(new User
            {
                Id = userId,
                FirstName = "Admin",
                LastName = "User",
                Email = $"{userId:N}@example.com",
                PasswordHash = "hash",
                Role = UserRole.Administrator,
                IsActive = true,
                CreatedOn = DateTime.UtcNow,
                SecurityStamp = "stamp",
            });
            var eventId = Guid.CreateVersion7();
            var otherEventId = Guid.CreateVersion7();
            db.Events.Add(NewEvent(eventId, userId, "group-event"));
            db.Events.Add(NewEvent(otherEventId, userId, "other-group-event"));
            await db.SaveChangesAsync();
            return new Scope(connection, db, eventId, otherEventId);
        }

        public async ValueTask DisposeAsync()
        {
            await Db.DisposeAsync();
            await connection.DisposeAsync();
        }

        private static Event NewEvent(Guid id, Guid userId, string slug) => new()
        {
            Id = id,
            Name = slug,
            Slug = slug,
            StartDate = new DateOnly(2026, 10, 27),
            EndDate = new DateOnly(2026, 10, 27),
            Timezone = "Asia/Dubai",
            Status = EventStatus.Draft,
            CreatedBy = userId,
            CreatedOn = DateTime.UtcNow,
            UpdatedOn = DateTime.UtcNow,
            IsActive = true,
        };
    }

    private sealed class NoAssets : IEventAssetService
    {
        public Task<EventAssetDto> SaveAsync(Guid eventId, Stream content, string contentType, string originalFileName, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task EnsureOwnedAsync(Guid eventId, IReadOnlyCollection<Guid> assetIds, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task DeleteUnreferencedAsync(Guid eventId, IReadOnlyCollection<Guid> keep, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task<EventAssetFile?> OpenAsync(Guid assetId, CancellationToken cancellationToken) => Task.FromResult<EventAssetFile?>(null);
    }
}
