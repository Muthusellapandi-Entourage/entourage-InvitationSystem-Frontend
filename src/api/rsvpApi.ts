import { apiBaseUrl, apiBlob, apiClient } from '@/api/client'

export type RsvpReply = {
  guestId: string
  name: string
  position: string | null
  company: string | null
  guestTypeName: string | null
  status: 'Accepted' | 'Declined'
  repliedOn: string | null
  declineReason: string | null
}

export type RsvpDashboard = {
  total: number
  accepted: number
  declined: number
  pending: number
  askDeclineReason: boolean
  groups: { name: string; accepted: number; declined: number; pending: number }[]
  replies: RsvpReply[]
  /** Artwork shown after a guest confirms Accept; null = a text thank-you. */
  thankYouAssetId?: string | null
}

/** Look and wording of the guest RSVP page. Every text has a default on the server. */
export type RsvpPageSettings = {
  backgroundAssetId: string | null
  logoAssetId: string | null
  fontId: string | null
  backgroundColor: string
  textColor: string
  buttonColor: string
  buttonTextColor: string
  confirmAcceptText: string
  confirmDeclineText: string
  acceptButton: string
  declineButton: string
  reasonsPrompt: string
  declineReasons: string[] | null
  thankYouText: string
  qrText: string
  downloadButton: string
  walletButton: string
  infoText: string
  contactText: string
  signOff: string
  declineText: string
}

export type RsvpPreviewView = 'confirm-accept' | 'confirm-decline' | 'accepted' | 'declined'

export const rsvpApi = {
  getPage(eventId: string) {
    return apiClient<RsvpPageSettings>(`/api/events/${eventId}/rsvp/page`)
  },

  savePage(eventId: string, settings: RsvpPageSettings) {
    return apiClient<RsvpPageSettings>(`/api/events/${eventId}/rsvp/page`, { method: 'PUT', body: JSON.stringify(settings) })
  },

  /** The page with a sample guest; images, fonts and calls are pointed at the API address. */
  async previewPage(eventId: string, settings: RsvpPageSettings, view: RsvpPreviewView) {
    // Empty texts are left out so the server's default wording is used.
    const body = Object.fromEntries(Object.entries(settings).filter(([, item]) => !(typeof item === 'string' && item.trim() === '')))
    const blob = await apiBlob(`/api/events/${eventId}/rsvp/page/preview?view=${view}`, { method: 'POST', body: JSON.stringify(body) })
    const origin = apiBaseUrl || window.location.origin
    return (await blob.text()).replaceAll("'/api/public/", `'${origin}/api/public/`).replaceAll('"/api/public/', `"${origin}/api/public/`)
  },

  get(eventId: string) {
    return apiClient<RsvpDashboard>(`/api/events/${eventId}/rsvp`)
  },

  setThankYouImage(eventId: string, assetId: string | null) {
    return apiClient<{ assetId: string | null }>(`/api/events/${eventId}/rsvp/thank-you-image`, {
      method: 'PUT',
      body: JSON.stringify({ assetId }),
    })
  },

  saveSettings(eventId: string, askDeclineReason: boolean) {
    return apiClient<{ askDeclineReason: boolean }>(`/api/events/${eventId}/rsvp/settings`, {
      method: 'PUT',
      body: JSON.stringify({ askDeclineReason }),
    })
  },
}
