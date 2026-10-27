using System.Net;
using System.Net.Mail;
using System.Text;
using Entourage.Application.Interfaces;

namespace Entourage.Infrastructure.Services;

/// <summary>
/// Sends mail with the built-in .NET SMTP client over one connection.
/// Supports plain SMTP and STARTTLS (port 587, used by Office 365 and Gmail).
/// Implicit TLS on port 465 is not supported by this client; use 587 instead.
/// </summary>
public sealed class SmtpMailTransport(ILogger<SmtpMailTransport> logger) : IMailTransport
{
    public async Task<IReadOnlyDictionary<Guid, string>> SendManyAsync(
        SmtpAccount account,
        IReadOnlyList<OutgoingMail> messages,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<Guid, string>();
        using var client = new SmtpClient(account.Host, account.Port)
        {
            EnableSsl = account.EnableSsl,
            DeliveryMethod = SmtpDeliveryMethod.Network,
            Timeout = 60_000,
        };
        if (!string.IsNullOrEmpty(account.Username))
        {
            client.UseDefaultCredentials = false;
            client.Credentials = new NetworkCredential(account.Username, account.Password ?? string.Empty);
        }

        var from = new MailAddress(account.FromEmail, account.FromName ?? string.Empty);
        foreach (var message in messages)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                using var mail = new MailMessage
                {
                    From = from,
                    Subject = message.Subject,
                    SubjectEncoding = Encoding.UTF8,
                    Body = message.HtmlBody,
                    BodyEncoding = Encoding.UTF8,
                    IsBodyHtml = true,
                };
                mail.To.Add(new MailAddress(message.ToEmail, message.ToName ?? string.Empty));
                await client.SendMailAsync(mail, cancellationToken);
            }
            catch (Exception error) when (error is SmtpException or FormatException or InvalidOperationException)
            {
                logger.LogWarning(error, "Email to {Recipient} failed.", message.ToEmail);
                errors[message.Id] = Describe(error, account);
            }
        }

        return errors;
    }

    private static string Describe(Exception error, SmtpAccount account)
    {
        if (error is FormatException)
        {
            return "The email address is not valid.";
        }

        if (error is SmtpFailedRecipientException failed)
        {
            return $"The mail server refused the address ({failed.StatusCode}).";
        }

        if (error is not SmtpException smtp)
        {
            return error.Message;
        }

        // The server's own reply, e.g. "5.7.57 Client not authenticated to send mail".
        var reply = smtp.Message.Trim();
        var detail = smtp.InnerException is null ? reply : $"{reply} {smtp.InnerException.Message}";

        // Code 530 means "Must issue STARTTLS first" in .NET, but Gmail and Microsoft 365 also send 530
        // when the login was missing or refused. With TLS already on, it is a sign-in problem.
        if (smtp.StatusCode == SmtpStatusCode.MustIssueStartTlsFirst)
        {
            if (!account.EnableSsl)
            {
                return "The mail server requires a secure connection. Turn on 'Use TLS' in Email settings.";
            }

            if (string.IsNullOrEmpty(account.Username) || string.IsNullOrEmpty(account.Password))
            {
                return "The mail server needs a sign-in. Enter the username (the full email address) and the password, then save.";
            }

            return "The mail server did not accept the sign-in. Check that the username is the full email address and the password is correct "
                + "(Gmail needs an App Password; Microsoft 365 needs Authenticated SMTP turned on for the mailbox by your IT admin). "
                + $"Server reply: {detail}";
        }

        if (smtp.StatusCode is SmtpStatusCode.ClientNotPermitted or SmtpStatusCode.MailboxUnavailable
            && reply.Contains("auth", StringComparison.OrdinalIgnoreCase))
        {
            return $"The mail server refused the sign-in. Check the username and password. Server reply: {detail}";
        }

        return detail;
    }
}
