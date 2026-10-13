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

public sealed class GuestDirectoryServiceTests
{
    [Fact]
    public async Task Create_and_edit_are_event_specific()
    {
        await using var scope = await TestScope.CreateAsync();
        var created = await scope.Service.CreateTypeAsync(scope.EventId, new CreateGuestTypeRequest("VIP"), CancellationToken.None);
        var edited = await scope.Service.UpdateTypeAsync(scope.EventId, created.Id, new UpdateGuestTypeRequest("VVIP", true), CancellationToken.None);
        Assert.Equal("VVIP", edited.Name);
        await Assert.ThrowsAsync<AppException>(() =>
            scope.Service.UpdateTypeAsync(scope.OtherEventId, created.Id, new UpdateGuestTypeRequest("Media", true), CancellationToken.None));
    }

    [Fact]
    public async Task Guests_cannot_be_assigned_across_events()
    {
        await using var scope = await TestScope.CreateAsync();
        var foreign = await scope.Service.CreateTypeAsync(scope.OtherEventId, new CreateGuestTypeRequest("VIP"), CancellationToken.None);
        var error = await Assert.ThrowsAsync<AppException>(() =>
            scope.Service.CreateGuestAsync(scope.EventId, Guest("Lina", foreign.Id), CancellationToken.None));
        Assert.Equal(404, error.StatusCode);
    }

    [Fact]
    public async Task Import_matches_case_and_whitespace_and_rejects_blank_unknown_and_disabled()
    {
        await using var scope = await TestScope.CreateAsync();
        var vip = await scope.Service.CreateTypeAsync(scope.EventId, new CreateGuestTypeRequest("VIP"), CancellationToken.None);
        var staff = await scope.Service.CreateTypeAsync(scope.EventId, new CreateGuestTypeRequest("Staff"), CancellationToken.None);
        await scope.Service.UpdateTypeAsync(scope.EventId, staff.Id, new UpdateGuestTypeRequest("Staff", false), CancellationToken.None);

        var preview = await scope.Service.ImportGuestsAsync(scope.EventId, new ImportGuestsRequest(
        [
            new ImportGuestRowDto(2, "Lina Haddad", "lina@example.com", "Editor", "  vip "),
            new ImportGuestRowDto(3, "No Type", null, null, "  "),
            new ImportGuestRowDto(4, "Unknown", null, null, "Press"),
            new ImportGuestRowDto(5, "Sam", null, null, "staff"),
        ],
        null,
        false), CancellationToken.None);

        Assert.False(preview.Complete);
        Assert.Contains(preview.UnmatchedTypes, value => value == "Press");
        Assert.Contains(preview.Errors, error => error.Row == 3);
        Assert.Contains(preview.Errors, error => error.Row == 5 && error.Message.Contains("disabled"));
        Assert.Equal(0, await scope.Db.Guests.CountAsync());

        var imported = await scope.Service.ImportGuestsAsync(scope.EventId, new ImportGuestsRequest(
        [
            new ImportGuestRowDto(2, "Lina Haddad", "lina@example.com", "Editor", "  vip "),
            new ImportGuestRowDto(4, "Nora Ali", null, null, "Press"),
        ],
        [new ImportTypeMapping("Press", null, true)],
        true), CancellationToken.None);

        Assert.True(imported.Complete);
        var guests = await scope.Service.ListGuestsAsync(scope.EventId, null, false, CancellationToken.None);
        Assert.Equal(vip.Id, guests.Single(guest => guest.Name == "Lina Haddad").GuestTypeId);
        Assert.Equal("Press", guests.Single(guest => guest.Name == "Nora Ali").GuestTypeName);
    }

    [Fact]
    public async Task Manual_assignment_and_later_change_do_not_issue_an_invitation()
    {
        await using var scope = await TestScope.CreateAsync();
        var vip = await scope.Service.CreateTypeAsync(scope.EventId, new CreateGuestTypeRequest("VIP"), CancellationToken.None);
        var media = await scope.Service.CreateTypeAsync(scope.EventId, new CreateGuestTypeRequest("Media"), CancellationToken.None);
        var guest = await scope.Service.CreateGuestAsync(scope.EventId, Guest("Lina", vip.Id), CancellationToken.None);
        var changed = await scope.Service.UpdateGuestAsync(scope.EventId, guest.Id, Guest("Lina", media.Id), CancellationToken.None);
        Assert.Equal(media.Id, changed.GuestTypeId);
        Assert.Equal(0, changed.InvitationCount);
        Assert.Equal(guest.CheckInCode, changed.CheckInCode);
    }

    [Fact]
    public async Task Invitation_and_badge_designs_stay_independent_through_duplicate_and_edit()
    {
        await using var scope = await TestScope.CreateAsync();
        var vip = await scope.Service.CreateTypeAsync(scope.EventId, new CreateGuestTypeRequest("VIP"), CancellationToken.None);
        var media = await scope.Service.CreateTypeAsync(scope.EventId, new CreateGuestTypeRequest("Media"), CancellationToken.None);
        await scope.Service.SaveInvitationAsync(scope.EventId, vip.Id, InvitationDesignDto.CreateDefault() with { Width = 640 }, CancellationToken.None);
        await scope.Service.SaveInvitationAsync(scope.EventId, media.Id, InvitationDesignDto.CreateDefault() with { Width = 800 }, CancellationToken.None);
        await scope.Service.SaveBadgeAsync(scope.EventId, vip.Id, BadgeDesignDto.CreateDefault() with { Width = 700, Height = 1000 }, CancellationToken.None);
        await scope.Service.SaveBadgeAsync(scope.EventId, media.Id, BadgeDesignDto.CreateDefault() with { Width = 500, Height = 700 }, CancellationToken.None);

        var vipInvitation = await scope.Service.GetInvitationAsync(scope.EventId, vip.Id, CancellationToken.None);
        var mediaInvitation = await scope.Service.GetInvitationAsync(scope.EventId, media.Id, CancellationToken.None);
        Assert.Equal(640, vipInvitation.Design.Width);
        Assert.Equal(800, mediaInvitation.Design.Width);

        await scope.Service.DuplicateDesignAsync(scope.EventId, vip.Id, new DuplicateDesignRequest("invitation", media.Id, true), CancellationToken.None);
        vipInvitation = await scope.Service.GetInvitationAsync(scope.EventId, vip.Id, CancellationToken.None);
        mediaInvitation = await scope.Service.GetInvitationAsync(scope.EventId, media.Id, CancellationToken.None);
        Assert.Equal(640, vipInvitation.Design.Width);
        Assert.Equal(640, mediaInvitation.Design.Width);
        Assert.Equal(500, (await scope.Service.GetBadgeAsync(scope.EventId, media.Id, CancellationToken.None)).Design.Width);

        await scope.Service.SaveInvitationAsync(scope.EventId, media.Id, InvitationDesignDto.CreateDefault() with { Width = 900 }, CancellationToken.None);
        Assert.Equal(640, (await scope.Service.GetInvitationAsync(scope.EventId, vip.Id, CancellationToken.None)).Design.Width);
        Assert.Equal(900, (await scope.Service.GetInvitationAsync(scope.EventId, media.Id, CancellationToken.None)).Design.Width);

        await scope.Service.DuplicateDesignAsync(scope.EventId, vip.Id, new DuplicateDesignRequest("badge", media.Id, true), CancellationToken.None);
        await scope.Service.SaveBadgeAsync(scope.EventId, media.Id, BadgeDesignDto.CreateDefault() with { Width = 510, Height = 720 }, CancellationToken.None);
        Assert.Equal(700, (await scope.Service.GetBadgeAsync(scope.EventId, vip.Id, CancellationToken.None)).Design.Width);
        Assert.Equal(510, (await scope.Service.GetBadgeAsync(scope.EventId, media.Id, CancellationToken.None)).Design.Width);
    }

    [Fact]
    public async Task Sending_and_badges_use_the_guest_type_design_and_block_when_missing()
    {
        await using var scope = await TestScope.CreateAsync();
        var vip = await scope.Service.CreateTypeAsync(scope.EventId, new CreateGuestTypeRequest("VIP"), CancellationToken.None);
        var media = await scope.Service.CreateTypeAsync(scope.EventId, new CreateGuestTypeRequest("Media"), CancellationToken.None);
        var acceptId = Guid.CreateVersion7();
        await scope.Service.SaveInvitationAsync(scope.EventId, vip.Id, InvitationDesignDto.CreateDefault() with { Width = 640, AcceptAssetId = acceptId }, CancellationToken.None);
        await scope.Service.SaveBadgeAsync(scope.EventId, vip.Id, BadgeDesignDto.CreateDefault() with { Width = 700, Height = 1000 }, CancellationToken.None);
        var ready = await scope.Service.CreateGuestAsync(scope.EventId, Guest("Lina Haddad", vip.Id, "Editor"), CancellationToken.None);
        var blockedGuest = await scope.Service.CreateGuestAsync(scope.EventId, Guest("Nora", media.Id), CancellationToken.None);
        var untyped = await scope.Service.CreateGuestAsync(scope.EventId, Guest("Sam", null), CancellationToken.None);

        var missingInvite = await Assert.ThrowsAsync<AppException>(() =>
            scope.Service.IssueInvitationsAsync(scope.EventId, new GuestIdsRequest([blockedGuest.Id]), "http://localhost:5080", "http://localhost:5173", CancellationToken.None));
        Assert.Contains("Media invitation design", missingInvite.Message);

        var issued = await scope.Service.IssueInvitationsAsync(
            scope.EventId,
            new GuestIdsRequest([ready.Id, blockedGuest.Id, untyped.Id]),
            "http://localhost:5080",
            "http://localhost:5173",
            CancellationToken.None);
        Assert.False(issued.Complete);
        Assert.Single(issued.Issued);
        Assert.Equal(2, issued.Blocked.Length);
        var html = await scope.Db.GuestInvitationIssues.SingleAsync(item => item.GuestId == ready.Id);
        Assert.Contains("width=\"640\"", html.Html, StringComparison.Ordinal);
        Assert.Contains("Lina Haddad", html.Html, StringComparison.Ordinal);
        Assert.Contains("/invite/sample-event/rsvp?status=accept", html.Html, StringComparison.Ordinal);
        Assert.Equal(0, await scope.Db.GuestInvitationIssues.CountAsync(item => item.GuestId == blockedGuest.Id));

        var missingBadge = await scope.Service.PrepareBadgesAsync(scope.EventId, new GuestIdsRequest([blockedGuest.Id]), CancellationToken.None);
        Assert.Contains("Media badge design", missingBadge.Blocked[0].Reason, StringComparison.Ordinal);
        Assert.Equal(0, await scope.Db.GuestBadgeIssues.CountAsync());

        var badges = await scope.Service.PrepareBadgesAsync(scope.EventId, new GuestIdsRequest([ready.Id, blockedGuest.Id]), CancellationToken.None);
        Assert.Equal(700, badges.Ready[0].Design.Width);
        Assert.Equal(1000, badges.Ready[0].Design.Height);
        Assert.Equal(ready.CheckInCode, badges.Ready[0].QrPayload);
        var committed = await scope.Service.CommitBadgesAsync(scope.EventId, new GuestIdsRequest([ready.Id, blockedGuest.Id]), CancellationToken.None);
        Assert.False(committed.Complete);
        Assert.Single(committed.Issued);
        Assert.Equal(ready.CheckInCode, (await scope.Db.GuestBadgeIssues.SingleAsync()).QrPayload);
    }

    [Fact]
    public async Task Changing_type_after_send_does_not_resend_until_asked_and_keeps_history()
    {
        await using var scope = await TestScope.CreateAsync();
        var vip = await scope.Service.CreateTypeAsync(scope.EventId, new CreateGuestTypeRequest("VIP"), CancellationToken.None);
        var media = await scope.Service.CreateTypeAsync(scope.EventId, new CreateGuestTypeRequest("Media"), CancellationToken.None);
        await scope.Service.SaveInvitationAsync(scope.EventId, vip.Id, InvitationDesignDto.CreateDefault() with { Width = 640 }, CancellationToken.None);
        await scope.Service.SaveInvitationAsync(scope.EventId, media.Id, InvitationDesignDto.CreateDefault() with { Width = 880 }, CancellationToken.None);
        await scope.Service.SaveBadgeAsync(scope.EventId, vip.Id, BadgeDesignDto.CreateDefault() with { Width = 700, Height = 1000 }, CancellationToken.None);
        await scope.Service.SaveBadgeAsync(scope.EventId, media.Id, BadgeDesignDto.CreateDefault() with { Width = 500, Height = 800 }, CancellationToken.None);
        var guest = await scope.Service.CreateGuestAsync(scope.EventId, Guest("Lina Haddad", vip.Id), CancellationToken.None);
        await scope.Service.IssueInvitationsAsync(scope.EventId, new GuestIdsRequest([guest.Id]), "http://localhost:5080", "http://localhost:5173", CancellationToken.None);
        await scope.Service.CommitBadgesAsync(scope.EventId, new GuestIdsRequest([guest.Id]), CancellationToken.None);

        var invitation = await scope.Db.Invitations.SingleAsync(item => item.EventId == scope.EventId);
        scope.Db.InvitationResponses.Add(new InvitationResponse
        {
            Id = Guid.CreateVersion7(),
            InvitationId = invitation.Id,
            GuestName = "Lina Haddad",
            Status = RsvpStatus.Accepted,
            CreatedOn = DateTime.UtcNow,
        });
        await scope.Db.SaveChangesAsync();

        var conflict = await Assert.ThrowsAsync<AppException>(() =>
            scope.Service.UpdateGuestAsync(scope.EventId, guest.Id, Guest("Lina Haddad", media.Id), CancellationToken.None));
        Assert.Equal(409, conflict.StatusCode);
        Assert.Equal(1, await scope.Db.GuestInvitationIssues.CountAsync());

        var changed = await scope.Service.UpdateGuestAsync(
            scope.EventId,
            guest.Id,
            Guest("Lina Haddad", media.Id) with { AcknowledgeTypeChange = true },
            CancellationToken.None);
        Assert.Equal(media.Id, changed.GuestTypeId);
        Assert.Equal(1, changed.InvitationCount);
        Assert.Equal(guest.CheckInCode, changed.CheckInCode);
        Assert.Equal(RsvpStatus.Accepted, (await scope.Db.InvitationResponses.SingleAsync()).Status);

        await scope.Service.IssueInvitationsAsync(scope.EventId, new GuestIdsRequest([guest.Id]), "http://localhost:5080", "http://localhost:5173", CancellationToken.None);
        var issues = await scope.Db.GuestInvitationIssues.OrderBy(item => item.IssuedOn).ToListAsync();
        Assert.Equal(2, issues.Count);
        Assert.Contains("width=\"640\"", issues[0].Html, StringComparison.Ordinal);
        Assert.Contains("width=\"880\"", issues[1].Html, StringComparison.Ordinal);
        Assert.Equal(guest.CheckInCode, changed.CheckInCode);

        var regenerated = await scope.Service.CommitBadgesAsync(scope.EventId, new GuestIdsRequest([guest.Id]), CancellationToken.None);
        Assert.Equal("Media", regenerated.Issued[0].GuestTypeName);
        var payloads = await scope.Db.GuestBadgeIssues.Select(item => item.QrPayload).ToListAsync();
        Assert.All(payloads, payload => Assert.Equal(guest.CheckInCode, payload));
        Assert.Equal("legacy-invitation", (await scope.Db.Invitations.SingleAsync()).DesignJson);
        Assert.Equal("legacy-badge", (await scope.Db.Invitations.SingleAsync()).BadgeDesignJson);
    }

    private static SaveGuestRequest Guest(string name, Guid? typeId, string? position = null) =>
        new(name, null, position, typeId, false);

    private sealed class TestScope : IAsyncDisposable
    {
        private readonly SqliteConnection connection;
        public AppDbContext Db { get; }
        public GuestDirectoryService Service { get; }
        public Guid EventId { get; }
        public Guid OtherEventId { get; }

        private TestScope(SqliteConnection connection, AppDbContext db, GuestDirectoryService service, Guid eventId, Guid otherEventId)
        {
            this.connection = connection;
            Db = db;
            Service = service;
            EventId = eventId;
            OtherEventId = otherEventId;
        }

        public static async Task<TestScope> CreateAsync()
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options;
            var db = new AppDbContext(options);
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
            db.Events.Add(Event(eventId, userId, "sample-event"));
            db.Events.Add(Event(otherEventId, userId, "other-event"));
            db.Invitations.Add(new Invitation
            {
                Id = Guid.CreateVersion7(),
                EventId = eventId,
                OrganizationName = string.Empty,
                DateLine = string.Empty,
                VenueLine = string.Empty,
                DesignJson = "legacy-invitation",
                BadgeDesignJson = "legacy-badge",
                Html = "<p>legacy</p>",
                UpdatedOn = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
            var service = new GuestDirectoryService(
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
                new FakeAssets());
            return new TestScope(connection, db, service, eventId, otherEventId);
        }

        public async ValueTask DisposeAsync()
        {
            await Db.DisposeAsync();
            await connection.DisposeAsync();
        }

        private static Event Event(Guid id, Guid userId, string slug) => new()
        {
            Id = id,
            Name = slug,
            Slug = slug,
            StartDate = new DateOnly(2026, 10, 13),
            EndDate = new DateOnly(2026, 10, 13),
            Timezone = "Asia/Dubai",
            Status = EventStatus.Draft,
            CreatedBy = userId,
            CreatedOn = DateTime.UtcNow,
            UpdatedOn = DateTime.UtcNow,
            IsActive = true,
        };
    }

    private sealed class FakeAssets : IEventAssetService
    {
        public Task<EventAssetDto> SaveAsync(Guid eventId, Stream content, string contentType, string originalFileName, CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task EnsureOwnedAsync(Guid eventId, IReadOnlyCollection<Guid> assetIds, CancellationToken cancellationToken) =>
            Task.CompletedTask;

        public Task DeleteUnreferencedAsync(Guid eventId, IReadOnlyCollection<Guid> keep, CancellationToken cancellationToken) =>
            Task.CompletedTask;

        public Task<EventAssetFile?> OpenAsync(Guid assetId, CancellationToken cancellationToken) =>
            Task.FromResult<EventAssetFile?>(null);
    }
}
