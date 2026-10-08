using Entourage.Domain.Enums;

namespace Entourage.Domain.Entities;

public sealed class User
{
    public Guid Id { get; set; }

    public string FirstName { get; set; } = string.Empty;

    public string LastName { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public UserRole Role { get; set; }

    public bool IsActive { get; set; }

    public DateTime CreatedOn { get; set; }

    public DateTime? LastLoginOn { get; set; }

    public string SecurityStamp { get; set; } = string.Empty;
}
