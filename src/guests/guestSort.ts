import type { Guest } from '@/api/guestApi'

/** Sortable columns of a group's guest table. */
export type GuestSortColumn = 'guest' | 'type' | 'status' | 'invitation'
export type GuestSort = { column: GuestSortColumn; direction: 'asc' | 'desc' } | null

/** Click cycle on a column header: ascending → descending → off. */
export function nextSort(current: GuestSort, column: GuestSortColumn): GuestSort {
  if (!current || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

function time(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

const text = (value: string | null | undefined) => (value ?? '').trim().toLocaleLowerCase()

/** Accepted, then Declined, then Pending (ascending). */
const statusRank: Record<string, number> = { Accepted: 0, Declined: 1, Pending: 2 }

/**
 * Returns a new sorted list (ties keep the original order).
 * - Guest / Guest type: A→Z, then Z→A. Guests without a type always go last.
 * - Status: Accepted → Declined → Pending, then reversed; within a status the latest reply is first.
 * - Invitation: sent (latest first) → not sent, then not sent → sent.
 */
export function sortGuests(guests: Guest[], sort: GuestSort): Guest[] {
  if (!sort) return guests
  const sign = sort.direction === 'asc' ? 1 : -1
  const list = [...guests]
  switch (sort.column) {
    case 'guest':
      return list.sort((a, b) => sign * text(a.name).localeCompare(text(b.name)))
    case 'type':
      return list.sort((a, b) => {
        if (!a.guestTypeName !== !b.guestTypeName) return a.guestTypeName ? -1 : 1
        return sign * text(a.guestTypeName).localeCompare(text(b.guestTypeName))
      })
    case 'status':
      return list.sort((a, b) => {
        const rank = statusRank[a.rsvpStatus ?? 'Pending'] - statusRank[b.rsvpStatus ?? 'Pending']
        if (rank !== 0) return sign * rank
        return time(b.rsvpUpdatedOn) - time(a.rsvpUpdatedOn)
      })
    case 'invitation':
      return list.sort((a, b) => {
        const sent = Number(b.invitationCount > 0) - Number(a.invitationCount > 0)
        if (sent !== 0) return sign * sent
        return time(b.lastInvitationOn) - time(a.lastInvitationOn)
      })
  }
}
