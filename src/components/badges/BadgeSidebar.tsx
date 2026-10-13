import { QrCode, Type, UserRound } from 'lucide-react'
import { useState } from 'react'
import {
  defaultBackground,
  defaultName,
  defaultQr,
  normalizeBadgeDesign,
  type BadgeDesign,
  type BadgeText,
} from '@/badges/design'
import { ImageSettings } from '@/components/invitations/ImageSettings'
import { ColorSwatchField, Disclosure, Segmented, UploadCard } from '@/components/invitations/designerControls'
import type { ImageMetrics } from '@/components/invitations/InvitationCanvas'
import { Button } from '@/components/ui/Button'
import { NumberField } from '@/components/ui/NumberField'
import { SelectField } from '@/components/ui/SelectField'
import { invitationFonts, type ImagePlacement } from '@/invitations/design'
import type { CanvasSelection } from '@/components/invitations/InvitationCanvas'

const alignOptions = [
  { value: 'left' as const, label: 'Left' },
  { value: 'center' as const, label: 'Center' },
  { value: 'right' as const, label: 'Right' },
]

const valignOptions = [
  { value: 'top' as const, label: 'Top' },
  { value: 'middle' as const, label: 'Middle' },
  { value: 'bottom' as const, label: 'Bottom' },
]

export function BadgeSidebar({
  design,
  selection,
  metrics,
  uploading,
  onChange,
  onSelect,
  onUpload,
}: {
  design: BadgeDesign
  selection: CanvasSelection
  metrics: ImageMetrics | null
  uploading: boolean
  onChange: (design: BadgeDesign) => void
  onSelect: (selection: CanvasSelection) => void
  onUpload: (file: File) => void
}) {
  const selected = selection?.kind === 'image' ? selection.slot : null

  function apply(next: BadgeDesign) {
    onChange(normalizeBadgeDesign(next))
  }

  function updateQr(placement: ImagePlacement | null) {
    if (!placement) {
      apply({ ...design, qr: defaultQr(design) })
      return
    }
    const locked = placement.lockRatio !== false
    apply({
      ...design,
      qr: {
        ...placement,
        height: locked ? placement.width : (placement.height ?? placement.width),
        lockRatio: locked,
      },
    })
  }

  return (
    <aside className="flex min-h-0 flex-col rounded-md border border-border bg-surface" style={{ boxShadow: 'var(--shadow)' }}>
      <div className="px-5 pt-5 pb-4">
        {selected ? (
          <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => onSelect(null)}>
            Badge
          </button>
        ) : null}
        <h1 className="text-lg font-semibold">{titleFor(selected)}</h1>
        <p className="mt-1 text-sm text-muted">{subtitleFor(selected)}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {selected === null ? (
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Width"
                min={200}
                max={2400}
                value={design.width}
                hint="Pixels"
                onChange={(width) => {
                  if (width !== null) apply({ ...design, width })
                }}
              />
              <NumberField
                label="Height"
                min={200}
                max={4000}
                value={design.height}
                hint="Pixels"
                onChange={(height) => {
                  if (height !== null) apply({ ...design, height })
                }}
              />
            </div>
            <UploadCard
              title="Background"
              caption="Drag it on the badge to place it."
              hint="Use Fill the badge when this image is the whole artwork."
              assetId={design.backgroundAssetId}
              uploading={uploading}
              onUpload={onUpload}
              onRemove={() => {
                apply({ ...design, backgroundAssetId: null, background: null })
                onSelect(null)
              }}
            />
            <div className="grid gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  if (!design.qr) apply({ ...design, qr: defaultQr(design) })
                  onSelect({ kind: 'image', slot: 'qr' })
                }}
              >
                <QrCode className="size-4" aria-hidden="true" />
                Add QR Code
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (!design.name) apply({ ...design, name: defaultName(design) })
                  onSelect({ kind: 'image', slot: 'name' })
                }}
              >
                <UserRound className="size-4" aria-hidden="true" />
                Add Guest Name
              </Button>
            </div>
            <p className="text-xs text-muted">
              Guest Name and the QR code are placeholders. Each guest badge uses that guest's name and their own QR code.
            </p>
          </div>
        ) : null}

        {selected === 'background' && design.background ? (
          <div className="grid gap-4">
            <ImageSettings
              slot="background"
              placement={design.background}
              canvasWidth={design.width}
              canvasHeight={design.height}
              metrics={metrics}
              showFit
              noun="badge"
              alignNote="Aligns the image to the badge edges."
              xLabel="X position"
              yLabel="Y position"
              yHint="From the top edge"
              onChange={(placement) => apply({ ...design, background: placement ?? defaultBackground(design) })}
            />
            <Button
              variant="secondary"
              onClick={() =>
                apply({
                  ...design,
                  background: { x: 0, y: 0, width: design.width, height: design.height, lockRatio: false },
                })
              }
            >
              Fill the badge
            </Button>
          </div>
        ) : null}

        {selected === 'qr' && design.qr ? (
          <div className="grid gap-4">
            <ImageSettings
              slot="qr"
              placement={design.qr}
              canvasWidth={design.width}
              canvasHeight={design.height}
              metrics={metrics}
              noun="badge"
              alignNote="The QR code stays square while its shape is locked."
              xLabel="X position"
              yLabel="Y position"
              yHint="From the top edge"
              onChange={updateQr}
            />
            <Button
              variant="ghost"
              onClick={() => {
                apply({ ...design, qr: null })
                onSelect(null)
              }}
            >
              Remove QR code
            </Button>
          </div>
        ) : null}

        {selected === 'name' && design.name ? (
          <NameSettings
            name={design.name}
            canvasWidth={design.width}
            canvasHeight={design.height}
            onChange={(name) => apply({ ...design, name })}
            onRemove={() => {
              apply({ ...design, name: null })
              onSelect(null)
            }}
          />
        ) : null}
      </div>
    </aside>
  )
}

function NameSettings({
  name,
  canvasWidth,
  canvasHeight,
  onChange,
  onRemove,
}: {
  name: BadgeText
  canvasWidth: number
  canvasHeight: number
  onChange: (name: BadgeText) => void
  onRemove: () => void
}) {
  const [layoutOpen, setLayoutOpen] = useState(true)

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">This sample is replaced by each guest's name.</p>
      <SelectField
        label="Font family"
        value={name.font}
        options={invitationFonts.map((font) => ({ value: font, label: font }))}
        onChange={(event) => onChange({ ...name, font: event.target.value as BadgeText['font'] })}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Font size"
          min={8}
          max={160}
          value={name.fontSize}
          onChange={(fontSize) => {
            if (fontSize !== null) onChange({ ...name, fontSize })
          }}
        />
        <SelectField
          label="Font weight"
          value={name.weight}
          options={[
            { value: 'regular', label: 'Regular' },
            { value: 'bold', label: 'Bold' },
          ]}
          onChange={(event) => onChange({ ...name, weight: event.target.value as BadgeText['weight'] })}
        />
      </div>
      <ColorSwatchField label="Text color" value={name.color} onChange={(color) => onChange({ ...name, color })} />
      <Segmented label="Text alignment" value={name.align} options={alignOptions} onChange={(align) => onChange({ ...name, align })} />
      <Disclosure
        icon={<Type className="size-4" aria-hidden="true" />}
        title="Position and size"
        summary={`${name.width} × ${name.height}`}
        open={layoutOpen}
        onToggle={() => setLayoutOpen((open) => !open)}
      >
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Text area width"
              min={20}
              max={2400}
              value={name.width}
              onChange={(width) => {
                if (width !== null) onChange({ ...name, width })
              }}
            />
            <NumberField
              label="Text area height"
              min={20}
              max={4000}
              value={name.height}
              onChange={(height) => {
                if (height !== null) onChange({ ...name, height })
              }}
            />
            <NumberField
              label="X position"
              min={0}
              max={canvasWidth}
              value={name.x}
              hint="From the left edge"
              onChange={(x) => {
                if (x !== null) onChange({ ...name, x })
              }}
            />
            <NumberField
              label="Y position"
              min={0}
              max={canvasHeight}
              value={name.y}
              hint="From the top edge"
              onChange={(y) => {
                if (y !== null) onChange({ ...name, y })
              }}
            />
          </div>
          <Segmented
            label="Vertical placement"
            value={name.valign}
            options={valignOptions}
            onChange={(valign) => onChange({ ...name, valign })}
          />
        </div>
      </Disclosure>
      <Button variant="ghost" onClick={onRemove}>
        Remove guest name
      </Button>
    </div>
  )
}

function titleFor(slot: string | null) {
  if (slot === 'background') return 'Background'
  if (slot === 'qr') return 'QR code'
  if (slot === 'name') return 'Guest name'
  return 'Badge'
}

function subtitleFor(slot: string | null) {
  if (slot === 'background') return 'Move, scale, or fill the badge with this image.'
  if (slot === 'qr') return 'This box is where each guest’s QR code will be printed.'
  if (slot === 'name') return 'Style the sample. The real name uses these settings.'
  return 'Set the size, then add the background, QR code, and guest name.'
}
