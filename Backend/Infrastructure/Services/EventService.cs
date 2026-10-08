using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Application.Validation;
using Entourage.Domain.Entities;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using FluentValidation;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

public sealed class EventService(
    AppDbContext db,
    IValidator<EventWriteRequest> writeValidator,
    IValidator<UpdateEventStatusRequest> statusValidator) : IEventService
{
    public async Task<IReadOnlyList<EventDto>> ListAsync(
        string? search,
        EventStatus? status,
        CancellationToken cancellationToken)
    {
        var query = db.Events.AsNoTracking().AsQueryable();

        if (status is not null)
        {
            query = query.Where(item => item.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(item =>
                item.Name.Contains(term) ||
                item.Slug.Contains(term) ||
                (item.Description != null && item.Description.Contains(term)));
        }

        var events = await query
            .OrderByDescending(item => item.CreatedOn)
            .ToListAsync(cancellationToken);

        return events.Select(ToDto).ToList();
    }

    public async Task<EventDto> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var item = await db.Events.AsNoTracking().FirstOrDefaultAsync(entry => entry.Id == id, cancellationToken);
        if (item is null)
        {
            throw AppException.NotFound("Event not found.");
        }

        return ToDto(item);
    }

    public async Task<EventDto> CreateAsync(
        EventWriteRequest request,
        Guid userId,
        CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(writeValidator, request, cancellationToken);
        var slug = request.Slug.Trim();
        await EnsureSlugAvailableAsync(slug, null, cancellationToken);

        var now = DateTime.UtcNow;
        var item = new Event
        {
            Id = Guid.CreateVersion7(),
            Name = request.Name.Trim(),
            Slug = slug,
            Description = NormalizeDescription(request.Description),
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            Timezone = request.Timezone.Trim(),
            Status = request.Status,
            IsActive = request.Status != EventStatus.Archived,
            CreatedBy = userId,
            CreatedOn = now,
            UpdatedOn = now,
        };

        db.Events.Add(item);
        await SaveAsync(cancellationToken);
        return ToDto(item);
    }

    public async Task<EventDto> UpdateAsync(Guid id, EventWriteRequest request, CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(writeValidator, request, cancellationToken);
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == id, cancellationToken);
        if (item is null)
        {
            throw AppException.NotFound("Event not found.");
        }

        var slug = request.Slug.Trim();
        await EnsureSlugAvailableAsync(slug, id, cancellationToken);

        item.Name = request.Name.Trim();
        item.Slug = slug;
        item.Description = NormalizeDescription(request.Description);
        item.StartDate = request.StartDate;
        item.EndDate = request.EndDate;
        item.Timezone = request.Timezone.Trim();
        item.Status = request.Status;
        item.IsActive = request.Status != EventStatus.Archived;
        item.UpdatedOn = DateTime.UtcNow;

        await SaveAsync(cancellationToken);
        return ToDto(item);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == id, cancellationToken);
        if (item is null)
        {
            throw AppException.NotFound("Event not found.");
        }

        db.Events.Remove(item);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<EventDto> UpdateStatusAsync(
        Guid id,
        UpdateEventStatusRequest request,
        CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(statusValidator, request, cancellationToken);
        var item = await db.Events.FirstOrDefaultAsync(entry => entry.Id == id, cancellationToken);
        if (item is null)
        {
            throw AppException.NotFound("Event not found.");
        }

        var status = request.Status ?? throw AppException.Validation(new Dictionary<string, string[]>
        {
            ["status"] = ["Status is required."],
        });

        item.Status = status;
        item.IsActive = status != EventStatus.Archived;
        item.UpdatedOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(item);
    }

    private async Task EnsureSlugAvailableAsync(string slug, Guid? currentId, CancellationToken cancellationToken)
    {
        var taken = await db.Events.AnyAsync(
            item => item.Slug == slug && (currentId == null || item.Id != currentId),
            cancellationToken);

        if (taken)
        {
            throw AppException.Conflict(
                "Event slug already exists.",
                "slug",
                "This slug is already in use.");
        }
    }

    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsUniqueViolation(exception))
        {
            throw AppException.Conflict(
                "Event slug already exists.",
                "slug",
                "This slug is already in use.");
        }
    }

    private static bool IsUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is SqlException sql && sql.Number is 2601 or 2627;

    private static string? NormalizeDescription(string? description)
    {
        if (string.IsNullOrWhiteSpace(description))
        {
            return null;
        }

        return description.Trim();
    }

    private static EventDto ToDto(Event item) =>
        new(
            item.Id,
            item.Name,
            item.Slug,
            item.Description,
            item.StartDate,
            item.EndDate,
            item.Timezone,
            item.Status,
            item.IsActive,
            item.CreatedBy,
            item.CreatedOn,
            item.UpdatedOn);
}
