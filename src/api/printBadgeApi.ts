import { apiClient } from '@/api/client'

export type PrintElementKind = 'name' | 'position' | 'company' | 'guestType' | 'seat' | 'text' | 'qr' | 'image'

/** One element on the printed badge; position and size in millimetres, font size in points. */
export type PrintBadgeElement = {
  id: string
  kind: PrintElementKind
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontWeight: 'regular' | 'semibold' | 'bold'
  color: string
  align: 'left' | 'center' | 'right'
  valign: 'top' | 'middle' | 'bottom'
  uppercase: boolean
  text: string | null
  font: string | null
  assetId: string | null
}

export type PrintBadgeDesign = {
  widthMm: number
  heightMm: number
  backgroundColor: string
  backgroundAssetId: string | null
  elements: PrintBadgeElement[]
}

export type PrintBadgeTemplate = { guestTypeId: string; guestTypeName: string; configured: boolean; design: PrintBadgeDesign }

export type PrintGuest = {
  id: string
  name: string
  position: string | null
  company: string | null
  guestType: string | null
  seat: string | null
  checkInCode: string
}

export type PrintPayload = { design: PrintBadgeDesign | null; guest: PrintGuest }

export const printBadgeApi = {
  get(eventId: string, guestTypeId: string) {
    return apiClient<PrintBadgeTemplate>(`/api/events/${eventId}/guest-types/${guestTypeId}/print-badge`)
  },

  save(eventId: string, guestTypeId: string, design: PrintBadgeDesign) {
    return apiClient<PrintBadgeTemplate>(`/api/events/${eventId}/guest-types/${guestTypeId}/print-badge`, {
      method: 'PUT',
      body: JSON.stringify(design),
    })
  },

  /** A guest's print data (admin, from the guest list). */
  forGuest(eventId: string, guestId: string) {
    return apiClient<PrintPayload>(`/api/events/${eventId}/guests/${guestId}/print-badge`)
  },

  printed(eventId: string, guestId: string) {
    return apiClient<void>(`/api/events/${eventId}/guests/${guestId}/print-badge/printed`, { method: 'POST' })
  },
}

/* ---------------- kiosk ---------------- */

export type KioskSettings = {
  welcomeTitle: string
  welcomeText: string
  confirmTitle: string
  confirmButton: string
  cancelButton: string
  printingText: string
  doneTitle: string
  doneText: string
  alreadyText: string
  declinedText: string
  notFoundText: string
  allowReprint: boolean
  showSeat: boolean
  useCamera: boolean
  resetSeconds: number
  backgroundAssetId: string | null
  logoAssetId: string | null
  backgroundColor: string
  cardColor: string
  textColor: string
  accentColor: string
  accentTextColor: string
}

export type KioskInfo = { eventName: string; status: string; settings: KioskSettings }
export type KioskLookup = { status: string; message: string; guest: PrintGuest | null; alreadyCheckedIn: boolean }
export type KioskConfirm = { status: string; message: string; print: PrintPayload | null }

export const kioskApi = {
  settings(eventId: string) {
    return apiClient<KioskSettings>(`/api/events/${eventId}/kiosk`)
  },
  saveSettings(eventId: string, settings: KioskSettings) {
    return apiClient<KioskSettings>(`/api/events/${eventId}/kiosk`, { method: 'PUT', body: JSON.stringify(settings) })
  },
  share(eventId: string) {
    return apiClient<{ token: string | null }>(`/api/events/${eventId}/kiosk/share`)
  },
  renew(eventId: string) {
    return apiClient<{ token: string | null }>(`/api/events/${eventId}/kiosk/share`, { method: 'POST' })
  },
  disable(eventId: string) {
    return apiClient<{ token: string | null }>(`/api/events/${eventId}/kiosk/share`, { method: 'DELETE' })
  },

  /* public (no sign-in) */
  info(token: string) {
    return apiClient<KioskInfo>(`/api/public/kiosk/${token}`)
  },
  lookup(token: string, code: string) {
    return apiClient<KioskLookup>(`/api/public/kiosk/${token}/lookup`, { method: 'POST', body: JSON.stringify({ code }) })
  },
  confirm(token: string, code: string) {
    return apiClient<KioskConfirm>(`/api/public/kiosk/${token}/confirm`, { method: 'POST', body: JSON.stringify({ code }) })
  },
  printed(token: string, guestId: string) {
    return apiClient<void>(`/api/public/kiosk/${token}/guests/${guestId}/printed`, { method: 'POST' })
  },
}

export function kioskUrl(token: string) {
  return `${window.location.origin}/kiosk/${token}`
}
