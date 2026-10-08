import { useQuery } from '@tanstack/react-query'
import { eventApi } from '@/api/eventApi'
import type { EventStatus } from '@/types/event'

export function useEvents(filters: { search?: string; status?: EventStatus | '' } = {}) {
  return useQuery({
    queryKey: ['events', filters],
    queryFn: () => eventApi.list(filters),
  })
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: ['events', id],
    queryFn: () => eventApi.get(id),
    enabled: id.length > 0,
  })
}
