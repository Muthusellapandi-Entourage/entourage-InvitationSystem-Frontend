import { apiClient } from '@/api/client'
import type { BadgeDesign } from '@/badges/design'

export type BadgeTemplate = {
  design: BadgeDesign
  updatedOn: string | null
}

export const badgeApi = {
  getTemplate(eventId: string) {
    return apiClient<BadgeTemplate>(`/api/events/${eventId}/badge`)
  },

  saveTemplate(eventId: string, design: BadgeDesign) {
    return apiClient<BadgeTemplate>(`/api/events/${eventId}/badge`, {
      method: 'PUT',
      body: JSON.stringify(design),
    })
  },
}
