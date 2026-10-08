using Entourage.Application.Interfaces;

namespace Entourage.Infrastructure.Services;

public sealed class BcryptPasswordHasher : IPasswordHasher
{
    private readonly string _dummyHash = BCrypt.Net.BCrypt.HashPassword("timing-pad", workFactor: 12);

    public string Hash(string password) => BCrypt.Net.BCrypt.HashPassword(password, workFactor: 12);

    public bool Verify(string password, string passwordHash)
    {
        var hash = string.IsNullOrWhiteSpace(passwordHash) ? _dummyHash : passwordHash;
        try
        {
            return BCrypt.Net.BCrypt.Verify(password, hash);
        }
        catch (BCrypt.Net.SaltParseException)
        {
            return false;
        }
    }
}
