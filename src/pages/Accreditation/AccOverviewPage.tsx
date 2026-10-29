import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useParams } from 'react-router-dom'
import { accApi, type AccCount } from '@/api/accreditationApi'
import { errorMessage, formatDateTime, Section, Stat, useAccRole } from '@/components/accreditation/shared'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'

function Bars({ items, eventId, filter }: { items: AccCount[]; eventId: string; filter: 'stage' | 'typeId' | 'organizationId' }) {
  const max = Math.max(1, ...items.map((item) => item.count))
  if (items.length === 0) return <p className="text-sm text-muted">Nothing yet.</p>
  return (
    <ul className="grid gap-2.5">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            to={`/accreditation/${eventId}/applicants?${filter}=${item.key === 'none' ? (filter === 'organizationId' ? '00000000-0000-0000-0000-000000000000' : '') : item.key}`}
            className="group grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-3 text-sm"
          >
            <span className="truncate group-hover:text-accent">{item.label}</span>
            <span className="h-2 overflow-hidden rounded-sm bg-hover">
              <span
                className="block h-full rounded-sm"
                style={{ width: `${(item.count / max) * 100}%`, backgroundColor: item.color ?? 'var(--accent)' }}
              />
            </span>
            <span className="text-right tabular-nums text-muted">{item.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function AccOverviewPage() {
  const { accEventId = '' } = useParams()
  const { canWork, canPrint } = useAccRole()
  const query = useQuery({ queryKey: ['acc', 'overview', accEventId], queryFn: () => accApi.overview(accEventId), enabled: canWork })
  useDocumentTitle('Accreditation overview')

  // Print operators only work the print queue.
  if (!canWork) return canPrint ? <Navigate to={`/accreditation/${accEventId}/print`} replace /> : <p className="text-sm text-muted">Nothing to show for your role yet.</p>

  if (query.isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (query.isError || !query.data) {
    return <p role="alert" className="text-sm text-danger">{errorMessage(query.error, 'The overview could not be loaded.')}</p>
  }

  const data = query.data
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Applicants" value={data.event.applicants} />
        <Stat label="In review" value={data.event.pending} tone="amber" />
        <Stat label="Approved" value={data.event.approved} tone="teal" />
        <Stat label="Rejected" value={data.event.rejected} tone="rose" />
        <Stat label="Possible duplicates" value={data.duplicatesFlagged} tone={data.duplicatesFlagged ? 'amber' : undefined} />
        <Stat label="Documents to check" value={data.documentsPending} tone={data.documentsPending ? 'amber' : undefined} />
        <Stat label="Expired documents" value={data.documentsExpired} tone={data.documentsExpired ? 'rose' : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Pipeline">
          <Bars items={data.byStage} eventId={accEventId} filter="stage" />
        </Section>
        <Section title="Applicant types">
          <Bars items={data.byType} eventId={accEventId} filter="typeId" />
        </Section>
        <Section title="Organisations">
          <Bars items={data.byOrganization.slice(0, 12)} eventId={accEventId} filter="organizationId" />
        </Section>
        <Section title="Zone capacity" description="Approved people with access to each zone. Over capacity is a warning only.">
          {data.zones.length === 0 ? (
            <p className="text-sm text-muted">
              No zones yet.{' '}
              <Link to={`/accreditation/${accEventId}/setup`} className="text-accent underline-offset-4 hover:underline">
                Add zones in Set-up
              </Link>
              .
            </p>
          ) : (
            <ul className="grid gap-3">
              {data.zones.map((zone) => {
                const ratio = zone.capacity ? zone.used / zone.capacity : 0
                return (
                  <li key={zone.id} className="grid gap-1.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="inline-flex h-5 min-w-7 items-center justify-center rounded-sm px-1 text-xs font-semibold text-white" style={{ backgroundColor: zone.color }}>
                          {zone.code}
                        </span>
                        <span className="truncate">{zone.name}</span>
                      </span>
                      <span className={cn('tabular-nums', ratio > 1 ? 'text-danger' : ratio > 0.9 ? 'text-warning' : 'text-muted')}>
                        {zone.used}
                        {zone.capacity ? ` / ${zone.capacity}` : ''}
                      </span>
                    </div>
                    {zone.capacity ? (
                      <span className="h-1.5 overflow-hidden rounded-sm bg-hover">
                        <span
                          className={cn('block h-full', ratio > 1 ? 'bg-danger' : ratio > 0.9 ? 'bg-warning' : 'bg-accent')}
                          style={{ width: `${Math.min(100, ratio * 100)}%` }}
                        />
                      </span>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </Section>
      </div>

      {data.recent.length ? (
        <Section title="Recent activity">
          <ul className="divide-y divide-border text-sm">
            {data.recent.map((item) => (
              <li key={item.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-3">
                <span className="w-40 shrink-0 text-xs text-muted">{formatDateTime(item.createdOn)}</span>
                <span className="min-w-0">
                  <span className="font-medium">{item.action}</span>
                  {item.applicantName ? <span> · {item.applicantName}</span> : null}
                  {item.detail ? <span className="text-muted"> · {item.detail}</span> : null}
                  <span className="block text-xs text-muted">{item.actorName}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  )
}
