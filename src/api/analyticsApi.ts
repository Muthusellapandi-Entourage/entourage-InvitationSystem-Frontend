import { apiClient } from '@/api/client'

export type AnalyticsGuest = {
  id: string
  name: string
  position: string | null
  hasEmail: boolean
  guestType: string
  group: string
  rsvp: 'Pending' | 'Accepted' | 'Declined'
  rsvpOn: string | null
  declineReason: string | null
  addedOn: string
  invitationCount: number
  firstInvitedOn: string | null
  lastInvitedOn: string | null
  emailCount: number
  reminderCount: number
  emailFailures: number
  lastEmailedOn: string | null
  badgeCount: number
  checkInCount: number
  firstCheckInOn: string | null
  lastCheckInOn: string | null
  seatedOn: string | null
  table: string | null
  seat: string | null
}

export type AnalyticsTable = { name: string; kind: string; capacity: number; assigned: number }

export type AnalyticsActivity = { guestId: string; kind: string; on: string; detail: string | null }

export type EventAnalytics = {
  eventName: string
  status: string
  startDate: string
  endDate: string
  timezone: string
  generatedOn: string
  guests: AnalyticsGuest[]
  tables: AnalyticsTable[]
  activities: AnalyticsActivity[]
}

export const analyticsApi = {
  get(eventId: string) {
    return apiClient<EventAnalytics>(`/api/events/${eventId}/analytics`)
  },
}
