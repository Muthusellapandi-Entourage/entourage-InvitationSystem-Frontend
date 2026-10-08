import { apiClient } from '@/api/client'
import type {
  InvitationContent,
  InvitationItem,
  InvitationResponseItem,
  PublicInvitation,
  RsvpStatus,
} from '@/types/invitation'
import type { EventAssetItem, InvitationDesign, InvitationTemplate } from '@/invitations/design'

export const invitationApi = {
  get(eventId: string) {
    return apiClient<InvitationItem>(`/api/events/${eventId}/invitation`)
  },

  save(eventId: string, input: InvitationContent) {
    return apiClient<InvitationItem>(`/api/events/${eventId}/invitation`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  },

  responses(eventId: string) {
    return apiClient<InvitationResponseItem[]>(`/api/events/${eventId}/invitation/responses`)
  },

  getTemplate(eventId: string) {
    return apiClient<InvitationTemplate>(`/api/events/${eventId}/invitation/template`)
  },

  saveTemplate(eventId: string, design: InvitationDesign) {
    return apiClient<InvitationTemplate>(`/api/events/${eventId}/invitation/template`, {
      method: 'PUT',
      body: JSON.stringify(design),
    })
  },

  uploadAsset(eventId: string, file: File) {
    const body = new FormData()
    body.append('file', file)
    return apiClient<EventAssetItem>(`/api/events/${eventId}/assets`, {
      method: 'POST',
      body,
    })
  },

  getPublic(slug: string) {
    return apiClient<PublicInvitation>(`/api/public/invitations/${encodeURIComponent(slug)}`)
  },

  respond(slug: string, guestName: string, status: RsvpStatus) {
    return apiClient<InvitationResponseItem>(`/api/public/invitations/${encodeURIComponent(slug)}/responses`, {
      method: 'POST',
      body: JSON.stringify({ guestName, status }),
    })
  },
}
