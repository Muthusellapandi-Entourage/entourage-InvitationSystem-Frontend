namespace Entourage.Application.Validation;

public static class TimezoneRules
{
    public static bool IsValid(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return TimeZoneInfo.TryFindSystemTimeZoneById(value.Trim(), out _);
    }
}
