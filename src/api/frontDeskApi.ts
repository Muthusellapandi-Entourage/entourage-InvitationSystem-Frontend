import { apiClient } from '@/api/client'
import type { GuestRsvpStatus } from '@/api/guestApi'
import type { PrintPayload } from '@/api/printBadgeApi'

export type FrontDeskGuest = {
  id: string
  name: string
  position: string | null
  company: string | null
  email: string | null
  guestTypeName: string | null
  seat: string | null
  rsvpStatus: GuestRsvpStatus
  declineReason: string | null
  checkInCount: number
  firstCheckedInOn: string | null
  lastCheckedInOn: string | null
  seatedOn: string | null
  /** What the guest's E-Badge QR holds; the door scanner reads it. */
  checkInCode: string
}

export type FrontDesk = {
  eventName: string
  timezone: string
  status: 'Draft' | 'Active' | 'Archived'
  totals: { guests: number; accepted: number; declined: number; pending: number; checkedIn: number; seated: number }
  guests: FrontDeskGuest[]
}

export type FrontDeskAction = { status: string; message: string; guest: FrontDeskGuest | null }

export const frontDeskApi = {
  /* Admin */
  getShare: (eventId: string) => apiClient<{ token: string | null }>(`/api/events/${eventId}/front-desk-share`),
  renewShare: (eventId: string) => apiClient<{ token: string | null }>(`/api/events/${eventId}/front-desk-share`, { method: 'POST' }),
  disableShare: (eventId: string) => apiClient<{ token: string | null }>(`/api/events/${eventId}/front-desk-share`, { method: 'DELETE' }),

  /* Public (no sign-in) */
  get: (token: string) => apiClient<FrontDesk>(`/api/public/front-desk/${encodeURIComponent(token)}`),
  checkIn: (token: string, guestId: string) =>
    apiClient<FrontDeskAction>(`/api/public/front-desk/${encodeURIComponent(token)}/guests/${guestId}/check-in`, { method: 'POST' }),
  seated: (token: string, guestId: string) =>
    apiClient<FrontDeskAction>(`/api/public/front-desk/${encodeURIComponent(token)}/guests/${guestId}/seated`, { method: 'POST' }),
  /** A badge scanned at the desk (USB scanner on the laptop): checks the guest in. */
  scan: (token: string, code: string) =>
    apiClient<FrontDeskAction>(`/api/public/front-desk/${encodeURIComponent(token)}/scan`, { method: 'POST', body: JSON.stringify({ code }) }),
  /** The guest's printed badge data and design. */
  print: (token: string, guestId: string) => apiClient<PrintPayload>(`/api/public/front-desk/${encodeURIComponent(token)}/guests/${guestId}/print`),
  printed: (token: string, guestId: string) =>
    apiClient<void>(`/api/public/front-desk/${encodeURIComponent(token)}/guests/${guestId}/printed`, { method: 'POST' }),
}

export const frontDeskUrl = (token: string) => `${window.location.origin}/live-dashboard/${token}`
