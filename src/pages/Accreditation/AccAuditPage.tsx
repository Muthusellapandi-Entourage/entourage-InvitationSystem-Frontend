import { useInfiniteQuery } from '@tanstack/react-query'
import { Download, Loader2, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { accApi, type AccAudit } from '@/api/accreditationApi'
import { errorMessage, formatDateTime } from '@/components/accreditation/shared'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const PAGE = 200

function csvCell(value: string | null) {
  const text = value ?? ''
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function AccAuditPage() {
  const { accEventId = '' } = useParams()
  const [filter, setFilter] = useState('')
  useDocumentTitle('Audit log')
  const query = useInfiniteQuery({
    queryKey: ['acc', 'audit', accEventId],
    queryFn: ({ pageParam }) => accApi.audit(accEventId, { take: PAGE, before: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: AccAudit[]) => (last.length === PAGE ? last[last.length - 1].createdOn : null),
  })
  const rows = useMemo(() => (query.data?.pages ?? []).flat(), [query.data])
  const term = filter.trim().toLowerCase()
  const visible = term
    ? rows.filter((row) => [row.action, row.detail, row.actorName, row.applicantName].some((value) => value?.toLowerCase().includes(term)))
    : rows

  function exportCsv() {
    const lines = ['When (UTC),Who,Action,Applicant,Detail', ...visible.map((row) => [row.createdOn, row.actorName, row.action, row.applicantName, row.detail].map(csvCell).join(','))]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'accreditation-audit-log.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Audit log</h2>
          <p className="mt-1 text-sm text-muted">Every change, decision and ID view. Entries are never edited or deleted.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter the log"
              placeholder="Filter…"
              className="h-10 w-56 rounded-md border border-border bg-surface pl-8 pr-3 text-sm placeholder:text-muted"
            />
          </div>
          <Button variant="secondary" onClick={exportCsv} disabled={visible.length === 0}>
            <Download className="size-4" aria-hidden="true" />
            Export CSV
          </Button>
        </div>
      </div>
      <div className="mt-6">
        {query.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : query.isError ? (
          <p role="alert" className="text-sm text-danger">{errorMessage(query.error, 'The audit log could not be loaded.')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-border bg-hover/50 text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Who</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Applicant</th>
                  <th className="px-4 py-3 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatDateTime(row.createdOn)}</td>
                    <td className="px-4 py-2.5">{row.actorName}</td>
                    <td className="px-4 py-2.5 font-medium">{row.action}</td>
                    <td className="px-4 py-2.5">{row.applicantName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted">{row.detail ?? ''}</td>
                  </tr>
                ))}
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted">
                      Nothing logged{term ? ' for this filter' : ' yet'}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        {query.hasNextPage ? (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Load older entries
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
