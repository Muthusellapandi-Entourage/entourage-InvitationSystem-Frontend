using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Application.Validation;
using Entourage.Domain.Entities;
using Entourage.Infrastructure.Data;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

public sealed class AuthService(
    AppDbContext db,
    IPasswordHasher passwordHasher,
    IJwtTokenService tokenService,
    IValidator<LoginRequest> loginValidator,
    ILogger<AuthService> logger) : IAuthService
{
    public async Task<AuthSessionDto> LoginAsync(LoginRequest request, CancellationToken cancellationToken)
    {
        await ValidationGuard.EnsureValidAsync(loginValidator, request, cancellationToken);

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(item => item.Email == email, cancellationToken);
        var passwordMatches = passwordHasher.Verify(request.Password, user?.PasswordHash ?? string.Empty);

        if (user is null || !passwordMatches)
        {
            logger.LogWarning("Sign-in failed.");
            throw AppException.Unauthorized("The email or password is incorrect.");
        }

        if (!user.IsActive)
        {
            logger.LogWarning("Inactive account attempted to sign in.");
            throw AppException.Forbidden("This account is inactive.");
        }

        user.LastLoginOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return tokenService.CreateSession(user);
    }

    public async Task<UserDto> GetCurrentAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(item => item.Id == userId, cancellationToken);
        if (user is null || !user.IsActive)
        {
            throw AppException.Unauthorized();
        }

        return UserMapper.ToDto(user);
    }

    public async Task LogoutAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await db.Users.FirstOrDefaultAsync(item => item.Id == userId, cancellationToken);
        if (user is null)
        {
            return;
        }

        user.SecurityStamp = Guid.NewGuid().ToString("N");
        await db.SaveChangesAsync(cancellationToken);
    }
}
