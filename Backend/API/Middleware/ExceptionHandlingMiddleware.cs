using System.Text.Json;
using Entourage.Application;

namespace Entourage.Api.Middleware;

public sealed class ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task Invoke(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (AppException exception)
        {
            await WriteAsync(context, exception.StatusCode, exception.Message, exception.Errors);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Unhandled exception for {Method} {Path}", context.Request.Method, context.Request.Path);
            await WriteAsync(context, StatusCodes.Status500InternalServerError, "Something went wrong. Try again.", null);
        }
    }

    private static async Task WriteAsync(
        HttpContext context,
        int statusCode,
        string message,
        IDictionary<string, string[]>? errors)
    {
        if (context.Response.HasStarted)
        {
            return;
        }

        context.Response.Clear();
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(
            new ApiResponse<object>(false, null, message, errors),
            JsonOptions);
    }
}
