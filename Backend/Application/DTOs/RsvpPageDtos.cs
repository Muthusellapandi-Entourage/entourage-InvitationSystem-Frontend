namespace Entourage.Application.DTOs;

/// <summary>
/// Look and wording of the guest RSVP page (confirm → thank-you / decline). Defaults match the
/// Aramco RSVP page; every text can be changed per event.
/// </summary>
public sealed record RsvpPageSettingsDto(
    Guid? BackgroundAssetId = null,
    Guid? LogoAssetId = null,
    Guid? FontId = null,
    string BackgroundColor = "#313131",
    string TextColor = "#FFFFFF",
    string ButtonColor = "#FFFFFF",
    string ButtonTextColor = "#313131",
    string ConfirmAcceptText = "Please confirm your attendance.",
    string ConfirmDeclineText = "Please confirm that you cannot attend.",
    string AcceptButton = "Accept",
    string DeclineButton = "Decline",
    string ReasonsPrompt = "Please let us know why you’re unable to attend:",
    string[]? DeclineReasons = null,
    string ThankYouText = "Thank you for confirming your attendance! Please note that your invitation is personal and strictly non-transferable.",
    string QrText = "Please scan the QR Code above from your mobile device to access your digital pass or click the link below",
    string DownloadButton = "Download digital pass",
    string WalletButton = "Add to Apple Wallet",
    string InfoText = "To ensure a smooth entry, we recommend saving the QR code or digital pass to your mobile device for quick scanning at the registration area. Please note that your digital pass will be updated with your table details closer to the date of the event.",
    string ContactText = "For any inquiries, feel free to contact us at Corporate Protocol.",
    string SignOff = "Warm regards!",
    string DeclineText = "Thank you for your response. We hope to see you at a future event. If your plans change, please contact the event team.")
{
    public static readonly string[] DefaultReasons = ["I have a prior commitment", "Personal reasons."];

    [System.Text.Json.Serialization.JsonIgnore]
    public string[] Reasons => DeclineReasons is { Length: > 0 } reasons ? reasons : DefaultReasons;
}

/// <summary>What the confirm button sends.</summary>
/// <param name="Status">"Accepted" or "Declined" (also "accept" / "decline").</param>
/// <param name="DeclineReason">One of the listed reasons, or "Other".</param>
/// <param name="DeclineReasonNote">Free text when the reason is "Other".</param>
public sealed record PublicRsvpRequest(string? G, string? Status, string? DeclineReason = null, string? DeclineReasonNote = null);

public sealed record PublicRsvpResult(string Status, string Message);
