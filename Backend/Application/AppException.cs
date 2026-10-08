namespace Entourage.Application;

public sealed class AppException : Exception
{
    public AppException(string message, int statusCode, IDictionary<string, string[]>? errors = null)
        : base(message)
    {
        StatusCode = statusCode;
        Errors = errors;
    }

    public int StatusCode { get; }

    public IDictionary<string, string[]>? Errors { get; }

    public static AppException Validation(IDictionary<string, string[]> errors) =>
        new("Some fields need attention.", StatusCodes.Status400BadRequest, errors);

    public static AppException Unauthorized(string message = "You need to sign in to continue.") =>
        new(message, StatusCodes.Status401Unauthorized);

    public static AppException Forbidden(string message) =>
        new(message, StatusCodes.Status403Forbidden);

    public static AppException NotFound(string message) =>
        new(message, StatusCodes.Status404NotFound);

    public static AppException Conflict(string message, string field, string error) =>
        new(message, StatusCodes.Status409Conflict, new Dictionary<string, string[]>
        {
            [field] = [error],
        });
}
