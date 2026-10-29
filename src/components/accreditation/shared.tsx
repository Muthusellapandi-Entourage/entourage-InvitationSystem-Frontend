import { FileText, ImageOff, Loader2, Upload, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '@/api/client'
import type { AccDocumentRule, AccField, AccFile, AccStage } from '@/api/accreditationApi'
import { cn } from '@/lib/cn'
import { useAuth } from '@/stores/authStore'

/* ---------------- Roles ---------------- */

export const accRoleLabels: Record<string, string> = {
  Administrator: 'Administrator',
  AccreditationAdmin: 'Accreditation admin',
  SecurityManager: 'Security manager',
  DataEntryClerk: 'Data entry clerk',
  PrintOperator: 'Print operator',
  GateGuard: 'Gate guard',
}

export const accTeamRoles = ['AccreditationAdmin', 'SecurityManager', 'DataEntryClerk', 'PrintOperator', 'GateGuard'] as const

/** What the signed-in staff member may do in accreditation. */
export function useAccRole() {
  const { user } = useAuth()
  const role = user?.role ?? ''
  const admin = role === 'Administrator'
  return {
    role,
    isAdministrator: admin,
    canManage: admin || role === 'AccreditationAdmin',
    canVet: admin || role === 'AccreditationAdmin' || role === 'SecurityManager',
    canWork: admin || ['AccreditationAdmin', 'SecurityManager', 'DataEntryClerk'].includes(role),
    canPrint: admin || ['AccreditationAdmin', 'SecurityManager', 'PrintOperator'].includes(role),
  }
}

/** Accreditation-only roles never see the invitation system. */
export function isAccreditationOnly(role: string | undefined) {
  return Boolean(role && role !== 'Administrator')
}

/* ---------------- Formatting ---------------- */

export function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Field errors from an API error, keyed by field name. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.errors) return {}
  return Object.fromEntries(Object.entries(error.errors).map(([key, messages]) => [key, messages[0] ?? '']))
}

export function slugKey(value: string, fallback: string) {
  const key = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  return key || `${fallback}_${Math.random().toString(36).slice(2, 7)}`
}

/* ---------------- Small pieces ---------------- */

export function StageChip({ stage, fallback }: { stage: AccStage | undefined; fallback?: string }) {
  const color = stage?.color ?? '#7a8ea8'
  return (
    <span
      className="inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 text-xs font-medium"
      style={{ backgroundColor: `${color.slice(0, 7)}26`, color: color.slice(0, 7) }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color.slice(0, 7) }} aria-hidden="true" />
      {stage?.name ?? fallback ?? 'Unknown stage'}
    </span>
  )
}

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ backgroundColor: color }} />
}

export function Section({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'teal' | 'amber' | 'rose' }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'teal' && 'text-accent',
          tone === 'amber' && 'text-warning',
          tone === 'rose' && 'text-danger',
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** Loads a private file (photo) through a signed-in request and shows it. */
export function PrivateImage({
  fileId,
  load,
  alt,
  className,
}: {
  fileId: string | null
  load: (fileId: string) => Promise<Blob>
  alt: string
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    if (!fileId) return
    let cancelled = false
    let objectUrl: string | null = null
    setFailed(false)
    loadRef
      .current(fileId)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [fileId])

  return (
    <span className={cn('flex items-center justify-center overflow-hidden rounded-md bg-hover text-muted', className)}>
      {!fileId ? (
        <UserRound className="size-1/2" aria-hidden="true" />
      ) : failed ? (
        <ImageOff className="size-1/3" aria-hidden="true" />
      ) : url ? (
        <img src={url} alt={alt} className="size-full object-cover" />
      ) : (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      )}
    </span>
  )
}

/** Opens a private file in a new tab. */
export async function openPrivateFile(fileId: string, load: (fileId: string) => Promise<Blob>) {
  const opened = window.open('', '_blank')
  try {
    const blob = await load(fileId)
    const url = URL.createObjectURL(blob)
    if (opened) opened.location.href = url
    else window.location.href = url
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    opened?.close()
    throw error
  }
}

/* ---------------- Applicant form ---------------- */

export type FormType = { id: string | null; name: string; fields: AccField[]; documents: AccDocumentRule[] }

export type ApplicantFormValue = {
  organizationId: string | null
  applicantTypeId: string | null
  firstName: string
  lastName: string
  email: string
  phone: string
  jobTitle: string
  nationality: string
  dateOfBirth: string
  idNumber: string
  photo: { fileId: string; preview: string | null } | null
  customFields: Record<string, string>
  documents: Record<string, { fileId: string; fileName: string; expiresOn: string }>
}

export function emptyApplicant(typeId: string | null, organizationId: string | null = null): ApplicantFormValue {
  return {
    organizationId,
    applicantTypeId: typeId,
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    jobTitle: '',
    nationality: '',
    dateOfBirth: '',
    idNumber: '',
    photo: null,
    customFields: {},
    documents: {},
  }
}

export function toWriteRequest(value: ApplicantFormValue) {
  const blank = (text: string) => (text.trim() ? text.trim() : null)
  return {
    organizationId: value.organizationId,
    applicantTypeId: value.applicantTypeId,
    firstName: value.firstName.trim(),
    lastName: value.lastName.trim(),
    email: blank(value.email),
    phone: blank(value.phone),
    jobTitle: blank(value.jobTitle),
    nationality: blank(value.nationality),
    dateOfBirth: blank(value.dateOfBirth),
    idNumber: blank(value.idNumber),
    photoFileId: value.photo?.fileId ?? null,
    customFields: Object.fromEntries(Object.entries(value.customFields).map(([key, text]) => [key, blank(text)])),
    documents: Object.entries(value.documents).map(([kind, document]) => ({
      kind,
      label: null,
      fileId: document.fileId,
      expiresOn: blank(document.expiresOn),
    })),
  }
}

const inputClass =
  'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground transition-colors placeholder:text-placeholder focus:border-accent disabled:opacity-50'

function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
      {error ? <span className="text-sm text-danger">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

function UploadButton({
  accept,
  label,
  busy,
  onPick,
}: {
  accept: string
  label: string
  busy: boolean
  onPick: (file: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onPick(file)
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm hover:bg-hover disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
        {label}
      </button>
    </>
  )
}

/**
 * The applicant form used by staff, the organisation portal and the public application page.
 * `strict` marks required documents / photo (portal and public must provide them).
 */
export function ApplicantForm({
  value,
  onChange,
  types,
  organizations,
  strict,
  errors,
  upload,
  existingPhoto,
  idMasked,
  hideType,
}: {
  value: ApplicantFormValue
  onChange: (value: ApplicantFormValue) => void
  types: FormType[]
  organizations?: { id: string; name: string }[]
  strict: boolean
  errors: Record<string, string>
  upload: (file: File) => Promise<AccFile>
  existingPhoto?: ReactNode
  idMasked?: string | null
  hideType?: boolean
}) {
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const type = types.find((item) => item.id === value.applicantTypeId) ?? null
  const set = (patch: Partial<ApplicantFormValue>) => onChange({ ...value, ...patch })

  async function pick(slot: string, file: File, done: (saved: AccFile) => void) {
    setUploading(slot)
    setUploadError(null)
    try {
      done(await upload(file))
    } catch (error) {
      setUploadError(errorMessage(error, 'The file could not be uploaded.'))
    } finally {
      setUploading(null)
    }
  }

  return (
    <div className="grid gap-6">
      {organizations || !hideType ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {organizations ? (
            <Field label="Organisation" error={errors.organizationId}>
              <select className={inputClass} value={value.organizationId ?? ''} onChange={(event) => set({ organizationId: event.target.value || null })}>
                <option value="">Individual / direct</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {!hideType ? (
            <Field label="Applying as" required={strict} error={errors.applicantTypeId}>
              <select
                className={inputClass}
                value={value.applicantTypeId ?? ''}
                onChange={(event) => set({ applicantTypeId: event.target.value || null, customFields: {}, documents: {} })}
              >
                <option value="">{strict ? 'Choose…' : 'No type'}</option>
                {types.map((item) => (
                  <option key={item.id ?? item.name} value={item.id ?? ''}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-[8rem_1fr]">
        <div className="grid content-start gap-2">
          <span className="text-sm font-medium">
            Photo{strict ? <span className="text-danger"> *</span> : null}
          </span>
          <span className="flex aspect-[3/4] w-32 items-center justify-center overflow-hidden rounded-md border border-border bg-hover">
            {value.photo?.preview ? (
              <img src={value.photo.preview} alt="New photo" className="size-full object-cover" />
            ) : existingPhoto ? (
              existingPhoto
            ) : (
              <UserRound className="size-10 text-muted" aria-hidden="true" />
            )}
          </span>
          <UploadButton
            accept="image/jpeg,image/png,image/webp"
            label={value.photo || existingPhoto ? 'Replace' : 'Upload'}
            busy={uploading === 'photo'}
            onPick={(file) =>
              void pick('photo', file, (saved) => set({ photo: { fileId: saved.id, preview: URL.createObjectURL(file) } }))
            }
          />
          {errors.photoFileId ? <span className="text-sm text-danger">{errors.photoFileId}</span> : (
            <span className="text-xs text-muted">Passport-style, face visible.</span>
          )}
        </div>
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Field label="First name" required error={errors.firstName}>
            <input className={inputClass} value={value.firstName} onChange={(event) => set({ firstName: event.target.value })} autoComplete="given-name" />
          </Field>
          <Field label="Last name" required error={errors.lastName}>
            <input className={inputClass} value={value.lastName} onChange={(event) => set({ lastName: event.target.value })} autoComplete="family-name" />
          </Field>
          <Field label="Email" error={errors.email}>
            <input className={inputClass} type="email" value={value.email} onChange={(event) => set({ email: event.target.value })} autoComplete="email" />
          </Field>
          <Field label="Mobile" error={errors.phone}>
            <input className={inputClass} type="tel" value={value.phone} onChange={(event) => set({ phone: event.target.value })} autoComplete="tel" />
          </Field>
          <Field label="Role / job title" error={errors.jobTitle}>
            <input className={inputClass} value={value.jobTitle} onChange={(event) => set({ jobTitle: event.target.value })} />
          </Field>
          <Field label="Nationality" error={errors.nationality}>
            <input className={inputClass} value={value.nationality} onChange={(event) => set({ nationality: event.target.value })} />
          </Field>
          <Field label="Date of birth" error={errors.dateOfBirth}>
            <input className={inputClass} type="date" value={value.dateOfBirth} onChange={(event) => set({ dateOfBirth: event.target.value })} />
          </Field>
          <Field
            label="Passport / ID number"
            error={errors.idNumber}
            hint={idMasked ? `Stored as ${idMasked}. Leave blank to keep it.` : 'Stored encrypted; staff see only the last 4 characters.'}
          >
            <input className={inputClass} value={value.idNumber} onChange={(event) => set({ idNumber: event.target.value })} autoComplete="off" />
          </Field>
        </div>
      </div>

      {type && type.fields.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">{type.name} details</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {type.fields.map((field) => {
              const current = value.customFields[field.key] ?? ''
              const update = (text: string) => set({ customFields: { ...value.customFields, [field.key]: text } })
              return (
                <Field key={field.key} label={field.label} required={field.required && strict} error={errors[`customFields.${field.key}`]}>
                  {field.type === 'textarea' ? (
                    <textarea
                      className={cn(inputClass, 'h-24 py-2')}
                      value={current}
                      onChange={(event) => update(event.target.value)}
                    />
                  ) : field.type === 'select' ? (
                    <select className={inputClass} value={current} onChange={(event) => update(event.target.value)}>
                      <option value="">Choose…</option>
                      {(field.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={inputClass}
                      type={field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text'}
                      value={current}
                      onChange={(event) => update(event.target.value)}
                    />
                  )}
                </Field>
              )
            })}
          </div>
        </div>
      ) : null}

      {type && type.documents.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Documents</h3>
          <p className="mt-0.5 text-xs text-muted">JPG, PNG, WEBP or PDF, up to 10 MB each.</p>
          <ul className="mt-3 divide-y divide-border rounded-md border border-border">
            {type.documents.map((rule) => {
              const current = value.documents[rule.key]
              return (
                <li key={rule.key} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {rule.label}
                      {rule.required && strict ? <span className="text-danger"> *</span> : null}
                    </p>
                    {current ? (
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-accent">
                        <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                        {current.fileName}
                      </p>
                    ) : null}
                    {errors[`documents.${rule.key}`] ? <p className="mt-1 text-sm text-danger">{errors[`documents.${rule.key}`]}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {rule.needsExpiry && current ? (
                      <label className="flex items-center gap-2 text-xs text-muted">
                        Expires
                        <input
                          type="date"
                          className={cn(inputClass, 'h-9 w-40')}
                          value={current.expiresOn}
                          onChange={(event) =>
                            set({ documents: { ...value.documents, [rule.key]: { ...current, expiresOn: event.target.value } } })
                          }
                        />
                      </label>
                    ) : null}
                    <UploadButton
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      label={current ? 'Replace' : 'Upload'}
                      busy={uploading === rule.key}
                      onPick={(file) =>
                        void pick(rule.key, file, (saved) =>
                          set({
                            documents: {
                              ...value.documents,
                              [rule.key]: { fileId: saved.id, fileName: saved.fileName, expiresOn: current?.expiresOn ?? '' },
                            },
                          }),
                        )
                      }
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {uploadError ? (
        <p role="alert" className="text-sm text-danger">
          {uploadError}
        </p>
      ) : null}
    </div>
  )
}

/* ---------------- Bulk upload (spreadsheet) ---------------- */

export const bulkColumns = [
  { key: 'firstName', label: 'First name', aliases: ['first name', 'firstname', 'given name', 'first'] },
  { key: 'lastName', label: 'Last name', aliases: ['last name', 'lastname', 'surname', 'family name', 'last'] },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'email address'] },
  { key: 'phone', label: 'Mobile', aliases: ['phone', 'mobile', 'phone number', 'mobile number'] },
  { key: 'jobTitle', label: 'Role / job title', aliases: ['role', 'job title', 'title', 'position', 'designation'] },
  { key: 'nationality', label: 'Nationality', aliases: ['nationality', 'country'] },
  { key: 'dateOfBirth', label: 'Date of birth', aliases: ['date of birth', 'dob', 'birth date', 'birthdate'] },
  { key: 'idNumber', label: 'Passport / ID number', aliases: ['passport', 'passport number', 'id', 'id number', 'national id', 'emirates id'] },
  { key: 'applicantType', label: 'Applicant type', aliases: ['type', 'applicant type', 'category'] },
  { key: 'photo', label: 'Photo file name', aliases: ['photo', 'photo file', 'image', 'picture'] },
] as const

export type BulkColumnKey = (typeof bulkColumns)[number]['key']

export function guessColumn(header: string): BulkColumnKey | '' {
  const normalized = header.trim().toLowerCase()
  const match = bulkColumns.find((column) => (column.aliases as readonly string[]).includes(normalized))
  return match?.key ?? ''
}
