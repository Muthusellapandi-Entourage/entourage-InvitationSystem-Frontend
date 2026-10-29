using Entourage.Application;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Api.Filters;

/// <summary>Marks a POST that only reads (previews, logging a download), so it still works on an archived event.</summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class AllowOnArchivedEventAttribute : Attribute;

/// <summary>
/// An archived event is read-only: every change under api/events/{eventId}/… is refused.
/// The event itself (api/events/{id}, including its status) stays editable, so it can be made Active again.
/// </summary>
public sealed class ArchivedEventFilter(AppDbContext db) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var method = context.HttpContext.Request.Method;
        var changes = !(HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method));
        if (changes
            && context.RouteData.Values.TryGetValue("eventId", out var raw)
            && Guid.TryParse(raw?.ToString(), out var eventId)
            && !context.ActionDescriptor.EndpointMetadata.OfType<AllowOnArchivedEventAttribute>().Any())
        {
            var archived = await db.Events.AsNoTracking()
                .AnyAsync(item => item.Id == eventId && item.Status == EventStatus.Archived, context.HttpContext.RequestAborted);
            if (archived)
            {
                context.Result = new ObjectResult(new ApiResponse<object>(
                    false,
                    null,
                    "This event is finished and read-only. Make the event Live to make changes."))
                {
                    StatusCode = StatusCodes.Status409Conflict,
                };
                return;
            }
        }

        await next();
    }
}
