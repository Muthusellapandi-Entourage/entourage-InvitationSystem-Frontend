using Entourage.Application;
using Entourage.Application.Interfaces;
using Entourage.Domain.Entities;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services.Accreditation;

/// <summary>
/// Accreditation staff accounts (system users with accreditation roles). Administrators are listed but can
/// only be changed by another Administrator; accreditation roles never get access to the invitation system.
/// </summary>
public sealed class AccTeamService(AppDbContext db, ICurrentUser currentUser, IPasswordHasher hasher)
{
    public async Task<AccTeamMemberDto[]> ListAsync(CancellationToken cancellationToken)
    {
        var roles = AccRoles.TeamRoles.Append(UserRole.Administrator).ToList();
        var users = await db.Users.AsNoTracking().Where(item => roles.Contains(item.Role)).OrderBy(item => item.FirstName).ThenBy(item => item.LastName).ToListAsync(cancellationToken);
        return [.. users.Select(ToDto)];
    }

    private static AccTeamMemberDto ToDto(User user) =>
        new(user.Id, user.FirstName, user.LastName, user.Email, user.Role.ToString(), user.IsActive, user.LastLoginOn);

    public async Task<AccTeamMemberDto[]> CreateAsync(AccTeamWriteRequest request, CancellationToken cancellationToken)
    {
        var me = await MeAsync(cancellationToken);
        var (first, last, email, role) = Validate(request, me, isNew: true);
        if (await db.Users.AsNoTracking().AnyAsync(item => item.Email == email, cancellationToken))
        {
            throw AccErrors.One("email", "A user with this email already exists.");
        }

        db.Users.Add(new User
        {
            Id = Guid.CreateVersion7(),
            FirstName = first,
            LastName = last,
            Email = email,
            PasswordHash = hasher.Hash(request.Password!),
            Role = role,
            IsActive = request.IsActive,
            CreatedOn = DateTime.UtcNow,
            SecurityStamp = Guid.NewGuid().ToString("N"),
        });
        await db.SaveChangesAsync(cancellationToken);
        return await ListAsync(cancellationToken);
    }

    public async Task<AccTeamMemberDto[]> UpdateAsync(Guid userId, AccTeamWriteRequest request, CancellationToken cancellationToken)
    {
        var me = await MeAsync(cancellationToken);
        var user = await db.Users.FirstOrDefaultAsync(item => item.Id == userId, cancellationToken)
            ?? throw AppException.NotFound("User not found.");
        if (user.Role == UserRole.Administrator && me.Role != UserRole.Administrator)
        {
            throw AppException.Forbidden("Only an Administrator can change an Administrator.");
        }

        if (user.Role != UserRole.Administrator && !AccRoles.TeamRoles.Contains(user.Role))
        {
            throw AppException.NotFound("User not found.");
        }

        var (first, last, email, role) = Validate(request, me, isNew: false);
        if (user.Id == me.Id && (!request.IsActive || role != user.Role))
        {
            throw AccErrors.One("role", "You cannot change your own role or disable yourself.");
        }

        if (await db.Users.AsNoTracking().AnyAsync(item => item.Email == email && item.Id != userId, cancellationToken))
        {
            throw AccErrors.One("email", "A user with this email already exists.");
        }

        var signOut = user.Role != role || user.IsActive != request.IsActive || user.Email != email || !string.IsNullOrEmpty(request.Password);
        user.FirstName = first;
        user.LastName = last;
        user.Email = email;
        user.Role = role;
        user.IsActive = request.IsActive;
        if (!string.IsNullOrEmpty(request.Password))
        {
            user.PasswordHash = hasher.Hash(request.Password);
        }

        if (signOut)
        {
            // Their current sign-in stops working, so the new role / password applies right away.
            user.SecurityStamp = Guid.NewGuid().ToString("N");
        }

        await db.SaveChangesAsync(cancellationToken);
        return await ListAsync(cancellationToken);
    }

    private async Task<User> MeAsync(CancellationToken cancellationToken)
    {
        var id = currentUser.UserId;
        return await db.Users.AsNoTracking().FirstOrDefaultAsync(item => item.Id == id, cancellationToken)
            ?? throw AppException.Unauthorized();
    }

    private static (string First, string Last, string Email, UserRole Role) Validate(AccTeamWriteRequest request, User me, bool isNew)
    {
        var errors = new AccErrors();
        var first = AccText.Clean(request.FirstName, 100);
        var last = AccText.Clean(request.LastName, 100);
        var email = AccText.Email(request.Email);
        if (first is null)
        {
            errors.Add("firstName", "Enter the first name.");
        }

        if (last is null)
        {
            errors.Add("lastName", "Enter the last name.");
        }

        if (!AccText.IsEmail(email))
        {
            errors.Add("email", "Enter a valid email address.");
        }

        if (!Enum.TryParse<UserRole>(request.Role, ignoreCase: false, out var role) || !Enum.IsDefined(role))
        {
            errors.Add("role", "Choose a role.");
        }
        else if (role == UserRole.Administrator && me.Role != UserRole.Administrator)
        {
            errors.Add("role", "Only an Administrator can give the Administrator role.");
        }

        if (isNew && (string.IsNullOrEmpty(request.Password) || request.Password.Length < 8))
        {
            errors.Add("password", "Use at least 8 characters.");
        }
        else if (!isNew && !string.IsNullOrEmpty(request.Password) && request.Password.Length < 8)
        {
            errors.Add("password", "Use at least 8 characters.");
        }

        errors.ThrowIfAny();
        return (first!, last!, email!, role);
    }
}
