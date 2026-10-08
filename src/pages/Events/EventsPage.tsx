import { Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { buttonClassName } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { EventTable } from '@/components/events/EventTable'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvents } from '@/hooks/useEvents'
import { cn } from '@/lib/cn'
import { usePageBreadcrumbs } from '@/stores/breadcrumbStore'
import { parseStatusParam, statusParam } from '@/utils/status'
import type { EventStatus } from '@/types/event'

const filters: { label: string; value: EventStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'Active' },
  { label: 'Draft', value: 'Draft' },
  { label: 'Archived', value: 'Archived' },
]

export function EventsPage() {
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const status = parseStatusParam(params.get('status'))
  const [draft, setDraft] = useState(search)
  const debounced = useDebouncedValue(draft, 250)
  const query = useEvents({ search, status })
  useDocumentTitle('Events')
  usePageBreadcrumbs([
    { label: 'Dashboard', to: '/' },
    { label: 'Events' },
  ])

  useEffect(() => {
    setDraft(search)
  }, [search])

  useEffect(() => {
    if (debounced === search || draft !== debounced) return
    const next = new URLSearchParams(params)
    if (debounced) next.set('q', debounced)
    else next.delete('q')
    setParams(next, { replace: true })
  }, [debounced, draft, params, search, setParams])

  const events = query.data ?? []
  const filtered = Boolean(search || status)

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">Events</h1>
          <p className="mt-2 text-sm text-muted">Manage all events</p>
        </div>
        <Link to="/events/create" className={buttonClassName()}>
          <Plus className="size-4" aria-hidden="true" />
          Create event
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Search events"
            placeholder="Search events..."
            className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm placeholder:text-muted"
          />
        </div>
        <div className="inline-flex w-fit rounded-md border border-border p-0.5" role="group" aria-label="Filter by status">
          {filters.map((filter) => {
            const selected = filter.value === status
            return (
              <button
                key={filter.label}
                type="button"
                aria-pressed={selected}
                className={cn(
                  'h-8 rounded-[4px] px-3 text-sm transition-colors duration-150',
                  selected ? 'bg-selected font-medium text-foreground' : 'text-muted hover:text-foreground',
                )}
                onClick={() => {
                  const next = new URLSearchParams(params)
                  if (filter.value) next.set('status', statusParam(filter.value))
                  else next.delete('status')
                  setParams(next, { replace: true })
                }}
              >
                {filter.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4">
        {query.isLoading ? (
          <EventTable events={[]} loading />
        ) : query.isError ? (
          <div role="alert" className="py-10">
            <p className="text-sm">Events could not be loaded.</p>
            <button type="button" className={`${buttonClassName('secondary')} mt-4`} onClick={() => query.refetch()}>
              Try again
            </button>
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            title={filtered ? 'No matching events' : 'No events yet'}
            description={
              filtered ? 'Try a different search or status.' : 'Create your first event to get started.'
            }
            action={
              filtered ? (
                <button
                  type="button"
                  className={buttonClassName('secondary')}
                  onClick={() => {
                    setDraft('')
                    setParams({}, { replace: true })
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Link to="/events/create" className={buttonClassName()}>
                  <Plus className="size-4" aria-hidden="true" />
                  Create event
                </Link>
              )
            }
          />
        ) : (
          <EventTable events={events} />
        )}
      </div>
    </div>
  )
}
