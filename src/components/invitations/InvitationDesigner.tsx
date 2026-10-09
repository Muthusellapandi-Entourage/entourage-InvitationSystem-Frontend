import { ArrowLeft } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiBaseUrl } from '@/api/client'
import { Button, buttonClassName } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/SelectField'
import { Skeleton } from '@/components/ui/Skeleton'
import { TextField } from '@/components/ui/TextField'
import {
  clampGuestBand,
  effectiveGuestBand,
  invitationFonts,
  type FontWeight,
  type GroupVertical,
  type GuestBand,
  type GuestFieldDesign,
  type InvitationDesign,
  type TextAlign,
} from '@/invitations/design'
import { buildInvitationTable, renderInvitationHtml, wrapInvitationPreview } from '@/invitations/emailHtml'
import { useInvitationDocument } from '@/invitations/useInvitationDocument'
import { cn } from '@/lib/cn'
import type { InvitationResponseItem } from '@/types/invitation'
import { formatTimestamp } from '@/utils/dates'

const steps = [
  { id: 'header', label: 'Header' },
  { id: 'guest', label: 'Guest' },
  { id: 'event', label: 'Event' },
  { id: 'rsvp', label: 'RSVP' },
  { id: 'preview', label: 'Preview' },
] as const

type StepId = (typeof steps)[number]['id']

export type AssetSlot = 'header' | 'details' | 'accept' | 'decline'

const alignOptions = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

const verticalOptions = [
  { value: 'top', label: 'Top' },
  { value: 'middle', label: 'Middle' },
  { value: 'bottom', label: 'Bottom' },
]

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
}

export function InvitationDesigner({
  eventId,
  eventName,
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
}: InvitationDesignerProps) {
  const [step, setStep] = useState<StepId>('header')
  const [hidePosition, setHidePosition] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const band = effectiveGuestBand(design)
  const table = useMemo(() => buildInvitationTable(design), [design])
  const previewHtml = useMemo(
    () =>
      renderInvitationHtml(wrapInvitationPreview(table, design), {
        guestName: 'Sara Ahmed',
        guestPosition: hidePosition ? '' : 'Senior Manager',
        acceptUrl: '#',
        declineUrl: '#',
        assetOrigin: apiBaseUrl,
      }),
    [design, hidePosition, table],
  )
  useInvitationDocument(table)

  function setAsset(slot: AssetSlot, assetId: string | null) {
    const key = {
      header: 'headerAssetId',
      details: 'detailsAssetId',
      accept: 'acceptAssetId',
      decline: 'declineAssetId',
    } satisfies Record<AssetSlot, keyof InvitationDesign>
    onChange({ ...design, [key[slot]]: assetId })
  }

  function updateGuest(key: 'guestName' | 'guestPosition', patch: Partial<GuestFieldDesign>) {
    onChange({ ...design, [key]: { ...design[key], ...patch } })
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

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Link
          to={`/events/${eventId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">Create invitation</h1>
        <Button onClick={onSave} disabled={saving || uploading !== null}>
          {saving ? 'Saving…' : 'Save template'}
        </Button>
      </header>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="order-2 min-h-0 overflow-auto border-b border-border lg:order-1 lg:border-r lg:border-b-0">
          <nav aria-label="Invitation steps" className="px-3 py-4">
            <ol className="grid gap-1">
              {steps.map((item) => {
                const current = item.id === step
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={current ? 'step' : undefined}
                      onClick={() => setStep(item.id)}
                      className={cn(
                        'flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm',
                        current ? 'bg-selected font-medium' : 'text-muted hover:bg-hover hover:text-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          current ? 'bg-foreground' : 'border border-current',
                        )}
                        aria-hidden="true"
                      />
                      {item.label}
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>
          <div className="grid grid-cols-2 gap-3 border-t border-border px-4 py-4">
            <TextField
              label="Width"
              type="number"
              min={200}
              max={2400}
              value={design.width}
              hint="Pixels"
              onChange={(event) =>
                onChange({ ...design, width: clampNumber(event.target.value, design.width, 200, 2400) })
              }
            />
            <TextField
              label="Height"
              type="number"
              min={200}
              max={4000}
              value={design.height ?? ''}
              placeholder="Auto"
              hint="Blank fits the content"
              onChange={(event) => {
                if (event.target.value.trim() === '') {
                  onChange({ ...design, height: null })
                  return
                }
                onChange({
                  ...design,
                  height: clampNumber(event.target.value, design.height ?? 800, 200, 4000),
                })
              }}
            />
          </div>
          <div className="border-t border-border px-4 py-5">
            {step === 'header' ? (
              <ImageStep
                title="Header image"
                description="Upload your invitation header image."
                hint={`Recommended: ${design.width}px wide. WEBP, PNG, or JPG.`}
                assetId={design.headerAssetId}
                uploading={uploading === 'header'}
                onUpload={(file) => onUpload('header', file)}
                onRemove={() => setAsset('header', null)}
              />
            ) : null}
            {step === 'guest' ? (
              <div className="grid gap-6">
                <div>
                  <h2 className="text-base font-semibold">Guest information</h2>
                  <p className="mt-2 text-sm text-muted">
                    This band is always as wide as the invitation. Drag it up or down, or pull the top and bottom edges
                    to change its height. The sample reads Sara Ahmed, Senior Manager.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label="Height"
                    type="number"
                    min={48}
                    max={800}
                    value={band.height}
                    hint="Pixels"
                    onChange={(event) => updateBand({ height: clampNumber(event.target.value, band.height, 48, 800) })}
                  />
                  <TextField
                    label="Vertical position"
                    type="number"
                    min={0}
                    max={2000}
                    value={band.y}
                    hint="Space under the header"
                    onChange={(event) => updateBand({ y: clampNumber(event.target.value, band.y, 0, 2000) })}
                  />
                </div>
                <SelectField
                  label="Text alignment"
                  hint="Aligns the name and title inside the full width of the invitation."
                  value={band.align}
                  options={alignOptions}
                  onChange={(event) => updateBand({ align: event.target.value as TextAlign })}
                />
                <SelectField
                  label="Vertical placement"
                  hint="Where the name and title sit inside the band."
                  value={band.valign}
                  options={verticalOptions}
                  onChange={(event) => updateBand({ valign: event.target.value as GroupVertical })}
                />
                <TextField
                  label="Space between name and title"
                  type="number"
                  min={0}
                  max={80}
                  value={band.spacing}
                  hint="Pixels. Hidden when a guest has no title."
                  onChange={(event) => updateBand({ spacing: clampNumber(event.target.value, band.spacing, 0, 80) })}
                />
                <button
                  type="button"
                  className="w-fit text-sm text-muted underline-offset-4 hover:underline"
                  aria-expanded={advanced}
                  onClick={() => setAdvanced((current) => !current)}
                >
                  {advanced ? 'Hide extra spacing' : 'Extra spacing'}
                </button>
                {advanced ? (
                  <TextField
                    label="Side margin"
                    type="number"
                    min={0}
                    max={120}
                    value={band.inset}
                    hint="Equal space on the left and right. Center stays in the middle."
                    onChange={(event) => updateBand({ inset: clampNumber(event.target.value, band.inset, 0, 120) })}
                  />
                ) : null}
                <TypeSettings
                  label="Guest name"
                  field={design.guestName}
                  onChange={(patch) => updateGuest('guestName', patch)}
                />
                <TypeSettings
                  label="Guest position"
                  field={design.guestPosition}
                  enabledToggle
                  onChange={(patch) => updateGuest('guestPosition', patch)}
                />
              </div>
            ) : null}
            {step === 'event' ? (
              <ImageStep
                title="Event information"
                description="Upload your event details image."
                hint={`Put the date, time, and venue in this image. Recommended: ${design.width}px wide. WEBP, PNG, or JPG.`}
                assetId={design.detailsAssetId}
                uploading={uploading === 'details'}
                onUpload={(file) => onUpload('details', file)}
                onRemove={() => setAsset('details', null)}
              />
            ) : null}
            {step === 'rsvp' ? (
              <div className="grid gap-8">
                <div>
                  <h2 className="text-base font-semibold">RSVP buttons</h2>
                  <p className="mt-2 text-sm text-muted">
                    The uploaded images are the buttons. Leave one out if this invitation only needs a single reply.
                  </p>
                </div>
                <ImageStep
                  title="Accept button"
                  description="Upload the accept image."
                  assetId={design.acceptAssetId}
                  uploading={uploading === 'accept'}
                  onUpload={(file) => onUpload('accept', file)}
                  onRemove={() => setAsset('accept', null)}
                  action="Accept invitation"
                />
                <Button
                  variant="secondary"
                  disabled={!design.acceptAssetId && !design.declineAssetId}
                  onClick={() =>
                    onChange({
                      ...design,
                      acceptAssetId: design.declineAssetId,
                      declineAssetId: design.acceptAssetId,
                    })
                  }
                >
                  Swap Accept/Decline images
                </Button>
                <ImageStep
                  title="Decline button"
                  description="Upload the decline image."
                  assetId={design.declineAssetId}
                  uploading={uploading === 'decline'}
                  onUpload={(file) => onUpload('decline', file)}
                  onRemove={() => setAsset('decline', null)}
                  action="Decline invitation"
                />
              </div>
            ) : null}
            {step === 'preview' ? (
              <PreviewNotes
                hidePosition={hidePosition}
                positionEnabled={design.guestPosition.enabled}
                onHidePosition={setHidePosition}
                slug={slug}
                published={published}
                eventName={eventName}
                replies={replies}
                repliesLoading={repliesLoading}
              />
            ) : null}
          </div>
        </aside>
        <section className="order-1 flex h-[32rem] flex-col bg-[#e8e8e4] lg:sticky lg:top-14 lg:order-2 lg:h-[calc(100dvh-3.5rem)]" aria-label="Invitation preview">
          <p className="px-4 pt-3 text-center text-sm text-[#3f3c38]">
            {design.width} × {design.height ?? 'auto'} px
          </p>
          <InvitationCanvas
            html={previewHtml}
            width={design.width}
            height={design.height}
            band={band}
            editing={step === 'guest' && (design.guestName.enabled || design.guestPosition.enabled)}
            onCommit={updateBand}
          />
        </section>
      </div>
    </div>
  )
}

function InvitationCanvas({
  html,
  width,
  height,
  band,
  editing,
  onCommit,
}: {
  html: string
  width: number
  height: number | null
  band: GuestBand
  editing: boolean
  onCommit: (patch: Partial<GuestBand>) => void
}) {
  const paneRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const dragRef = useRef<{
    mode: 'move' | 'n' | 's'
    originY: number
    originHeight: number
    originTop: number
    pointerY: number
    y: number
    height: number
  } | null>(null)
  const [pane, setPane] = useState({ width: 640, height: 640 })
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const [seen, setSeen] = useState<{ top: number; height: number } | null>(null)
  const [draft, setDraft] = useState<{ top: number; height: number } | null>(null)

  useEffect(() => {
    const node = paneRef.current
    if (!node) return
    const measure = () => setPane({ width: node.clientWidth, height: node.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const scale = Math.min(1, Math.max(0.1, (pane.width - 48) / width), height ? Math.max(0.1, (pane.height - 24) / height) : 1)
  const frameHeight = height ?? contentHeight ?? Math.max(480, Math.round(pane.height / scale))
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  useEffect(() => {
    const id = requestAnimationFrame(() => readBand())
    return () => cancelAnimationFrame(id)
  }, [html, editing, frameHeight])

  function readBand() {
    const doc = frameRef.current?.contentDocument
    const HtmlElement = doc?.defaultView?.HTMLElement
    const canvas = doc?.querySelector('[data-invitation-canvas]')
    const row = doc?.querySelector('[data-guest-band="true"]')
    if (!doc || !HtmlElement || !(canvas instanceof HtmlElement) || !(row instanceof HtmlElement)) return
    setContentHeight((current) => {
      const next = Math.ceil(canvas.offsetHeight)
      return current === next ? current : next
    })
    setSeen(measureBand(row, canvas))
  }

  function paint(y: number, bandHeight: number) {
    const doc = frameRef.current?.contentDocument
    const HtmlElement = doc?.defaultView?.HTMLElement
    if (!doc || !HtmlElement) return
    const spacer = doc.querySelector('[data-guest-band="spacer"] td')
    const cell = doc.querySelector('[data-guest-band-cell]')
    if (spacer instanceof HtmlElement) {
      spacer.setAttribute('height', String(y))
      spacer.style.height = `${y}px`
    }
    if (cell instanceof HtmlElement) {
      cell.setAttribute('height', String(bandHeight))
      cell.style.height = `${bandHeight}px`
    }
  }

  function beginDrag(event: PointerEvent<HTMLElement>, mode: 'move' | 'n' | 's') {
    if (!seen) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      mode,
      originY: band.y,
      originHeight: band.height,
      originTop: seen.top,
      pointerY: event.clientY,
      y: band.y,
      height: band.height,
    }
    setDraft({ top: seen.top, height: seen.height })
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag) return
    const dy = (event.clientY - drag.pointerY) / (scaleRef.current || 1)
    let y = drag.originY
    let bandHeight = drag.originHeight
    if (drag.mode === 'move') y = drag.originY + dy
    if (drag.mode === 's') bandHeight = drag.originHeight + dy
    if (drag.mode === 'n') {
      y = drag.originY + dy
      bandHeight = drag.originHeight - dy
    }
    const next = clampGuestBand({ ...band, y, height: bandHeight })
    drag.y = next.y
    drag.height = next.height
    setDraft({ top: drag.originTop + (next.y - drag.originY), height: next.height })
    paint(next.y, next.height)
  }

  function endDrag(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDraft(null)
    onCommit({ y: drag.y, height: drag.height })
  }

  const box = draft ?? seen

  return (
    <div ref={paneRef} className="flex min-h-0 flex-1 justify-center overflow-auto px-4 pb-6">
      <div className="relative" style={{ width: width * scale, height: frameHeight * scale }}>
        <iframe
          ref={frameRef}
          title="Invitation preview"
          sandbox="allow-same-origin"
          srcDoc={html}
          onLoad={readBand}
          className="pointer-events-none absolute top-0 left-0"
          style={{
            width,
            height: frameHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: 0,
            background: '#e8e8e4',
          }}
        />
        {editing && box ? (
          <div className="absolute inset-0">
            <div
              role="group"
              aria-label="Guest information"
              className="absolute touch-none"
              style={{
                left: 0,
                top: box.top * scale,
                width: width * scale,
                height: box.height * scale,
                outline: '2px solid #3dbea2',
                cursor: 'move',
              }}
              onPointerDown={(event) => beginDrag(event, 'move')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <span className="pointer-events-none absolute -top-4 left-1 rounded-sm bg-[#143f36] px-1 text-[10px] leading-4 text-white">
                Guest information
              </span>
              {(['n', 's'] as const).map((edge) => (
                <button
                  key={edge}
                  type="button"
                  aria-label={edge === 'n' ? 'Make the guest band shorter from the top' : 'Make the guest band taller'}
                  className="absolute left-1/2 h-2.5 w-8 -translate-x-1/2 border border-[#1c1b19] bg-white"
                  style={{ top: edge === 'n' ? 0 : '100%', transform: 'translate(-50%, -50%)', cursor: 'ns-resize' }}
                  onPointerDown={(event) => beginDrag(event, edge)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function measureBand(row: HTMLElement, canvas: HTMLElement) {
  const HtmlElement = row.ownerDocument.defaultView?.HTMLElement
  let top = 0
  let node: HTMLElement | null = row
  while (node && node !== canvas) {
    top += node.offsetTop
    const parent: Element | null = node.offsetParent
    if (!HtmlElement || !(parent instanceof HtmlElement)) break
    node = parent
  }
  return { top: Math.max(0, Math.round(top)), height: Math.max(48, Math.round(row.offsetHeight)) }
}

function TypeSettings({
  label,
  field,
  enabledToggle = false,
  onChange,
}: {
  label: string
  field: GuestFieldDesign
  enabledToggle?: boolean
  onChange: (patch: Partial<GuestFieldDesign>) => void
}) {
  const checkboxId = useId()
  const [more, setMore] = useState(false)
  const weight = field.weight ?? (field.font === 'Manifa Bold' ? 'bold' : 'regular')
  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{label}</h3>
        {enabledToggle ? (
          <label htmlFor={checkboxId} className="inline-flex items-center gap-2 text-sm">
            <input
              id={checkboxId}
              type="checkbox"
              className="size-4 accent-accent"
              checked={field.enabled}
              onChange={(event) => onChange({ enabled: event.target.checked })}
            />
            Show
          </label>
        ) : null}
      </div>
      {field.enabled ? (
        <>
          <SelectField
            label="Font"
            hint="Manifa is used when that font is installed."
            value={field.font}
            options={invitationFonts.map((font) => ({ value: font, label: font }))}
            onChange={(event) => onChange({ font: event.target.value as GuestFieldDesign['font'] })}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Size"
              type="number"
              min={8}
              max={72}
              value={field.fontSize}
              onChange={(event) => onChange({ fontSize: clampNumber(event.target.value, field.fontSize, 8, 72) })}
            />
            <SelectField
              label="Weight"
              value={weight}
              options={[
                { value: 'regular', label: 'Regular' },
                { value: 'bold', label: 'Bold' },
              ]}
              onChange={(event) => onChange({ weight: event.target.value as FontWeight })}
            />
          </div>
          <ColorField value={field.color} onChange={(color) => onChange({ color })} />
          <button
            type="button"
            className="w-fit text-sm text-muted underline-offset-4 hover:underline"
            aria-expanded={more}
            onClick={() => setMore((current) => !current)}
          >
            {more ? 'Hide phone size' : 'Phone size'}
          </button>
          {more ? (
            <TextField
              label="Size on a phone"
              type="number"
              min={8}
              max={48}
              value={field.mobileFontSize}
              onChange={(event) =>
                onChange({ mobileFontSize: clampNumber(event.target.value, field.mobileFontSize, 8, 48) })
              }
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function ImageStep({
  title,
  description,
  hint,
  assetId,
  uploading,
  onUpload,
  onRemove,
  action,
}: {
  title: string
  description: string
  hint?: string
  assetId: string | null
  uploading: boolean
  onUpload: (file: File) => void
  onRemove: () => void
  action?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onUpload(file)
  }

  return (
    <div className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted">{description}</p>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/webp,image/png,image/jpeg"
        className="sr-only"
        onChange={choose}
      />
      {assetId ? (
        <img
          src={`${apiBaseUrl}/api/public/assets/${assetId}`}
          alt=""
          className="max-h-28 w-full bg-[#313131] object-contain"
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Uploading…' : assetId ? 'Replace image' : 'Upload image'}
        </Button>
        {assetId ? (
          <Button variant="ghost" onClick={onRemove} disabled={uploading}>
            Remove image
          </Button>
        ) : null}
      </div>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      {action ? (
        <p className="text-sm">
          <span className="text-muted">Action</span>
          <span className="mt-1 block">{action}</span>
        </p>
      ) : null}
    </div>
  )
}

function ColorField({
  label = 'Color',
  value,
  onChange,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const shown = draft === value ? value : draft
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Color swatch"
          value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#FFFFFF'}
          className="size-10 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1"
          onChange={(event) => {
            const next = event.target.value.toUpperCase()
            setDraft(next)
            onChange(next)
          }}
        />
        <input
          id={id}
          value={shown}
          spellCheck={false}
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
          onChange={(event) => {
            const next = event.target.value.toUpperCase()
            setDraft(next)
            if (/^#[0-9A-FA-F]{6}$/.test(next)) onChange(next)
          }}
          onBlur={() => setDraft(value)}
        />
      </div>
    </div>
  )
}

function PreviewNotes({
  hidePosition,
  positionEnabled,
  onHidePosition,
  slug,
  published,
  eventName,
  replies,
  repliesLoading,
}: {
  hidePosition: boolean
  positionEnabled: boolean
  onHidePosition: (value: boolean) => void
  slug: string
  published: boolean
  eventName: string
  replies: InvitationResponseItem[] | undefined
  repliesLoading: boolean
}) {
  const [copied, setCopied] = useState(false)
  const guestPath = `/invite/${slug}`
  const checkboxId = useId()

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${guestPath}`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-base font-semibold">Preview</h2>
        <p className="mt-2 text-sm text-muted">
          Sample guest for {eventName}: Dear Sara Ahmed, Senior Manager. A shared link says Dear Guest until a guest
          name is filled in.
        </p>
      </div>
      {positionEnabled ? (
        <label htmlFor={checkboxId} className="inline-flex items-center gap-2 text-sm">
          <input
            id={checkboxId}
            type="checkbox"
            className="size-4 accent-accent"
            checked={hidePosition}
            onChange={(event) => onHidePosition(event.target.checked)}
          />
          Guest has no position
        </label>
      ) : null}
      {published ? (
        <a href={guestPath} target="_blank" rel="noreferrer" className={buttonClassName('secondary')}>
          Open guest page
        </a>
      ) : (
        <p className="text-sm text-muted">Guests can open the page after this event is active.</p>
      )}
      <button type="button" className="w-fit text-sm text-muted underline-offset-4 hover:underline" onClick={() => void copyLink()}>
        {copied ? 'Link copied' : 'Copy guest link'}
      </button>
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-medium">Replies</h3>
        {repliesLoading ? (
          <Skeleton className="mt-3 h-12 w-full" />
        ) : replies && replies.length > 0 ? (
          <table className="mt-3 w-full text-left text-sm">
            <caption className="sr-only">Invitation replies</caption>
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium">Name</th>
                <th scope="col" className="py-2 font-medium">Reply</th>
              </tr>
            </thead>
            <tbody>
              {replies.map((reply) => (
                <tr key={reply.id} className="border-b border-border">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {reply.guestName}
                  </th>
                  <td className="py-2">
                    {reply.status === 'Accepted' ? 'Accepted' : 'Declined'}
                    <span className="mt-0.5 block text-muted tabular-nums">{formatTimestamp(reply.createdOn)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-muted">No replies yet.</p>
        )}
      </div>
    </div>
  )
}

function clampNumber(value: string, fallback: number, min: number, max: number) {
  if (value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}
