import { apiClient } from '@/api/client'

export type EventDomain = {
  /** e.g. "excellenceawards2026.com"; null when none is set. */
  domain: string | null
  verifiedOn: string | null
  /** True when invitations use the domain (set and confirmed). */
  inUse: boolean
  /** What the domain's DNS should point to, from the server settings. */
  dnsTarget: string | null
  dnsRecordType: string | null
  exampleUrl: string | null
}

export type EventDomainCheck = {
  reachable: boolean
  secure: boolean
  message: string
  domain: EventDomain
}

export const domainApi = {
  get(eventId: string) {
    return apiClient<EventDomain>(`/api/events/${eventId}/domain`)
  },

  set(eventId: string, domain: string) {
    return apiClient<EventDomain>(`/api/events/${eventId}/domain`, { method: 'PUT', body: JSON.stringify({ domain }) })
  },

  clear(eventId: string) {
    return apiClient<EventDomain>(`/api/events/${eventId}/domain`, { method: 'DELETE' })
  },

  check(eventId: string) {
    return apiClient<EventDomainCheck>(`/api/events/${eventId}/domain/check`, { method: 'POST' })
  },
}
