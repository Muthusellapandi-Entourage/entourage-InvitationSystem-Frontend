using Entourage.Application.DTOs;
using Entourage.Domain.Entities;

namespace Entourage.Infrastructure.Services;

public static class UserMapper
{
    public static UserDto ToDto(User user) =>
        new(
            user.Id,
            user.FirstName,
            user.LastName,
            user.Email,
            user.Role.ToString(),
            user.IsActive,
            user.LastLoginOn is null ? null : DateTime.SpecifyKind(user.LastLoginOn.Value, DateTimeKind.Utc));
}
