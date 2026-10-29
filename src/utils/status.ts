import type { EventStatus } from '@/types/event'

const STATUSES = ['Draft', 'Active', 'Archived'] as const

/** What people see. The stored values stay Draft / Active / Archived. */
export const statusLabel: Record<EventStatus, string> = {
  Draft: 'Setting up',
  Active: 'Live',
  Archived: 'Finished',
}

/** One line on what each status means. */
export const statusHelp: Record<EventStatus, string> = {
  Draft: 'You can prepare everything. Invitations cannot be sent, guest links are closed and the door scanner is off.',
  Active: 'Invitations can be sent, guests can reply and the door scanner works.',
  Archived: 'The event is over. Everything is kept but read-only; guest links and the scanner are closed.',
}

export function parseStatusParam(value: string | null): EventStatus | '' {
  if (!value) return ''
  const match = STATUSES.find((status) => status.toLowerCase() === value.toLowerCase())
  return match ?? ''
}

export function statusParam(status: EventStatus) {
  return status.toLowerCase()
}
