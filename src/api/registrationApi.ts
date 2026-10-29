import { apiBaseUrl, apiBlob, apiClient } from '@/api/client'

export type RegistrationFieldKey = 'name' | 'position' | 'company' | 'email' | 'phone'

export type RegistrationField = { key: RegistrationFieldKey; label: string; enabled: boolean; required: boolean }

export type QuestionType = 'text' | 'textarea' | 'select' | 'yesno'

export type RegistrationQuestion = {
  id: string
  label: string
  type: QuestionType
  required: boolean
  options: string[] | null
  placeholder: string | null
}

export type RegistrationSettings = {
  open: boolean
  closesOn: string | null
  capacity: number | null
  guestTypeId: string | null
  guestGroupId: string | null
  fields: RegistrationField[]
  questions: RegistrationQuestion[]
  title: string
  intro: string
  submitButton: string
  successTitle: string
  successText: string
  closedText: string
  downloadButton: string
  walletButton: string
  backgroundAssetId: string | null
  logoAssetId: string | null
  fontId: string | null
  backgroundColor: string
  cardColor: string
  textColor: string
  accentColor: string
  accentTextColor: string
}

export type RegistrationInfo = {
  settings: RegistrationSettings
  publicUrl: string
  onEventDomain: boolean
  eventActive: boolean
  registrations: number
  acceptingNow: boolean
  stateText: string
}

export type RegistrationPreviewView = 'form' | 'done' | 'closed'

export const registrationApi = {
  get(eventId: string) {
    return apiClient<RegistrationInfo>(`/api/events/${eventId}/registration`)
  },

  save(eventId: string, settings: RegistrationSettings) {
    return apiClient<RegistrationInfo>(`/api/events/${eventId}/registration`, { method: 'PUT', body: JSON.stringify(settings) })
  },

  /** The page with unsaved settings; images, fonts and calls are pointed at the API address. */
  async preview(eventId: string, settings: RegistrationSettings, view: RegistrationPreviewView) {
    const blob = await apiBlob(`/api/events/${eventId}/registration/preview?view=${view}`, { method: 'POST', body: JSON.stringify(settings) })
    const origin = apiBaseUrl || window.location.origin
    return (await blob.text()).replaceAll("'/api/public/", `'${origin}/api/public/`).replaceAll('"/api/public/', `"${origin}/api/public/`)
  },

  /** QR code (PNG) that opens the public registration page. */
  qr(eventId: string) {
    return apiBlob(`/api/events/${eventId}/registration/qr`)
  },
}
