import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Info,
  Loader2,
  Plus,
  QrCode,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError, apiBaseUrl } from '@/api/client'
import { fontApi } from '@/api/fontApi'
import { guestGroupApi } from '@/api/guestGroupApi'
import { guestTypeApi } from '@/api/guestTypeApi'
import { invitationApi } from '@/api/invitationApi'
import {
  registrationApi,
  type QuestionType,
  type RegistrationPreviewView,
  type RegistrationQuestion,
  type RegistrationSettings,
} from '@/api/registrationApi'
import { AlphaColorInput } from '@/components/ui/AlphaColorInput'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/StatusBadge'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { cn } from '@/lib/cn'

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: 'text', label: 'Short answer' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'select', label: 'Dropdown' },
  { value: 'yesno', label: 'Yes / No' },
]

/**
 * Self-registration (direct RSVP): design the public form, choose where sign-ups go, publish it on
 * eventdomain.com/register and share its QR code. Each sign-up joins the guest list as Accepted.
 */
export function RegistrationPage() {
  const { eventId = '' } = useParams()
  const event = useEvent(eventId).data
  useDocumentTitle(event ? `Self-registration · ${event.name}` : 'Self-registration')
  const queryClient = useQueryClient()

  const query = useQuery({ queryKey: ['registration', eventId], queryFn: () => registrationApi.get(eventId), enabled: Boolean(eventId), refetchInterval: 30_000 })
  const typesQuery = useQuery({ queryKey: ['guest-types', eventId], queryFn: () => guestTypeApi.list(eventId), enabled: Boolean(eventId) })
  const groupsQuery = useQuery({ queryKey: ['guest-groups', eventId], queryFn: () => guestGroupApi.list(eventId), enabled: Boolean(eventId) })
  const fontsQuery = useQuery({ queryKey: ['event-fonts', eventId], queryFn: () => fontApi.list(eventId), enabled: Boolean(eventId) })

  const [draft, setDraft] = useState<RegistrationSettings | null>(null)
  const [uploading, setUploading] = useState<'background' | 'logo' | null>(null)
  const [view, setView] = useState<RegistrationPreviewView>('form')
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewBusy, setPreviewBusy] = useState(false)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const saved = query.data?.settings

  // Load the saved settings once (and again after each save).
  useEffect(() => {
    if (saved && !draft) setDraft(saved)
  }, [saved, draft])

  // QR code for the public page (refreshed when the address changes).
  const publicUrl = query.data?.publicUrl
  useEffect(() => {
    if (!publicUrl) return
    let url: string | null = null
    let cancelled = false
    registrationApi
      .qr(eventId)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setQrUrl(url)
      })
      .catch(() => setQrUrl(null))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [eventId, publicUrl])

  // Live preview, redrawn shortly after each change.
  const previewKey = useMemo(() => (draft ? JSON.stringify(draft) + view : ''), [draft, view])
  const previewTimer = useRef<number | null>(null)
  useEffect(() => {
    if (!draft) return
    if (previewTimer.current) window.clearTimeout(previewTimer.current)
    previewTimer.current = window.setTimeout(() => {
      setPreviewBusy(true)
      registrationApi
        .preview(eventId, draft, view)
        .then(setPreviewHtml)
        .catch(() => undefined)
        .finally(() => setPreviewBusy(false))
    }, 500)
    return () => {
      if (previewTimer.current) window.clearTimeout(previewTimer.current)
    }
  }, [previewKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (value: RegistrationSettings) => registrationApi.save(eventId, value),
    onSuccess: (info) => {
      queryClient.setQueryData(['registration', eventId], info)
      setDraft(info.settings)
      toast.success(info.acceptingNow ? 'Registration page saved and live.' : 'Registration page saved.')
    },
    onError: (error) => {
      const field = error instanceof ApiError && error.errors ? Object.values(error.errors)[0]?.[0] : undefined
      toast.error(field ?? (error instanceof ApiError ? error.message : 'The registration page could not be saved.'))
    },
  })

  if (!event) return null
  if (query.isLoading || !draft || !query.data) return <p className="text-sm text-muted">Loading the registration page…</p>

  const info = query.data
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const set = (change: Partial<RegistrationSettings>) => setDraft({ ...draft, ...change })
  const types = typesQuery.data ?? []
  const chosenType = types.find((type) => type.id === draft.guestTypeId)

  async function upload(kind: 'background' | 'logo', file: File) {
    setUploading(kind)
    try {
      const asset = await invitationApi.uploadAsset(eventId, file)
      set(kind === 'background' ? { backgroundAssetId: asset.id } : { logoAssetId: asset.id })
    } catch {
      toast.error('The image could not be uploaded. Use a PNG, JPG or WEBP up to 15 MB.')
    } finally {
      setUploading(null)
    }
  }

  function updateQuestion(index: number, change: Partial<RegistrationQuestion>) {
    set({ questions: draft!.questions.map((question, position) => (position === index ? { ...question, ...change } : question)) })
  }

  function moveQuestion(index: number, delta: number) {
    const list = [...draft!.questions]
    const target = index + delta
    if (target < 0 || target >= list.length) return
    ;[list[index], list[target]] = [list[target], list[index]]
    set({ questions: list })
  }

  const state = !info.eventActive
    ? { tone: 'amber' as const, label: event.status === 'Archived' ? 'Archived' : 'Event not live' }
    : info.acceptingNow
      ? { tone: 'teal' as const, label: 'Live' }
      : { tone: 'gray' as const, label: draft.open ? 'Closed' : 'Not published' }

  return (
    <div className="flex flex-col gap-6">
      {/* Publish card */}
      <section className="rounded-md border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold tracking-tight">Self-registration</h2>
              <Badge tone={state.tone}>{state.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">{info.stateText}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to={`/events/${eventId}/guests`}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-hover"
              title="Registrations join the guest list as Accepted"
            >
              <Users className="size-4 text-accent" aria-hidden="true" />
              <span className="tabular-nums font-semibold">{info.registrations}</span>
              <span className="text-muted">registered</span>
            </Link>
            <Toggle
              label="Accept registrations"
              checked={draft.open}
              onChange={(open) => set({ open })}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-5 border-t border-border pt-5 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Public link</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2.5 text-sm">{info.publicUrl}</code>
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(info.publicUrl).then(() => toast.success('Link copied.'))
                }}
              >
                <Copy className="size-4" aria-hidden="true" />
                Copy
              </Button>
              <Button variant="secondary" onClick={() => window.open(info.publicUrl, '_blank', 'noopener')}>
                <ExternalLink className="size-4" aria-hidden="true" />
                Open
              </Button>
            </div>
            <p className="mt-2 flex items-start gap-2 text-xs text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
              {info.onEventDomain
                ? 'On the event’s own domain. Share the link or the QR code on posters, emails and social media.'
                : 'Set up and confirm the event domain (event settings) to use eventdomain.com/register. Until then this app address works.'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex size-32 items-center justify-center rounded-md bg-white p-2">
              {qrUrl ? <img src={qrUrl} alt="QR code to the registration page" className="size-full" /> : <QrCode className="size-8 text-neutral-400" aria-hidden="true" />}
            </div>
            <div className="grid gap-2">
              <Button
                variant="secondary"
                disabled={!qrUrl}
                onClick={() => {
                  if (!qrUrl) return
                  const link = document.createElement('a')
                  link.href = qrUrl
                  link.download = `${event.slug || 'event'}-registration-qr.png`
                  link.click()
                }}
              >
                <Download className="size-4" aria-hidden="true" />
                Download QR
              </Button>
              <p className="max-w-40 text-xs text-muted">High-resolution PNG for print.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-12">
        {/* Settings */}
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-7">
          <Step number="01" title="Form fields" subtitle="Built-in details. Full name is always asked.">
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-background">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2.5">Field</th>
                    <th className="px-3 py-2.5">Label on the form</th>
                    <th className="w-20 px-3 py-2.5 text-center">Show</th>
                    <th className="w-24 px-3 py-2.5 text-center">Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {draft.fields.map((field, index) => {
                    const locked = field.key === 'name'
                    const change = (patch: Partial<typeof field>) =>
                      set({ fields: draft.fields.map((item, position) => (position === index ? { ...item, ...patch } : item)) })
                    return (
                      <tr key={field.key} className={cn(!field.enabled && 'opacity-60')}>
                        <td className="px-3 py-2 capitalize text-muted">{field.key}</td>
                        <td className="px-3 py-2">
                          <input
                            aria-label={`${field.key} label`}
                            className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm"
                            value={field.label}
                            onChange={(change2) => change({ label: change2.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Check aria-label={`Show ${field.key}`} checked={field.enabled} disabled={locked} onChange={(enabled) => change({ enabled, required: enabled && field.required })} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Check aria-label={`${field.key} required`} checked={field.required} disabled={locked || !field.enabled} onChange={(required) => change({ required })} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              Guests with an email or mobile already on the list are updated instead of added twice. Company and custom answers are saved on the guest.
            </p>
          </Step>

          <Step number="02" title="Custom questions" subtitle="Dietary needs, attendance day, how they heard about the event…">
            {draft.questions.length === 0 ? <p className="text-sm text-muted">No custom questions yet.</p> : null}
            <div className="grid gap-3">
              {draft.questions.map((question, index) => (
                <div key={question.id} className="rounded-md border border-border p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem]">
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium">Question</span>
                      <input
                        className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                        value={question.label}
                        placeholder="e.g. Any dietary requirements?"
                        onChange={(change) => updateQuestion(index, { label: change.target.value })}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium">Answer type</span>
                      <select
                        className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                        value={question.type}
                        onChange={(change) => {
                          const type = change.target.value as QuestionType
                          updateQuestion(index, { type, options: type === 'select' ? question.options ?? ['Option 1', 'Option 2'] : null })
                        }}
                      >
                        {questionTypes.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {question.type === 'select' ? (
                    <label className="mt-3 grid gap-1.5 text-sm">
                      <span className="font-medium">Choices</span>
                      <textarea
                        rows={3}
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={(question.options ?? []).join('\n')}
                        onChange={(change) => updateQuestion(index, { options: change.target.value.split('\n') })}
                      />
                      <span className="text-xs text-muted">One choice per line.</span>
                    </label>
                  ) : question.type === 'text' || question.type === 'textarea' ? (
                    <label className="mt-3 grid gap-1.5 text-sm">
                      <span className="font-medium">Placeholder (optional)</span>
                      <input
                        className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                        value={question.placeholder ?? ''}
                        onChange={(change) => updateQuestion(index, { placeholder: change.target.value || null })}
                      />
                    </label>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Check aria-label="Required" checked={question.required} onChange={(required) => updateQuestion(index, { required })} />
                      Required
                    </label>
                    <div className="flex items-center gap-1">
                      <IconAction label="Move up" disabled={index === 0} onClick={() => moveQuestion(index, -1)}>
                        <ArrowUp className="size-4" />
                      </IconAction>
                      <IconAction label="Move down" disabled={index === draft.questions.length - 1} onClick={() => moveQuestion(index, 1)}>
                        <ArrowDown className="size-4" />
                      </IconAction>
                      <IconAction label="Delete question" danger onClick={() => set({ questions: draft.questions.filter((_, position) => position !== index) })}>
                        <Trash2 className="size-4" />
                      </IconAction>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="secondary"
              className="mt-3"
              disabled={draft.questions.length >= 20}
              onClick={() =>
                set({
                  questions: [
                    ...draft.questions,
                    { id: crypto.randomUUID().replaceAll('-', '').slice(0, 12), label: '', type: 'text', required: false, options: null, placeholder: null },
                  ],
                })
              }
            >
              <Plus className="size-4" aria-hidden="true" />
              Add question
            </Button>
          </Step>

          <Step number="03" title="Where sign-ups go" subtitle="Every registration is added to the guest list as Accepted.">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Guest type</span>
                <select
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={draft.guestTypeId ?? ''}
                  onChange={(change) => set({ guestTypeId: change.target.value || null })}
                >
                  <option value="">No guest type</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                <span className={cn('text-xs', chosenType?.badgeConfigured ? 'text-muted' : 'text-warning')}>
                  {chosenType
                    ? chosenType.badgeConfigured
                      ? 'Guests can download their E-Badge right after registering.'
                      : `${chosenType.name} has no E-Badge design yet; guests will see their QR code only.`
                    : 'Choose a guest type with an E-Badge design so guests can download their badge.'}
                </span>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Group</span>
                <select
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={draft.guestGroupId ?? ''}
                  onChange={(change) => set({ guestGroupId: change.target.value || null })}
                >
                  <option value="">“Self-registered” (created automatically)</option>
                  {(groupsQuery.data ?? []).map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-muted">Keeps registrations together on the Guests page.</span>
              </label>
            </div>
          </Step>

          <Step number="04" title="Wording" subtitle="Everything the guest reads on the page.">
            <div className="grid gap-4">
              <TextInput label="Page title" value={draft.title} onChange={(title) => set({ title })} />
              <TextArea label="Introduction" value={draft.intro} onChange={(intro) => set({ intro })} />
              <div className="grid gap-4 md:grid-cols-2">
                <TextInput label="Submit button" value={draft.submitButton} onChange={(submitButton) => set({ submitButton })} />
                <TextInput label="Thank-you title" value={draft.successTitle} onChange={(successTitle) => set({ successTitle })} />
              </div>
              <TextArea label="Thank-you message" value={draft.successText} onChange={(successText) => set({ successText })} />
              <div className="grid gap-4 md:grid-cols-2">
                <TextInput label="Download E-Badge button" value={draft.downloadButton} onChange={(downloadButton) => set({ downloadButton })} />
                <TextInput label="Apple Wallet button" value={draft.walletButton} onChange={(walletButton) => set({ walletButton })} />
              </div>
              <TextArea label="Message when registration is closed" value={draft.closedText} onChange={(closedText) => set({ closedText })} />
            </div>
          </Step>

          <Step number="05" title="Look" subtitle="Background, logo, font and colours.">
            <div className="grid gap-5 md:grid-cols-2">
              <ImagePick label="Background image" assetId={draft.backgroundAssetId} busy={uploading === 'background'} onFile={(file) => void upload('background', file)} onClear={() => set({ backgroundAssetId: null })} />
              <ImagePick label="Logo" contain assetId={draft.logoAssetId} busy={uploading === 'logo'} onFile={(file) => void upload('logo', file)} onClear={() => set({ logoAssetId: null })} />
            </div>
            <label className="mt-5 grid gap-1.5 text-sm">
              <span className="font-medium">Font</span>
              <select
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={draft.fontId ?? ''}
                onChange={(change) => set({ fontId: change.target.value || null })}
              >
                <option value="">Inter (default)</option>
                {(fontsQuery.data ?? []).map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
              <ColorField label="Background" value={draft.backgroundColor} onChange={(backgroundColor) => set({ backgroundColor })} />
              <ColorField label="Card" value={draft.cardColor} onChange={(cardColor) => set({ cardColor })} />
              <ColorField label="Text" value={draft.textColor} onChange={(textColor) => set({ textColor })} />
              <ColorField label="Button" value={draft.accentColor} onChange={(accentColor) => set({ accentColor })} />
              <ColorField label="Button text" value={draft.accentTextColor} onChange={(accentTextColor) => set({ accentTextColor })} />
            </div>
          </Step>

          <Step number="06" title="Limits" subtitle="Optional. Leave empty for no limit." last>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Closes on</span>
                <input
                  type="datetime-local"
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={toLocalInput(draft.closesOn)}
                  onChange={(change) => set({ closesOn: change.target.value ? new Date(change.target.value).toISOString() : null })}
                />
                <span className="text-xs text-muted">Your local time. The page closes automatically.</span>
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Maximum registrations</span>
                <input
                  type="number"
                  min={1}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={draft.capacity ?? ''}
                  placeholder="No limit"
                  onChange={(change) => set({ capacity: change.target.value ? Math.max(1, Math.round(Number(change.target.value))) : null })}
                />
                <span className="text-xs text-muted tabular-nums">{info.registrations} registered so far.</span>
              </label>
            </div>
          </Step>
        </div>

        {/* Live preview */}
        <div className="xl:col-span-5">
          <div className="sticky top-4 rounded-md border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Preview</p>
              <div className="flex rounded-md border border-border p-0.5">
                {(
                  [
                    ['form', 'Form'],
                    ['done', 'Thank you'],
                    ['closed', 'Closed'],
                  ] as [RegistrationPreviewView, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={view === value}
                    className={cn('h-7 rounded-sm px-2.5 text-xs font-medium', view === value ? 'bg-accent-soft text-accent' : 'text-muted hover:text-foreground')}
                    onClick={() => setView(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-md border border-border bg-background">
              {previewBusy ? <Loader2 className="absolute right-3 top-3 z-10 size-4 animate-spin text-muted" aria-hidden="true" /> : null}
              <iframe title="Registration page preview" sandbox="allow-scripts" srcDoc={previewHtml} className="h-[720px] w-full" />
            </div>
            <p className="mt-2 text-xs text-muted">The preview does not save anything. Save to publish your changes.</p>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background px-1 py-4">
        {dirty ? (
          <>
            <span className="mr-auto text-sm text-muted">You have unsaved changes.</span>
            <Button variant="secondary" onClick={() => setDraft(saved ?? null)}>
              Discard
            </Button>
          </>
        ) : null}
        <Button className="px-6" disabled={!dirty || save.isPending} onClick={() => save.mutate(cleanForSave(draft))}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {save.isPending ? 'Saving…' : draft.open ? 'Save & publish' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

/** Tidy before saving: drop blank questions and empty choices. */
function cleanForSave(settings: RegistrationSettings): RegistrationSettings {
  return {
    ...settings,
    questions: settings.questions
      .filter((question) => question.label.trim())
      .map((question) => ({ ...question, options: question.type === 'select' ? (question.options ?? []).map((option) => option.trim()).filter(Boolean) : null })),
  }
}

function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function Step({ number, title, subtitle, last, children }: { number: string; title: string; subtitle?: string; last?: boolean; children: ReactNode }) {
  return (
    <section className={cn('pb-6', !last && 'border-b border-border')}>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="text-sm font-semibold tabular-nums text-accent">{number}</span>
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="flex items-center gap-2.5 text-sm" onClick={() => onChange(!checked)}>
      <span className={cn('relative h-6 w-11 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-border')}>
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-white transition-all', checked ? 'left-[1.375rem]' : 'left-0.5')} />
      </span>
      <span className="font-medium">{label}</span>
    </button>
  )
}

function Check({ checked, disabled, onChange, ...rest }: { checked: boolean; disabled?: boolean; onChange: (value: boolean) => void; 'aria-label': string }) {
  return (
    <input
      type="checkbox"
      className="size-4 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed"
      checked={checked}
      disabled={disabled}
      onChange={(change) => onChange(change.target.checked)}
      {...rest}
    />
  )
}

function IconAction({ label, disabled, danger, onClick, children }: { label: string; disabled?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted disabled:opacity-40',
        danger ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-hover hover:text-foreground',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input value={value} onChange={(change) => onChange(change.target.value)} className="h-10 rounded-md border border-border bg-background px-3 text-sm" />
    </label>
  )
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <textarea rows={2} value={value} onChange={(change) => onChange(change.target.value)} className="resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed" />
    </label>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid min-w-0 gap-1.5 text-sm">
      <span className="truncate font-medium">{label}</span>
      <AlphaColorInput label={label} value={value} onChange={onChange} />
    </div>
  )
}

function ImagePick({
  label,
  assetId,
  busy,
  contain,
  onFile,
  onClear,
}: {
  label: string
  assetId: string | null
  busy: boolean
  contain?: boolean
  onFile: (file: File) => void
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-4">
      <div className={cn('flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border', contain ? 'bg-background' : 'bg-hover')}>
        {assetId ? (
          <img src={`${apiBaseUrl}/api/public/assets/${assetId}`} alt="" className={cn('size-full', contain ? 'object-contain p-1.5' : 'object-cover')} />
        ) : (
          <ImageIcon className="size-6 text-muted" aria-hidden="true" />
        )}
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-hover">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            {assetId ? 'Replace' : 'Upload'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(change) => {
                const file = change.target.files?.[0]
                change.target.value = ''
                if (file) onFile(file)
              }}
            />
          </label>
          {assetId ? (
            <button type="button" className="text-sm font-medium text-danger hover:underline" onClick={onClear}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
