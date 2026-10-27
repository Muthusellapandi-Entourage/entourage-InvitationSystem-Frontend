using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Application.Validation;
using Entourage.Infrastructure.Data;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

/// <summary>
/// Bulk email: issues each guest's personalised invitation (same as "Send" on a guest row),
/// then emails that exact invitation through the configured SMTP account.
/// </summary>
public sealed class GuestMailer(
    AppDbContext db,
    IGuestDirectoryService guests,
    IMailSettingsService settings,
    IMailTransport transport,
    IValidator<GuestIdsRequest> guestIdsValidator) : IGuestMailer
{
    public async Task<BulkEmailResult> SendInvitationsAsync(
        Guid eventId,
        GuestIdsRequest request,
        string assetOrigin,
        string appOrigin,
        CancellationToken cancellationToken,
        bool reminder = false)
    {
        await ValidationGuard.EnsureValidAsync(guestIdsValidator, request, cancellationToken);
        // Check mail settings before recording anything, so a missing setup changes nothing.
        var account = await settings.GetAccountAsync(cancellationToken) ?? throw MailSettingsService.NotConfigured();

        var ids = request.GuestIds.Distinct().ToArray();
        var targets = await db.Guests.AsNoTracking()
            .Where(item => item.EventId == eventId && ids.Contains(item.Id))
            .Select(item => new { item.Id, item.Name, item.Email })
            .ToListAsync(cancellationToken);
        if (targets.Count != ids.Length)
        {
            throw Entourage.Application.AppException.NotFound("One or more guests are not on this event.");
        }

        var skipped = targets
            .Where(item => string.IsNullOrWhiteSpace(item.Email))
            .Select(item => new GuestBlockDto(item.Id, item.Name, "No email address. Add one on the guest to email the invitation."))
            .ToList();
        var withEmail = targets.Where(item => !string.IsNullOrWhiteSpace(item.Email)).ToList();
        if (withEmail.Count == 0)
        {
            return new BulkEmailResult(false, [], [], skipped.ToArray(), "None of these guests has an email address. Nothing was sent.");
        }

        // Records the invitation for every guest that can receive one (type set, design ready).
        // Guests that cannot are returned as blocked and are not emailed.
        var issued = await guests.IssueInvitationsAsync(
            eventId,
            new GuestIdsRequest(withEmail.Select(item => item.Id).ToArray()),
            assetOrigin,
            appOrigin,
            cancellationToken);
        skipped.AddRange(issued.Blocked);

        var issuedIds = issued.Issued.Select(item => item.GuestId).ToArray();
        var latestHtml = (await db.GuestInvitationIssues.AsNoTracking()
                .Where(item => issuedIds.Contains(item.GuestId))
                .Select(item => new { item.GuestId, item.Html, item.IssuedOn })
                .ToListAsync(cancellationToken))
            .GroupBy(item => item.GuestId)
            .ToDictionary(group => group.Key, group => group.OrderByDescending(item => item.IssuedOn).First().Html);

        var eventName = await db.Events.AsNoTracking()
            .Where(item => item.Id == eventId)
            .Select(item => item.Name)
            .FirstAsync(cancellationToken);
        var byId = withEmail.ToDictionary(item => item.Id);
        var messages = issuedIds
            .Where(latestHtml.ContainsKey)
            .Select(id => new OutgoingMail(
                id,
                byId[id].Email!.Trim(),
                byId[id].Name,
                reminder ? $"Reminder: {eventName}" : $"Invitation: {eventName}",
                latestHtml[id]))
            .ToList();

        var errors = await transport.SendManyAsync(account, messages, cancellationToken);
        var sent = messages
            .Where(message => !errors.ContainsKey(message.Id))
            .Select(message => new GuestMailItem(message.Id, byId[message.Id].Name, message.ToEmail))
            .ToArray();
        var failed = messages
            .Where(message => errors.ContainsKey(message.Id))
            .Select(message => new GuestBlockDto(message.Id, byId[message.Id].Name, errors[message.Id]))
            .ToArray();

        // Each guest's history shows the email (or why it failed).
        foreach (var item in sent)
        {
            GuestActivityLog.Add(
                db,
                item.GuestId,
                reminder ? Entourage.Domain.Entities.GuestActivityKinds.ReminderEmailed : Entourage.Domain.Entities.GuestActivityKinds.InvitationEmailed,
                $"To {item.Email}");
        }

        foreach (var item in failed)
        {
            GuestActivityLog.Add(db, item.GuestId, Entourage.Domain.Entities.GuestActivityKinds.EmailFailed, item.Reason);
        }

        await db.SaveChangesAsync(cancellationToken);

        var complete = failed.Length == 0 && skipped.Count == 0;
        var noun = reminder ? "reminder" : "invitation";
        var parts = new List<string> { $"Emailed {sent.Length} {noun}{(sent.Length == 1 ? "" : "s")}." };
        if (failed.Length > 0)
        {
            parts.Add($"{failed.Length} could not be delivered.");
        }

        if (skipped.Count > 0)
        {
            parts.Add($"{skipped.Count} skipped.");
        }

        return new BulkEmailResult(complete, sent, failed, skipped.ToArray(), string.Join(' ', parts));
    }
}
