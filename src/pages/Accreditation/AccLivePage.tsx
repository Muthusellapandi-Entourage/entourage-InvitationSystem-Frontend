import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { accApi } from '@/api/accreditationApi'
import { errorMessage, Section, Stat } from '@/components/accreditation/shared'
import { buttonClassName } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'

const dot = { green: 'bg-accent', yellow: 'bg-warning', red: 'bg-danger' } as const
const reasons: Record<string, string> = {
  granted: 'Granted',
  wrong_zone: 'Wrong zone',
  unknown: 'Unknown badge',
  revoked: 'Cancelled badge',
  not_approved: 'Not approved',
  guest: 'Guest checked in',
  guest_repeat: 'Guest repeat',
  guest_not_allowed: 'Guest turned away',
  closed: 'Scanning closed',
}

/** Live gate activity: who is inside each zone, today's totals, the last 12 hours and the latest scans. */
export function AccLivePage() {
  const { accEventId = '' } = useParams()
  useDocumentTitle('Gates live')
  const query = useQuery({ queryKey: ['acc', 'live', accEventId], queryFn: () => accApi.live(accEventId), refetchInterval: 5000 })
  const data = query.data

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Gates live</h2>
          <p className="mt-1 text-sm text-muted">Updates every 5 seconds.</p>
        </div>
        <a href={`/accreditation/${accEventId}/scan`} target="_blank" rel="noopener" className={buttonClassName()}>
          Open gate scanner
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError || !data ? (
        <p role="alert" className="text-sm text-danger">{errorMessage(query.error, 'Live data could not be loaded.')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="On site now" value={data.onSite} tone="teal" />
            <Stat label="Scans today" value={data.scansToday} />
            <Stat label="Granted today" value={data.grantedToday} tone="teal" />
            <Stat label="Wrong zone today" value={data.wrongZoneToday} tone={data.wrongZoneToday ? 'amber' : undefined} />
            <Stat label="Denied today" value={data.deniedToday} tone={data.deniedToday ? 'rose' : undefined} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Inside now" description="From each person's latest entry / exit scan at that gate.">
              <ul className="grid gap-3">
                {data.zones.map((zone) => {
                  const ratio = zone.capacity ? zone.inside / zone.capacity : 0
                  return (
                    <li key={zone.id ?? 'entrance'} className="grid gap-1.5 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="inline-flex h-5 min-w-7 items-center justify-center rounded-sm px-1 text-xs font-semibold text-white" style={{ backgroundColor: zone.color }}>
                            {zone.code}
                          </span>
                          <span className="truncate">{zone.name}</span>
                        </span>
                        <span className={cn('tabular-nums', ratio > 1 ? 'text-danger' : ratio > 0.9 ? 'text-warning' : 'text-muted')}>
                          {zone.inside}
                          {zone.capacity ? ` / ${zone.capacity}` : ''}
                        </span>
                      </div>
                      {zone.capacity ? (
                        <span className="h-1.5 overflow-hidden rounded-sm bg-hover">
                          <span className={cn('block h-full', ratio > 1 ? 'bg-danger' : ratio > 0.9 ? 'bg-warning' : 'bg-accent')} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </Section>

            <Section title="Last 12 hours">
              {(() => {
                const max = Math.max(1, ...data.hours.map((hour) => hour.granted + hour.denied))
                return (
                  <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Scans per hour">
                    {data.hours.map((hour) => (
                      <div key={hour.hour} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${hour.granted} granted, ${hour.denied} not granted`}>
                        <div className="flex w-full flex-col justify-end" style={{ height: `${((hour.granted + hour.denied) / max) * 100}%` }}>
                          <div className="w-full rounded-t-sm bg-danger/80" style={{ height: `${hour.granted + hour.denied ? (hour.denied / (hour.granted + hour.denied)) * 100 : 0}%` }} />
                          <div className="w-full flex-1 bg-accent" />
                        </div>
                        <span className="text-[10px] tabular-nums text-muted">{new Date(hour.hour).getHours().toString().padStart(2, '0')}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </Section>
          </div>

          <Section title="Latest scans">
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted">No scans yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Time</th>
                      <th className="py-2 pr-3 font-medium">Result</th>
                      <th className="py-2 pr-3 font-medium">Person</th>
                      <th className="py-2 pr-3 font-medium">Gate</th>
                      <th className="py-2 pr-3 font-medium">Scanned by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.recent.map((row) => (
                      <tr key={row.id}>
                        <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-muted">
                          {new Date(row.scannedOn).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="py-2 pr-3">
                          <span className="inline-flex items-center gap-2">
                            <span className={cn('size-2.5 rounded-full', dot[row.result])} aria-hidden="true" />
                            {reasons[row.reason] ?? row.reason}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {row.name ?? <span className="text-muted">Unknown</span>}
                          {row.organization ? <span className="text-muted"> · {row.organization}</span> : null}
                        </td>
                        <td className="py-2 pr-3 text-muted">
                          {row.gateName}
                          {row.zoneCode ? ` (${row.zoneCode})` : ''} · {row.direction === 'in' ? 'In' : 'Out'}
                        </td>
                        <td className="py-2 pr-3 text-muted">{row.scannedByName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
