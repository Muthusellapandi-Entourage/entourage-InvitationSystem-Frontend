import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Link2 } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { accApi } from '@/api/accreditationApi'
import { ApiError } from '@/api/client'
import { errorMessage, formatDate, useAccRole } from '@/components/accreditation/shared'
import { Button, buttonClassName } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/StatusBadge'
import { cn } from '@/lib/cn'
import { usePageBreadcrumbs } from '@/stores/breadcrumbStore'
import { AccEventDialog, accStatusHelp, accStatusTone } from '@/pages/Accreditation/AccEventsPage'

/** The event's setup (zones, types, stages…) — shared by every tab. */
export function useAccSetup(eventId: string) {
  return useQuery({ queryKey: ['acc', 'setup', eventId], queryFn: () => accApi.setup(eventId), enabled: Boolean(eventId) })
}

export function AccEventLayout() {
  const { accEventId = '' } = useParams()
  const { canManage, canVet, canWork, canPrint, isAdministrator } = useAccRole()
  const query = useAccSetup(accEventId)
  const [editing, setEditing] = useState(false)
  const setup = query.data
  usePageBreadcrumbs([{ label: 'Accreditation', to: '/accreditation' }, { label: setup?.event.name ?? 'Event' }])

  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (query.isError || !setup) {
    const missing = query.error instanceof ApiError && query.error.status === 404
    return (
      <EmptyState
        title={missing ? 'Accreditation event not found' : 'Event could not be loaded'}
        description={missing ? 'It may have been removed.' : errorMessage(query.error, 'Try again in a moment.')}
        action={
          <Link to="/accreditation" className={buttonClassName('secondary')}>
            Back to accreditation
          </Link>
        }
      />
    )
  }

  const event = setup.event
  const tabs = [
    ...(canWork
      ? [
          { label: 'Overview', path: '' },
          { label: 'Applicants', path: 'applicants' },
          { label: 'Organisations', path: 'organizations' },
        ]
      : []),
    ...(canManage ? [{ label: 'Badges', path: 'badges' }] : []),
    ...(canPrint ? [{ label: 'Print queue', path: 'print' }] : []),
    ...(canWork ? [{ label: 'Set-up', path: 'setup' }] : []),
    ...(canVet ? [{ label: 'Audit log', path: 'audit' }] : []),
  ]
  const publicLink = `${window.location.origin}${setup.publicApplyPath}`

  return (
    <div>
      <Link to="/accreditation" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Accreditation
      </Link>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">{event.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone={accStatusTone[event.status]}>{event.status}</Badge>
            <span>
              {formatDate(event.startDate)} – {formatDate(event.endDate)}
            </span>
            {event.venue ? <span>· {event.venue}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {event.eventId && isAdministrator ? (
            <Link to={`/events/${event.eventId}`} className={buttonClassName('ghost')}>
              Open event
            </Link>
          ) : null}
          {canManage ? (
            <Link to="/accreditation/team" className={buttonClassName('ghost')}>
              Team
            </Link>
          ) : null}
          {event.publicApplyEnabled ? (
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(publicLink).then(
                  () => toast.success('Public application link copied.'),
                  () => toast.message(publicLink),
                )
              }}
            >
              <Link2 className="size-4" aria-hidden="true" />
              Copy apply link
            </Button>
          ) : null}
          {canManage ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit event
            </Button>
          ) : null}
        </div>
      </div>
      {event.status !== 'Open' ? (
        <p role="note" className={cn('mt-4 rounded-lg border px-4 py-3 text-sm', event.status === 'Draft' ? 'border-warning/40 bg-warning-soft' : 'border-border bg-hover')}>
          <span className="font-semibold">{event.status}.</span> {accStatusHelp[event.status]}
        </p>
      ) : null}
      <nav aria-label="Accreditation event" className="mt-6 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.path ? `/accreditation/${event.id}/${tab.path}` : `/accreditation/${event.id}`}
            end={tab.path === ''}
            className={({ isActive }) =>
              cn(
                '-mb-px shrink-0 border-b-2 px-4 py-3 text-sm transition-colors duration-150',
                isActive ? 'border-accent font-medium text-accent' : 'border-transparent text-muted hover:text-foreground',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <div className="pt-8">
        <Outlet />
      </div>
      <AccEventDialog
        open={editing}
        onClose={() => setEditing(false)}
        eventId={event.id}
        initial={{
          name: event.name,
          slug: event.slug,
          venue: event.venue,
          startDate: event.startDate,
          endDate: event.endDate,
          timezone: event.timezone,
          status: event.status,
          publicApplyEnabled: event.publicApplyEnabled,
        }}
      />
    </div>
  )
}
