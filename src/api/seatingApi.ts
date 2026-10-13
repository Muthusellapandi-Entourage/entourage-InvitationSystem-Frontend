import { apiClient } from '@/api/client'

export type SeatingPlan = {
  designJson: string | null
  updatedOn: string | null
}

export const seatingApi = {
  get(eventId: string) {
    return apiClient<SeatingPlan>(`/api/events/${eventId}/seating`)
  },

  save(eventId: string, designJson: string) {
    return apiClient<SeatingPlan>(`/api/events/${eventId}/seating`, {
      method: 'PUT',
      body: JSON.stringify({ designJson }),
    })
  },
}
