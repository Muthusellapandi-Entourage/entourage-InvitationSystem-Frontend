namespace Entourage.Application.DTOs;

public sealed class LoginRequest
{
    public string Email { get; set; } = string.Empty;

    public string Password { get; set; } = string.Empty;
}

public sealed record UserDto(
    Guid Id,
    string FirstName,
    string LastName,
    string Email,
    string Role,
    bool IsActive,
    DateTime? LastLoginOn);

public sealed record AuthSessionDto(
    string AccessToken,
    DateTimeOffset ExpiresAt,
    UserDto User);

/// <summary>The ID token Microsoft returned to the browser after "Sign in with Microsoft".</summary>
public sealed record MicrosoftSignInRequest(string? IdToken);

/// <summary>Which sign-in methods the login page shows. No secrets: tenant and client IDs are public.</summary>
public sealed record AuthOptionsDto(bool PasswordLogin, MicrosoftLoginOptionsDto? Microsoft);

public sealed record MicrosoftLoginOptionsDto(string TenantId, string ClientId);
