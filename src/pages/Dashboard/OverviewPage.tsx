import { Link } from 'react-router-dom'
import { buttonClassName } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { EventTable } from '@/components/events/EventTable'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvents } from '@/hooks/useEvents'
import { useAuth } from '@/stores/authStore'
import { usePageBreadcrumbs } from '@/stores/breadcrumbStore'
import { greetingFor } from '@/utils/greeting'

export function OverviewPage() {
  const { user } = useAuth()
  const query = useEvents()
  useDocumentTitle('Overview')
  usePageBreadcrumbs([{ label: 'Dashboard' }])

  const events = query.data ?? []
  const counts = [
    { label: 'Total events', value: events.length },
    { label: 'Active events', value: events.filter((event) => event.status === 'Active').length },
    { label: 'Draft events', value: events.filter((event) => event.status === 'Draft').length },
  ]

  return (
    <div>
      <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">
        {greetingFor()}, {user?.firstName || 'there'}
      </h1>
      <p className="mt-2 text-sm text-muted">Here&apos;s an overview of your events.</p>

      {query.isLoading ? (
        <div className="mt-8 grid grid-cols-3 border-y border-border" aria-busy="true">
          {counts.map((count) => (
            <div key={count.label} className="px-1 py-5 sm:px-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-12" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <div role="alert" className="mt-8 border-y border-border py-8">
          <p className="text-sm">Events could not be loaded.</p>
          <button type="button" className={`${buttonClassName('secondary')} mt-4`} onClick={() => query.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <dl className="mt-8 grid grid-cols-3 divide-x divide-border border-y border-border">
          {counts.map((count) => (
            <div key={count.label} className="px-1 py-5 sm:px-4">
              <dt className="text-sm text-muted">{count.label}</dt>
              <dd className="mt-1 text-[1.75rem] font-semibold tabular-nums tracking-[-0.02em]">{count.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <h2 className="mb-3 mt-10 text-base font-semibold">Recent events</h2>
      {query.isLoading ? (
        <EventTable events={[]} loading />
      ) : query.isError ? null : events.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Create your first event to get started."
          action={
            <Link to="/events/create" className={buttonClassName()}>
              Create event
            </Link>
          }
        />
      ) : (
        <EventTable events={events.slice(0, 5)} />
      )}
    </div>
  )
}
