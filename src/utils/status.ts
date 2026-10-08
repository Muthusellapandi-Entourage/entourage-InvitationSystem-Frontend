import type { EventStatus } from '@/types/event'

const STATUSES = ['Draft', 'Active', 'Archived'] as const

export function parseStatusParam(value: string | null): EventStatus | '' {
  if (!value) return ''
  const match = STATUSES.find((status) => status.toLowerCase() === value.toLowerCase())
  return match ?? ''
}

export function statusParam(status: EventStatus) {
  return status.toLowerCase()
}
