using Entourage.Application.DTOs;

namespace Entourage.Application.Interfaces;

public interface IAuthService
{
    Task<AuthSessionDto> LoginAsync(LoginRequest request, CancellationToken cancellationToken);

    Task<UserDto> GetCurrentAsync(Guid userId, CancellationToken cancellationToken);

    Task LogoutAsync(Guid userId, CancellationToken cancellationToken);
}
