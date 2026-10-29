import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError, apiBaseUrl } from '@/api/client'
import { invitationApi } from '@/api/invitationApi'
import { kioskApi, type KioskSettings } from '@/api/printBadgeApi'
import { KioskScreen, type KioskStep } from '@/components/kiosk/KioskScreen'
import { DesignerShell, PanelSection, PanelTabs, useZoom } from '@/designer/DesignerShell'
import { EventDesignerSwitcher } from '@/designer/DesignerSwitcher'
import { ColourField, ImageField, Segmented, TextField } from '@/designer/PageFields'
import { PreviewStage } from '@/designer/PreviewStage'
import { useHistory } from '@/designer/useHistory'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { sampleGuest } from '@/printing/PrintBadgeView'

const assetOrigin = apiBaseUrl || window.location.origin

type PreviewStep = 'welcome' | 'confirm' | 'printing' | 'done' | 'error'
type Screen = 'landscape' | 'portrait'
const screens: Record<Screen, { width: number; height: number }> = {
  landscape: { width: 1280, height: 800 },
  portrait: { width: 800, height: 1280 },
}

/** Self check-in screen designer: wording and look, with every step previewed. Link and behaviour stay on the Check-in tab. */
export function KioskDesignerPage() {
  const { eventId = '' } = useParams()
  const event = useEvent(eventId).data
  useDocumentTitle('Self check-in screen')
  const settings = useQuery({ queryKey: ['kiosk-settings', eventId], queryFn: () => kioskApi.settings(eventId), enabled: Boolean(eventId) })

  if (settings.isLoading || !event) return <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted">Loading the self check-in screen…</div>
  if (settings.isError || !settings.data) return <div className="flex h-dvh items-center justify-center bg-background text-sm text-danger">The self check-in screen could not be loaded.</div>
  return <Designer key={eventId} eventId={eventId} eventName={event.name} initial={settings.data} />
}

function Designer({ eventId, eventName, initial }: { eventId: string; eventName: string; initial: KioskSettings }) {
  const queryClient = useQueryClient()
  const history = useHistory<KioskSettings>(initial)
  const draft = history.present
  const [saved, setSaved] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState<PreviewStep>('welcome')
  const [screen, setScreen] = useState<Screen>('landscape')
  const [uploading, setUploading] = useState<'background' | 'logo' | null>(null)
  const zoom = useZoom()
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const set = (change: Partial<KioskSettings>) => history.commit((current) => ({ ...current, ...change }))

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
      // Behaviour (reprint, camera, seat, timer) is set on the Check-in tab: keep what is saved there.
      const latest = await kioskApi.settings(eventId)
      const next = await kioskApi.saveSettings(eventId, {
        ...draft,
        allowReprint: latest.allowReprint,
        showSeat: latest.showSeat,
        useCamera: latest.useCamera,
        resetSeconds: latest.resetSeconds,
      })
      queryClient.setQueryData(['kiosk-settings', eventId], next)
      setSaved(next)
      history.reset(next)
      toast.success('Self check-in screen saved.')
      return true
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The self check-in screen could not be saved.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const steps: Record<PreviewStep, KioskStep> = {
    welcome: { kind: 'welcome' },
    confirm: { kind: 'confirm', guest: sampleGuest, already: false },
    printing: { kind: 'printing', guest: sampleGuest },
    done: { kind: 'done', guest: sampleGuest },
    error: { kind: 'error', message: draft.notFoundText },
  }

  const wording = (
    <>
      <PanelSection title="Welcome">
        <div className="grid gap-2.5">
          <TextField label="Title" value={draft.welcomeTitle} onChange={(welcomeTitle) => set({ welcomeTitle })} />
          <TextField label="Message" area value={draft.welcomeText} onChange={(welcomeText) => set({ welcomeText })} />
        </div>
      </PanelSection>
      <PanelSection title="Is this you?">
        <div className="grid gap-2.5">
          <TextField label="Title" value={draft.confirmTitle} onChange={(confirmTitle) => set({ confirmTitle })} />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="Confirm button" value={draft.confirmButton} onChange={(confirmButton) => set({ confirmButton })} />
            <TextField label="Cancel button" value={draft.cancelButton} onChange={(cancelButton) => set({ cancelButton })} />
          </div>
        </div>
      </PanelSection>
      <PanelSection title="Printing and done">
        <div className="grid gap-2.5">
          <TextField label="While printing" value={draft.printingText} onChange={(printingText) => set({ printingText })} />
          <TextField label="Done title" value={draft.doneTitle} onChange={(doneTitle) => set({ doneTitle })} />
          <TextField label="Done message" area value={draft.doneText} onChange={(doneText) => set({ doneText })} />
        </div>
      </PanelSection>
      <PanelSection title="Problems">
        <div className="grid gap-2.5">
          <TextField label="Already checked in" value={draft.alreadyText} onChange={(alreadyText) => set({ alreadyText })} />
          <TextField label="Badge not found" value={draft.notFoundText} onChange={(notFoundText) => set({ notFoundText })} />
          <TextField label="Guest declined" value={draft.declinedText} onChange={(declinedText) => set({ declinedText })} />
        </div>
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
      <PanelSection title="Colours">
        <div className="grid gap-2.5">
          <ColourField label="Background" value={draft.backgroundColor} onChange={(backgroundColor) => set({ backgroundColor })} />
          <ColourField label="Card" value={draft.cardColor} onChange={(cardColor) => set({ cardColor })} />
          <ColourField label="Text" value={draft.textColor} onChange={(textColor) => set({ textColor })} />
          <ColourField label="Button" value={draft.accentColor} onChange={(accentColor) => set({ accentColor })} />
          <ColourField label="Button text" value={draft.accentTextColor} onChange={(accentTextColor) => set({ accentTextColor })} />
        </div>
      </PanelSection>
      <p className="text-xs text-muted">The link, reprints, camera and timer are on the Check-in tab. Badges print with each guest category’s printed badge design.</p>
    </>
  )

  return (
    <DesignerShell
      title="Self check-in screen"
      subtitle={eventName}
      backLabel="Designs"
      backTo={`/events/${eventId}/designs`}
      switcher={<EventDesignerSwitcher eventId={eventId} kind="kiosk" />}
      history={history}
      zoom={{ value: zoom.value, fit: zoom.fit, set: zoom.set }}
      save={{ dirty, saving, onSave: save }}
      canvasTools={false}
      left={<PanelTabs tabs={[{ key: 'wording', label: 'Wording', content: wording }]} />}
      right={look}
    >
      <PreviewStage
        width={screens[screen].width}
        height={screens[screen].height}
        zoom={zoom.value}
        onZoom={zoom.set}
        onFitChange={zoom.setFit}
        toolbar={
          <>
            <Segmented
              label="Step"
              value={step}
              onChange={setStep}
              options={[
                ['welcome', 'Welcome'],
                ['confirm', 'Is this you?'],
                ['printing', 'Printing'],
                ['done', 'Done'],
                ['error', 'Problem'],
              ]}
            />
            <Segmented
              label="Screen"
              value={screen}
              onChange={(next) => {
                setScreen(next)
                zoom.set('fit')
              }}
              options={[
                ['landscape', 'Landscape'],
                ['portrait', 'Portrait'],
              ]}
            />
          </>
        }
        note="The self check-in screen fills the whole screen of the laptop or tablet."
      >
        <div className="pointer-events-none size-full">
          <KioskScreen settings={draft} eventName={eventName} assetOrigin={assetOrigin} step={steps[step]} countdown={draft.resetSeconds} preview />
        </div>
      </PreviewStage>
    </DesignerShell>
  )
}
