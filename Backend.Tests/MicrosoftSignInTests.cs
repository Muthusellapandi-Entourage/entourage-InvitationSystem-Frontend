using System.Security.Claims;
using Entourage.Infrastructure.Authentication;
using Xunit;

namespace Entourage.Tests;

public sealed class MicrosoftSignInTests
{
    private const string Tenant = "11111111-2222-3333-4444-555555555555";

    private static MicrosoftAuthOptions Settings(params string[] groups) => new()
    {
        Enabled = true,
        TenantId = Tenant,
        ClientId = "66666666-7777-8888-9999-000000000000",
        AllowedDomains = ["entourageintl.com"],
        AllowedGroupIds = groups,
    };

    private static ClaimsIdentity Person(string tenant = Tenant, string? idp = null, params string[] groups)
    {
        var claims = new List<Claim> { new("tid", tenant) };
        if (idp is not null) claims.Add(new Claim("idp", idp));
        claims.AddRange(groups.Select(group => new Claim("groups", group)));
        return new ClaimsIdentity(claims, "test");
    }

    [Fact]
    public void Company_account_in_the_company_directory_may_sign_in()
    {
        Assert.Null(MicrosoftSignInService.CheckPerson(Person(), "muthu@entourageintl.com", Settings()));
        Assert.Null(MicrosoftSignInService.CheckPerson(Person(), "MUTHU@EntourageIntl.com".ToLowerInvariant(), Settings()));
    }

    [Theory]
    [InlineData("someone@gmail.com")]
    [InlineData("someone@entourageintl.com.evil.com")]
    [InlineData(null)]
    public void Other_domains_are_refused(string? email)
    {
        Assert.NotNull(MicrosoftSignInService.CheckPerson(Person(), email, Settings()));
    }

    [Fact]
    public void Other_directories_and_invited_guests_are_refused()
    {
        Assert.NotNull(MicrosoftSignInService.CheckPerson(Person(tenant: Guid.NewGuid().ToString()), "a@entourageintl.com", Settings()));
        Assert.NotNull(MicrosoftSignInService.CheckPerson(Person(idp: "https://sts.windows.net/another-tenant/"), "a@entourageintl.com", Settings()));
    }

    [Fact]
    public void Group_rule_applies_only_when_groups_are_set()
    {
        const string group = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
        Assert.NotNull(MicrosoftSignInService.CheckPerson(Person(), "a@entourageintl.com", Settings(group)));
        Assert.Null(MicrosoftSignInService.CheckPerson(Person(groups: new[] { group }), "a@entourageintl.com", Settings(group)));
    }
}
