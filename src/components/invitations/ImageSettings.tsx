import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Maximize2,
  RotateCcw,
} from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { NumberField } from '@/components/ui/NumberField'
import { cn } from '@/lib/cn'
import { clampImagePlacement, effectiveImagePlacement, type ImagePlacement } from '@/invitations/design'
import { FieldLabel } from './designerControls'
import type { ImageMetrics } from './InvitationCanvas'

export function ImageSettings({
  slot,
  placement,
  resolved,
  canvasWidth,
  canvasHeight = null,
  metrics,
  showFit = false,
  noun = 'invitation',
  alignNote = 'Aligns the image to the invitation edges. Text alignment is set in the guest step.',
  xLabel = 'Horizontal position',
  yLabel = 'Space above',
  yHint = 'From the content above',
  onChange,
}: {
  slot: string
  placement: ImagePlacement | null
  resolved?: ImagePlacement | null
  canvasWidth: number
  /** Fixed invitation height; null when the height follows the content. */
  canvasHeight?: number | null
  metrics: ImageMetrics | null
  showFit?: boolean
  noun?: string
  alignNote?: string
  xLabel?: string
  yLabel?: string
  yHint?: string
  onChange: (placement: ImagePlacement | null) => void
}) {
  const fallback = slot === 'accept' || slot === 'decline' ? 220 : canvasWidth
  const yMax = canvasHeight ?? 2000
  const frame = resolved ?? effectiveImagePlacement(placement, canvasWidth, fallback)
  function write(patch: Partial<ImagePlacement>) {
    onChange(clampImagePlacement({ ...frame, ...patch }, canvasWidth, yMax))
  }

  // Vertical alignment works in the section the image sits in: `y` is the gap
  // above the image, and metrics tell us where that section starts on the canvas.
  const sectionTop = metrics ? metrics.top - frame.y : null
  const renderedHeight = metrics?.height ?? frame.height ?? null
  const canAlignVertically = sectionTop !== null && renderedHeight !== null
  const canAlignBottom = canAlignVertically && canvasHeight !== null

  function verticalTarget(where: 'top' | 'middle' | 'bottom') {
    if (sectionTop === null || renderedHeight === null || !metrics) return null
    const total = canvasHeight ?? metrics.canvasHeight
    const target = where === 'top' ? 0 : where === 'middle' ? (total - renderedHeight) / 2 : total - renderedHeight
    return Math.max(0, Math.round(target - sectionTop))
  }

  // A fixed-height invitation spreads spare height across its rows, so the
  // measured section top shifts once the image moves. Re-check with the fresh
  // measurement and nudge once more so a single press lands exactly.
  const pending = useRef<{ where: 'middle' | 'bottom'; tries: number } | null>(null)
  useEffect(() => {
    const intent = pending.current
    if (!intent || !metrics) return
    const next = verticalTarget(intent.where)
    if (next === null || Math.abs(next - frame.y) <= 1 || intent.tries >= 3) {
      pending.current = null
      return
    }
    pending.current = { ...intent, tries: intent.tries + 1 }
    write({ y: next })
  }, [metrics])

  function alignVertical(where: 'top' | 'middle' | 'bottom') {
    const y = verticalTarget(where)
    if (y === null) return
    pending.current = where === 'top' ? null : { where, tries: 1 }
    write({ y })
  }

  const horizontal: 'left' | 'center' | 'right' | null =
    frame.x === 0 && frame.width < canvasWidth
      ? 'left'
      : frame.x === Math.round((canvasWidth - frame.width) / 2) && frame.width < canvasWidth
        ? 'center'
        : frame.x === canvasWidth - frame.width && frame.width < canvasWidth
          ? 'right'
          : null

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">Drag the image on the {noun}. Corners keep its shape unless you unlock it.</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Width"
          min={20}
          max={2400}
          value={frame.width}
          onChange={(next) => {
            if (next === null) return
            if (frame.lockRatio && frame.height) {
              write({ width: next, height: Math.max(20, Math.round(next / (frame.width / frame.height))) })
              return
            }
            write({ width: next })
          }}
        />
        <NumberField
          label="Height"
          min={20}
          max={4000}
          allowEmpty
          value={frame.height}
          placeholder="Auto"
          hint="Blank keeps the shape"
          onChange={(next) => {
            if (next === null) {
              write({ height: null, lockRatio: true })
              return
            }
            write({ height: next, lockRatio: false })
          }}
        />
        <NumberField
          label={xLabel}
          min={0}
          max={canvasWidth}
          value={frame.x}
          hint="From the left edge"
          onChange={(next) => {
            if (next !== null) write({ x: next })
          }}
        />
        <NumberField
          label={yLabel}
          min={0}
          max={yMax}
          value={frame.y}
          hint={yHint}
          onChange={(next) => {
            if (next !== null) write({ y: next })
          }}
        />
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-accent"
          checked={frame.lockRatio}
          onChange={(event) => {
            if (event.target.checked) {
              write({ lockRatio: true, height: null })
              return
            }
            write({ lockRatio: false, height: frame.height ?? metrics?.height ?? frame.width })
          }}
        />
        Keep the image shape
      </label>
      <div className="grid gap-2">
        <FieldLabel>Position on the {noun}</FieldLabel>
        <p className="-mt-1 text-xs text-muted">{alignNote}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <AlignGroup label="Horizontal">
            <AlignButton
              label="Align left"
              icon={<AlignStartVertical />}
              selected={horizontal === 'left'}
              disabled={frame.width >= canvasWidth}
              onClick={() => write({ x: 0 })}
            />
            <AlignButton
              label="Align center"
              icon={<AlignCenterVertical />}
              selected={horizontal === 'center'}
              disabled={frame.width >= canvasWidth}
              onClick={() => write({ x: Math.max(0, Math.round((canvasWidth - frame.width) / 2)) })}
            />
            <AlignButton
              label="Align right"
              icon={<AlignEndVertical />}
              selected={horizontal === 'right'}
              disabled={frame.width >= canvasWidth}
              onClick={() => write({ x: Math.max(0, canvasWidth - frame.width) })}
            />
          </AlignGroup>
          <AlignGroup label="Vertical">
            <AlignButton
              label="Align top"
              icon={<AlignStartHorizontal />}
              selected={frame.y === 0}
              disabled={!canAlignVertically}
              onClick={() => alignVertical('top')}
            />
            <AlignButton
              label="Align middle"
              icon={<AlignCenterHorizontal />}
              disabled={!canAlignVertically}
              onClick={() => alignVertical('middle')}
            />
            <AlignButton
              label={canAlignBottom ? 'Align bottom' : 'Align bottom (set a fixed height first)'}
              icon={<AlignEndHorizontal />}
              disabled={!canAlignBottom}
              onClick={() => alignVertical('bottom')}
            />
          </AlignGroup>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {showFit ? (
          <Button
            variant="secondary"
            title={`Stretch the image to the full ${noun} width`}
            onClick={() => onChange({ x: 0, y: frame.y, width: canvasWidth, height: null, lockRatio: true })}
          >
            <Maximize2 className="size-4" aria-hidden="true" />
            Fit to width
          </Button>
        ) : null}
        <Button variant="ghost" title="Return to the default size and position" onClick={() => onChange(null)}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Reset size and position
        </Button>
      </div>
    </div>
  )
}

function AlignGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={`${label} alignment`} className="flex items-center gap-1 rounded-md border border-border bg-surface p-1">
      <span className="w-16 shrink-0 pl-1.5 text-xs text-muted">{label}</span>
      <div className="flex flex-1 gap-1">{children}</div>
    </div>
  )
}

function AlignButton({
  label,
  icon,
  selected = false,
  disabled = false,
  onClick,
}: {
  label: string
  icon: ReactNode
  selected?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 flex-1 items-center justify-center rounded-sm transition-colors duration-150 [&>svg]:size-4',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
        selected ? 'bg-accent-soft text-accent' : 'text-foreground hover:bg-hover',
        'disabled:cursor-not-allowed disabled:text-muted/60 disabled:hover:bg-transparent',
      )}
    >
      {icon}
    </button>
  )
}
