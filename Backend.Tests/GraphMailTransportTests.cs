using System.Net;
using System.Text;
using Entourage.Application.DTOs;
using Entourage.Application.Interfaces;
using Entourage.Application.Validation;
using Entourage.Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Entourage.Tests;

public sealed class GraphMailTransportTests
{
    private static readonly SmtpAccount Account = new(
        string.Empty, 587, true, null, null, "events@contoso.com", "Events", "graph",
        "contoso.onmicrosoft.com", "11111111-2222-3333-4444-555555555555", "secret-value");

    [Fact]
    public async Task Signs_in_then_posts_one_sendMail_per_guest()
    {
        var handler = new FakeHandler(request => request.RequestUri!.Host == "login.microsoftonline.com"
            ? Json(HttpStatusCode.OK, """{"access_token":"token-123","token_type":"Bearer"}""")
            : new HttpResponseMessage(HttpStatusCode.Accepted));
        var transport = new GraphMailTransport(new FakeFactory(handler), NullLogger<GraphMailTransport>.Instance);

        var errors = await transport.SendManyAsync(Account,
        [
            new OutgoingMail(Guid.NewGuid(), "lina@example.com", "Lina", "Invitation", "<p>Hi</p>"),
            new OutgoingMail(Guid.NewGuid(), "omar@example.com", "Omar", "Invitation", "<p>Hi</p>"),
        ], CancellationToken.None);

        Assert.Empty(errors);
        var sends = handler.Requests.Where(item => item.Uri.Contains("/sendMail")).ToList();
        Assert.Equal(2, sends.Count);
        Assert.All(sends, item => Assert.Contains("/v1.0/users/events%40contoso.com/sendMail", item.Uri));
        Assert.All(sends, item => Assert.Equal("Bearer token-123", item.Authorization));
        Assert.Contains("lina@example.com", sends[0].Body);
    }

    [Fact]
    public async Task A_wrong_secret_is_reported_in_plain_words_for_every_guest()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.Unauthorized,
            """{"error":"invalid_client","error_description":"AADSTS7000215: Invalid client secret provided."}"""));
        var transport = new GraphMailTransport(new FakeFactory(handler), NullLogger<GraphMailTransport>.Instance);
        var id = Guid.NewGuid();

        var errors = await transport.SendManyAsync(Account, [new OutgoingMail(id, "lina@example.com", null, "Hi", "<p>Hi</p>")], CancellationToken.None);

        Assert.Contains("client secret", errors[id]);
        Assert.DoesNotContain(handler.Requests, item => item.Uri.Contains("/sendMail"));
    }

    [Fact]
    public void Graph_settings_need_tenant_client_id_and_a_valid_sender()
    {
        var validator = new SaveMailSettingsRequestValidator();
        var missing = validator.Validate(new SaveMailSettingsRequest(string.Empty, 0, true, null, null, "events@contoso.com", null, "graph"));
        Assert.Contains(missing.Errors, error => error.PropertyName == "GraphTenantId");
        Assert.Contains(missing.Errors, error => error.PropertyName == "GraphClientId");
        // SMTP host and port are not required for Graph.
        Assert.DoesNotContain(missing.Errors, error => error.PropertyName is "Host" or "Port");

        var valid = validator.Validate(new SaveMailSettingsRequest(
            string.Empty, 0, true, null, null, "events@contoso.com", null, "graph", "contoso.com", "11111111-2222-3333-4444-555555555555", "s"));
        Assert.True(valid.IsValid);
    }

    private static HttpResponseMessage Json(HttpStatusCode status, string body) =>
        new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private sealed record Captured(string Uri, string? Authorization, string Body);

    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<Captured> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
            Requests.Add(new Captured(request.RequestUri!.AbsoluteUri, request.Headers.Authorization?.ToString(), body));
            return respond(request);
        }
    }

    private sealed class FakeFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }
}
