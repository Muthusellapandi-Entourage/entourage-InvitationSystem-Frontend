import { ArrowLeft, ArrowRight, Check, Monitor, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, apiBaseUrl } from '@/api/client'
import { invitationApi } from '@/api/invitationApi'
import { LogoMark } from '@/components/brand/Logo'
import { GuestTypeDesignSelect, type GuestTypeOption } from '@/components/events/GuestTypeDesignSelect'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  clampGuestBand,
  clampImagePlacement,
  effectiveGuestBand,
  rsvpFrames,
  type DesignGuides,
  type GuestBand,
  type GuestFieldDesign,
  type ImagePlacement,
  type ImageSlot,
  type InvitationDesign,
} from '@/invitations/design'
import { buildInvitationTable, renderInvitationHtml, wrapInvitationPreview } from '@/invitations/emailHtml'
import { useInvitationDocument } from '@/invitations/useInvitationDocument'
import { cn } from '@/lib/cn'
import type { InvitationResponseItem } from '@/types/invitation'
import { InvitationCanvas, type CanvasSelection, type CanvasZoom, type ImageMetrics } from './InvitationCanvas'
import { PreviewDialog, type PreviewState } from './PreviewDialog'
import { ArtworkStep } from './steps/ArtworkStep'
import { EventStep } from './steps/EventStep'
import { GuestStep, type SampleGuest } from './steps/GuestStep'
import { ReviewStep } from './steps/ReviewStep'
import { RsvpStep } from './steps/RsvpStep'

export type AssetSlot = 'header' | 'details' | 'accept' | 'decline'

const steps = [
  {
    id: 'artwork',
    label: 'Artwork',
    title: 'Add your invitation artwork',
    subtitle: "Upload the top section of your invitation. We'll fit it for you.",
  },
  { id: 'guest', label: 'Guest details', title: 'Personalize the guest greeting', subtitle: "Choose how each guest's name will appear." },
  { id: 'event', label: 'Event details', title: 'Add your event details', subtitle: 'Use an image that includes the date, time, and venue.' },
  { id: 'rsvp', label: 'RSVP', title: 'Let guests reply', subtitle: 'Choose how guests can respond to your invitation.' },
  { id: 'review', label: 'Review', title: 'Review your invitation', subtitle: 'Check how it looks before saving your template.' },
] as const

type StepId = (typeof steps)[number]['id']

const assetKey = {
  header: 'headerAssetId',
  details: 'detailsAssetId',
  accept: 'acceptAssetId',
  decline: 'declineAssetId',
} satisfies Record<AssetSlot, keyof InvitationDesign>

const imageKey = {
  header: 'headerImage',
  details: 'detailsImage',
  accept: 'acceptImage',
  decline: 'declineImage',
} satisfies Record<ImageSlot, keyof InvitationDesign>

type InvitationDesignerProps = {
  eventId: string
  eventName: string
  slug: string
  published: boolean
  design: InvitationDesign
  onChange: (design: InvitationDesign) => void
  uploading: AssetSlot | null
  onUpload: (slot: AssetSlot, file: File) => void
  saving: boolean
  onSave: () => void
  replies: InvitationResponseItem[] | undefined
  repliesLoading: boolean
  backTo?: string
  backLabel?: string
  context?: string
  guestTypes?: GuestTypeOption[]
  guestTypeId?: string
  onGuestTypeChange?: (guestTypeId: string) => void
}

export function InvitationDesigner({
  eventId,
  slug,
  published,
  design,
  onChange,
  uploading,
  onUpload,
  saving,
  onSave,
  replies,
  repliesLoading,
  backTo,
  backLabel = 'Back to event',
  context,
  guestTypes,
  guestTypeId = '',
  onGuestTypeChange,
}: InvitationDesignerProps) {
  const [step, setStep] = useState<StepId>('artwork')
  const [sample, setSample] = useState<SampleGuest>({ name: 'Sara Ahmed', title: 'Senior Manager' })
  const [hideTitle, setHideTitle] = useState(false)
  const [rsvpImage, setRsvpImage] = useState<'accept' | 'decline'>('accept')
  const [acceptOnly, setAcceptOnly] = useState(() => Boolean(design.acceptAssetId) && !design.declineAssetId)
  const [declineStash, setDeclineStash] = useState<{ assetId: string; image: ImagePlacement | null } | null>(null)
  const [imageMetrics, setImageMetrics] = useState<ImageMetrics | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [zoom, setZoom] = useState<CanvasZoom>('fit')
  const [rulers, setRulers] = useState(true)
  const [guidesVisible, setGuidesVisible] = useState(true)
  const [snap, setSnap] = useState(true)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [confirmClear, setConfirmClear] = useState(false)

  const band = effectiveGuestBand(design)
  const bandVisible = design.guestName.enabled || design.guestPosition.enabled
  const frames = rsvpFrames(design)
  const stepIndex = steps.findIndex((item) => item.id === step)
  const current = steps[stepIndex]
  const table = useMemo(() => buildInvitationTable(design), [design])
  const previewHtml = useMemo(
    () =>
      renderInvitationHtml(wrapInvitationPreview(table, design), {
        guestName: sample.name.trim() || 'Guest',
        guestPosition: hideTitle ? '' : sample.title.trim(),
        acceptUrl: '#',
        declineUrl: '#',
        assetOrigin: apiBaseUrl,
      }),
    [design, hideTitle, sample, table],
  )
  useInvitationDocument(table)

  const rsvpSlot: ImageSlot | null =
    rsvpImage === 'decline' && design.declineAssetId ? 'decline' : design.acceptAssetId ? 'accept' : design.declineAssetId ? 'decline' : null
  const selection: CanvasSelection =
    step === 'artwork' && design.headerAssetId
      ? { kind: 'image', slot: 'header' }
      : step === 'guest' && bandVisible
        ? { kind: 'band' }
        : step === 'event' && design.detailsAssetId
          ? { kind: 'image', slot: 'details' }
          : step === 'rsvp' && rsvpSlot
            ? { kind: 'image', slot: rsvpSlot }
            : null

  function setAsset(slot: AssetSlot, assetId: string | null) {
    onChange({ ...design, [assetKey[slot]]: assetId })
  }

  function updateGuest(key: 'guestName' | 'guestPosition', patch: Partial<GuestFieldDesign>) {
    onChange({ ...design, [key]: { ...design[key], ...patch } })
  }

  function updateImage(slot: string, placement: ImagePlacement | null) {
    if (slot !== 'header' && slot !== 'details' && slot !== 'accept' && slot !== 'decline') return
    onChange({ ...design, [imageKey[slot]]: placement ? clampImagePlacement(placement, design.width) : null })
  }

  function updateGuides(guides: DesignGuides | null) {
    const next = guides && (guides.vertical.length > 0 || guides.horizontal.length > 0) ? guides : null
    onChange({ ...design, guides: next })
  }

  function updateBand(patch: Partial<GuestBand>) {
    const next = clampGuestBand({ ...band, ...patch })
    onChange({
      ...design,
      guestBand: next,
      groupAlign: next.align,
      groupVertical: next.valign,
      guestName: { ...design.guestName, alignment: next.align },
      guestPosition: { ...design.guestPosition, alignment: next.align, topSpacing: next.spacing },
    })
  }

  function setReplyMode(onlyAccept: boolean) {
    setAcceptOnly(onlyAccept)
    if (onlyAccept) {
      if (design.declineAssetId) setDeclineStash({ assetId: design.declineAssetId, image: design.declineImage })
      onChange({ ...design, declineAssetId: null, declineImage: null })
      setRsvpImage('accept')
      return
    }
    if (declineStash && !design.declineAssetId) {
      onChange({ ...design, declineAssetId: declineStash.assetId, declineImage: declineStash.image })
      setDeclineStash(null)
    }
  }

  function select(next: NonNullable<CanvasSelection>) {
    if (next.kind === 'band') {
      setStep('guest')
      return
    }
    if (next.slot === 'header') setStep('artwork')
    else if (next.slot === 'details') setStep('event')
    else if (next.slot === 'accept' || next.slot === 'decline') {
      setRsvpImage(next.slot)
      setStep('rsvp')
    }
  }

  async function openPreview() {
    setPreview({ status: 'loading' })
    try {
      const result = await invitationApi.createPreview(eventId, design)
      setPreview({ status: 'ready', url: result.url, html: result.html, expiresOn: result.expiresOn })
    } catch (error) {
      setPreview({ status: 'error', message: error instanceof ApiError ? error.message : 'The preview could not be created.' })
    }
  }

  const nextStep = steps[stepIndex + 1]
  const previousStep = steps[stepIndex - 1]
  const review = step === 'review'

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-5">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-6 text-accent" />
          <span className="text-sm font-semibold">Invitation builder</span>
        </div>
        <span className="h-5 w-px bg-border" aria-hidden="true" />
        <Link to={backTo ?? `/events/${eventId}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
        {guestTypes && onGuestTypeChange ? (
          <GuestTypeDesignSelect value={guestTypeId} types={guestTypes} onChange={onGuestTypeChange} />
        ) : null}
        {context ? <p className="min-w-0 flex-1 truncate text-sm text-muted">{context}</p> : null}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" onClick={onSave} disabled={saving || uploading !== null}>
            {saving ? 'Saving…' : 'Save draft'}
          </Button>
          <Button
            variant="secondary"
            className="border-accent text-accent hover:bg-accent-soft"
            onClick={() => void openPreview()}
            disabled={preview?.status === 'loading'}
          >
            {preview?.status === 'loading' ? 'Preparing…' : 'Preview'}
          </Button>
        </div>
      </header>

      <nav aria-label="Invitation steps" className="shrink-0 overflow-x-auto px-6 py-4">
        <ol className="mx-auto flex w-max items-center">
          {steps.map((item, index) => {
            const state = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'upcoming'
            return (
              <li key={item.id} className="flex items-center">
                <button
                  type="button"
                  aria-current={state === 'current' ? 'step' : undefined}
                  onClick={() => setStep(item.id)}
                  className="group flex items-center gap-2 rounded-md px-1 py-0.5"
                >
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors duration-150',
                      state === 'upcoming'
                        ? 'border-border bg-surface text-muted group-hover:border-muted'
                        : 'border-accent bg-accent text-accent-foreground',
                    )}
                  >
                    {state === 'done' ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
                  </span>
                  <span className={cn('text-sm', state === 'current' ? 'font-semibold text-foreground' : 'text-muted group-hover:text-foreground')}>
                    {item.label}
                  </span>
                </button>
                {index < steps.length - 1 ? (
                  <span aria-hidden="true" className={cn('mx-4 h-px w-12 lg:w-24', index < stepIndex ? 'bg-accent' : 'bg-border')} />
                ) : null}
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="grid min-h-0 flex-1 gap-5 overflow-auto px-6 pb-5 lg:grid-cols-[25rem_minmax(0,1fr)] lg:overflow-hidden">
        <aside className="flex min-h-0 flex-col rounded-md border border-border bg-surface" aria-labelledby="step-title" style={{ boxShadow: 'var(--shadow)' }}>
          <div className="px-5 pt-5 pb-4">
            <h1 id="step-title" className="text-lg font-semibold">
              {current.title}
            </h1>
            <p className="mt-1 text-sm text-muted">{current.subtitle}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            {step === 'artwork' ? (
              <ArtworkStep
                design={design}
                uploading={uploading === 'header'}
                metrics={imageMetrics}
                onUpload={(file) => onUpload('header', file)}
                onRemove={() => setAsset('header', null)}
                onPlacement={(placement) => updateImage('header', placement)}
                onCanvas={(patch) => onChange({ ...design, ...patch })}
              />
            ) : null}
            {step === 'guest' ? (
              <GuestStep
                design={design}
                band={band}
                sample={sample}
                onSample={setSample}
                onChange={onChange}
                updateGuest={updateGuest}
                updateBand={updateBand}
              />
            ) : null}
            {step === 'event' ? (
              <EventStep
                design={design}
                uploading={uploading === 'details'}
                metrics={imageMetrics}
                onUpload={(file) => onUpload('details', file)}
                onRemove={() => setAsset('details', null)}
                onPlacement={(placement) => updateImage('details', placement)}
              />
            ) : null}
            {step === 'rsvp' ? (
              <RsvpStep
                design={design}
                uploading={uploading === 'accept' || uploading === 'decline' ? uploading : null}
                metrics={imageMetrics}
                acceptOnly={acceptOnly}
                selected={rsvpImage}
                onSelect={setRsvpImage}
                onChange={onChange}
                onUpload={onUpload}
                onRemove={(slot) => setAsset(slot, null)}
                onAcceptOnly={setReplyMode}
                onPlacement={updateImage}
              />
            ) : null}
            {step === 'review' ? (
              <ReviewStep
                design={design}
                sample={sample}
                onSample={setSample}
                hideTitle={hideTitle}
                onHideTitle={setHideTitle}
                onEdit={setStep}
                onOpenPreview={() => void openPreview()}
                previewLoading={preview?.status === 'loading'}
                slug={slug}
                published={published}
                replies={replies}
                repliesLoading={repliesLoading}
              />
            ) : null}
          </div>
          <div className="flex items-center gap-2 border-t border-border px-5 py-3 whitespace-nowrap">
            {previousStep && nextStep ? (
              <Button variant="secondary" onClick={() => setStep(previousStep.id)}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </Button>
            ) : null}
            <span className={cn('flex-1 text-xs text-muted', previousStep && nextStep && 'text-center')}>
              Step {stepIndex + 1} of {steps.length}
            </span>
            {nextStep ? (
              <Button onClick={() => setStep(nextStep.id)}>
                Continue to {nextStep.id === 'rsvp' ? nextStep.label : nextStep.label.toLowerCase()}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            ) : (
              <>
                {previousStep ? (
                  <Button variant="secondary" onClick={() => setStep(previousStep.id)}>
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Back
                  </Button>
                ) : null}
                <Button onClick={onSave} disabled={saving || uploading !== null}>
                  {saving ? 'Saving…' : 'Save template'}
                </Button>
              </>
            )}
          </div>
        </aside>

        <div className="flex min-h-[32rem] min-w-0 flex-col lg:min-h-0">
          <InvitationCanvas
            html={previewHtml}
            width={design.width}
            height={design.height}
            band={band}
            bandVisible={bandVisible}
            placements={{
              header: design.headerImage,
              details: design.detailsImage,
              accept: frames.accept,
              decline: frames.decline,
            }}
            selection={review ? null : selection}
            editable={!review}
            onSelect={select}
            onBandCommit={updateBand}
            onImageCommit={updateImage}
            onImageMetrics={setImageMetrics}
            zoom={zoom}
            onZoomChange={setZoom}
            rulers={rulers}
            onRulers={setRulers}
            guidesVisible={guidesVisible}
            onGuidesVisible={setGuidesVisible}
            snap={snap}
            onSnap={setSnap}
            guides={design.guides}
            onGuidesChange={updateGuides}
            onClearGuides={() => setConfirmClear(true)}
            mobile={review && device === 'mobile'}
            heading={review ? 'Guest preview' : 'Your invitation'}
            headingAside={
              review ? (
                <div role="group" aria-label="Preview device" className="flex rounded-md border border-border bg-surface p-0.5">
                  {(
                    [
                      { id: 'desktop', label: 'Desktop', icon: Monitor },
                      { id: 'mobile', label: 'Mobile', icon: Smartphone },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={device === option.id}
                      onClick={() => setDevice(option.id)}
                      className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm',
                        device === option.id ? 'bg-selected font-medium text-foreground' : 'text-muted hover:text-foreground',
                      )}
                    >
                      <option.icon className="size-4" aria-hidden="true" />
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-xs font-medium text-muted">
                  <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                  Live preview
                </span>
              )
            }
          />
        </div>
      </div>

      {preview ? <PreviewDialog preview={preview} onClose={() => setPreview(null)} /> : null}
      <ConfirmDialog
        open={confirmClear}
        title="Clear all guides?"
        description="This removes every guide you added to this invitation. Snapping to the canvas center and edges keeps working."
        confirmLabel="Clear guides"
        pendingLabel="Clearing…"
        onConfirm={() => {
          updateGuides(null)
          setConfirmClear(false)
        }}
        onClose={() => setConfirmClear(false)}
      />
    </div>
  )
}
