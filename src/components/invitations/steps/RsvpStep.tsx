import { ArrowLeftRight, Check, Move, Trash2, Upload, X } from 'lucide-react'
import { useId, useRef, useState, type ChangeEvent } from 'react'
import { apiBaseUrl } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { rsvpFrames, type ImagePlacement, type ImageSlot, type InvitationDesign } from '@/invitations/design'
import { cn } from '@/lib/cn'
import { Disclosure, RadioRows, Segmented } from '../designerControls'
import { ImageSettings } from '../ImageSettings'
import type { ImageMetrics } from '../InvitationCanvas'

type ReplySlot = 'accept' | 'decline'

type ReplyMode = 'both' | 'acceptOnly'

export function RsvpStep({
  design,
  uploading,
  metrics,
  acceptOnly,
  selected,
  onSelect,
  onChange,
  onUpload,
  onRemove,
  onAcceptOnly,
  onPlacement,
}: {
  design: InvitationDesign
  uploading: ReplySlot | null
  metrics: ImageMetrics | null
  acceptOnly: boolean
  selected: ReplySlot
  onSelect: (slot: ReplySlot) => void
  onChange: (design: InvitationDesign) => void
  onUpload: (slot: ReplySlot, file: File) => void
  onRemove: (slot: ReplySlot) => void
  onAcceptOnly: (value: boolean) => void
  onPlacement: (slot: ImageSlot, placement: ImagePlacement | null) => void
}) {
  const [more, setMore] = useState(false)
  const frames = rsvpFrames(design)
  const both = Boolean(design.acceptAssetId && design.declineAssetId)
  const order: ReplySlot[] =
    frames.accept && frames.decline ? (frames.accept.x <= frames.decline.x ? ['accept', 'decline'] : ['decline', 'accept']) : []
  const selectedSlot: ReplySlot | null =
    selected === 'decline' && design.declineAssetId ? 'decline' : design.acceptAssetId ? 'accept' : design.declineAssetId ? 'decline' : null

  function swapOrder() {
    if (!frames.accept || !frames.decline) return
    const [left, right] = order
    const leftFrame = frames[left]!
    const rightFrame = frames[right]!
    const next = {
      [left]: { ...leftFrame, x: rightFrame.x + rightFrame.width - leftFrame.width },
      [right]: { ...rightFrame, x: leftFrame.x },
    } as Record<ReplySlot, ImagePlacement>
    onChange({ ...design, acceptImage: next.accept, declineImage: next.decline })
  }

  return (
    <div className="grid gap-5">
      <RadioRows<ReplyMode>
        label="Reply options"
        value={acceptOnly ? 'acceptOnly' : 'both'}
        onChange={(mode) => onAcceptOnly(mode === 'acceptOnly')}
        options={[
          { value: 'both', label: 'Accept & decline', description: 'Guests can confirm or send apologies.' },
          { value: 'acceptOnly', label: 'Accept only', description: 'Guests can only confirm attendance.' },
        ]}
      />
      <div className="grid gap-3">
        <ReplyRow
          slot="accept"
          label="Accept invitation"
          description="For guests who can attend."
          assetId={design.acceptAssetId}
          uploading={uploading === 'accept'}
          onUpload={(file) => onUpload('accept', file)}
          onRemove={() => onRemove('accept')}
        />
        {acceptOnly ? null : (
          <ReplyRow
            slot="decline"
            label="Decline invitation"
            description="For guests who cannot attend."
            assetId={design.declineAssetId}
            uploading={uploading === 'decline'}
            onUpload={(file) => onUpload('decline', file)}
            onRemove={() => onRemove('decline')}
          />
        )}
      </div>
      {both && !acceptOnly ? (
        <div>
          <p className="text-sm font-medium">Button order</p>
          <p className="mt-0.5 text-xs text-muted">Choose the order of the RSVP buttons on your invitation.</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center justify-center gap-3 rounded-md border border-border bg-background px-3 py-2">
              {order.map((slot, index) => (
                <span key={slot} className="flex min-w-0 items-center gap-3">
                  {index > 0 ? <span className="h-6 w-px bg-border" aria-hidden="true" /> : null}
                  <img
                    src={`${apiBaseUrl}/api/public/assets/${slot === 'accept' ? design.acceptAssetId : design.declineAssetId}`}
                    alt={slot === 'accept' ? 'Accept button' : 'Decline button'}
                    className="h-8 max-w-28 rounded-sm object-contain"
                  />
                </span>
              ))}
            </div>
            <Button variant="secondary" className="shrink-0 border-accent text-accent hover:bg-accent-soft" onClick={swapOrder}>
              <ArrowLeftRight className="size-4" aria-hidden="true" />
              Swap order
            </Button>
          </div>
        </div>
      ) : null}
      {selectedSlot ? (
        <Disclosure
          icon={<Move className="size-4" aria-hidden="true" />}
          title="Size & placement"
          open={more}
          onToggle={() => setMore((value) => !value)}
        >
          {both && !acceptOnly ? (
            <Segmented<ReplySlot>
              label="Selected button"
              value={selectedSlot}
              options={[
                { value: 'accept', label: 'Accept' },
                { value: 'decline', label: 'Decline' },
              ]}
              onChange={onSelect}
            />
          ) : null}
          <ImageSettings
            slot={selectedSlot}
            placement={selectedSlot === 'accept' ? design.acceptImage : design.declineImage}
            resolved={frames[selectedSlot]}
            canvasWidth={design.width}
            metrics={metrics}
            onChange={(placement) => onPlacement(selectedSlot, placement)}
          />
          {both && !acceptOnly ? (
            <Button
              variant="ghost"
              className="justify-self-start"
              onClick={() => onChange({ ...design, acceptAssetId: design.declineAssetId, declineAssetId: design.acceptAssetId })}
            >
              Swap the accept and decline images
            </Button>
          ) : null}
        </Disclosure>
      ) : null}
    </div>
  )
}

function ReplyRow({
  slot,
  label,
  description,
  assetId,
  uploading,
  onUpload,
  onRemove,
}: {
  slot: ReplySlot
  label: string
  description: string
  assetId: string | null
  uploading: boolean
  onUpload: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const Icon = slot === 'accept' ? Check : X

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onUpload(file)
  }

  return (
    <div className="grid gap-3 rounded-md border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full',
            slot === 'accept' ? 'bg-accent text-accent-foreground' : 'bg-muted text-surface',
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{label}</span>
          <span className="block text-xs text-muted">{description}</span>
        </span>
        {assetId ? (
          <button
            type="button"
            aria-label={`Remove ${label.toLowerCase()} image`}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:bg-hover hover:text-foreground"
            disabled={uploading}
            onClick={onRemove}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-3 pl-11">
        {assetId ? (
          <img src={`${apiBaseUrl}/api/public/assets/${assetId}`} alt="" className="h-12 min-w-0 flex-1 rounded-sm bg-background object-contain" />
        ) : (
          <span className="flex h-12 min-w-0 flex-1 items-center justify-center rounded-sm border border-dashed border-border text-muted">
            <Upload className="size-4" aria-hidden="true" />
          </span>
        )}
        <input ref={inputRef} id={inputId} type="file" accept="image/webp,image/png,image/jpeg" className="sr-only" onChange={choose} />
        <Button
          variant="secondary"
          className="shrink-0 border-accent text-accent hover:bg-accent-soft"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? 'Uploading…' : assetId ? 'Change image' : 'Upload image'}
        </Button>
      </div>
    </div>
  )
}
