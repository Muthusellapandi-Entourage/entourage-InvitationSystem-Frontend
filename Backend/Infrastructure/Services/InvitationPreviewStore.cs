using System.Security.Cryptography;
using Microsoft.Extensions.Caching.Memory;

namespace Entourage.Infrastructure.Services;

public interface IInvitationPreviewStore
{
    (string Token, DateTime ExpiresOn) Create(string html, TimeSpan lifetime);

    string? Find(string token);
}

public sealed class InvitationPreviewStore(IMemoryCache cache) : IInvitationPreviewStore
{
    public (string Token, DateTime ExpiresOn) Create(string html, TimeSpan lifetime)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
        var expiresOn = DateTime.UtcNow.Add(lifetime);
        cache.Set(token, html, expiresOn);
        return (token, expiresOn);
    }

    public string? Find(string token)
    {
        return cache.TryGetValue(token, out string? html) ? html : null;
    }
}
