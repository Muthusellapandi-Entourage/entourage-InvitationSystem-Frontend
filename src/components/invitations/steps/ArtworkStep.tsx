import { SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { NumberField } from '@/components/ui/NumberField'
import {
  defaultCanvasBackground,
  effectiveImagePlacement,
  transparentBackground,
  type ImagePlacement,
  type InvitationDesign,
} from '@/invitations/design'
import { ChoiceCards, ColorSwatchField, Disclosure, InfoNote, TipBox, UploadCard } from '../designerControls'
import { ImageSettings } from '../ImageSettings'
import type { ImageMetrics } from '../InvitationCanvas'
import { detectPlacementMode, originalSizeState, placementFor, type PlacementMode } from '../placementMode'

type CanvasPatch = Partial<Pick<InvitationDesign, 'width' | 'height' | 'backgroundColor'>>

export function ArtworkStep({
  design,
  uploading,
  metrics,
  onUpload,
  onRemove,
  onPlacement,
  onCanvas,
}: {
  design: InvitationDesign
  uploading: boolean
  metrics: ImageMetrics | null
  onUpload: (file: File) => void
  onRemove: () => void
  onPlacement: (placement: ImagePlacement | null) => void
  onCanvas: (patch: CanvasPatch) => void
}) {
  const [more, setMore] = useState(false)
  const canvas = design.width
  const frame = effectiveImagePlacement(design.headerImage, canvas, canvas)
  const natural = metrics?.naturalWidth || 0
  const current = detectPlacementMode(frame, canvas, natural)
  const original = originalSizeState(natural, canvas)

  return (
    <div className="grid gap-5">
      <UploadCard
        title="Invitation header"
        caption="Invitation header"
        hint={design.headerAssetId ? undefined : `Recommended: ${canvas}px wide. WEBP, PNG, or JPG.`}
        assetId={design.headerAssetId}
        uploading={uploading}
        onUpload={onUpload}
        onRemove={onRemove}
      />
      {design.headerAssetId ? (
        <>
          <div>
            <ChoiceCards<PlacementMode>
              label="Image placement"
              value={current}
              onChange={(mode) => onPlacement(placementFor(mode, frame, canvas, natural))}
              options={[
                { value: 'fit', label: 'Fit width', description: 'Spans the full invitation', preview: <PlacementGlyph kind="fit" /> },
                { value: 'centered', label: 'Centered', description: 'Narrower, with even margins', preview: <PlacementGlyph kind="centered" /> },
                {
                  value: 'original',
                  label: 'Original size',
                  description: original.disabled ? 'Not available for this image' : `${natural}px, from the left`,
                  preview: <PlacementGlyph kind="original" />,
                  disabled: original.disabled,
                  title: original.reason ?? undefined,
                },
              ]}
            />
            <div className="mt-3">
              {original.disabled && natural > canvas ? (
                <InfoNote tone="warning" icon={<TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}>
                  {original.reason}
                </InfoNote>
              ) : (
                <InfoNote>Height follows the image so it never distorts. Fine-tune under More options.</InfoNote>
              )}
            </div>
          </div>
          <Disclosure
            icon={<SlidersHorizontal className="size-4" aria-hidden="true" />}
            title="More options"
            open={more}
            onToggle={() => setMore((value) => !value)}
          >
            <CanvasFields design={design} onCanvas={onCanvas} />
            <div className="border-t border-border pt-4">
              <h3 className="mb-3 text-sm font-medium">Header image</h3>
              <ImageSettings
                slot="header"
                placement={design.headerImage}
                canvasWidth={canvas}
                canvasHeight={design.height}
                metrics={metrics}
                showFit
                onChange={onPlacement}
              />
            </div>
          </Disclosure>
        </>
      ) : (
        <Disclosure
          icon={<SlidersHorizontal className="size-4" aria-hidden="true" />}
          title="More options"
          open={more}
          onToggle={() => setMore((value) => !value)}
        >
          <CanvasFields design={design} onCanvas={onCanvas} />
        </Disclosure>
      )}
      <TipBox>You can update your artwork at any time. A {canvas}px wide image gives the sharpest result in email.</TipBox>
    </div>
  )
}

function CanvasFields({ design, onCanvas }: { design: InvitationDesign; onCanvas: (patch: CanvasPatch) => void }) {
  const transparent = design.backgroundColor === transparentBackground
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="mb-3 text-sm font-medium">Invitation size</h3>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Width"
            min={200}
            max={2400}
            value={design.width}
            hint="Pixels"
            onChange={(width) => {
              if (width !== null) onCanvas({ width })
            }}
          />
          <NumberField
            label="Height"
            min={200}
            max={4000}
            allowEmpty
            value={design.height}
            placeholder="Auto"
            hint="Blank fits the artwork"
            onChange={(height) => onCanvas({ height })}
          />
        </div>
      </div>
      <div>
        <h3 className="mb-1 text-sm font-medium">Invitation background</h3>
        <p className="mb-3 text-xs text-muted">Fills the invitation edge to edge behind your artwork. The area around the invitation is not affected.</p>
        <ColorSwatchField
          label="Canvas background color"
          value={transparent ? defaultCanvasBackground : design.backgroundColor}
          none={transparent}
          noneLabel="Transparent"
          onNone={() => onCanvas({ backgroundColor: transparentBackground })}
          onChange={(backgroundColor) => onCanvas({ backgroundColor })}
        />
      </div>
    </div>
  )
}

function PlacementGlyph({ kind }: { kind: PlacementMode }) {
  return (
    <span aria-hidden="true" className="mb-1 flex h-7 w-10 items-start justify-center rounded-sm border border-border bg-background p-0.5">
      <span
        className="block rounded-[1px] bg-muted/70"
        style={kind === 'fit' ? { width: '100%', height: 10 } : kind === 'centered' ? { width: '60%', height: 10 } : { width: '45%', height: 10, alignSelf: 'flex-start', marginRight: 'auto' }}
      />
    </span>
  )
}
