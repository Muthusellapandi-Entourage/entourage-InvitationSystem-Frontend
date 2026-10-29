import { ArrowLeft, Settings } from 'lucide-react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { buttonClassName } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useEvent } from '@/hooks/useEvents'
import { cn } from '@/lib/cn'

const modules = [
  // In event workflow order: set up → prepare & invite → plan → event day → review.
  { label: 'Overview', path: '', enabled: true },
  { label: 'Guests', path: 'guests', enabled: true },
  { label: 'Guest types', path: 'guest-types', enabled: true },
  { label: 'Invitations', path: 'invitations', enabled: true },
  { label: 'E-Badges', path: 'badges', enabled: true },
  { label: 'Self-registration', path: 'registration', enabled: true },
  { label: 'Responses', path: 'rsvp', enabled: true },
  { label: 'Seating', path: 'seating', enabled: true },
  { label: 'Scanner', path: 'check-in', enabled: true },
  { label: 'Live attendance', path: 'live', enabled: true, liveOnly: true },
  { label: 'Analytics', path: 'analytics', enabled: true },
]

export function EventLayout() {
  const { eventId = '' } = useParams()
  const query = useEvent(eventId)
  const event = query.data

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading event</span>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404
    return (
      <EmptyState
        title={missing ? 'Event not found' : 'Event could not be loaded'}
        description={missing ? 'It may have been deleted.' : 'Try again in a moment.'}
        action={
          <Link to="/events" className={buttonClassName('secondary')}>
            Back to events
          </Link>
        }
      />
    )
  }

  if (!event) return null

  return (
    <div>
      <Link to="/events" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Events
      </Link>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">{event.name}</h1>
          <div className="mt-2">
            <StatusBadge status={event.status} />
          </div>
        </div>
        <Link to={`/events/${event.id}/settings`} className={buttonClassName('secondary')}>
          Edit event
        </Link>
      </div>
      {event.status !== 'Active' ? (
        <p
          role="note"
          className={cn(
            'mt-4 rounded-lg border px-4 py-3 text-sm',
            event.status === 'Draft' ? 'border-warning/40 bg-warning-soft' : 'border-border bg-hover',
          )}
        >
          <span className="font-semibold">{event.status === 'Draft' ? 'Draft — not live yet.' : 'Archived — read-only.'}</span>{' '}
          {event.status === 'Draft'
            ? 'You can set everything up, but invitations cannot be sent, guest links are closed and the door scanner is off. Set the event to Active when you are ready.'
            : 'Nothing can be changed, invitations cannot be sent, and guest links and the door scanner are closed. Set the event to Active to reopen it.'}{' '}
          <Link to={`/events/${event.id}/settings`} className="font-medium underline underline-offset-4">
            Change status
          </Link>
        </p>
      ) : null}
      <nav aria-label="Event" className="mt-6 flex flex-wrap gap-x-1 gap-y-1 border-b border-border">
        {modules.map((module) => {
          const waitingForLive = 'liveOnly' in module && module.liveOnly && event.status !== 'Active'
          if (!module.enabled || waitingForLive) {
            return (
              <span
                key={module.label}
                className="shrink-0 px-3 py-2 text-sm text-muted"
                aria-disabled="true"
                title={waitingForLive ? 'Available while the event is Active' : undefined}
              >
                {module.label}
              </span>
            )
          }

          const to = module.path ? `/events/${event.id}/${module.path}` : `/events/${event.id}`
          return (
            <NavLink
              key={module.label}
              to={to}
              end={module.path === ''}
              className={({ isActive }) =>
                cn(
                  '-mb-px shrink-0 border-b-2 px-4 py-3 text-sm transition-colors duration-150',
                  isActive ? 'border-accent font-medium text-accent' : 'border-transparent text-muted hover:text-foreground',
                )
              }
            >
              {module.label}
            </NavLink>
          )
        })}
        <NavLink
          to={`/events/${event.id}/settings`}
          aria-label="Settings"
          className={({ isActive }) =>
            cn(
              'ml-auto inline-flex size-9 items-center justify-center rounded-md hover:bg-hover',
              isActive ? 'text-foreground' : 'text-muted hover:text-foreground',
            )
          }
        >
          <Settings className="size-4" aria-hidden="true" />
        </NavLink>
      </nav>
      <div className="pt-10">
        <Outlet />
      </div>
    </div>
  )
}
