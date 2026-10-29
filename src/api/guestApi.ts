import { apiBlob, apiClient } from '@/api/client'
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
  guestGroupId?: string | null
  guestGroupName?: string | null
  rsvpStatus?: GuestRsvpStatus
  rsvpUpdatedOn?: string | null
  lastEmailedOn?: string | null
  /** Personal link on the event's own domain (eventdomain/invitation.html?g=…); null when the event has no confirmed domain. */
  invitationUrl?: string | null
  /** What the guest wrote when declining (only when the event asks for a reason). */
  declineReason?: string | null
  /** The guest's personal code in their invitation and RSVP links. */
  inviteToken?: string | null
  phone?: string | null
  /** Set when the guest signed up on the event's public registration page. */
  registeredOn?: string | null
  /** Registration answers: company and custom questions. */
  answers?: { label: string; value: string }[] | null
}

export type GuestRsvpStatus = 'Pending' | 'Accepted' | 'Declined'

export type GuestActivity = { id: string; kind: string; detail: string | null; createdOn: string }

export type GuestWrite = {
  name: string
  email: string | null
  position: string | null
  guestTypeId: string | null
  acknowledgeTypeChange: boolean
  guestGroupId?: string | null
}

export type ImportRow = {
  row: number
  name: string | null
  email: string | null
  position: string | null
  guestType: string | null
  /** Optional group name from a "Group" column; unknown names become new groups. */
  group?: string | null
}

export type GuestListFilter = {
  guestTypeId?: string
  unassigned?: boolean
  guestGroupId?: string
  ungrouped?: boolean
}

export type DeleteGuestsResult = { deleted: number; seatsCleared: number; message: string }

export type BulkEmailResult = {
  complete: boolean
  sent: { guestId: string; name: string; email: string }[]
  failed: GuestBlock[]
  skipped: GuestBlock[]
  message: string
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
  list(eventId: string, filter?: GuestListFilter) {
    const params = new URLSearchParams()
    if (filter?.unassigned) params.set('unassigned', 'true')
    else if (filter?.guestTypeId) params.set('guestTypeId', filter.guestTypeId)
    if (filter?.ungrouped) params.set('ungrouped', 'true')
    else if (filter?.guestGroupId) params.set('guestGroupId', filter.guestGroupId)
    const query = params.toString() ? `?${params}` : ''
    return apiClient<Guest[]>(`/api/events/${eventId}/guests${query}`)
  },

  remove(eventId: string, guestId: string) {
    return apiClient<DeleteGuestsResult>(`/api/events/${eventId}/guests/${guestId}`, { method: 'DELETE' })
  },

  removeMany(eventId: string, guestIds: string[]) {
    return apiClient<DeleteGuestsResult>(`/api/events/${eventId}/guests/delete`, {
      method: 'POST',
      body: JSON.stringify({ guestIds }),
    })
  },

  /** Issues each guest's invitation and emails it. `reminder` sends it with a "Reminder:" subject. */
  email(eventId: string, guestIds: string[], reminder = false) {
    return apiClient<BulkEmailResult>(`/api/events/${eventId}/guests/email`, {
      method: 'POST',
      body: JSON.stringify({ guestIds, reminder }),
    })
  },

  setRsvp(eventId: string, guestId: string, status: GuestRsvpStatus) {
    return apiClient<GuestActivity | null>(`/api/events/${eventId}/guests/${guestId}/rsvp`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    })
  },

  activity(eventId: string, guestId: string) {
    return apiClient<GuestActivity[]>(`/api/events/${eventId}/guests/${guestId}/activity`)
  },

  /** Records a browser-side download in the guest's history. */
  logDownload(eventId: string, guestId: string, detail: string) {
    return apiClient<GuestActivity>(`/api/events/${eventId}/guests/${guestId}/activity`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'Downloaded', detail }),
    })
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

  import(
    eventId: string,
    rows: ImportRow[],
    mappings: { value: string; guestTypeId: string | null; create: boolean }[],
    commit: boolean,
    guestGroupId: string | null = null,
  ) {
    return apiClient<ImportResult>(`/api/events/${eventId}/guests/import`, {
      method: 'POST',
      body: JSON.stringify({ rows, mappings, commit, guestGroupId }),
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

  /** One guest's E-Badge as a PNG drawn on the server. */
  badgeImage(eventId: string, guestId: string) {
    return apiBlob(`/api/events/${eventId}/guests/${guestId}/e-badge`, { cache: 'no-store' })
  },

  commitBadges(eventId: string, guestIds: string[]) {
    return apiClient<GuestOperation>(`/api/events/${eventId}/guests/badges`, {
      method: 'POST',
      body: JSON.stringify({ guestIds }),
    })
  },
}
