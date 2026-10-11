import { SlidersHorizontal, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { clampImagePlacement, effectiveImagePlacement, type ImagePlacement, type InvitationDesign } from '@/invitations/design'
import { ChoiceCards, Disclosure, InfoNote, Segmented, TipBox, UploadCard } from '../designerControls'
import { ImageSettings } from '../ImageSettings'
import type { ImageMetrics } from '../InvitationCanvas'
import { detectPlacementMode, originalSizeState, placementFor, type PlacementMode } from '../placementMode'

type Spacing = 'small' | 'medium' | 'large'

const spacingValues: Record<Spacing, number> = { small: 0, medium: 16, large: 32 }

export function EventStep({
  design,
  uploading,
  metrics,
  onUpload,
  onRemove,
  onPlacement,
}: {
  design: InvitationDesign
  uploading: boolean
  metrics: ImageMetrics | null
  onUpload: (file: File) => void
  onRemove: () => void
  onPlacement: (placement: ImagePlacement | null) => void
}) {
  const [more, setMore] = useState(false)
  const canvas = design.width
  const frame = effectiveImagePlacement(design.detailsImage, canvas, canvas)
  const natural = metrics?.naturalWidth || 0
  const fit = detectPlacementMode(frame, canvas, natural)
  const original = originalSizeState(natural, canvas)
  const spacing = (Object.keys(spacingValues) as Spacing[]).find((key) => spacingValues[key] === frame.y) ?? null

  function write(patch: Partial<ImagePlacement>) {
    onPlacement(clampImagePlacement({ ...frame, ...patch }, canvas))
  }

  return (
    <div className="grid gap-5">
      <UploadCard
        title="Event details image"
        caption="Event details image"
        hint="Include your event information and location QR code in this image."
        assetId={design.detailsAssetId}
        uploading={uploading}
        onUpload={onUpload}
        onRemove={onRemove}
      />
      {design.detailsAssetId ? (
        <>
          <div>
            <ChoiceCards<PlacementMode>
              label="How should it fit?"
              value={fit}
              onChange={(mode) => onPlacement(placementFor(mode, frame, canvas, natural))}
              options={[
                { value: 'fit', label: 'Fit to invitation', description: 'Spans the full width' },
                { value: 'centered', label: 'Centered', description: 'Narrower, even margins' },
                {
                  value: 'original',
                  label: 'Keep original size',
                  description: original.disabled ? 'Not available for this image' : `${natural}px, from the left`,
                  disabled: original.disabled,
                  title: original.reason ?? undefined,
                },
              ]}
            />
            {original.disabled && natural > canvas ? (
              <div className="mt-3">
                <InfoNote tone="warning" icon={<TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}>
                  {original.reason}
                </InfoNote>
              </div>
            ) : null}
          </div>
          <Segmented<Spacing>
            label="Spacing"
            value={spacing}
            options={[
              { value: 'small', label: 'Small' },
              { value: 'medium', label: 'Medium' },
              { value: 'large', label: 'Large' },
            ]}
            onChange={(next) => write({ y: spacingValues[next] })}
          />
          <Disclosure
            icon={<SlidersHorizontal className="size-4" aria-hidden="true" />}
            title="More options"
            open={more}
            onToggle={() => setMore((value) => !value)}
          >
            <ImageSettings
              slot="details"
              placement={design.detailsImage}
              canvasWidth={canvas}
              canvasHeight={design.height}
              metrics={metrics}
              showFit
              onChange={onPlacement}
            />
          </Disclosure>
        </>
      ) : null}
      <TipBox>Your image will stay in proportion. Resize it from a corner on the invitation to keep its shape.</TipBox>
    </div>
  )
}
