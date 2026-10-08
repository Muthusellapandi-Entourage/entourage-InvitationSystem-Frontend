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
