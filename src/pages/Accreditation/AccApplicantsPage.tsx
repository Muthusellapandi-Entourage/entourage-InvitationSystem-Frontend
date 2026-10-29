import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Columns3, FileText, List, Loader2, Plus, Search, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { accApi, type AccApplicantRow, type AccSetup, type AccStage } from '@/api/accreditationApi'
import { ApplicantDrawer } from '@/components/accreditation/ApplicantDrawer'
import { BulkUploadDialog } from '@/components/accreditation/BulkUploadDialog'
import { RejectDialog, reportDecision } from '@/components/accreditation/RejectDialog'
import {
  ApplicantForm,
  emptyApplicant,
  errorMessage,
  fieldErrors,
  formatDate,
  PrivateImage,
  StageChip,
  toWriteRequest,
  useAccRole,
  type ApplicantFormValue,
} from '@/components/accreditation/shared'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/StatusBadge'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { useAccSetup } from '@/pages/Accreditation/AccEventLayout'

const NO_ORG = '00000000-0000-0000-0000-000000000000'

export function AccApplicantsPage() {
  const { accEventId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { canVet, canWork } = useAccRole()
  const setupQuery = useAccSetup(accEventId)
  const setup = setupQuery.data
  const [view, setView] = useState<'board' | 'list'>(() => {
    try {
      return localStorage.getItem('acc.applicants.view') === 'list' ? 'list' : 'board'
    } catch {
      return 'board'
    }
  })
  const [searchDraft, setSearchDraft] = useState(params.get('search') ?? '')
  const search = useDebouncedValue(searchDraft, 250)
  const stage = params.get('stage') ?? ''
  const organizationId = params.get('organizationId') ?? ''
  const typeId = params.get('typeId') ?? ''
  const duplicates = params.get('duplicates') === 'true'
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkOrg, setBulkOrg] = useState('')
  const [pendingMove, setPendingMove] = useState<{ ids: string[]; stage: AccStage } | null>(null)
  useDocumentTitle('Applicants')

  const filters = { stage: view === 'list' ? stage : '', organizationId, typeId, search, duplicates }
  const query = useQuery({
    queryKey: ['acc', 'applicants', accEventId, filters],
    queryFn: () => accApi.applicants(accEventId, filters),
  })
  const organizationsQuery = useQuery({ queryKey: ['acc', 'organizations', accEventId], queryFn: () => accApi.organizations(accEventId) })
  const queryClient = useQueryClient()
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['acc'] })

  const move = useMutation({
    mutationFn: ({ ids, stageKey, reason }: { ids: string[]; stageKey: string; reason: string | null }) =>
      accApi.move(accEventId, ids, stageKey, reason),
    onSuccess: (result, variables) => {
      const target = setup?.stages.find((item) => item.key === variables.stageKey)
      reportDecision(result, `moved to ${target?.name ?? 'the step'}`)
      setSelected(new Set())
      setPendingMove(null)
      refresh()
    },
    onError: (error) => toast.error(errorMessage(error, 'The applicants could not be moved.')),
  })

  function requestMove(ids: string[], target: AccStage) {
    if (ids.length === 0) return
    if (target.kind === 'rejected') setPendingMove({ ids, stage: target })
    else move.mutate({ ids, stageKey: target.key, reason: null })
  }

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const rows = useMemo(() => query.data ?? [], [query.data])
  const organizations = organizationsQuery.data ?? []

  if (setupQuery.isLoading || !setup) return <Skeleton className="h-64 w-full" />

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              aria-label="Search applicants"
              placeholder="Name, email, badge #, ID last 4…"
              className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm placeholder:text-muted"
            />
          </div>
          {view === 'list' ? (
            <FilterSelect label="Step" value={stage} onChange={(value) => setFilter('stage', value)} options={setup.stages.map((item) => ({ value: item.key, label: item.name }))} />
          ) : null}
          <FilterSelect
            label="Organisation"
            value={organizationId}
            onChange={(value) => setFilter('organizationId', value)}
            options={[{ value: NO_ORG, label: 'Individual / direct' }, ...organizations.map((item) => ({ value: item.id, label: item.name }))]}
          />
          <FilterSelect
            label="Category"
            value={typeId}
            onChange={(value) => setFilter('typeId', value)}
            options={setup.types.map((item) => ({ value: item.id ?? '', label: item.name }))}
          />
          <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm">
            <input type="checkbox" className="size-4" checked={duplicates} onChange={(event) => setFilter('duplicates', event.target.checked ? 'true' : '')} />
            Possible duplicates
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="View">
            {(
              [
                ['board', Columns3, 'Board'],
                ['list', List, 'List'],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                className={cn('inline-flex h-8 items-center gap-1.5 rounded-[4px] px-3 text-sm', view === key ? 'bg-selected font-medium' : 'text-muted hover:text-foreground')}
                onClick={() => {
                  setView(key)
                  try {
                    localStorage.setItem('acc.applicants.view', key)
                  } catch {
                    // Not remembered; fine.
                  }
                }}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          {canWork ? (
            <>
              <Button variant="secondary" onClick={() => setBulkOpen(true)}>
                <Upload className="size-4" aria-hidden="true" />
                Upload a list
              </Button>
              <Button onClick={() => setAdding(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Add applicant
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-5">
        {query.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : query.isError ? (
          <p role="alert" className="text-sm text-danger">{errorMessage(query.error, 'Applicants could not be loaded.')}</p>
        ) : rows.length === 0 && view === 'list' ? (
          <EmptyState title="No applicants" description="Nobody matches these filters yet." />
        ) : view === 'board' ? (
          <Board setup={setup} rows={rows} canMove={canVet} eventId={accEventId} onOpen={setOpenId} onMove={requestMove} />
        ) : (
          <ListView
            setup={setup}
            rows={rows}
            selected={selected}
            setSelected={setSelected}
            canMove={canVet}
            eventId={accEventId}
            onOpen={setOpenId}
            onMove={requestMove}
            moving={move.isPending}
          />
        )}
      </div>

      <ApplicantDrawer
        eventId={accEventId}
        setup={setup}
        applicantId={openId}
        organizations={organizations}
        onOpen={setOpenId}
        onClose={() => setOpenId(null)}
        onChanged={refresh}
      />

      <AddApplicantDialog
        open={adding}
        onClose={() => setAdding(false)}
        eventId={accEventId}
        setup={setup}
        organizations={organizations}
        onCreated={(id) => {
          refresh()
          setAdding(false)
          setOpenId(id)
        }}
      />

      <BulkUploadDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Upload a list of applicants"
        typeNames={setup.types.map((item) => item.name)}
        upload={(file) => accApi.upload(accEventId, file)}
        submit={(bulkRows) => accApi.bulk(accEventId, bulkOrg || null, bulkRows)}
        onDone={() => refresh()}
        extra={organizations.length ? <BulkOrgPicker value={bulkOrg} onChange={setBulkOrg} organizations={organizations} /> : null}
      />

      <RejectDialog
        target={pendingMove}
        pending={move.isPending}
        onClose={() => setPendingMove(null)}
        onConfirm={(reason) => pendingMove && move.mutate({ ids: pendingMove.ids, stageKey: pendingMove.stage.key, reason })}
      />
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn('h-9 max-w-48 rounded-md border border-border bg-surface px-2 text-sm', value ? 'text-foreground' : 'text-muted')}
    >
      <option value="">All {label.toLowerCase().endsWith('y') ? `${label.toLowerCase().slice(0, -1)}ies` : `${label.toLowerCase()}s`}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function BulkOrgPicker({ value, onChange, organizations }: { value: string; onChange: (value: string) => void; organizations: { id: string; name: string }[] }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">Upload for</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-border bg-surface px-2 text-sm">
        <option value="">Individual / direct</option>
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function Flags({ row }: { row: AccApplicantRow }) {
  return (
    <span className="flex flex-wrap gap-1">
      {row.duplicateCount > 0 ? (
        <Badge tone="amber">
          <AlertTriangle className="mr-1 size-3" aria-hidden="true" />
          {row.duplicateCount} duplicate{row.duplicateCount > 1 ? 's' : ''}
        </Badge>
      ) : null}
      {row.documentsPending > 0 ? (
        <Badge tone="gray">
          <FileText className="mr-1 size-3" aria-hidden="true" />
          {row.documentsPending} to check
        </Badge>
      ) : null}
    </span>
  )
}

function Board({
  setup,
  rows,
  canMove,
  eventId,
  onOpen,
  onMove,
}: {
  setup: AccSetup
  rows: AccApplicantRow[]
  canMove: boolean
  eventId: string
  onOpen: (id: string) => void
  onMove: (ids: string[], stage: AccStage) => void
}) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {setup.stages.map((stage) => {
        const items = rows.filter((row) => row.stageKey === stage.key)
        return (
          <section
            key={stage.key}
            aria-label={stage.name}
            className={cn(
              'flex max-h-[calc(100vh-18rem)] min-h-64 w-72 shrink-0 flex-col rounded-lg border bg-surface',
              dragOver === stage.key ? 'border-accent' : 'border-border',
            )}
            onDragOver={(event) => {
              if (!canMove) return
              event.preventDefault()
              setDragOver(stage.key)
            }}
            onDragLeave={() => setDragOver((current) => (current === stage.key ? null : current))}
            onDrop={(event) => {
              event.preventDefault()
              setDragOver(null)
              const id = event.dataTransfer.getData('text/plain')
              const row = rows.find((item) => item.id === id)
              if (row && row.stageKey !== stage.key) onMove([id], stage)
            }}
          >
            <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <StageChip stage={stage} />
              <span className="text-xs tabular-nums text-muted">{items.length}</span>
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {items.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  draggable={canMove}
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', row.id)}
                  onClick={() => onOpen(row.id)}
                  className="flex w-full gap-3 rounded-md border border-border bg-background p-2.5 text-left hover:border-accent/60"
                >
                  <PrivateImage
                    fileId={row.photoFileId}
                    load={(fileId) => accApi.fileBlob(eventId, fileId)}
                    alt=""
                    className="h-12 w-10 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {row.firstName} {row.lastName}
                    </span>
                    <span className="block truncate text-xs text-muted">{[row.organization, row.applicantType].filter(Boolean).join(' · ') || 'Direct'}</span>
                    {row.badgeNumber ? <span className="block text-xs text-accent">Badge #{row.badgeNumber}</span> : null}
                    <span className="mt-1 block">
                      <Flags row={row} />
                    </span>
                  </span>
                </button>
              ))}
              {items.length === 0 ? <p className="px-2 py-6 text-center text-xs text-muted">{canMove ? 'Drop here' : 'Empty'}</p> : null}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ListView({
  setup,
  rows,
  selected,
  setSelected,
  canMove,
  eventId,
  onOpen,
  onMove,
  moving,
}: {
  setup: AccSetup
  rows: AccApplicantRow[]
  selected: Set<string>
  setSelected: (value: Set<string>) => void
  canMove: boolean
  eventId: string
  onOpen: (id: string) => void
  onMove: (ids: string[], stage: AccStage) => void
  moving: boolean
}) {
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const stageOf = (key: string) => setup.stages.find((item) => item.key === key)
  return (
    <div>
      {canMove && selected.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <span className="text-muted">Move to</span>
          {setup.stages.map((stage) => (
            <button
              key={stage.key}
              type="button"
              disabled={moving}
              onClick={() => onMove([...selected], stage)}
              className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium hover:bg-hover disabled:opacity-50"
            >
              {stage.name}
            </button>
          ))}
          {moving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          <button type="button" className="ml-auto text-xs text-muted hover:text-foreground" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className="border-b border-border bg-hover/50 text-xs text-muted">
            <tr>
              {canMove ? (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    className="size-4"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))}
                  />
                </th>
              ) : null}
              <th className="px-3 py-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Organisation</th>
              <th className="px-3 py-3 font-medium">Category</th>
              <th className="px-3 py-3 font-medium">Step</th>
              <th className="px-3 py-3 font-medium">Access</th>
              <th className="px-3 py-3 font-medium">Badge</th>
              <th className="px-3 py-3 font-medium">Flags</th>
              <th className="px-3 py-3 font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-hover/40">
                {canMove ? (
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
                ) : null}
                <td className="px-3 py-2.5">
                  <button type="button" className="flex items-center gap-2.5 text-left" onClick={() => onOpen(row.id)}>
                    <PrivateImage fileId={row.photoFileId} load={(fileId) => accApi.fileBlob(eventId, fileId)} alt="" className="h-9 w-7 shrink-0" />
                    <span>
                      <span className="block font-medium hover:text-accent">
                        {row.firstName} {row.lastName}
                      </span>
                      <span className="block text-xs text-muted">{row.jobTitle ?? row.email ?? ''}</span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-2.5 text-muted">{row.organization ?? 'Direct'}</td>
                <td className="px-3 py-2.5 text-muted">{row.applicantType ?? '—'}</td>
                <td className="px-3 py-2.5">
                  <StageChip stage={stageOf(row.stageKey)} fallback={row.stageKey} />
                </td>
                <td className="px-3 py-2.5 text-muted">{row.accessProfile ?? '—'}</td>
                <td className="px-3 py-2.5 tabular-nums">{row.badgeNumber ?? '—'}</td>
                <td className="px-3 py-2.5">
                  <Flags row={row} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted">{formatDate(row.submittedOn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AddApplicantDialog({
  open,
  onClose,
  eventId,
  setup,
  organizations,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  eventId: string
  setup: AccSetup
  organizations: { id: string; name: string }[]
  onCreated: (id: string) => void
}) {
  const [value, setValue] = useState<ApplicantFormValue>(() => emptyApplicant(null))
  const [lastOpen, setLastOpen] = useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) setValue(emptyApplicant(null))
  }
  const mutation = useMutation({
    mutationFn: () => accApi.createApplicant(eventId, toWriteRequest(value)),
    onSuccess: (detail) => {
      toast.success('Applicant added.')
      onCreated(detail.summary.id)
    },
  })
  const errors = fieldErrors(mutation.error)

  return (
    <Modal open={open} onClose={onClose} width="lg" title="Add applicant" description="Staff entries can be saved without every document; add them later.">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <ApplicantForm
          value={value}
          onChange={setValue}
          types={setup.types}
          organizations={organizations}
          strict={false}
          errors={errors}
          upload={(file) => accApi.upload(eventId, file)}
        />
        {mutation.error && !Object.keys(errors).length ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {errorMessage(mutation.error, 'The applicant could not be saved.')}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Add applicant
          </Button>
        </div>
      </form>
    </Modal>
  )
}
