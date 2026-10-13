import { apiClient } from '@/api/client'
import type { BadgeDesign } from '@/badges/design'
import type { InvitationDesign } from '@/invitations/design'

export type GuestType = {
  id: string
  name: string
  sortOrder: number
  isEnabled: boolean
  guestCount: number
  invitationConfigured: boolean
  badgeConfigured: boolean
  updatedOn: string
}

export type GuestTypeInvitation = {
  design: InvitationDesign
  html: string | null
  updatedOn: string | null
  configured: boolean
}

export type GuestTypeBadge = {
  design: BadgeDesign
  updatedOn: string | null
  configured: boolean
}

export const guestTypeApi = {
  list(eventId: string) {
    return apiClient<GuestType[]>(`/api/events/${eventId}/guest-types`)
  },

  create(eventId: string, name: string) {
    return apiClient<GuestType>(`/api/events/${eventId}/guest-types`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },

  update(eventId: string, guestTypeId: string, body: { name: string; isEnabled: boolean }) {
    return apiClient<GuestType>(`/api/events/${eventId}/guest-types/${guestTypeId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  },

  reorder(eventId: string, ids: string[]) {
    return apiClient<GuestType[]>(`/api/events/${eventId}/guest-types/order`, {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    })
  },

  remove(eventId: string, guestTypeId: string, discardDesigns: boolean) {
    const query = discardDesigns ? '?discardDesigns=true' : ''
    return apiClient<null>(`/api/events/${eventId}/guest-types/${guestTypeId}${query}`, { method: 'DELETE' })
  },

  duplicate(
    eventId: string,
    guestTypeId: string,
    body: { category: 'invitation' | 'badge'; destinationGuestTypeId: string; replace: boolean },
  ) {
    return apiClient<GuestType>(`/api/events/${eventId}/guest-types/${guestTypeId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  getInvitation(eventId: string, guestTypeId: string) {
    return apiClient<GuestTypeInvitation>(`/api/events/${eventId}/guest-types/${guestTypeId}/invitation`)
  },

  saveInvitation(eventId: string, guestTypeId: string, design: InvitationDesign) {
    return apiClient<GuestTypeInvitation>(`/api/events/${eventId}/guest-types/${guestTypeId}/invitation`, {
      method: 'PUT',
      body: JSON.stringify(design),
    })
  },

  getBadge(eventId: string, guestTypeId: string) {
    return apiClient<GuestTypeBadge>(`/api/events/${eventId}/guest-types/${guestTypeId}/badge`)
  },

  saveBadge(eventId: string, guestTypeId: string, design: BadgeDesign) {
    return apiClient<GuestTypeBadge>(`/api/events/${eventId}/guest-types/${guestTypeId}/badge`, {
      method: 'PUT',
      body: JSON.stringify(design),
    })
  },
}
