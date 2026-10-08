using Entourage.Application.Interfaces;
using Entourage.Domain.Entities;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Entourage.Infrastructure.Services;

public static class DatabaseInitializer
{
    public static async Task MigrateAndSeedAsync(IServiceProvider services, IHostEnvironment environment)
    {
        if (!environment.IsDevelopment())
        {
            return;
        }

        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseInitializer");
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

        await db.Database.MigrateAsync();

        var email = configuration["Admin:Email"] ?? configuration["ADMIN_EMAIL"];
        var password = configuration["Admin:Password"] ?? configuration["ADMIN_PASSWORD"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            logger.LogWarning("Development administrator was not seeded. Set Admin:Email and Admin:Password.");
            return;
        }

        var normalizedEmail = email.Trim().ToLowerInvariant();
        var exists = await db.Users.AnyAsync(user => user.Email == normalizedEmail);
        if (exists)
        {
            return;
        }

        db.Users.Add(new User
        {
            Id = Guid.CreateVersion7(),
            FirstName = configuration["Admin:FirstName"] ?? "Muthu",
            LastName = configuration["Admin:LastName"] ?? string.Empty,
            Email = normalizedEmail,
            PasswordHash = passwordHasher.Hash(password),
            Role = UserRole.Administrator,
            IsActive = true,
            CreatedOn = DateTime.UtcNow,
            SecurityStamp = Guid.NewGuid().ToString("N"),
        });

        await db.SaveChangesAsync();
        logger.LogInformation("Seeded development administrator {Email}.", normalizedEmail);
    }
}
