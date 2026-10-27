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
    public async Task Import_rejects_emails_already_on_the_event_or_repeated_in_the_file()
    {
        await using var scope = await TestScope.CreateAsync();
        var first = await scope.Service.ImportGuestsAsync(scope.EventId, new ImportGuestsRequest(
        [
            new ImportGuestRowDto(2, "Lina Haddad", "lina@example.com", null, null),
        ],
        null,
        true), CancellationToken.None);
        Assert.True(first.Complete);

        var second = await scope.Service.ImportGuestsAsync(scope.EventId, new ImportGuestsRequest(
        [
            // Same email as an existing guest, different case and spaces.
            new ImportGuestRowDto(2, "Lina H.", "  LINA@example.com ", null, null),
            new ImportGuestRowDto(3, "Omar Saleh", "omar@example.com", null, null),
            // Repeats row 3 within the same file.
            new ImportGuestRowDto(4, "Omar S.", "Omar@Example.com", null, null),
            // Guests without an email are never duplicates of each other.
            new ImportGuestRowDto(5, "No Email One", null, null, null),
            new ImportGuestRowDto(6, "No Email Two", null, null, null),
        ],
        null,
        true), CancellationToken.None);

        Assert.False(second.Complete);
        Assert.Contains(second.Errors, error => error.Row == 2 && error.Message.Contains("already used by Lina Haddad"));
        Assert.Contains(second.Errors, error => error.Row == 4 && error.Message.Contains("duplicate of row 3"));
        Assert.DoesNotContain(second.Errors, error => error.Row is 3 or 5 or 6);
        // Nothing from the second file is saved while any row has an error.
        Assert.Equal(1, await scope.Db.Guests.CountAsync());
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
        // Without an event domain, Accept opens the RSVP page on the API's address.
        var inviteToken = (await scope.Db.Guests.SingleAsync(item => item.Id == ready.Id)).InviteToken;
        Assert.Contains($"http://localhost:5080/api/public/rsvp?g={inviteToken}&amp;status=accept", html.Html, StringComparison.Ordinal);
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
    public async Task Confirmed_event_domain_gives_each_guest_a_personal_link_and_reply_page()
    {
        await using var scope = await TestScope.CreateAsync();
        var vip = await scope.Service.CreateTypeAsync(scope.EventId, new CreateGuestTypeRequest("VIP"), CancellationToken.None);
        await scope.Service.SaveInvitationAsync(scope.EventId, vip.Id, InvitationDesignDto.CreateDefault() with { Width = 640 }, CancellationToken.None);
        var guest = await scope.Service.CreateGuestAsync(scope.EventId, Guest("Lina Haddad", vip.Id), CancellationToken.None);
        var token = (await scope.Db.Guests.SingleAsync(item => item.Id == guest.Id)).InviteToken;
        Assert.True(GuestInviteTokens.LooksValid(token));

        var sites = new EventSiteService(
            scope.Db,
            new Microsoft.Extensions.Caching.Memory.MemoryCache(new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions()),
            new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build(),
            null!,
            null!,
            Microsoft.Extensions.Logging.Abstractions.NullLogger<EventSiteService>.Instance);

        // Saved but not confirmed: links stay as before.
        await sites.SetAsync(scope.EventId, new SetEventDomainRequest("https://Awards.Example.com/invite"), ["admin.example.com"], CancellationToken.None);
        Assert.Null((await scope.Service.ListGuestsAsync(scope.EventId, null, false, CancellationToken.None)).Single().InvitationUrl);
        await Assert.ThrowsAsync<AppException>(() =>
            sites.SetAsync(scope.OtherEventId, new SetEventDomainRequest("awards.example.com"), [], CancellationToken.None));
        await Assert.ThrowsAsync<AppException>(() =>
            sites.SetAsync(scope.OtherEventId, new SetEventDomainRequest("admin.example.com"), ["admin.example.com"], CancellationToken.None));

        var stored = await scope.Db.Events.SingleAsync(item => item.Id == scope.EventId);
        Assert.Equal("awards.example.com", stored.CustomDomain);
        stored.CustomDomainVerifiedOn = DateTime.UtcNow;
        await scope.Db.SaveChangesAsync();

        var listed = (await scope.Service.ListGuestsAsync(scope.EventId, null, false, CancellationToken.None)).Single();
        Assert.Equal($"https://awards.example.com/invitation.html?g={token}", listed.InvitationUrl);

        await scope.Service.IssueInvitationsAsync(scope.EventId, new GuestIdsRequest([guest.Id]), "http://localhost:5080", "http://localhost:5173", CancellationToken.None);
        var html = (await scope.Db.GuestInvitationIssues.SingleAsync()).Html;
        Assert.Contains($"https://awards.example.com/rsvp.html?g={token}&amp;r=accept", html, StringComparison.Ordinal);
        Assert.DoesNotContain("/invite/sample-event", html, StringComparison.Ordinal);

        var site = await sites.FindByHostAsync("awards.example.com", CancellationToken.None);
        Assert.NotNull(site);
        Assert.Null(await sites.FindByHostAsync("other.example.com", CancellationToken.None));

        var page = await sites.InvitationPageAsync(site!, token, CancellationToken.None);
        Assert.Equal(200, page.Status);
        Assert.Contains("Lina Haddad", page.Html, StringComparison.Ordinal);
        Assert.Equal(404, (await sites.InvitationPageAsync(site!, "0000000000000000", CancellationToken.None)).Status);
        Assert.Equal(404, (await sites.InvitationPageAsync(site!, "../../etc", CancellationToken.None)).Status);

        // Opening the reply page changes nothing; only the confirm (POST) records the reply.
        var confirm = await sites.RsvpPageAsync(site!, token, "accept", CancellationToken.None);
        Assert.Contains("method=\"post\"", confirm.Html, StringComparison.Ordinal);
        Assert.Equal(GuestRsvp.Pending, (await scope.Db.Guests.AsNoTracking().SingleAsync(item => item.Id == guest.Id)).RsvpStatus);

        var recorded = await sites.RecordRsvpAsync(site!, token, "accept", CancellationToken.None);
        Assert.Equal(200, recorded.Status);
        Assert.Equal(GuestRsvp.Accepted, (await scope.Db.Guests.AsNoTracking().SingleAsync(item => item.Id == guest.Id)).RsvpStatus);

        // The confirm button's API: decline then accept again, each pointing at the right next page.
        var declined = await sites.ConfirmRsvpAsync(site!, token, "decline", "Travelling", CancellationToken.None);
        Assert.Equal($"/declined.html?g={token}", declined.Next);
        Assert.Equal(GuestRsvp.Declined, (await scope.Db.Guests.AsNoTracking().SingleAsync(item => item.Id == guest.Id)).RsvpStatus);
        var accepted = await sites.ConfirmRsvpAsync(site!, token, "accept", null, CancellationToken.None);
        Assert.Equal($"/thank-you.html?g={token}", accepted.Next);
        Assert.Equal(200, (await sites.AfterReplyPageAsync(site!, token, CancellationToken.None)).Status);
        Assert.Equal(400, (await sites.ConfirmRsvpAsync(site!, token, "maybe", null, CancellationToken.None)).Status);

        // A guest of another event cannot reply through this domain.
        var other = await scope.Service.CreateGuestAsync(scope.OtherEventId, Guest("Omar", null), CancellationToken.None);
        var otherToken = (await scope.Db.Guests.SingleAsync(item => item.Id == other.Id)).InviteToken;
        Assert.Equal(404, (await sites.RecordRsvpAsync(site!, otherToken, "decline", CancellationToken.None)).Status);
    }

    [Fact]
    public async Task Door_scan_checks_in_once_then_warns_and_seating_needs_a_check_in()
    {
        await using var scope = await TestScope.CreateAsync();
        var guest = await scope.Service.CreateGuestAsync(scope.EventId, Guest("Lina Haddad", null, "Editor"), CancellationToken.None);
        var checkIn = new CheckInService(scope.Db);

        await Assert.ThrowsAsync<AppException>(() => checkIn.MarkSeatedAsync(scope.EventId, guest.Id, CancellationToken.None));

        var empty = await checkIn.ScanAsync(scope.EventId, new CheckInScanRequest("   "), CancellationToken.None);
        Assert.Equal(CheckInService.Invalid, empty.Status);
        var unknown = await checkIn.ScanAsync(scope.EventId, new CheckInScanRequest("ffffffffffffffffffffffffffffffff"), CancellationToken.None);
        Assert.Equal(CheckInService.NotFound, unknown.Status);
        // A badge from another event is not on this guest list.
        Assert.Equal(CheckInService.NotFound, (await checkIn.ScanAsync(scope.OtherEventId, new CheckInScanRequest(guest.CheckInCode), CancellationToken.None)).Status);

        // The code works as a GUID with dashes and inside a link, in any case.
        var asGuid = Guid.ParseExact(guest.CheckInCode, "N").ToString("D").ToUpperInvariant();
        var first = await checkIn.ScanAsync(scope.EventId, new CheckInScanRequest(asGuid), CancellationToken.None);
        Assert.Equal(CheckInService.CheckedIn, first.Status);
        Assert.Equal(1, first.Guest!.CheckInCount);

        var again = await checkIn.ScanAsync(scope.EventId, new CheckInScanRequest($"https://example.com/badge?uniqueId={guest.CheckInCode}"), CancellationToken.None);
        Assert.Equal(CheckInService.AlreadyCheckedIn, again.Status);
        Assert.Equal(2, again.Guest!.CheckInCount);
        Assert.Equal(2, again.Guest.History.Length);

        var seated = await checkIn.MarkSeatedAsync(scope.EventId, guest.Id, CancellationToken.None);
        Assert.NotNull(seated.SeatedOn);
        var seatedAgain = await checkIn.MarkSeatedAsync(scope.EventId, guest.Id, CancellationToken.None);
        Assert.Equal(seated.SeatedOn, seatedAgain.SeatedOn);
        Assert.Equal(3, seatedAgain.History.Length);

        var live = await checkIn.LiveAsync(scope.EventId, 50, CancellationToken.None);
        Assert.Equal((1, 1, 1), (live.TotalGuests, live.CheckedIn, live.Seated));
        Assert.Equal(2, live.Scans.Length);
        Assert.False(live.Scans[0].FirstScan);
        Assert.True(live.Scans[1].FirstScan);
        Assert.Equal(guest.CheckInCode, live.Scans[0].Code);

        // Viewer link: works with its token, stops after a new one is made or it is turned off.
        await Assert.ThrowsAsync<AppException>(() => checkIn.PublicLiveAsync("not-a-token", CancellationToken.None));
        var share = await checkIn.RenewShareAsync(scope.EventId, CancellationToken.None);
        var shared = await checkIn.PublicLiveAsync(share.Token!, CancellationToken.None);
        Assert.Equal("sample-event", shared.EventName);
        Assert.Equal(2, shared.Live.Scans.Length);
        var renewed = await checkIn.RenewShareAsync(scope.EventId, CancellationToken.None);
        await Assert.ThrowsAsync<AppException>(() => checkIn.PublicLiveAsync(share.Token!, CancellationToken.None));
        await checkIn.DisableShareAsync(scope.EventId, CancellationToken.None);
        await Assert.ThrowsAsync<AppException>(() => checkIn.PublicLiveAsync(renewed.Token!, CancellationToken.None));

        // Draft and archived events: the door is closed and nothing is recorded.
        var stored = await scope.Db.Events.SingleAsync(item => item.Id == scope.EventId);
        stored.Status = EventStatus.Draft;
        await scope.Db.SaveChangesAsync();
        Assert.Equal(CheckInService.Closed, (await checkIn.ScanAsync(scope.EventId, new CheckInScanRequest(guest.CheckInCode), CancellationToken.None)).Status);
        Assert.Equal(2, (await scope.Db.Guests.AsNoTracking().SingleAsync(item => item.Id == guest.Id)).CheckInCount);
        await Assert.ThrowsAsync<AppException>(() =>
            scope.Service.IssueInvitationsAsync(scope.EventId, new GuestIdsRequest([guest.Id]), "http://localhost:5080", "http://localhost:5173", CancellationToken.None));
    }

    [Fact]
    public async Task Front_desk_link_lists_guests_and_checks_in_by_hand()
    {
        await using var scope = await TestScope.CreateAsync();
        var guest = await scope.Service.CreateGuestAsync(scope.EventId, Guest("Lina Haddad", null, "Editor"), CancellationToken.None);
        var frontDesk = new FrontDeskService(scope.Db, new CheckInService(scope.Db));

        await Assert.ThrowsAsync<AppException>(() => frontDesk.GetAsync("nope", CancellationToken.None));
        var share = await frontDesk.RenewShareAsync(scope.EventId, CancellationToken.None);

        var board = await frontDesk.GetAsync(share.Token!, CancellationToken.None);
        Assert.Equal((1, 0), (board.Totals.Guests, board.Totals.CheckedIn));
        Assert.Equal("Editor", board.Guests.Single().Position);

        // Seating needs a check-in first; then both work and are logged as front desk.
        await Assert.ThrowsAsync<AppException>(() => frontDesk.MarkSeatedAsync(share.Token!, guest.Id, CancellationToken.None));
        var checkedIn = await frontDesk.CheckInAsync(share.Token!, guest.Id, CancellationToken.None);
        Assert.Equal(CheckInService.CheckedIn, checkedIn.Status);
        Assert.Equal(1, checkedIn.Guest!.CheckInCount);
        var seated = await frontDesk.MarkSeatedAsync(share.Token!, guest.Id, CancellationToken.None);
        Assert.NotNull(seated.Guest!.SeatedOn);
        Assert.Contains(await scope.Db.GuestActivities.Select(item => item.Detail).ToListAsync(), detail => detail == "First check-in · front desk");

        // The live board still counts a front-desk check-in as the first one.
        Assert.True((await new CheckInService(scope.Db).LiveAsync(scope.EventId, 10, CancellationToken.None)).Scans.Single().FirstScan);

        await frontDesk.DisableShareAsync(scope.EventId, CancellationToken.None);
        await Assert.ThrowsAsync<AppException>(() => frontDesk.GetAsync(share.Token!, CancellationToken.None));
    }

    [Fact]
    public async Task Rsvp_page_confirms_through_the_api_with_decline_reasons()
    {
        await using var scope = await TestScope.CreateAsync();
        var guest = await scope.Service.CreateGuestAsync(scope.EventId, Guest("Lina Haddad", null), CancellationToken.None);
        var token = (await scope.Db.Guests.SingleAsync(item => item.Id == guest.Id)).InviteToken;
        var stored = await scope.Db.Events.SingleAsync(item => item.Id == scope.EventId);
        stored.AskDeclineReason = true;
        await scope.Db.SaveChangesAsync();
        var rsvp = new RsvpPageService(scope.Db, new FakeAssets());

        var (code, html) = await rsvp.PageAsync(token, "decline", CancellationToken.None);
        Assert.Equal(200, code);
        Assert.Contains("Dear Lina Haddad,", html, StringComparison.Ordinal);
        Assert.Contains("I have a prior commitment", html, StringComparison.Ordinal);
        Assert.Contains("data-intent=\"decline\"", html, StringComparison.Ordinal);
        // Opening the page changes nothing.
        Assert.Equal(GuestRsvp.Pending, (await scope.Db.Guests.AsNoTracking().SingleAsync(item => item.Id == guest.Id)).RsvpStatus);

        var (declineCode, declined) = await rsvp.ConfirmAsync(new PublicRsvpRequest(token, "Declined", "Other", "Travelling abroad"), CancellationToken.None);
        Assert.Equal(200, declineCode);
        Assert.Equal("declined", declined.Status);
        var saved = await scope.Db.Guests.AsNoTracking().SingleAsync(item => item.Id == guest.Id);
        Assert.Equal(GuestRsvp.Declined, saved.RsvpStatus);
        Assert.Equal("Other: Travelling abroad", saved.DeclineReason);

        var (acceptCode, accepted) = await rsvp.ConfirmAsync(new PublicRsvpRequest(token, "Accepted"), CancellationToken.None);
        Assert.Equal(200, acceptCode);
        Assert.Equal("accepted", accepted.Status);
        Assert.Null((await scope.Db.Guests.AsNoTracking().SingleAsync(item => item.Id == guest.Id)).DeclineReason);
        Assert.NotNull(await rsvp.QrAsync(token, "http://localhost:5080", CancellationToken.None));

        Assert.Equal(404, (await rsvp.ConfirmAsync(new PublicRsvpRequest("0000000000000000", "Accepted"), CancellationToken.None)).Item1);
        Assert.Equal(404, (await rsvp.PageAsync("not-a-token", "accept", CancellationToken.None)).Status);
    }

    [Theory]
    [InlineData("excellenceawards2026.com", "excellenceawards2026.com")]
    [InlineData("  HTTPS://Invite.Example.com/path?x=1 ", "invite.example.com")]
    [InlineData("example.com.", "example.com")]
    [InlineData("localhost", null)]
    [InlineData("10.0.0.5", null)]
    [InlineData("example.com:8080", null)]
    [InlineData("no_dots", null)]
    [InlineData("-bad-.com", null)]
    public void Event_domains_are_cleaned_and_checked(string input, string? expected)
    {
        Assert.Equal(expected, Entourage.Application.Invitations.EventDomains.Normalize(input, out _));
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
            // Active: invitations, guest pages and check-in only work on a live event.
            Status = EventStatus.Active,
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
