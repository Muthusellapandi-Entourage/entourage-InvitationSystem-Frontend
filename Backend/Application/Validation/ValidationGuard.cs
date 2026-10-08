using System.Text.Json;
using FluentValidation;

namespace Entourage.Application.Validation;

public static class ValidationGuard
{
    public static async Task EnsureValidAsync<T>(
        IValidator<T> validator,
        T model,
        CancellationToken cancellationToken)
    {
        var result = await validator.ValidateAsync(model, cancellationToken);
        if (result.IsValid)
        {
            return;
        }

        var errors = result.Errors
            .GroupBy(error => ToCamelCase(error.PropertyName))
            .ToDictionary(
                group => group.Key,
                group => group.Select(error => error.ErrorMessage).Distinct().ToArray());

        throw AppException.Validation(errors);
    }

    private static string ToCamelCase(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return "request";
        }

        return JsonNamingPolicy.CamelCase.ConvertName(name);
    }
}
