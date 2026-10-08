import { apiClient } from '@/api/client'
import type { EventInput, EventItem, EventStatus } from '@/types/event'

type ListParams = {
  search?: string
  status?: EventStatus | ''
}

export const eventApi = {
  list({ search, status }: ListParams = {}) {
    const query = new URLSearchParams()
    if (search) query.set('search', search)
    if (status) query.set('status', status)
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    return apiClient<EventItem[]>(`/api/events${suffix}`)
  },

  get(id: string) {
    return apiClient<EventItem>(`/api/events/${id}`)
  },

  create(input: EventInput) {
    return apiClient<EventItem>('/api/events', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  update(id: string, input: EventInput) {
    return apiClient<EventItem>(`/api/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  },

  remove(id: string) {
    return apiClient<null>(`/api/events/${id}`, { method: 'DELETE' })
  },

  updateStatus(id: string, status: EventStatus) {
    return apiClient<EventItem>(`/api/events/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  },
}
