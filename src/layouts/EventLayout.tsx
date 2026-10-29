import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Loader2, Settings, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { accApi } from '@/api/accreditationApi'
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
  { label: 'Brand kit', path: 'brand', enabled: true },
  { label: 'Guests', path: 'guests', enabled: true },
  { label: 'Guest categories', path: 'guest-types', enabled: true },
  { label: 'Designs', path: 'designs', enabled: true },
  { label: 'Self-registration', path: 'registration', enabled: true },
  { label: 'Responses', path: 'rsvp', enabled: true },
  { label: 'Seating', path: 'seating', enabled: true },
  { label: 'Check-in', path: 'check-in', enabled: true },
  { label: 'Live attendance', path: 'live', enabled: true, liveOnly: true },
  { label: 'Analytics', path: 'analytics', enabled: true },
]

/**
 * Opens this event's accreditation in its own browser tab (it is a separate workspace, not an event tab).
 * The first click starts accreditation for the event, copying its name and dates.
 */
function AccreditationButton({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient()
  const linked = useQuery({ queryKey: ['acc', 'for-event', eventId], queryFn: async () => (await accApi.forEvent(eventId)) ?? null })
  const [starting, setStarting] = useState(false)
  const accEventId = linked.data?.id

  if (accEventId) {
    return (
      <a href={`/accreditation/${accEventId}`} target="_blank" rel="noopener" className={buttonClassName('secondary')}>
        <ShieldCheck className="size-4" aria-hidden="true" />
        Accreditation
        <ExternalLink className="size-3.5 text-muted" aria-hidden="true" />
      </a>
    )
  }

  return (
    <button
      type="button"
      className={buttonClassName('secondary')}
      disabled={linked.isLoading || starting}
      title="Start accreditation (workforce, media, vendors) for this event"
      onClick={async () => {
        // Open the tab now so the browser does not block it as a pop-up.
        const tab = window.open('', '_blank')
        setStarting(true)
        try {
          const created = await accApi.startForEvent(eventId)
          queryClient.setQueryData(['acc', 'for-event', eventId], created)
          void queryClient.invalidateQueries({ queryKey: ['acc', 'events'] })
          const url = `/accreditation/${created.id}/setup`
          if (tab) tab.location.href = url
          else window.open(url, '_blank')
        } catch (error) {
          tab?.close()
          toast.error(error instanceof Error ? error.message : 'Accreditation could not be started.')
        } finally {
          setStarting(false)
        }
      }}
    >
      {starting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
      Start accreditation
    </button>
  )
}

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
        <div className="flex flex-wrap gap-2">
          <AccreditationButton eventId={event.id} />
          <Link to={`/events/${event.id}/settings`} className={buttonClassName('secondary')}>
            Edit event
          </Link>
        </div>
      </div>
      {event.status !== 'Active' ? (
        <p
          role="note"
          className={cn(
            'mt-4 rounded-lg border px-4 py-3 text-sm',
            event.status === 'Draft' ? 'border-warning/40 bg-warning-soft' : 'border-border bg-hover',
          )}
        >
          <span className="font-semibold">{event.status === 'Draft' ? 'Setting up — not live yet.' : 'Finished — view only.'}</span>{' '}
          {event.status === 'Draft'
            ? 'Prepare everything here. Invitations can’t be sent, guest links are closed and the door scanner is off until you make the event Live.'
            : 'Nothing can be changed, invitations can’t be sent, and guest links and the door scanner are closed. Make the event Live again to reopen it.'}{' '}
          <Link to={`/events/${event.id}/settings`} className="font-medium underline underline-offset-4">
            {event.status === 'Draft' ? 'Go live' : 'Change status'}
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
                title={waitingForLive ? 'Available while the event is Live' : undefined}
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
