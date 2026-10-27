import { Search, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Guest } from '@/api/guestApi'
import { buttonClassName } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { guestInitials } from '@/components/seating/FloorStage'

export type GuestFilter = 'all' | 'seated' | 'open'

export type FloorStats = { tables: number; seats: number; seated: number; open: number }

function initials(name: string) {
  return guestInitials(name) ?? '?'
}

/** Left-hand guest list: search, filter, drag onto chairs, and live floor totals. */
export function GuestPanel({
  eventId,
  guests,
  visibleGuests,
  seatedCount,
  query,
  onQuery,
  filter,
  onFilter,
  placeOf,
  canPick,
  onPick,
  stats,
}: {
  eventId: string
  guests: Guest[]
  visibleGuests: Guest[]
  seatedCount: number
  query: string
  onQuery: (value: string) => void
  filter: GuestFilter
  onFilter: (value: GuestFilter) => void
  placeOf: (guestId: string) => string | null
  canPick: boolean
  onPick: (guest: Guest) => void
  stats: FloorStats
}) {
  return (
    <>
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            Guests
            <span className="rounded-full bg-hover px-2 py-0.5 text-xs font-medium tabular-nums text-muted">{guests.length}</span>
          </h2>
          <Link to={`/events/${eventId}/guests`} className={cn(buttonClassName('secondary'), 'h-8 px-2.5 text-xs')}>
            <Users className="size-3.5" aria-hidden="true" />
            Manage
          </Link>
        </div>
        <label className="relative mt-3 block">
          <span className="sr-only">Search guests</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search guests…"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm outline-none focus:border-accent"
          />
        </label>
        <div className="mt-3 flex gap-1 rounded-lg bg-hover p-1">
          {(
            [
              ['all', 'All', guests.length],
              ['open', 'Unseated', guests.length - seatedCount],
              ['seated', 'Seated', seatedCount],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              className={cn(
                'flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-xs',
                filter === value ? 'bg-surface font-medium text-foreground shadow-sm' : 'text-muted hover:text-foreground',
              )}
              onClick={() => onFilter(value)}
            >
              {label}
              <span className="tabular-nums opacity-70">{Math.max(0, count)}</span>
            </button>
          ))}
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {guests.length === 0 ? (
          <li className="m-2 rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm font-medium">No guests yet</p>
            <p className="mt-1 text-xs text-muted">Add or import your guest list, then drag guests onto chairs.</p>
            <Link to={`/events/${eventId}/guests`} className={cn(buttonClassName('primary'), 'mt-4 inline-flex')}>
              Add guests
            </Link>
          </li>
        ) : visibleGuests.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted">No guests match.</li>
        ) : (
          visibleGuests.map((guest) => {
            const place = placeOf(guest.id)
            return (
              <li key={guest.id}>
                <button
                  type="button"
                  draggable
                  title={canPick ? 'Click to seat at the selected table, or drag onto a chair' : 'Drag onto a chair'}
                  className="group flex w-full cursor-grab items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover active:cursor-grabbing"
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-guest', guest.id)
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => onPick(guest)}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      place ? 'bg-accent text-accent-foreground' : 'bg-accent-soft text-accent',
                    )}
                  >
                    {initials(guest.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{guest.name}</span>
                    <span className="block truncate text-xs text-muted">{guest.guestTypeName ?? 'Guest'}</span>
                  </span>
                  {place ? (
                    <span className="max-w-[7rem] shrink-0 truncate rounded-md bg-selected px-1.5 py-0.5 text-xs tabular-nums">{place}</span>
                  ) : (
                    <span className="shrink-0 text-xs text-muted opacity-0 group-hover:opacity-100">Unseated</span>
                  )}
                </button>
              </li>
            )
          })
        )}
      </ul>
      <div className="grid grid-cols-4 gap-1 border-t border-border px-3 py-2.5 text-center text-xs">
        <Stat label="tables" value={stats.tables} />
        <Stat label="seats" value={stats.seats} />
        <Stat label="seated" value={stats.seated} tone="text-accent" />
        <Stat label="empty" value={stats.open} tone={stats.open > 0 ? 'text-danger' : undefined} />
      </div>
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className={cn('text-sm font-semibold tabular-nums', tone)}>{value}</p>
      <p className="text-muted">{label}</p>
    </div>
  )
}
