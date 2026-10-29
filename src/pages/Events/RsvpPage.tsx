import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { rsvpApi, type RsvpReply } from '@/api/rsvpApi'
import { RsvpPageSettingsSection } from '@/components/rsvp/RsvpPageSettingsSection'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { cn } from '@/lib/cn'

type Filter = 'all' | 'Accepted' | 'Declined' | 'reasons'

/** RSVP dashboard: reply totals, response rate, per-group breakdown and the latest replies (with decline reasons). */
export function RsvpPage() {
  const { eventId = '' } = useParams()
  const event = useEvent(eventId).data
  useDocumentTitle(event ? `Responses · ${event.name}` : 'Responses')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const query = useQuery({
    queryKey: ['rsvp', eventId],
    queryFn: () => rsvpApi.get(eventId),
    enabled: Boolean(eventId),
    refetchInterval: 10_000,
  })
  const data = query.data
  const replies = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data?.replies ?? []).filter((reply) => {
      if (filter === 'Accepted' || filter === 'Declined') {
        if (reply.status !== filter) return false
      }
      if (filter === 'reasons' && !reply.declineReason) return false
      if (!term) return true
      return [reply.name, reply.company, reply.position, reply.declineReason].some((value) => value?.toLowerCase().includes(term))
    })
  }, [data?.replies, filter, search])

  if (!event) return null
  if (query.isLoading) return <p className="text-sm text-muted">Loading replies…</p>
  if (!data) return <p className="text-sm text-danger">The RSVP dashboard could not be loaded.</p>

  const replied = data.accepted + data.declined
  const rate = data.total > 0 ? Math.round((replied / data.total) * 100) : 0
  const reasons = data.replies.filter((reply) => reply.declineReason).length

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Accepted" value={data.accepted} tone="accent" detail={percent(data.accepted, data.total)} />
        <Stat label="Declined" value={data.declined} tone="danger" detail={percent(data.declined, data.total)} />
        <Stat label="Pending" value={data.pending} detail={percent(data.pending, data.total)} />
        <Stat label="Response rate" value={`${rate}%`} detail={`${replied} of ${data.total} guests replied`} />
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-hover" role="img" aria-label={`${data.accepted} accepted, ${data.declined} declined, ${data.pending} pending`}>
        {data.total > 0 ? (
          <div className="flex h-full">
            <div className="h-full bg-accent" style={{ width: `${(data.accepted / data.total) * 100}%` }} />
            <div className="h-full bg-danger" style={{ width: `${(data.declined / data.total) * 100}%` }} />
          </div>
        ) : null}
      </div>

      <RsvpPageSettingsSection eventId={eventId} askDeclineReason={data.askDeclineReason} />

      {data.groups.length > 1 ? (
        <section>
          <h2 className="mb-3 text-base font-semibold">By group</h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Group</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Accepted</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Declined</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Pending</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((group) => (
                  <tr key={group.name} className="border-t border-border tabular-nums">
                    <td className="px-4 py-2.5 font-medium">{group.name}</td>
                    <td className="px-4 py-2.5 text-right text-accent">{group.accepted}</td>
                    <td className="px-4 py-2.5 text-right text-danger">{group.declined}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{group.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-base font-semibold">Latest replies</h2>
          {(
            [
              ['all', `All (${data.replies.length})`],
              ['Accepted', `Accepted (${data.accepted})`],
              ['Declined', `Declined (${data.declined})`],
              ['reasons', `With reason (${reasons})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                'h-9 rounded-md border px-3 text-xs font-medium',
                filter === value ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
          <label className="relative w-full sm:w-64">
            <span className="sr-only">Search replies</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              value={search}
              onChange={(change) => setSearch(change.target.value)}
              placeholder="Search name, company or reason"
              className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm"
            />
          </label>
        </div>

        {replies.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
            {data.replies.length === 0 ? 'No replies yet. They appear here as guests accept or decline.' : 'No replies match.'}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {replies.map((reply) => (
              <ReplyCard key={reply.guestId} reply={reply} timezone={event.timezone} />
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Updates every 10 seconds.</p>
      </section>
    </div>
  )
}

function ReplyCard({ reply, timezone }: { reply: RsvpReply; timezone: string }) {
  const accepted = reply.status === 'Accepted'
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{reply.name}</p>
          <p className="truncate text-xs text-muted">{[reply.position, reply.company].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            accepted ? 'bg-accent-soft text-accent' : 'bg-danger-soft text-danger',
          )}
        >
          {reply.status}
        </span>
      </div>
      {reply.declineReason ? (
        <blockquote className="rounded-md bg-hover px-3 py-2 text-sm italic">“{reply.declineReason}”</blockquote>
      ) : null}
      <p className="mt-auto text-xs text-muted">
        {reply.guestTypeName ? `${reply.guestTypeName} · ` : ''}
        {reply.repliedOn ? formatWhen(reply.repliedOn, timezone) : '—'}
      </p>
    </li>
  )
}

function Stat({ label, value, detail, tone }: { label: string; value: number | string; detail: string; tone?: 'accent' | 'danger' }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={cn('mt-2 text-3xl font-semibold tabular-nums', tone === 'accent' && 'text-accent', tone === 'danger' && 'text-danger')}>{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  )
}

function percent(part: number, total: number) {
  return total > 0 ? `${Math.round((part / total) * 100)}% of guests` : '—'
}

function formatWhen(value: string, timezone: string) {
  try {
    return new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: timezone })
  } catch {
    return new Date(value).toLocaleString()
  }
}
