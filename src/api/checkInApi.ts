import { apiClient } from '@/api/client'
import type { GuestRsvpStatus } from '@/api/guestApi'

/** Closed: the event is not Active (draft or archived), so nothing is recorded. */
export type CheckInStatus = 'CheckedIn' | 'AlreadyCheckedIn' | 'NotFound' | 'Invalid' | 'Closed'

export type CheckInHistoryItem = { kind: 'Checked in' | 'Seated' | string; at: string }

export type CheckInGuest = {
  id: string
  name: string
  /** The guest's group (companies are usually imported as groups). */
  company: string | null
  position: string | null
  guestTypeName: string | null
  rsvpStatus: GuestRsvpStatus
  checkInCount: number
  firstCheckedInOn: string | null
  lastCheckedInOn: string | null
  seatedOn: string | null
  history: CheckInHistoryItem[]
}

export type CheckInResult = {
  status: CheckInStatus
  message: string
  guest: CheckInGuest | null
}

export type LiveScan = {
  id: string
  guestId: string
  name: string
  position: string | null
  company: string | null
  guestTypeName: string | null
  /** The guest's check-in code (what the E-Badge QR holds). */
  code: string
  firstScan: boolean
  isSeated: boolean
  at: string
  /** e.g. "Table 1 · Seat 7"; null when the guest has no seat. */
  seat: string | null
}

export type PublicLiveAttendance = {
  eventName: string
  timezone: string
  status: 'Draft' | 'Active' | 'Archived'
  live: LiveAttendance
}

export type LiveAttendance = {
  totalGuests: number
  checkedIn: number
  seated: number
  scans: LiveScan[]
}

export const checkInApi = {
  live(eventId: string, take = 100) {
    return apiClient<LiveAttendance>(`/api/events/${eventId}/check-in/live?take=${take}`)
  },

  /** The read-only viewer link's board; no sign-in. */
  publicLive(token: string) {
    return apiClient<PublicLiveAttendance>(`/api/public/live/${encodeURIComponent(token)}`)
  },

  getShare(eventId: string) {
    return apiClient<{ token: string | null }>(`/api/events/${eventId}/check-in/live-share`)
  },

  renewShare(eventId: string) {
    return apiClient<{ token: string | null }>(`/api/events/${eventId}/check-in/live-share`, { method: 'POST' })
  },

  disableShare(eventId: string) {
    return apiClient<{ token: string | null }>(`/api/events/${eventId}/check-in/live-share`, { method: 'DELETE' })
  },

  scan(eventId: string, code: string) {
    return apiClient<CheckInResult>(`/api/events/${eventId}/check-in/scan`, { method: 'POST', body: JSON.stringify({ code }) })
  },

  markSeated(eventId: string, guestId: string) {
    return apiClient<CheckInGuest>(`/api/events/${eventId}/check-in/guests/${guestId}/seated`, { method: 'POST' })
  },
}
