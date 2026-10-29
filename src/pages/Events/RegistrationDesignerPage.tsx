import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { fontApi } from '@/api/fontApi'
import { invitationApi } from '@/api/invitationApi'
import { registrationApi, type QuestionType, type RegistrationPreviewView, type RegistrationQuestion, type RegistrationSettings } from '@/api/registrationApi'
import { Button } from '@/components/ui/Button'
import { DesignerShell, PanelSection, PanelTabs, useZoom } from '@/designer/DesignerShell'
import { EventDesignerSwitcher } from '@/designer/DesignerSwitcher'
import { ColourField, ImageField, Segmented, TextField } from '@/designer/PageFields'
import { PreviewStage } from '@/designer/PreviewStage'
import { useHistory } from '@/designer/useHistory'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { cn } from '@/lib/cn'

const questionTypes: { value: QuestionType; label: string }[] = [
  { value: 'text', label: 'Short answer' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'select', label: 'Dropdown' },
  { value: 'yesno', label: 'Yes / No' },
]

type Device = 'phone' | 'desktop'
const devices: Record<Device, { width: number; height: number }> = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
}

/** Tidy before saving: drop blank questions and empty choices. */
export function cleanRegistration(settings: RegistrationSettings): RegistrationSettings {
  return {
    ...settings,
    questions: settings.questions
      .filter((question) => question.label.trim())
      .map((question) => ({ ...question, options: question.type === 'select' ? (question.options ?? []).map((option) => option.trim()).filter(Boolean) : null })),
  }
}

/** Self-registration page designer: form fields, questions, wording and look, with a live preview. */
export function RegistrationDesignerPage() {
  const { eventId = '' } = useParams()
  const event = useEvent(eventId).data
  useDocumentTitle('Self-registration page')
  const query = useQuery({ queryKey: ['registration', eventId], queryFn: () => registrationApi.get(eventId), enabled: Boolean(eventId) })

  if (query.isLoading || !event) return <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted">Loading the registration page…</div>
  if (query.isError || !query.data) return <div className="flex h-dvh items-center justify-center bg-background text-sm text-danger">The registration page could not be loaded.</div>
  return <Designer key={eventId} eventId={eventId} eventName={event.name} initial={query.data.settings} />
}

function Designer({ eventId, eventName, initial }: { eventId: string; eventName: string; initial: RegistrationSettings }) {
  const queryClient = useQueryClient()
  const history = useHistory<RegistrationSettings>(initial)
  const draft = history.present
  const [saved, setSaved] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<RegistrationPreviewView>('form')
  const [device, setDevice] = useState<Device>('phone')
  const [uploading, setUploading] = useState<'background' | 'logo' | null>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewBusy, setPreviewBusy] = useState(false)
  const zoom = useZoom()
  const fontsQuery = useQuery({ queryKey: ['event-fonts', eventId], queryFn: () => fontApi.list(eventId) })
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const set = (change: Partial<RegistrationSettings>) => history.commit((current) => ({ ...current, ...change }))

  // Live preview, redrawn shortly after each change.
  const previewKey = useMemo(() => JSON.stringify(draft) + view, [draft, view])
  const timer = useRef<number | null>(null)
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setPreviewBusy(true)
      registrationApi
        .preview(eventId, draft, view)
        .then(setPreviewHtml)
        .catch(() => undefined)
        .finally(() => setPreviewBusy(false))
    }, 400)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [previewKey]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function save() {
    setSaving(true)
    try {
      // Publishing settings live on the Self-registration tab: keep what is saved there.
      const latest = (await registrationApi.get(eventId)).settings
      const merged: RegistrationSettings = {
        ...draft,
        open: latest.open,
        guestTypeId: latest.guestTypeId,
        guestGroupId: latest.guestGroupId,
        closesOn: latest.closesOn,
        capacity: latest.capacity,
      }
      const info = await registrationApi.save(eventId, cleanRegistration(merged))
      queryClient.setQueryData(['registration', eventId], info)
      setSaved(info.settings)
      history.reset(info.settings)
      toast.success('Registration page saved.')
      return true
    } catch (error) {
      const field = error instanceof ApiError && error.errors ? Object.values(error.errors)[0]?.[0] : undefined
      toast.error(field ?? (error instanceof ApiError ? error.message : 'The registration page could not be saved.'))
      return false
    } finally {
      setSaving(false)
    }
  }

  function updateQuestion(index: number, change: Partial<RegistrationQuestion>) {
    history.commit((current) => ({ ...current, questions: current.questions.map((question, position) => (position === index ? { ...question, ...change } : question)) }))
  }

  function moveQuestion(index: number, delta: number) {
    history.commit((current) => {
      const list = [...current.questions]
      const target = index + delta
      if (target < 0 || target >= list.length) return current
      ;[list[index], list[target]] = [list[target], list[index]]
      return { ...current, questions: list }
    })
  }

  /* ---------------- panels ---------------- */
  const form = (
    <>
      <PanelSection title="Details asked" hint="Full name is always asked.">
        <ul className="grid gap-2">
          {draft.fields.map((field, index) => {
            const locked = field.key === 'name'
            const change = (patch: Partial<typeof field>) =>
              history.commit((current) => ({ ...current, fields: current.fields.map((item, position) => (position === index ? { ...item, ...patch } : item)) }))
            return (
              <li key={field.key} className={cn('rounded-md border border-border p-2.5', !field.enabled && 'opacity-60')}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium capitalize text-muted">{field.key}</span>
                  <span className="flex items-center gap-3 text-xs">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" className="size-3.5" checked={field.enabled} disabled={locked} onChange={(event) => change({ enabled: event.target.checked, required: event.target.checked && field.required })} />
                      Show
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" className="size-3.5" checked={field.required} disabled={locked || !field.enabled} onChange={(event) => change({ required: event.target.checked })} />
                      Required
                    </label>
                  </span>
                </div>
                <input
                  aria-label={`${field.key} label`}
                  className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm"
                  value={field.label}
                  onChange={(event) => change({ label: event.target.value })}
                />
              </li>
            )
          })}
        </ul>
      </PanelSection>

      <PanelSection title="Your questions" hint="Dietary needs, attendance day, how they heard about the event…">
        <div className="grid gap-2">
          {draft.questions.length === 0 ? <p className="text-xs text-muted">No questions yet.</p> : null}
          {draft.questions.map((question, index) => (
            <div key={question.id} className="grid gap-2 rounded-md border border-border p-2.5">
              <input
                aria-label="Question"
                className="h-8 rounded-md border border-border bg-background px-2.5 text-sm"
                value={question.label}
                placeholder="e.g. Any dietary requirements?"
                onChange={(event) => updateQuestion(index, { label: event.target.value })}
              />
              <select
                aria-label="Answer type"
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                value={question.type}
                onChange={(event) => {
                  const type = event.target.value as QuestionType
                  updateQuestion(index, { type, options: type === 'select' ? (question.options ?? ['Option 1', 'Option 2']) : null })
                }}
              >
                {questionTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              {question.type === 'select' ? (
                <label className="grid gap-1 text-xs">
                  <span className="text-muted">Choices, one per line</span>
                  <textarea
                    rows={3}
                    className="rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                    value={(question.options ?? []).join('\n')}
                    onChange={(event) => updateQuestion(index, { options: event.target.value.split('\n') })}
                  />
                </label>
              ) : question.type === 'text' || question.type === 'textarea' ? (
                <input
                  aria-label="Placeholder"
                  placeholder="Placeholder (optional)"
                  className="h-8 rounded-md border border-border bg-background px-2.5 text-sm"
                  value={question.placeholder ?? ''}
                  onChange={(event) => updateQuestion(index, { placeholder: event.target.value || null })}
                />
              ) : null}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" className="size-3.5" checked={question.required} onChange={(event) => updateQuestion(index, { required: event.target.checked })} />
                  Required
                </label>
                <span className="flex items-center">
                  <MiniButton label="Move up" disabled={index === 0} onClick={() => moveQuestion(index, -1)}>
                    <ArrowUp className="size-3.5" />
                  </MiniButton>
                  <MiniButton label="Move down" disabled={index === draft.questions.length - 1} onClick={() => moveQuestion(index, 1)}>
                    <ArrowDown className="size-3.5" />
                  </MiniButton>
                  <MiniButton label="Delete question" danger onClick={() => history.commit((current) => ({ ...current, questions: current.questions.filter((_, position) => position !== index) }))}>
                    <Trash2 className="size-3.5" />
                  </MiniButton>
                </span>
              </div>
            </div>
          ))}
          <Button
            variant="secondary"
            className="h-9"
            disabled={draft.questions.length >= 20}
            onClick={() =>
              history.commit((current) => ({
                ...current,
                questions: [...current.questions, { id: crypto.randomUUID().replaceAll('-', '').slice(0, 12), label: '', type: 'text', required: false, options: null, placeholder: null }],
              }))
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            Add question
          </Button>
        </div>
      </PanelSection>
    </>
  )

  const wording = (
    <>
      <PanelSection title="Form">
        <div className="grid gap-2.5">
          <TextField label="Page title" value={draft.title} onChange={(title) => set({ title })} />
          <TextField label="Introduction" area value={draft.intro} onChange={(intro) => set({ intro })} />
          <TextField label="Submit button" value={draft.submitButton} onChange={(submitButton) => set({ submitButton })} />
        </div>
      </PanelSection>
      <PanelSection title="Thank you">
        <div className="grid gap-2.5">
          <TextField label="Title" value={draft.successTitle} onChange={(successTitle) => set({ successTitle })} />
          <TextField label="Message" area value={draft.successText} onChange={(successText) => set({ successText })} />
          <TextField label="Download digital pass button" value={draft.downloadButton} onChange={(downloadButton) => set({ downloadButton })} />
          <TextField label="Apple Wallet button" value={draft.walletButton} onChange={(walletButton) => set({ walletButton })} />
        </div>
      </PanelSection>
      <PanelSection title="Closed">
        <TextField label="Message when registration is closed" area value={draft.closedText} onChange={(closedText) => set({ closedText })} />
      </PanelSection>
    </>
  )

  const look = (
    <>
      <PanelSection title="Images">
        <div className="grid gap-3">
          <ImageField label="Background image" assetId={draft.backgroundAssetId} busy={uploading === 'background'} onFile={(file) => void upload('background', file)} onClear={() => set({ backgroundAssetId: null })} />
          <ImageField label="Logo" contain assetId={draft.logoAssetId} busy={uploading === 'logo'} onFile={(file) => void upload('logo', file)} onClear={() => set({ logoAssetId: null })} />
        </div>
      </PanelSection>
      <PanelSection title="Font">
        <select aria-label="Font" className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm" value={draft.fontId ?? ''} onChange={(event) => set({ fontId: event.target.value || null })}>
          <option value="">Inter (default)</option>
          {(fontsQuery.data ?? []).map((font) => (
            <option key={font.id} value={font.id}>
              {font.name}
            </option>
          ))}
        </select>
      </PanelSection>
      <PanelSection title="Colours">
        <div className="grid gap-2.5">
          <ColourField label="Background" value={draft.backgroundColor} onChange={(backgroundColor) => set({ backgroundColor })} />
          <ColourField label="Card" value={draft.cardColor} onChange={(cardColor) => set({ cardColor })} />
          <ColourField label="Text" value={draft.textColor} onChange={(textColor) => set({ textColor })} />
          <ColourField label="Button" value={draft.accentColor} onChange={(accentColor) => set({ accentColor })} />
          <ColourField label="Button text" value={draft.accentTextColor} onChange={(accentTextColor) => set({ accentTextColor })} />
        </div>
      </PanelSection>
      <p className="text-xs text-muted">Publishing, the link and QR code, where sign-ups go and limits are on the Self-registration tab.</p>
    </>
  )

  return (
    <DesignerShell
      title="Self-registration page"
      subtitle={eventName}
      backLabel="Designs"
      backTo={`/events/${eventId}/designs`}
      switcher={<EventDesignerSwitcher eventId={eventId} kind="registration" />}
      history={history}
      zoom={{ value: zoom.value, fit: zoom.fit, set: zoom.set }}
      save={{ dirty, saving, onSave: save }}
      canvasTools={false}
      left={
        <PanelTabs
          tabs={[
            { key: 'form', label: 'Form', content: form },
            { key: 'wording', label: 'Wording', content: wording },
          ]}
        />
      }
      right={look}
    >
      <PreviewStage
        width={devices[device].width}
        height={devices[device].height}
        zoom={zoom.value}
        onZoom={zoom.set}
        onFitChange={zoom.setFit}
        toolbar={
          <>
            <Segmented
              label="Page"
              value={view}
              onChange={setView}
              options={[
                ['form', 'Form'],
                ['done', 'Thank you'],
                ['closed', 'Closed'],
              ]}
            />
            <Segmented
              label="Device"
              value={device}
              onChange={(next) => {
                setDevice(next)
                zoom.set('fit')
              }}
              options={[
                ['phone', 'Phone'],
                ['desktop', 'Desktop'],
              ]}
            />
            {previewBusy ? <Loader2 className="size-4 animate-spin text-muted" aria-label="Updating preview" /> : null}
          </>
        }
        note="The preview does not save anything. Scroll inside it to see the whole page."
      >
        <iframe title="Registration page preview" sandbox="allow-scripts" srcDoc={previewHtml} className="block size-full border-0 bg-white" />
      </PreviewStage>
    </DesignerShell>
  )
}

function MiniButton({ label, disabled, danger, onClick, children }: { label: string; disabled?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('flex size-7 items-center justify-center rounded-md text-muted disabled:opacity-40', danger ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-hover hover:text-foreground')}
    >
      {children}
    </button>
  )
}
