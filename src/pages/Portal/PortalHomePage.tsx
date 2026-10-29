import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, LogOut, Pencil, Plus, Search, ShieldCheck, Upload } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { AccApplicantDetail } from '@/api/accreditationApi'
import { ApiError } from '@/api/client'
import { portalApi, portalSession, type PortalMe } from '@/api/portalApi'
import { BulkUploadDialog } from '@/components/accreditation/BulkUploadDialog'
import {
  ApplicantForm,
  emptyApplicant,
  errorMessage,
  fieldErrors,
  formatDate,
  openPrivateFile,
  PrivateImage,
  Stat,
  StageChip,
  toWriteRequest,
  type ApplicantFormValue,
} from '@/components/accreditation/shared'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/StatusBadge'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { PortalShell } from '@/pages/Portal/PortalAuthPages'

/** The organisation manager's home: their team, add one / many, follow approval status. */
export function PortalHomePage() {
  useDocumentTitle('Accreditation portal')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hasSession = Boolean(portalSession.get())
  const me = useQuery({ queryKey: ['portal', 'me'], queryFn: portalApi.me, enabled: hasSession, retry: false })
  const roster = useQuery({ queryKey: ['portal', 'applicants'], queryFn: portalApi.applicants, enabled: hasSession && me.isSuccess })
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [bulk, setBulk] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  if (!hasSession || (me.error instanceof ApiError && me.error.status === 401)) {
    portalSession.set(null)
    return <Navigate to="/portal/login" replace />
  }

  if (me.isLoading || !me.data) {
    return (
      <PortalShell>
        {me.isError ? (
          <p role="alert" className="text-sm text-danger">{errorMessage(me.error, 'The portal could not be loaded.')}</p>
        ) : (
          <div className="flex justify-center">
            <Loader2 className="size-5 animate-spin text-muted" aria-hidden="true" />
          </div>
        )}
      </PortalShell>
    )
  }

  const info = me.data
  const rows = roster.data ?? []
  const term = search.trim().toLowerCase()
  const visible = term ? rows.filter((row) => `${row.firstName} ${row.lastName} ${row.email ?? ''} ${row.jobTitle ?? ''}`.toLowerCase().includes(term)) : rows
  const stageOf = (key: string) => info.stages.find((stage) => stage.key === key)
  const count = (kind: string) => rows.filter((row) => stageOf(row.stageKey)?.kind === kind).length
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['portal'] })
  const quotaFull = info.quota !== null && info.used >= info.quota

  return (
    <PortalShell wide>
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">{info.organization}</h1>
            <p className="text-sm text-muted">
              {info.event} · {formatDate(info.startDate)} – {formatDate(info.endDate)}
              {info.venue ? ` · ${info.venue}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">{info.userName}</span>
          <Button
            variant="ghost"
            onClick={() => {
              void portalApi.logout().finally(() => {
                portalSession.set(null)
                queryClient.removeQueries({ queryKey: ['portal'] })
                navigate('/portal/login', { replace: true })
              })
            }}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </header>

      {!info.acceptingApplications ? (
        <p role="note" className="mt-6 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
          {info.eventStatus === 'Draft' ? 'Applications have not opened yet.' : 'Applications are closed.'} You can still follow your team's status here.
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={info.quota ? `Submitted (quota ${info.quota})` : 'Submitted'} value={rows.length} />
        <Stat label="In review" value={count('open')} tone="amber" />
        <Stat label="Approved" value={count('approved')} tone="teal" />
        <Stat label="Rejected" value={count('rejected')} tone="rose" />
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search your team"
            placeholder="Search your team…"
            className="h-10 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm placeholder:text-muted"
          />
        </div>
        {info.acceptingApplications ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setBulk(true)} disabled={quotaFull}>
              <Upload className="size-4" aria-hidden="true" />
              Bulk upload
            </Button>
            <Button onClick={() => setAdding(true)} disabled={quotaFull}>
              <Plus className="size-4" aria-hidden="true" />
              Add person
            </Button>
          </div>
        ) : null}
      </div>
      {quotaFull && info.acceptingApplications ? <p className="mt-2 text-sm text-warning">Your quota of {info.quota} people is used.</p> : null}

      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-border bg-hover/50 text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Badge</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {roster.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <Loader2 className="mx-auto size-5 animate-spin text-muted" aria-hidden="true" />
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  {rows.length ? 'Nobody matches the search.' : 'Nobody submitted yet. Add people one by one or upload a spreadsheet.'}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.id} className="hover:bg-hover/40">
                  <td className="px-4 py-2.5">
                    <button type="button" className="flex items-center gap-2.5 text-left" onClick={() => setOpenId(row.id)}>
                      <PrivateImage fileId={row.photoFileId} load={portalApi.fileBlob} alt="" className="h-9 w-7 shrink-0" />
                      <span>
                        <span className="block font-medium hover:text-accent">
                          {row.firstName} {row.lastName}
                        </span>
                        <span className="block text-xs text-muted">{row.jobTitle ?? row.email ?? ''}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{row.applicantType ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <StageChip stage={stageOf(row.stageKey)} fallback={row.stageKey} />
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{row.badgeNumber ?? '—'}</td>
                  <td className="px-4 py-2.5 text-muted">{formatDate(row.submittedOn)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PersonDialog
        info={info}
        mode={adding ? { kind: 'new' } : openId ? { kind: 'view', id: openId } : null}
        onClose={() => {
          setAdding(false)
          setOpenId(null)
        }}
        onSaved={(detail) => {
          refresh()
          setAdding(false)
          setOpenId(detail.summary.id)
        }}
      />

      <BulkUploadDialog
        open={bulk}
        onClose={() => setBulk(false)}
        title="Bulk upload your team"
        typeNames={info.types.map((type) => type.name)}
        upload={portalApi.upload}
        submit={portalApi.bulk}
        onDone={() => refresh()}
        extra={
          <p className="text-sm text-muted">
            Required documents can be added afterwards by opening each person. People without them may be held in review.
          </p>
        }
      />
    </PortalShell>
  )
}

type Mode = { kind: 'new' } | { kind: 'view'; id: string } | null

function PersonDialog({ info, mode, onClose, onSaved }: { info: PortalMe; mode: Mode; onClose: () => void; onSaved: (detail: AccApplicantDetail) => void }) {
  const viewId = mode?.kind === 'view' ? mode.id : null
  const detail = useQuery({ queryKey: ['portal', 'applicant', viewId], queryFn: () => portalApi.applicant(viewId!), enabled: Boolean(viewId) })
  const [form, setForm] = useState<ApplicantFormValue | null>(null)
  const [lastMode, setLastMode] = useState<Mode>(mode)
  if (mode !== lastMode) {
    setLastMode(mode)
    setForm(mode?.kind === 'new' ? emptyApplicant(info.defaultTypeId ?? info.types[0]?.id ?? null) : null)
  }

  const save = useMutation({
    mutationFn: (value: ApplicantFormValue) => {
      const body = { ...toWriteRequest(value), organizationId: null }
      return viewId ? portalApi.update(viewId, body) : portalApi.create(body)
    },
    onSuccess: (saved) => {
      toast.success(viewId ? 'Changes saved.' : 'Person submitted for accreditation.')
      setForm(null)
      onSaved(saved)
    },
  })
  const errors = fieldErrors(save.error)
  const firstStage = info.stages[0]?.key
  const data = detail.data
  const editable = info.acceptingApplications && data?.summary.stageKey === firstStage
  const stage = info.stages.find((item) => item.key === data?.summary.stageKey)

  return (
    <Modal
      open={Boolean(mode)}
      onClose={onClose}
      width="lg"
      title={mode?.kind === 'new' ? 'Add person' : data ? `${data.summary.firstName} ${data.summary.lastName}` : 'Person'}
      description={mode?.kind === 'new' ? 'Fields marked * are required. Photos and documents go straight to the accreditation team.' : undefined}
    >
      {form ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate(form)
          }}
        >
          <ApplicantForm
            value={form}
            onChange={setForm}
            types={info.types}
            strict={mode?.kind === 'new'}
            errors={errors}
            upload={portalApi.upload}
            existingPhoto={data?.summary.photoFileId ? <PrivateImage fileId={data.summary.photoFileId} load={portalApi.fileBlob} alt="" className="size-full" /> : undefined}
            idMasked={data?.summary.idNumberMasked}
          />
          {save.error && !Object.keys(errors).length ? (
            <p role="alert" className="mt-4 text-sm text-danger">
              {errorMessage(save.error, 'Could not save.')}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => (viewId ? setForm(null) : onClose())}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {viewId ? 'Save changes' : 'Submit'}
            </Button>
          </div>
        </form>
      ) : detail.isLoading || !data ? (
        <div className="flex justify-center py-10">
          {detail.isError ? (
            <p role="alert" className="text-sm text-danger">{errorMessage(detail.error, 'Could not load this person.')}</p>
          ) : (
            <Loader2 className="size-5 animate-spin text-muted" aria-hidden="true" />
          )}
        </div>
      ) : (
        <div className="grid gap-5">
          <div className="flex gap-4">
            <PrivateImage fileId={data.summary.photoFileId} load={portalApi.fileBlob} alt="" className="aspect-[3/4] w-24 shrink-0" />
            <div className="min-w-0 text-sm">
              <div className="flex flex-wrap gap-2">
                <StageChip stage={stage} fallback={data.summary.stageKey} />
                {data.summary.badgeNumber ? <Badge tone="teal">Badge #{data.summary.badgeNumber}</Badge> : null}
              </div>
              <p className="mt-2 text-muted">{[data.summary.applicantType, data.summary.jobTitle, data.summary.email].filter(Boolean).join(' · ')}</p>
              {data.rejectionReason ? <p className="mt-2 text-danger">Reason: {data.rejectionReason}</p> : null}
              {!editable && stage?.kind === 'open' ? <p className="mt-2 text-xs text-muted">Being reviewed — contact the accreditation team for changes.</p> : null}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Documents</h3>
            {data.documents.length === 0 ? (
              <p className="mt-1 text-sm text-muted">None uploaded.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                {data.documents.map((document) => (
                  <li key={document.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left hover:text-accent"
                      onClick={() => void openPrivateFile(document.fileId, portalApi.fileBlob).catch(() => toast.error('The file could not be opened.'))}
                    >
                      {document.label}
                    </button>
                    {document.expired ? <Badge tone="rose">Expired</Badge> : null}
                    <Badge tone={document.status === 'Verified' ? 'teal' : document.status === 'Rejected' ? 'rose' : 'amber'}>{document.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {editable ? (
            <div className="flex justify-end">
              <Button
                variant="secondary"
                onClick={() =>
                  setForm({
                    ...emptyApplicant(data.summary.applicantTypeId),
                    firstName: data.summary.firstName,
                    lastName: data.summary.lastName,
                    email: data.summary.email ?? '',
                    phone: data.phone ?? '',
                    jobTitle: data.summary.jobTitle ?? '',
                    nationality: data.summary.nationality ?? '',
                    dateOfBirth: data.dateOfBirth ?? '',
                    customFields: Object.fromEntries(Object.entries(data.customFields).map(([key, value]) => [key, value ?? ''])),
                  })
                }
              >
                <Pencil className="size-4" aria-hidden="true" />
                Edit or add documents
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
