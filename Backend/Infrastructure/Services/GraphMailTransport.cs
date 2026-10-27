using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Entourage.Application.Interfaces;

namespace Entourage.Infrastructure.Services;

/// <summary>
/// Sends mail through Microsoft Graph (POST /users/{sender}/sendMail) with an app registration
/// (client credentials). This is Microsoft's supported replacement for SMTP AUTH on Microsoft 365,
/// and works when "SmtpClientAuthentication is disabled for the Tenant".
///
/// Azure setup (once, by an admin): register an app, add the Microsoft Graph *application* permission
/// Mail.Send, grant admin consent, create a client secret. Optionally restrict the app to the sender
/// mailbox with an Exchange application access policy.
/// </summary>
public sealed class GraphMailTransport(IHttpClientFactory httpClients, ILogger<GraphMailTransport> logger) : IMailTransport
{
    public const string HttpClientName = "graph-mail";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyDictionary<Guid, string>> SendManyAsync(
        SmtpAccount account,
        IReadOnlyList<OutgoingMail> messages,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<Guid, string>();
        if (messages.Count == 0)
        {
            return errors;
        }

        var http = httpClients.CreateClient(HttpClientName);
        string token;
        try
        {
            token = await GetTokenAsync(http, account, cancellationToken);
        }
        catch (GraphMailException error)
        {
            // A sign-in problem affects every message the same way.
            foreach (var message in messages)
            {
                errors[message.Id] = error.Message;
            }

            return errors;
        }

        var sender = Uri.EscapeDataString(account.FromEmail.Trim());
        foreach (var message in messages)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var body = new
            {
                message = new
                {
                    subject = message.Subject,
                    body = new { contentType = "HTML", content = message.HtmlBody },
                    toRecipients = new[]
                    {
                        new { emailAddress = new { address = message.ToEmail, name = message.ToName ?? message.ToEmail } },
                    },
                },
                saveToSentItems = false,
            };

            try
            {
                await SendOneAsync(http, token, sender, body, cancellationToken);
            }
            catch (GraphMailException error)
            {
                logger.LogWarning("Graph email to {Recipient} failed: {Error}", message.ToEmail, error.Message);
                errors[message.Id] = error.Message;
            }
            catch (HttpRequestException error)
            {
                logger.LogWarning(error, "Graph email to {Recipient} failed.", message.ToEmail);
                errors[message.Id] = $"Could not reach Microsoft 365: {error.Message}";
            }
        }

        return errors;
    }

    private static async Task<string> GetTokenAsync(HttpClient http, SmtpAccount account, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(account.GraphTenantId) || string.IsNullOrWhiteSpace(account.GraphClientId) || string.IsNullOrEmpty(account.GraphClientSecret))
        {
            throw new GraphMailException("Microsoft 365 (Graph) is not fully set up. Enter the tenant ID, client ID and client secret in Email settings.");
        }

        var tenant = Uri.EscapeDataString(account.GraphTenantId.Trim());
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token")
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = account.GraphClientId.Trim(),
                ["client_secret"] = account.GraphClientSecret,
                ["scope"] = "https://graph.microsoft.com/.default",
                ["grant_type"] = "client_credentials",
            }),
        };

        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException error)
        {
            throw new GraphMailException($"Could not reach Microsoft sign-in: {error.Message}");
        }

        using (response)
        {
            var text = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new GraphMailException(DescribeTokenError(text));
            }

            using var document = JsonDocument.Parse(text);
            return document.RootElement.TryGetProperty("access_token", out var value) && value.GetString() is { Length: > 0 } accessToken
                ? accessToken
                : throw new GraphMailException("Microsoft sign-in did not return an access token.");
        }
    }

    private static async Task SendOneAsync(HttpClient http, string token, string sender, object body, CancellationToken cancellationToken)
    {
        // Microsoft throttles bursts with 429/503 and a Retry-After header; wait and retry a few times.
        for (var attempt = 1; ; attempt++)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, $"https://graph.microsoft.com/v1.0/users/{sender}/sendMail")
            {
                Content = JsonContent.Create(body, options: Json),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var response = await http.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                return;
            }

            if ((response.StatusCode is HttpStatusCode.TooManyRequests or HttpStatusCode.ServiceUnavailable) && attempt < 4)
            {
                var wait = response.Headers.RetryAfter?.Delta ?? TimeSpan.FromSeconds(Math.Pow(2, attempt));
                await Task.Delay(wait > TimeSpan.FromSeconds(60) ? TimeSpan.FromSeconds(60) : wait, cancellationToken);
                continue;
            }

            var text = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new GraphMailException(DescribeSendError(response.StatusCode, text));
        }
    }

    private static string DescribeTokenError(string text)
    {
        var (code, description) = ReadOAuthError(text);
        // AADSTS codes: https://learn.microsoft.com/entra/identity-platform/reference-error-codes
        if (description.Contains("AADSTS7000215", StringComparison.Ordinal))
        {
            return "Microsoft rejected the client secret. Copy the secret's Value (not its Secret ID) into Email settings, or create a new secret.";
        }

        if (description.Contains("AADSTS7000222", StringComparison.Ordinal))
        {
            return "The client secret has expired. Ask your admin to create a new one in the app registration.";
        }

        if (description.Contains("AADSTS700016", StringComparison.Ordinal))
        {
            return "The Application (client) ID was not found in this tenant. Check the client ID and tenant ID.";
        }

        if (description.Contains("AADSTS90002", StringComparison.Ordinal) || description.Contains("AADSTS900023", StringComparison.Ordinal))
        {
            return "The tenant ID was not found. Use the Directory (tenant) ID from the app registration overview.";
        }

        return $"Microsoft sign-in failed ({code}). {FirstLine(description)}";
    }

    private static string DescribeSendError(HttpStatusCode status, string text)
    {
        var (code, message) = ReadGraphError(text);
        return status switch
        {
            HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized when code is "ErrorAccessDenied" or "Authorization_RequestDenied" or "AccessDenied" =>
                "Microsoft 365 refused to send. The app needs the Mail.Send application permission with admin consent, "
                + "and (if an access policy is used) must be allowed to send as this mailbox.",
            HttpStatusCode.NotFound or HttpStatusCode.BadRequest when code is "ErrorInvalidUser" or "MailboxNotEnabledForRESTAPI" or "ResourceNotFound" =>
                "The 'Send from' address is not a Microsoft 365 mailbox in this tenant. Use a licensed mailbox or shared mailbox address.",
            HttpStatusCode.BadRequest when code is "ErrorInvalidRecipients" =>
                "Microsoft 365 did not accept the recipient address.",
            _ => $"Microsoft 365 could not send ({(int)status} {code}). {message}",
        };
    }

    private static (string Code, string Description) ReadOAuthError(string text)
    {
        try
        {
            using var document = JsonDocument.Parse(text);
            var root = document.RootElement;
            var code = root.TryGetProperty("error", out var error) ? error.GetString() ?? "error" : "error";
            var description = root.TryGetProperty("error_description", out var detail) ? detail.GetString() ?? string.Empty : string.Empty;
            return (code, description);
        }
        catch (JsonException)
        {
            return ("error", text);
        }
    }

    private static (string Code, string Message) ReadGraphError(string text)
    {
        try
        {
            using var document = JsonDocument.Parse(text);
            if (document.RootElement.TryGetProperty("error", out var error))
            {
                var code = error.TryGetProperty("code", out var value) ? value.GetString() ?? string.Empty : string.Empty;
                var message = error.TryGetProperty("message", out var detail) ? detail.GetString() ?? string.Empty : string.Empty;
                return (code, message);
            }
        }
        catch (JsonException)
        {
        }

        return (string.Empty, text);
    }

    private static string FirstLine(string value)
    {
        var line = value.Split('\n', 2)[0].Trim();
        return line.Length > 300 ? line[..300] : line;
    }

    private sealed class GraphMailException(string message) : Exception(message);
}

/// <summary>Sends with SMTP or Microsoft Graph, depending on the saved provider.</summary>
public sealed class MailTransportRouter(SmtpMailTransport smtp, GraphMailTransport graph) : IMailTransport
{
    public Task<IReadOnlyDictionary<Guid, string>> SendManyAsync(
        SmtpAccount account,
        IReadOnlyList<OutgoingMail> messages,
        CancellationToken cancellationToken) =>
        account.Provider == Entourage.Domain.Entities.MailProviders.Graph
            ? graph.SendManyAsync(account, messages, cancellationToken)
            : smtp.SendManyAsync(account, messages, cancellationToken);
}
