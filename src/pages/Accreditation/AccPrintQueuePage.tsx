import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, Loader2, PackageCheck, Printer, RotateCcw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { accApi, type AccBadgeTemplate, type AccPrintQueue, type AccPrintRow, type AccPrintStatus } from '@/api/accreditationApi'
import { AccBadgeView, badgeQrDataUrl, loadImages, neededFileIds } from '@/components/accreditation/AccBadgeView'
import { printBadgeBatch, type PrintItem } from '@/components/accreditation/printBadges'
import { errorMessage, formatDateTime, PrivateImage, Stat, useAccRole } from '@/components/accreditation/shared'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/StatusBadge'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useBrandFonts, useBrandKit } from '@/brand/useBrandKit'
import { cn } from '@/lib/cn'

const NO_ORG = '00000000-0000-0000-0000-000000000000'
const statusTabs: { value: AccPrintStatus | 'All'; label: string }[] = [
  { value: 'ToPrint', label: 'To print' },
  { value: 'Printed', label: 'Printed' },
  { value: 'Collected', label: 'Handed out' },
  { value: 'All', label: 'All approved' },
]

/** Batch printing of approved badges: print all, by organisation, or a selection; reprint; hand out. */
export function AccPrintQueuePage() {
  const { accEventId = '' } = useParams()
  const { canVet, canManage } = useAccRole()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AccPrintStatus | 'All'>('ToPrint')
  const [organizationId, setOrganizationId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const search = useDebouncedValue(searchDraft, 250)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewRows, setPreviewRows] = useState<AccPrintRow[] | null>(null)
  const [reprintRows, setReprintRows] = useState<AccPrintRow[] | null>(null)
  useDocumentTitle('Print queue')
  // Badges may use the event's brand fonts.
  useBrandFonts(useBrandKit().kit.fonts)

  const filters = { status, organizationId, typeId, search }
  const query = useQuery({ queryKey: ['acc', 'print-queue', accEventId, filters], queryFn: () => accApi.printQueue(accEventId, filters) })
  // Unfiltered list for the organisation / type pickers.
  const everyone = useQuery({ queryKey: ['acc', 'print-queue', accEventId, 'options'], queryFn: () => accApi.printQueue(accEventId, { status: 'All' }) })
  const refresh = () => {
    setSelected(new Set())
    void queryClient.invalidateQueries({ queryKey: ['acc', 'print-queue', accEventId] })
    void queryClient.invalidateQueries({ queryKey: ['acc', 'overview', accEventId] })
  }

  const collected = useMutation({
    mutationFn: ({ ids, value }: { ids: string[]; value: boolean }) => accApi.setCollected(accEventId, ids, value),
    onSuccess: (count, variables) => {
      toast.success(variables.value ? `${count} badge(s) handed out.` : 'Collection undone.')
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update.')),
  })

  const data = query.data
  const rows = useMemo(() => data?.rows ?? [], [data])
  const options = useMemo(() => {
    const all = everyone.data?.rows ?? []
    const orgs = new Map<string, string>()
    const types = new Map<string, string>()
    let direct = false
    for (const row of all) {
      if (row.organizationId) orgs.set(row.organizationId, row.organization ?? '')
      else direct = true
      if (row.applicantTypeId) types.set(row.applicantTypeId, row.applicantType ?? '')
    }
    return {
      orgs: [...(direct ? [[NO_ORG, 'Individual / direct'] as [string, string]] : []), ...[...orgs.entries()].sort((a, b) => a[1].localeCompare(b[1]))],
      types: [...types.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    }
  }, [everyone.data])

  const selectedRows = rows.filter((row) => selected.has(row.id))
  const noTemplate = (data?.templates.length ?? 0) === 0
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 md:max-w-xl">
        <Stat label="To print" value={data?.toPrint ?? '—'} tone="amber" />
        <Stat label="Printed" value={data?.printed ?? '—'} />
        <Stat label="Handed out" value={data?.collected ?? '—'} tone="teal" />
      </div>

      {noTemplate && !query.isLoading ? (
        <p role="note" className="mt-4 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
          No badge template yet.{' '}
          {canManage ? (
            <Link to={`/accreditation/${accEventId}/badges`} className="font-medium underline underline-offset-4">
              Design one first
            </Link>
          ) : (
            'Ask an accreditation admin to design one.'
          )}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex w-fit flex-wrap rounded-md border border-border p-0.5" role="group" aria-label="Status">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={status === tab.value}
              className={cn('h-8 rounded-[4px] px-3 text-sm', status === tab.value ? 'bg-selected font-medium' : 'text-muted hover:text-foreground')}
              onClick={() => {
                setStatus(tab.value)
                setSelected(new Set())
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              aria-label="Search"
              placeholder="Name, organisation, badge #"
              className="h-9 w-56 rounded-md border border-border bg-surface pl-8 pr-3 text-sm placeholder:text-muted"
            />
          </div>
          <select aria-label="Organisation" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="h-9 max-w-52 rounded-md border border-border bg-surface px-2 text-sm">
            <option value="">All organisations</option>
            {options.orgs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select aria-label="Applicant category" value={typeId} onChange={(event) => setTypeId(event.target.value)} className="h-9 max-w-44 rounded-md border border-border bg-surface px-2 text-sm">
            <option value="">All categories</option>
            {options.types.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={noTemplate || rows.length === 0} onClick={() => setPreviewRows(selectedRows.length ? selectedRows : rows)}>
          <Printer className="size-4" aria-hidden="true" />
          {selectedRows.length
            ? `Print ${selectedRows.length} selected`
            : organizationId
              ? `Print all ${rows.length} for this organisation`
              : `Print all ${rows.length} shown`}
        </Button>
        {selectedRows.length ? (
          <>
            {selectedRows.some((row) => row.status === 'Printed') ? (
              <Button variant="secondary" disabled={collected.isPending} onClick={() => collected.mutate({ ids: selectedRows.map((row) => row.id), value: true })}>
                <PackageCheck className="size-4" aria-hidden="true" />
                Mark handed out
              </Button>
            ) : null}
            {selectedRows.some((row) => row.status !== 'ToPrint') ? (
              <Button variant="secondary" onClick={() => setReprintRows(selectedRows.filter((row) => row.status !== 'ToPrint'))}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Reprint
              </Button>
            ) : null}
            <button type="button" className="text-sm text-muted hover:text-foreground" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </>
        ) : null}
      </div>

      <div className="mt-4">
        {query.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : query.isError ? (
          <p role="alert" className="text-sm text-danger">{errorMessage(query.error, 'The print queue could not be loaded.')}</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title={status === 'ToPrint' ? 'Nothing waiting to print' : 'Nobody here'}
            description={status === 'ToPrint' ? 'Approved people appear here until their badge is printed.' : 'Try another filter.'}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-border bg-hover/50 text-xs text-muted">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="size-4"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))}
                    />
                  </th>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Organisation</th>
                  <th className="px-3 py-3 font-medium">Badge</th>
                  <th className="px-3 py-3 font-medium">Zones</th>
                  <th className="px-3 py-3 font-medium">Template</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-hover/40">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.firstName} ${row.lastName}`}
                        className="size-4"
                        checked={selected.has(row.id)}
                        onChange={() => {
                          const next = new Set(selected)
                          if (next.has(row.id)) next.delete(row.id)
                          else next.add(row.id)
                          setSelected(next)
                        }}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <PrivateImage fileId={row.photoFileId} load={(fileId) => accApi.fileBlob(accEventId, fileId)} alt="" className="h-9 w-7 shrink-0" />
                        <span>
                          <span className="block font-medium">
                            {row.firstName} {row.lastName}
                          </span>
                          <span className="block text-xs text-muted">{[row.applicantType, row.jobTitle].filter(Boolean).join(' · ')}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{row.organization ?? 'Direct'}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.badgeNumber ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex flex-wrap gap-1">
                        {row.zones.map((zone) => (
                          <span key={zone.code} title={zone.name} className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm px-1 text-xs font-bold text-white" style={{ backgroundColor: zone.color }}>
                            {zone.code}
                          </span>
                        ))}
                        {row.zones.length === 0 ? <span className="text-xs text-warning">No zones</span> : null}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{data?.templates.find((template) => template.id === row.templateId)?.name ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      {row.status === 'ToPrint' ? (
                        <Badge tone="amber">{row.printCount > 0 ? 'Reprint' : 'To print'}</Badge>
                      ) : row.status === 'Printed' ? (
                        <span title={formatDateTime(row.lastPrintedOn)}>
                          <Badge tone="gray">Printed{row.printCount > 1 ? ` ×${row.printCount}` : ''}</Badge>
                        </span>
                      ) : (
                        <span title={formatDateTime(row.collectedOn)}>
                          <Badge tone="teal">Handed out</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="inline-flex gap-1">
                        <button type="button" disabled={noTemplate} title="Print" aria-label="Print" className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground disabled:opacity-40" onClick={() => setPreviewRows([row])}>
                          <Printer className="size-4" aria-hidden="true" />
                        </button>
                        {row.status === 'Printed' ? (
                          <button type="button" title="Mark handed out" aria-label="Mark handed out" className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground" onClick={() => collected.mutate({ ids: [row.id], value: true })}>
                            <CheckCheck className="size-4" aria-hidden="true" />
                          </button>
                        ) : null}
                        {row.status !== 'ToPrint' ? (
                          <button type="button" title="Reprint" aria-label="Reprint" className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground" onClick={() => setReprintRows([row])}>
                            <RotateCcw className="size-4" aria-hidden="true" />
                          </button>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data ? <PrintDialog eventId={accEventId} queue={data} rows={previewRows} onClose={() => setPreviewRows(null)} onPrinted={refresh} /> : null}
      <ReprintDialog eventId={accEventId} rows={reprintRows} canRevoke={canVet} onClose={() => setReprintRows(null)} onDone={refresh} />
    </div>
  )
}

function templateFor(row: AccPrintRow, templates: AccBadgeTemplate[]) {
  return templates.find((template) => template.id === row.templateId) ?? templates.find((template) => template.isDefault) ?? templates[0]
}

/** Preview → print → confirm which came out right → marked printed. */
function PrintDialog({
  eventId,
  queue,
  rows,
  onClose,
  onPrinted,
}: {
  eventId: string
  queue: AccPrintQueue
  rows: AccPrintRow[] | null
  onClose: () => void
  onPrinted: () => void
}) {
  const [images, setImages] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState<'preview' | 'printing' | 'confirm'>('preview')
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [last, setLast] = useState(rows)
  if (rows !== last) {
    setLast(rows)
    setStage('preview')
  }

  const items: PrintItem[] = useMemo(
    () =>
      (rows ?? []).flatMap((row) => {
        const template = templateFor(row, queue.templates)
        return template ? [{ key: row.id, design: template.design, person: row }] : []
      }),
    [rows, queue.templates],
  )

  useEffect(() => {
    if (!rows?.length) return
    let cancelled = false
    setLoading(true)
    const ids = new Set<string>()
    for (const item of items) for (const id of neededFileIds(item.design, [item.person])) ids.add(id)
    void Promise.all([
      loadImages(ids, (fileId) => accApi.fileBlob(eventId, fileId)),
      Promise.all(items.slice(0, 6).map(async (item) => [item.key, await badgeQrDataUrl(item.person.credentialCode)] as const)),
    ]).then(([loaded, codes]) => {
      if (cancelled) return
      setImages(loaded)
      setQrs(Object.fromEntries(codes))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [rows, items, eventId])

  const mark = useMutation({
    mutationFn: () => accApi.markPrinted(eventId, (rows ?? []).map((row) => row.id)),
    onSuccess: (count) => {
      toast.success(`${count} badge(s) marked as printed.`)
      onPrinted()
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not mark them printed.')),
  })

  async function print() {
    setStage('printing')
    try {
      await printBadgeBatch(items, queue.eventName, images)
      setStage('confirm')
    } catch (error) {
      toast.error(errorMessage(error, 'Printing failed.'))
      setStage('preview')
    }
  }

  const count = rows?.length ?? 0
  const preview = items.slice(0, 6)
  return (
    <Modal open={Boolean(rows)} onClose={onClose} width="lg" title={`Print ${count} badge${count === 1 ? '' : 's'}`} description="Badges print in hand-out order: by organisation, then surname.">
      {stage === 'confirm' ? (
        <div className="grid gap-4">
          <p className="text-sm">Did all {count} badge(s) print correctly? They will move to Printed.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStage('preview')}>
              No, print again
            </Button>
            <Button onClick={() => mark.mutate()} disabled={mark.isPending}>
              {mark.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Yes, mark printed
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex max-h-[26rem] flex-wrap justify-center gap-4 overflow-y-auto rounded-md bg-hover/40 p-4">
            {loading ? (
              <Loader2 className="my-10 size-5 animate-spin text-muted" aria-hidden="true" />
            ) : (
              preview.map((item) => {
                const scale = Math.min(170 / item.design.widthMm, 230 / item.design.heightMm)
                return (
                  <div key={item.key} className="outline outline-1 outline-border">
                    <AccBadgeView design={item.design} person={item.person} eventName={queue.eventName} images={images} qrDataUrl={qrs[item.key] ?? null} scale={scale} />
                  </div>
                )
              })
            )}
          </div>
          {count > preview.length ? <p className="text-center text-xs text-muted">Showing the first {preview.length} of {count}.</p> : null}
          <p className="text-xs text-muted">
            In the print window choose the badge printer and set margins to None. To skip the print window, start Chrome with --kiosk-printing.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void print()} disabled={loading || stage === 'printing' || items.length === 0}>
              {stage === 'printing' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Printer className="size-4" aria-hidden="true" />}
              Print {count}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ReprintDialog({
  eventId,
  rows,
  canRevoke,
  onClose,
  onDone,
}: {
  eventId: string
  rows: AccPrintRow[] | null
  canRevoke: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [revoke, setRevoke] = useState(false)
  const [last, setLast] = useState(rows)
  if (rows !== last) {
    setLast(rows)
    setReason('')
    setRevoke(false)
  }
  const mutation = useMutation({
    mutationFn: () => accApi.reprint(eventId, (rows ?? []).map((row) => row.id), reason, revoke),
    onSuccess: (count) => {
      toast.success(revoke ? `${count} badge(s) cancelled and queued for reprint.` : `${count} badge(s) queued for reprint.`)
      onDone()
      onClose()
    },
  })
  const count = rows?.length ?? 0
  return (
    <Modal open={Boolean(rows)} onClose={onClose} width="sm" title={`Reprint ${count} badge${count === 1 ? '' : 's'}`} description="They go back to To print. The reason is kept in the history.">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (reason.trim()) mutation.mutate()
        }}
      >
        <div className="flex flex-wrap gap-1.5">
          {['Lost', 'Damaged', 'Details changed', 'Stolen'].map((preset) => (
            <button
              key={preset}
              type="button"
              className="h-7 rounded-sm border border-border px-2 text-xs hover:bg-hover"
              onClick={() => {
                setReason(preset)
                if ((preset === 'Lost' || preset === 'Stolen') && canRevoke) setRevoke(true)
              }}
            >
              {preset}
            </button>
          ))}
        </div>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Reason</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 rounded-md border border-border bg-surface px-3 text-sm focus:border-accent" autoFocus />
        </label>
        {canRevoke ? (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" checked={revoke} onChange={(event) => setRevoke(event.target.checked)} />
            <span>
              <span className="font-medium">Cancel the old badge</span>
              <span className="block text-xs text-muted">The old QR stops working at the gates and a new code is printed. Use for lost or stolen badges.</span>
            </span>
          </label>
        ) : (
          <p className="text-xs text-muted">To cancel a lost badge's QR, ask a security manager to cancel it.</p>
        )}
        {mutation.error ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(mutation.error, 'Could not queue the reprint.')}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={revoke ? 'danger' : 'primary'} disabled={!reason.trim() || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {revoke ? 'Cancel old badge and reprint' : 'Queue reprint'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

