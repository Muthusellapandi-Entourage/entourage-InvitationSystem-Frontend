import { apiClient } from '@/api/client'
import type { BadgeDesign } from '@/badges/design'

export type Guest = {
  id: string
  name: string
  email: string | null
  position: string | null
  guestTypeId: string | null
  guestTypeName: string | null
  guestTypeEnabled: boolean | null
  checkInCode: string
  invitationCount: number
  badgeCount: number
  lastInvitationOn: string | null
  lastInvitationTypeName: string | null
  lastBadgeOn: string | null
  lastBadgeTypeName: string | null
}

export type GuestWrite = {
  name: string
  email: string | null
  position: string | null
  guestTypeId: string | null
  acknowledgeTypeChange: boolean
}

export type ImportRow = {
  row: number
  name: string | null
  email: string | null
  position: string | null
  guestType: string | null
}

export type ImportResult = {
  complete: boolean
  readyCount: number
  createdCount: number
  errors: { row: number; message: string }[]
  unmatchedTypes: string[]
  message: string
}

export type GuestBlock = { guestId: string; name: string; reason: string }

export type GuestOperation = {
  complete: boolean
  issued: { guestId: string; name: string; guestTypeName: string }[]
  blocked: GuestBlock[]
  message: string
}

export type BadgeReady = {
  guestId: string
  guestTypeId: string
  name: string
  guestTypeName: string
  qrPayload: string
  design: BadgeDesign
}

export type BadgeBatch = {
  complete: boolean
  ready: BadgeReady[]
  blocked: GuestBlock[]
  message: string
}

export const guestApi = {
  list(eventId: string, filter?: { guestTypeId?: string; unassigned?: boolean }) {
    const params = new URLSearchParams()
    if (filter?.unassigned) params.set('unassigned', 'true')
    else if (filter?.guestTypeId) params.set('guestTypeId', filter.guestTypeId)
    const query = params.toString() ? `?${params}` : ''
    return apiClient<Guest[]>(`/api/events/${eventId}/guests${query}`)
  },

  create(eventId: string, body: GuestWrite) {
    return apiClient<Guest>(`/api/events/${eventId}/guests`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  update(eventId: string, guestId: string, body: GuestWrite) {
    return apiClient<Guest>(`/api/events/${eventId}/guests/${guestId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  },

  reassign(eventId: string, guestIds: string[], guestTypeId: string, acknowledgeTypeChange: boolean) {
    return apiClient<GuestOperation>(`/api/events/${eventId}/guests/reassign`, {
      method: 'POST',
      body: JSON.stringify({ guestIds, guestTypeId, acknowledgeTypeChange }),
    })
  },

  import(eventId: string, rows: ImportRow[], mappings: { value: string; guestTypeId: string | null; create: boolean }[], commit: boolean) {
    return apiClient<ImportResult>(`/api/events/${eventId}/guests/import`, {
      method: 'POST',
      body: JSON.stringify({ rows, mappings, commit }),
    })
  },

  issueInvitations(eventId: string, guestIds: string[]) {
    return apiClient<GuestOperation>(`/api/events/${eventId}/guests/invitations`, {
      method: 'POST',
      body: JSON.stringify({ guestIds }),
    })
  },

  prepareBadges(eventId: string, guestIds: string[]) {
    return apiClient<BadgeBatch>(`/api/events/${eventId}/guests/badges/prepare`, {
      method: 'POST',
      body: JSON.stringify({ guestIds }),
    })
  },

  commitBadges(eventId: string, guestIds: string[]) {
    return apiClient<GuestOperation>(`/api/events/${eventId}/guests/badges`, {
      method: 'POST',
      body: JSON.stringify({ guestIds }),
    })
  },
}
