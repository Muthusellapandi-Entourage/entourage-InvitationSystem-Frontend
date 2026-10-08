namespace Entourage.Application;

public sealed record ApiResponse<T>(
    bool Success,
    T? Data,
    string? Message = null,
    IDictionary<string, string[]>? Errors = null);
