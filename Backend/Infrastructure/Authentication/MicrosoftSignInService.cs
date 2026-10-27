using System.Security.Claims;
using Entourage.Application;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Domain.Entities;
using Entourage.Domain.Enums;
using Entourage.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Entourage.Infrastructure.Authentication;

/// <summary>Microsoft's signing keys for the tenant, downloaded once and refreshed automatically.</summary>
public sealed class MicrosoftKeys(IOptions<MicrosoftAuthOptions> options)
{
    private readonly Lazy<ConfigurationManager<OpenIdConnectConfiguration>> manager = new(() =>
        new ConfigurationManager<OpenIdConnectConfiguration>(
            $"https://login.microsoftonline.com/{options.Value.TenantId}/v2.0/.well-known/openid-configuration",
            new OpenIdConnectConfigurationRetriever(),
            new HttpDocumentRetriever { RequireHttps = true }));

    public Task<OpenIdConnectConfiguration> GetAsync(CancellationToken cancellationToken) =>
        manager.Value.GetConfigurationAsync(cancellationToken);
}

/// <summary>
/// Checks a Microsoft ID token (signature, our tenant, our app, not expired), then the person:
/// an allowed email domain, not a guest from another organisation, and in an allowed group when
/// groups are set. Then signs them in to this app, creating their user on first sign-in if allowed.
/// </summary>
public sealed class MicrosoftSignInService(
    AppDbContext db,
    IOptions<MicrosoftAuthOptions> options,
    MicrosoftKeys keys,
    IJwtTokenService tokens,
    IPasswordHasher passwordHasher,
    ILogger<MicrosoftSignInService> logger)
{
    public AuthOptionsDto Options()
    {
        var settings = options.Value;
        return new AuthOptionsDto(
            settings.PasswordLogin || !settings.IsConfigured,
            settings.IsConfigured ? new MicrosoftLoginOptionsDto(settings.TenantId, settings.ClientId) : null);
    }

    public async Task<AuthSessionDto> SignInAsync(MicrosoftSignInRequest request, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        if (!settings.IsConfigured)
        {
            throw AppException.Forbidden("Microsoft sign-in is not set up on this server.");
        }

        if (string.IsNullOrWhiteSpace(request.IdToken) || request.IdToken.Length > 16_000)
        {
            throw AppException.Unauthorized("Microsoft did not return a sign-in token. Try again.");
        }

        var identity = await ValidateAsync(request.IdToken, settings, cancellationToken);
        var email = Claim(identity, "preferred_username") ?? Claim(identity, "email") ?? Claim(identity, "upn");
        email = email?.Trim().ToLowerInvariant();
        var check = CheckPerson(identity, email, settings);
        if (check is not null)
        {
            logger.LogWarning("Microsoft sign-in refused: {Reason}", check);
            throw AppException.Forbidden(check);
        }

        var user = await db.Users.FirstOrDefaultAsync(item => item.Email == email, cancellationToken);
        if (user is null)
        {
            if (!settings.AutoCreateUsers)
            {
                throw AppException.Forbidden("Your account has not been added to this system yet. Ask an administrator to add you.");
            }

            var (first, last) = Names(identity, email!);
            user = new User
            {
                Id = Guid.CreateVersion7(),
                FirstName = first,
                LastName = last,
                Email = email!,
                // Microsoft users sign in through Microsoft; this random password is never shown or used.
                PasswordHash = passwordHasher.Hash(Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32))),
                Role = UserRole.Administrator,
                IsActive = true,
                CreatedOn = DateTime.UtcNow,
                SecurityStamp = Guid.NewGuid().ToString("N"),
            };
            db.Users.Add(user);
            logger.LogInformation("Created user {Email} on first Microsoft sign-in.", email);
        }

        if (!user.IsActive)
        {
            throw AppException.Forbidden("This account is inactive.");
        }

        user.LastLoginOn = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return tokens.CreateSession(user);
    }

    /// <summary>
    /// Why this person may not sign in, or null when they may. Separate from token checks so it can be tested.
    /// </summary>
    public static string? CheckPerson(ClaimsIdentity identity, string? email, MicrosoftAuthOptions settings)
    {
        if (!string.Equals(Claim(identity, "tid"), settings.TenantId, StringComparison.OrdinalIgnoreCase))
        {
            return "Only accounts from the company's Microsoft directory can sign in.";
        }

        // A guest invited from another organisation carries an "idp" claim naming their home directory.
        var idp = Claim(identity, "idp");
        if (!string.IsNullOrEmpty(idp) && !idp.Contains(settings.TenantId, StringComparison.OrdinalIgnoreCase))
        {
            return "Guest accounts from other organisations cannot sign in.";
        }

        var domain = email?.Split('@') is [_, var part] ? part : null;
        if (domain is null || !settings.AllowedDomains.Any(allowed => string.Equals(allowed.Trim().TrimStart('@'), domain, StringComparison.OrdinalIgnoreCase)))
        {
            return $"Only {string.Join(", ", settings.AllowedDomains.Select(item => "@" + item.Trim().TrimStart('@')))} accounts can sign in.";
        }

        var wanted = settings.AllowedGroupIds.Where(item => !string.IsNullOrWhiteSpace(item)).ToArray();
        if (wanted.Length > 0)
        {
            if (identity.HasClaim(item => item.Type is "_claim_names" or "hasgroups"))
            {
                return "Your account is in too many groups for Microsoft to list. Ask IT to switch the app to send only assigned groups.";
            }

            var groups = identity.FindAll("groups").Select(item => item.Value);
            if (!groups.Any(group => wanted.Contains(group, StringComparer.OrdinalIgnoreCase)))
            {
                return "Your account is not in the group allowed to use this system. Ask an administrator for access.";
            }
        }

        return null;
    }

    private async Task<ClaimsIdentity> ValidateAsync(string idToken, MicrosoftAuthOptions settings, CancellationToken cancellationToken)
    {
        OpenIdConnectConfiguration configuration;
        try
        {
            configuration = await keys.GetAsync(cancellationToken);
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            logger.LogError(error, "Could not download Microsoft sign-in keys.");
            throw new AppException("Could not reach Microsoft to check the sign-in. Try again in a moment.", StatusCodes.Status503ServiceUnavailable);
        }

        var result = await new JsonWebTokenHandler().ValidateTokenAsync(idToken, new TokenValidationParameters
        {
            ValidIssuer = $"https://login.microsoftonline.com/{settings.TenantId}/v2.0",
            ValidAudience = settings.ClientId,
            IssuerSigningKeys = configuration.SigningKeys,
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            RequireSignedTokens = true,
            ClockSkew = TimeSpan.FromMinutes(2),
        });
        if (!result.IsValid)
        {
            logger.LogWarning(result.Exception, "Microsoft ID token rejected.");
            throw AppException.Unauthorized("The Microsoft sign-in could not be verified. Try again.");
        }

        return result.ClaimsIdentity;
    }

    private static (string First, string Last) Names(ClaimsIdentity identity, string email)
    {
        var first = Claim(identity, "given_name");
        var last = Claim(identity, "family_name");
        if (string.IsNullOrWhiteSpace(first))
        {
            var full = Claim(identity, "name")?.Trim();
            var parts = string.IsNullOrEmpty(full) ? new[] { email.Split('@')[0] } : full.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
            first = parts[0];
            last ??= parts.Length > 1 ? parts[1] : string.Empty;
        }

        return (Trim(first, 100), Trim(last ?? string.Empty, 100));
    }

    private static string Trim(string value, int max) => value.Length <= max ? value : value[..max];

    private static string? Claim(ClaimsIdentity identity, string type) => identity.FindFirst(type)?.Value;
}
