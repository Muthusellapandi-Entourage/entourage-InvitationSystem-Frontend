import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Eye, FileText, Loader2, Pencil, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { accApi, type AccApplicantDetail, type AccSetup, type AccStage } from '@/api/accreditationApi'
import {
  ApplicantForm,
  errorMessage,
  fieldErrors,
  formatDate,
  formatDateTime,
  openPrivateFile,
  PrivateImage,
  StageChip,
  toWriteRequest,
  useAccRole,
  type ApplicantFormValue,
} from '@/components/accreditation/shared'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/StatusBadge'
import { cn } from '@/lib/cn'
import { RejectDialog, reportDecision } from '@/components/accreditation/RejectDialog'

function toFormValue(detail: AccApplicantDetail): ApplicantFormValue {
  const summary = detail.summary
  return {
    organizationId: summary.organizationId,
    applicantTypeId: summary.applicantTypeId,
    firstName: summary.firstName,
    lastName: summary.lastName,
    email: summary.email ?? '',
    phone: detail.phone ?? '',
    jobTitle: summary.jobTitle ?? '',
    nationality: summary.nationality ?? '',
    dateOfBirth: detail.dateOfBirth ?? '',
    idNumber: '',
    photo: null,
    customFields: Object.fromEntries(Object.entries(detail.customFields).map(([key, value]) => [key, value ?? ''])),
    documents: {},
  }
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm">{children || '—'}</dd>
    </div>
  )
}

/** Applicant details, vetting actions, access, documents, duplicates and history. */
export function ApplicantDrawer({
  eventId,
  setup,
  applicantId,
  organizations,
  onOpen,
  onClose,
  onChanged,
}: {
  eventId: string
  setup: AccSetup
  applicantId: string | null
  organizations: { id: string; name: string }[]
  onOpen: (id: string) => void
  onClose: () => void
  onChanged: () => void
}) {
  const { canVet, canWork } = useAccRole()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['acc', 'applicant', eventId, applicantId],
    queryFn: () => accApi.applicant(eventId, applicantId!),
    enabled: Boolean(applicantId),
  })
  const detail = query.data
  const [editing, setEditing] = useState<ApplicantFormValue | null>(null)
  const [revealed, setRevealed] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<AccStage | null>(null)
  const [lastId, setLastId] = useState(applicantId)
  if (applicantId !== lastId) {
    setLastId(applicantId)
    setEditing(null)
    setRevealed(null)
  }

  const after = (fresh?: AccApplicantDetail) => {
    if (fresh) queryClient.setQueryData(['acc', 'applicant', eventId, applicantId], fresh)
    else void queryClient.invalidateQueries({ queryKey: ['acc', 'applicant', eventId, applicantId] })
    onChanged()
  }

  const move = useMutation({
    mutationFn: ({ stageKey, reason }: { stageKey: string; reason: string | null }) => accApi.move(eventId, [applicantId!], stageKey, reason),
    onSuccess: (result, variables) => {
      reportDecision(result, `moved to ${setup.stages.find((stage) => stage.key === variables.stageKey)?.name ?? 'the stage'}`)
      setRejecting(null)
      after()
    },
    onError: (error) => toast.error(errorMessage(error, 'The stage could not be changed.')),
  })

  const save = useMutation({
    mutationFn: (value: ApplicantFormValue) => accApi.updateApplicant(eventId, applicantId!, toWriteRequest(value)),
    onSuccess: (fresh) => {
      toast.success('Applicant saved.')
      setEditing(null)
      after(fresh)
    },
  })

  const access = useMutation({
    mutationFn: ({ profileId, zones }: { profileId: string | null; zones: string[] }) => accApi.setAccess(eventId, applicantId!, profileId, zones),
    onSuccess: (result) => {
      toast.success('Access saved.')
      for (const warning of result.warnings) toast.warning(warning, { duration: 8000 })
      after()
    },
    onError: (error) => toast.error(errorMessage(error, 'Access could not be saved.')),
  })

  const documentStatus = useMutation({
    mutationFn: ({ documentId, status }: { documentId: string; status: 'Verified' | 'Rejected' | 'Pending' }) =>
      accApi.setDocumentStatus(eventId, applicantId!, documentId, status),
    onSuccess: (fresh) => after(fresh),
    onError: (error) => toast.error(errorMessage(error, 'The document could not be updated.')),
  })

  const addDocument = useMutation({
    mutationFn: async (file: File) => {
      const saved = await accApi.upload(eventId, file)
      return accApi.addDocument(eventId, applicantId!, { kind: 'other', label: file.name, fileId: saved.id, expiresOn: null })
    },
    onSuccess: (fresh) => {
      toast.success('Document added.')
      after(fresh)
    },
    onError: (error) => toast.error(errorMessage(error, 'The document could not be uploaded.')),
  })

  const loadFile = (fileId: string) => accApi.fileBlob(eventId, fileId)
  const summary = detail?.summary
  const stage = setup.stages.find((item) => item.key === summary?.stageKey)
  const zones = setup.zones

  return (
    <>
      <Modal open={Boolean(applicantId)} onClose={onClose} width="lg" title={summary ? `${summary.firstName} ${summary.lastName}` : 'Applicant'}>
        {query.isLoading || !detail || !summary ? (
          query.isError ? (
            <p role="alert" className="text-sm text-danger">{errorMessage(query.error, 'The applicant could not be loaded.')}</p>
          ) : (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted" aria-hidden="true" />
            </div>
          )
        ) : editing ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              save.mutate(editing)
            }}
          >
            <ApplicantForm
              value={editing}
              onChange={setEditing}
              types={setup.types}
              organizations={organizations}
              strict={false}
              errors={fieldErrors(save.error)}
              upload={(file) => accApi.upload(eventId, file)}
              existingPhoto={summary.photoFileId ? <PrivateImage fileId={summary.photoFileId} load={loadFile} alt="" className="size-full" /> : undefined}
              idMasked={summary.idNumberMasked}
            />
            {save.error && !Object.keys(fieldErrors(save.error)).length ? (
              <p role="alert" className="mt-4 text-sm text-danger">
                {errorMessage(save.error, 'The applicant could not be saved.')}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Save
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid gap-6">
            <div className="flex flex-col gap-4 sm:flex-row">
              <PrivateImage fileId={summary.photoFileId} load={loadFile} alt={`${summary.firstName} ${summary.lastName}`} className="aspect-[3/4] w-28 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StageChip stage={stage} fallback={summary.stageKey} />
                  {summary.badgeNumber ? <Badge tone="teal">Badge #{summary.badgeNumber}</Badge> : null}
                  <Badge tone="gray">Source: {summary.source}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <Info label="Organisation">{summary.organization ?? 'Direct'}</Info>
                  <Info label="Type">{summary.applicantType}</Info>
                  <Info label="Role">{summary.jobTitle}</Info>
                  <Info label="Email">{summary.email}</Info>
                  <Info label="Mobile">{detail.phone}</Info>
                  <Info label="Nationality">{summary.nationality}</Info>
                  <Info label="Date of birth">{formatDate(detail.dateOfBirth)}</Info>
                  <Info label="Passport / ID">
                    <span className="inline-flex items-center gap-2">
                      {revealed ?? summary.idNumberMasked ?? '—'}
                      {canVet && summary.idNumberMasked && !revealed ? (
                        <button
                          type="button"
                          className="text-xs text-accent hover:underline"
                          onClick={() =>
                            void accApi.revealId(eventId, summary.id).then(
                              (result) => setRevealed(result.idNumber ?? 'Not readable'),
                              (error) => toast.error(errorMessage(error, 'Could not show the ID number.')),
                            )
                          }
                        >
                          <Eye className="mr-0.5 inline size-3.5" aria-hidden="true" />
                          Show
                        </button>
                      ) : null}
                    </span>
                  </Info>
                  <Info label="Submitted">{formatDateTime(summary.submittedOn)}</Info>
                  {detail.decidedOn ? <Info label="Decided">{`${formatDateTime(detail.decidedOn)}${detail.decidedByName ? ` · ${detail.decidedByName}` : ''}`}</Info> : null}
                </dl>
                {detail.rejectionReason ? (
                  <p className="mt-3 rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm">
                    <span className="font-medium">Rejection reason:</span> {detail.rejectionReason}
                  </p>
                ) : null}
              </div>
            </div>

            {canVet ? (
              <div className="flex flex-wrap items-center gap-2 border-y border-border py-3">
                <span className="mr-1 text-sm text-muted">Move to</span>
                {setup.stages
                  .filter((item) => item.key !== summary.stageKey)
                  .map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      disabled={move.isPending}
                      onClick={() => (item.kind === 'rejected' ? setRejecting(item) : move.mutate({ stageKey: item.key, reason: null }))}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium disabled:opacity-50',
                        item.kind === 'approved'
                          ? 'border-accent bg-accent text-accent-foreground hover:bg-accent-hover'
                          : item.kind === 'rejected'
                            ? 'border-border text-danger hover:bg-danger-soft'
                            : 'border-border hover:bg-hover',
                      )}
                    >
                      {item.kind === 'approved' ? <Check className="size-4" aria-hidden="true" /> : item.kind === 'rejected' ? <X className="size-4" aria-hidden="true" /> : null}
                      {item.name}
                    </button>
                  ))}
                {canWork ? (
                  <Button variant="ghost" className="ml-auto h-8" onClick={() => setEditing(toFormValue(detail))}>
                    <Pencil className="size-4" aria-hidden="true" />
                    Edit details
                  </Button>
                ) : null}
              </div>
            ) : canWork ? (
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => setEditing(toFormValue(detail))}>
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit details
                </Button>
              </div>
            ) : null}

            {detail.duplicates.length ? (
              <div className="rounded-md border border-warning/50 bg-warning-soft px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                  Possible duplicates
                </p>
                <ul className="mt-2 grid gap-1.5 text-sm">
                  {detail.duplicates.map((duplicate) => (
                    <li key={duplicate.id}>
                      <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={() => onOpen(duplicate.id)}>
                        {duplicate.name}
                      </button>
                      <span className="text-muted">
                        {' '}
                        · {duplicate.organization ?? 'Direct'} · {setup.stages.find((item) => item.key === duplicate.stageKey)?.name ?? duplicate.stageKey} ·{' '}
                        {duplicate.reasons.join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <AccessEditor
              key={`${summary.accessProfileId}-${detail.extraZoneIds.join(',')}`}
              setup={setup}
              profileId={summary.accessProfileId}
              extraZoneIds={detail.extraZoneIds}
              effectiveZoneIds={detail.effectiveZoneIds}
              editable={canVet}
              saving={access.isPending}
              onSave={(profileId, zoneIds) => access.mutate({ profileId, zones: zoneIds })}
              zones={zones}
            />

            {Object.keys(detail.customFields).length ? (
              <div>
                <h3 className="text-sm font-semibold">{summary.applicantType ?? 'Extra'} details</h3>
                <dl className="mt-2 grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  {Object.entries(detail.customFields).map(([key, value]) => {
                    const label = setup.types.find((type) => type.id === summary.applicantTypeId)?.fields.find((field) => field.key === key)?.label ?? key
                    return (
                      <Info key={key} label={label}>
                        {value}
                      </Info>
                    )
                  })}
                </dl>
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Documents</h3>
                {canWork ? (
                  <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-hover">
                    {addDocument.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileText className="size-4" aria-hidden="true" />}
                    Add document
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file) addDocument.mutate(file)
                      }}
                    />
                  </label>
                ) : null}
              </div>
              {detail.documents.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No documents uploaded.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                  {detail.documents.map((document) => (
                    <li key={document.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => void openPrivateFile(document.fileId, loadFile).catch((error) => toast.error(errorMessage(error, 'The file could not be opened.')))}
                      >
                        <span className="block truncate font-medium hover:text-accent">{document.label}</span>
                        <span className="block truncate text-xs text-muted">
                          {document.fileName}
                          {document.expiresOn ? ` · expires ${formatDate(document.expiresOn)}` : ''}
                        </span>
                      </button>
                      {document.expired ? <Badge tone="rose">Expired</Badge> : null}
                      <Badge tone={document.status === 'Verified' ? 'teal' : document.status === 'Rejected' ? 'rose' : 'amber'}>{document.status}</Badge>
                      {canVet ? (
                        <span className="flex gap-1">
                          <button
                            type="button"
                            title="Mark verified"
                            aria-label="Mark verified"
                            disabled={documentStatus.isPending || document.status === 'Verified'}
                            onClick={() => documentStatus.mutate({ documentId: document.id, status: 'Verified' })}
                            className="inline-flex size-8 items-center justify-center rounded-md text-accent hover:bg-hover disabled:opacity-40"
                          >
                            <Check className="size-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            title="Mark rejected"
                            aria-label="Mark rejected"
                            disabled={documentStatus.isPending || document.status === 'Rejected'}
                            onClick={() => documentStatus.mutate({ documentId: document.id, status: 'Rejected' })}
                            className="inline-flex size-8 items-center justify-center rounded-md text-danger hover:bg-hover disabled:opacity-40"
                          >
                            <X className="size-4" aria-hidden="true" />
                          </button>
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {detail.history.length ? (
              <div>
                <h3 className="text-sm font-semibold">History</h3>
                <ol className="mt-2 grid gap-2 border-l border-border pl-4 text-sm">
                  {detail.history.map((item) => (
                    <li key={item.id}>
                      <span className="font-medium">{item.action}</span>
                      {item.detail ? <span className="text-muted"> · {item.detail}</span> : null}
                      <span className="block text-xs text-muted">
                        {formatDateTime(item.createdOn)} · {item.actorName}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        )}
      </Modal>
      <RejectDialog
        target={rejecting && applicantId ? { ids: [applicantId], stage: rejecting } : null}
        pending={move.isPending}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => rejecting && move.mutate({ stageKey: rejecting.key, reason })}
      />
    </>
  )
}

function AccessEditor({
  setup,
  zones,
  profileId,
  extraZoneIds,
  effectiveZoneIds,
  editable,
  saving,
  onSave,
}: {
  setup: AccSetup
  zones: AccSetup['zones']
  profileId: string | null
  extraZoneIds: string[]
  effectiveZoneIds: string[]
  editable: boolean
  saving: boolean
  onSave: (profileId: string | null, zoneIds: string[]) => void
}) {
  const [profile, setProfile] = useState(profileId ?? '')
  const [extras, setExtras] = useState<string[]>(extraZoneIds)
  const dirty = profile !== (profileId ?? '') || extras.slice().sort().join() !== extraZoneIds.slice().sort().join()
  const profileZones = setup.profiles.find((item) => item.id === profile)?.zoneIds ?? []
  const preview = dirty ? new Set([...profileZones, ...extras]) : new Set(effectiveZoneIds)

  return (
    <div>
      <h3 className="text-sm font-semibold">Access</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {zones.length === 0 ? <span className="text-sm text-muted">No zones set up.</span> : null}
        {zones.map((zone) => {
          const has = preview.has(zone.id ?? '')
          return (
            <span
              key={zone.id}
              title={zone.name}
              className={cn('inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium', has ? 'text-white' : 'border-border text-muted opacity-60')}
              style={has ? { backgroundColor: zone.color, borderColor: zone.color } : undefined}
            >
              {zone.code}
              <span className="font-normal">{zone.name}</span>
            </span>
          )
        })}
      </div>
      {editable ? (
        <div className="mt-3 grid gap-3 rounded-md border border-border p-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Access profile</span>
            <select className="h-9 rounded-md border border-border bg-surface px-2 text-sm" value={profile} onChange={(event) => setProfile(event.target.value)}>
              <option value="">No profile</option>
              {setup.profiles.map((item) => (
                <option key={item.id} value={item.id ?? ''}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {zones.length ? (
            <fieldset>
              <legend className="text-sm font-medium">Extra zones</legend>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
                {zones.map((zone) => (
                  <label key={zone.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={extras.includes(zone.id ?? '')}
                      onChange={(event) =>
                        setExtras((current) => (event.target.checked ? [...current, zone.id ?? ''] : current.filter((id) => id !== zone.id)))
                      }
                    />
                    {zone.code} · {zone.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          {dirty ? (
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                className="h-8"
                onClick={() => {
                  setProfile(profileId ?? '')
                  setExtras(extraZoneIds)
                }}
              >
                Reset
              </Button>
              <Button className="h-8" disabled={saving} onClick={() => onSave(profile || null, extras)}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Save access
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
