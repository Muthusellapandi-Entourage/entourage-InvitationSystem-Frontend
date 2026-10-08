import { ArrowLeft } from 'lucide-react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { buttonClassName } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useEvent } from '@/hooks/useEvents'
import { cn } from '@/lib/cn'

const modules = [
  { label: 'Overview', path: '', enabled: true },
  { label: 'Invitations', path: 'invitations', enabled: true },
  { label: 'E-Badges', path: 'badges', enabled: false },
  { label: 'Guests', path: 'guests', enabled: false },
  { label: 'RSVP', path: 'rsvp', enabled: false },
  { label: 'Check-in', path: 'check-in', enabled: false },
  { label: 'Seating', path: 'seating', enabled: false },
  { label: 'Analytics', path: 'analytics', enabled: false },
  { label: 'Settings', path: 'settings', enabled: true },
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
      <nav aria-label="Event" className="mt-6 flex flex-wrap gap-x-1 gap-y-1 border-b border-border">
        {modules.map((module) => {
          if (!module.enabled) {
            return (
              <span
                key={module.label}
                className="inline-flex min-w-36 shrink-0 cursor-not-allowed flex-col px-3 py-2 text-muted"
                aria-disabled="true"
              >
                <span className="text-sm">{module.label}</span>
                <span className="text-xs">Not built yet</span>
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
                  '-mb-px shrink-0 border-b px-3 py-2 text-sm transition-colors duration-150',
                  isActive ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted hover:text-foreground',
                )
              }
            >
              {module.label}
            </NavLink>
          )
        })}
      </nav>
      <div className="pt-8">
        <Outlet />
      </div>
    </div>
  )
}
