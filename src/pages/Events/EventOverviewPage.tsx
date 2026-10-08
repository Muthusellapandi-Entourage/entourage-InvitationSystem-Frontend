import { useParams } from 'react-router-dom'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { usePageBreadcrumbs } from '@/stores/breadcrumbStore'
import { formatDateRange } from '@/utils/dates'

export function EventOverviewPage() {
  const { eventId = '' } = useParams()
  const query = useEvent(eventId)
  const event = query.data
  useDocumentTitle(event?.name ?? 'Event')
  usePageBreadcrumbs([
    { label: 'Dashboard', to: '/' },
    { label: 'Events', to: '/events' },
    { label: event?.name ?? 'Event' },
  ])

  if (!event) return null

  const rows = [
    { label: 'Name', value: event.name },
    { label: 'Event code', value: event.slug },
    ...(event.description ? [{ label: 'Description', value: event.description }] : []),
    { label: 'Date', value: formatDateRange(event.startDate, event.endDate) },
    { label: 'Timezone', value: event.timezone },
  ]

  return (
    <div className="max-w-3xl">
      <h2 className="text-sm font-medium">Event information</h2>
      <dl className="mt-3 border-t border-border">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 border-b border-border py-3 sm:grid-cols-[180px_1fr] sm:gap-6">
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="text-sm">{row.value}</dd>
          </div>
        ))}
        <div className="grid gap-1 border-b border-border py-3 sm:grid-cols-[180px_1fr] sm:gap-6">
          <dt className="text-sm text-muted">Status</dt>
          <dd>
            <StatusBadge status={event.status} />
          </dd>
        </div>
      </dl>

      <h2 className="mb-3 mt-10 text-sm font-medium">Event URL</h2>
      <p className="rounded-md border border-border px-4 py-3 text-sm text-muted">Not configured yet</p>
    </div>
  )
}
