import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { fontApi } from '@/api/fontApi'
import { invitationApi } from '@/api/invitationApi'
import { rsvpApi, type RsvpPageSettings, type RsvpPreviewView } from '@/api/rsvpApi'
import { DesignerShell, PanelSection, PanelTabs, useZoom } from '@/designer/DesignerShell'
import { EventDesignerSwitcher } from '@/designer/DesignerSwitcher'
import { ColourField, ImageField, Segmented, TextField } from '@/designer/PageFields'
import { PreviewStage } from '@/designer/PreviewStage'
import { useHistory } from '@/designer/useHistory'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'

const DEFAULT_REASONS = ['I have a prior commitment', 'Personal reasons.']

type Device = 'phone' | 'desktop'
const devices: Record<Device, { width: number; height: number }> = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
}

/** Everything the undo history covers. */
type RsvpDesign = { page: RsvpPageSettings; reasons: string; ask: boolean }

const settingsOf = (design: RsvpDesign): RsvpPageSettings => ({
  ...design.page,
  declineReasons: design.reasons
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
})

/** Responses page designer: what guests see after tapping Accept or Decline, with a live preview of each step. */
export function RsvpDesignerPage() {
  const { eventId = '' } = useParams()
  const event = useEvent(eventId).data
  useDocumentTitle('Responses page')
  const page = useQuery({ queryKey: ['rsvp-page', eventId], queryFn: () => rsvpApi.getPage(eventId), enabled: Boolean(eventId) })
  const rsvp = useQuery({ queryKey: ['rsvp', eventId], queryFn: () => rsvpApi.get(eventId), enabled: Boolean(eventId) })

  if (page.isLoading || rsvp.isLoading || !event) return <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted">Loading the responses page…</div>
  if (!page.data || !rsvp.data) return <div className="flex h-dvh items-center justify-center bg-background text-sm text-danger">The responses page could not be loaded.</div>
  return (
    <Designer
      key={eventId}
      eventId={eventId}
      eventName={event.name}
      initial={{ page: page.data, reasons: (page.data.declineReasons ?? DEFAULT_REASONS).join('\n'), ask: rsvp.data.askDeclineReason }}
    />
  )
}

function Designer({ eventId, eventName, initial }: { eventId: string; eventName: string; initial: RsvpDesign }) {
  const queryClient = useQueryClient()
  const history = useHistory<RsvpDesign>(initial)
  const design = history.present
  const draft = design.page
  const [saved, setSaved] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<RsvpPreviewView>('confirm-accept')
  const [device, setDevice] = useState<Device>('phone')
  const [uploading, setUploading] = useState<'background' | 'logo' | null>(null)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewBusy, setPreviewBusy] = useState(false)
  const zoom = useZoom()
  const fontsQuery = useQuery({ queryKey: ['event-fonts', eventId], queryFn: () => fontApi.list(eventId) })
  const dirty = JSON.stringify(design) !== JSON.stringify(saved)

  const set = (change: Partial<RsvpPageSettings>) => history.commit((current) => ({ ...current, page: { ...current.page, ...change } }))
  const text = (key: keyof RsvpPageSettings) => ({
    value: String(draft[key] ?? ''),
    onChange: (value: string) => set({ [key]: value } as Partial<RsvpPageSettings>),
  })

  // Live preview, redrawn shortly after each change.
  const previewKey = useMemo(() => JSON.stringify(design) + view, [design, view])
  const timer = useRef<number | null>(null)
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setPreviewBusy(true)
      rsvpApi
        .previewPage(eventId, settingsOf(design), view)
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
      // Empty texts are left out, so the server uses its default wording instead of rejecting the save.
      const settings = settingsOf(design)
      const next = await rsvpApi.savePage(
        eventId,
        Object.fromEntries(Object.entries(settings).filter(([, item]) => !(typeof item === 'string' && item.trim() === ''))) as RsvpPageSettings,
      )
      if (design.ask !== saved.ask) await rsvpApi.saveSettings(eventId, design.ask)
      queryClient.setQueryData(['rsvp-page', eventId], next)
      void queryClient.invalidateQueries({ queryKey: ['rsvp', eventId] })
      const after: RsvpDesign = { page: next, reasons: (next.declineReasons ?? DEFAULT_REASONS).join('\n'), ask: design.ask }
      setSaved(after)
      history.reset(after)
      toast.success('Responses page saved.')
      return true
    } catch (error) {
      const field = error instanceof ApiError && error.errors ? Object.values(error.errors)[0]?.[0] : undefined
      toast.error(field ?? (error instanceof ApiError ? error.message : 'The responses page could not be saved.'))
      return false
    } finally {
      setSaving(false)
    }
  }

  /* ---------------- panels ---------------- */
  const wording = (
    <>
      <PanelSection title="Confirm" hint="Shown before a guest confirms their reply.">
        <div className="grid gap-2.5">
          <TextField label="Accept confirmation" area {...text('confirmAcceptText')} />
          <TextField label="Accept button" {...text('acceptButton')} />
          <TextField label="Decline confirmation" area {...text('confirmDeclineText')} />
          <TextField label="Decline button" {...text('declineButton')} />
        </div>
      </PanelSection>
      <PanelSection title="After accepting">
        <div className="grid gap-2.5">
          <TextField label="Thank-you message" area {...text('thankYouText')} />
          <TextField label="Text below the QR code" area {...text('qrText')} />
          <TextField label="Download button" {...text('downloadButton')} />
          <TextField label="Wallet button" {...text('walletButton')} />
          <TextField label="Entry information" area {...text('infoText')} />
          <TextField label="Contact line" {...text('contactText')} />
          <TextField label="Sign-off" {...text('signOff')} />
        </div>
      </PanelSection>
      <PanelSection title="After declining">
        <div className="grid gap-2.5">
          <TextField label="Decline thank-you message" area {...text('declineText')} />
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={design.ask}
              onChange={(event) => {
                const ask = event.target.checked
                history.commit((current) => ({ ...current, ask }))
                if (ask) setView('confirm-decline')
              }}
            />
            <span>
              <span className="block font-medium">Ask for a reason when a guest declines</span>
              <span className="block text-xs text-muted">Adds an optional reason field to the decline confirmation.</span>
            </span>
          </label>
          {design.ask ? (
            <>
              <TextField label="Reason question" area {...text('reasonsPrompt')} />
              <TextField
                label="Reasons (one per line; “Other” is always included)"
                area
                value={design.reasons}
                onChange={(reasons) => history.commit((current) => ({ ...current, reasons }))}
              />
            </>
          ) : null}
        </div>
      </PanelSection>
    </>
  )

  const look = (
    <>
      <PanelSection title="Images">
        <div className="grid gap-3">
          <ImageField label="Background image" assetId={draft.backgroundAssetId} busy={uploading === 'background'} onFile={(file) => void upload('background', file)} onClear={() => set({ backgroundAssetId: null })} />
          <ImageField label="Logo (top right)" contain assetId={draft.logoAssetId} busy={uploading === 'logo'} onFile={(file) => void upload('logo', file)} onClear={() => set({ logoAssetId: null })} />
        </div>
      </PanelSection>
      <PanelSection title="Font">
        <select aria-label="Font" className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm" value={draft.fontId ?? ''} onChange={(event) => set({ fontId: event.target.value || null })}>
          <option value="">Manifa Pro / Tahoma (default)</option>
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
          <ColourField label="Text" value={draft.textColor} onChange={(textColor) => set({ textColor })} />
          <ColourField label="Button background" value={draft.buttonColor} onChange={(buttonColor) => set({ buttonColor })} />
          <ColourField label="Button text" value={draft.buttonTextColor} onChange={(buttonTextColor) => set({ buttonTextColor })} />
        </div>
      </PanelSection>
      <p className="text-xs text-muted">Used on the event domain and on guests’ personal invitation links. If the microsite has its own reply pages, those are used instead.</p>
    </>
  )

  return (
    <DesignerShell
      title="Responses page"
      subtitle={eventName}
      backLabel="Designs"
      backTo={`/events/${eventId}/designs`}
      switcher={<EventDesignerSwitcher eventId={eventId} kind="rsvp" />}
      history={history}
      zoom={{ value: zoom.value, fit: zoom.fit, set: zoom.set }}
      save={{ dirty, saving, onSave: save }}
      canvasTools={false}
      left={<PanelTabs tabs={[{ key: 'wording', label: 'Wording', content: wording }]} />}
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
              label="Step"
              value={view}
              onChange={setView}
              options={[
                ['confirm-accept', 'Confirm accept'],
                ['confirm-decline', 'Confirm decline'],
                ['accepted', 'Thank you'],
                ['declined', 'Declined'],
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
        <iframe title="Responses page preview" sandbox="allow-scripts" srcDoc={previewHtml} className="block size-full border-0 bg-white" />
      </PreviewStage>
    </DesignerShell>
  )
}
