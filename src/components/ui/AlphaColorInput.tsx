import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/cn'

/** #RRGGBB or #RRGGBBAA. */
export const HEX_WITH_ALPHA = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/

/** "#11223380" → { rgb: "#112233", alpha: 128 }. Invalid values fall back to the given colour, opaque. */
export function splitHex(value: string | null | undefined, fallback = '#FFFFFF') {
  if (!value || !HEX_WITH_ALPHA.test(value)) return { rgb: fallback.slice(0, 7).toUpperCase(), alpha: 255 }
  const upper = value.toUpperCase()
  return { rgb: upper.slice(0, 7), alpha: upper.length === 9 ? Number.parseInt(upper.slice(7, 9), 16) : 255 }
}

/** Opaque colours stay #RRGGBB; see-through ones become #RRGGBBAA. */
export function joinHex(rgb: string, alpha: number) {
  const a = Math.max(0, Math.min(255, Math.round(alpha)))
  return a >= 255 ? rgb.toUpperCase() : `${rgb.toUpperCase()}${a.toString(16).padStart(2, '0').toUpperCase()}`
}

const checker = 'repeating-conic-gradient(#c7c7c7 0% 25%, #ffffff 0% 50%) 50% / 8px 8px'

type Hsv = { h: number; s: number; v: number }

function hexToHsv(rgb: string): Hsv {
  const r = Number.parseInt(rgb.slice(1, 3), 16) / 255
  const g = Number.parseInt(rgb.slice(3, 5), 16) / 255
  const b = Number.parseInt(rgb.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const delta = max - Math.min(r, g, b)
  let h = 0
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h = (h * 60 + 360) % 360
  }
  return { h, s: max ? delta / max : 0, v: max }
}

function hsvToHex({ h, s, v }: Hsv) {
  const chroma = v * s
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - chroma
  const [r, g, b] =
    h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x]
  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/** Drag helper: calls back with the pointer's position inside the element (0–1 on each axis). */
function useDrag(onMove: (x: number, y: number) => void) {
  return (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const update = (clientX: number, clientY: number) => {
      const box = target.getBoundingClientRect()
      onMove(Math.min(1, Math.max(0, (clientX - box.left) / box.width)), Math.min(1, Math.max(0, (clientY - box.top) / box.height)))
    }
    update(event.clientX, event.clientY)
    const move = (next: PointerEvent) => update(next.clientX, next.clientY)
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }
}

/**
 * Colour field: swatch + hex. Clicking the swatch opens a colour picker with an opacity (alpha) bar,
 * so see-through colours are chosen right in the picker. Stored as #RRGGBB, or #RRGGBBAA when see-through.
 */
export function AlphaColorInput({
  value,
  onChange,
  label,
  disabled,
  className,
}: {
  value: string
  onChange: (value: string) => void
  /** Used for screen-reader labels. */
  label: string
  /** Kept for compatibility; opacity is part of the picker. */
  slider?: boolean
  disabled?: boolean
  className?: string
}) {
  const { rgb, alpha } = splitHex(value)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  // Hue is kept while dragging through greys/black, where it cannot be read back from the colour.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(rgb))
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (hsvToHex(hsv) !== rgb) setHsv((current) => ({ ...hexToHsv(rgb), h: hexToHsv(rgb).s === 0 ? current.h : hexToHsv(rgb).h }))
  }, [rgb]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const setColor = (next: Hsv, nextAlpha = alpha) => {
    setHsv(next)
    onChange(joinHex(hsvToHex(next), nextAlpha))
  }
  const dragSv = useDrag((x, y) => setColor({ ...hsv, s: x, v: 1 - y }))
  const dragHue = useDrag((x) => setColor({ ...hsv, h: Math.min(359.9, x * 360) }))
  const dragAlpha = useDrag((x) => onChange(joinHex(rgb, x * 255)))
  const shown = joinHex(rgb, alpha)

  return (
    <div ref={root} className={cn('relative', className)}>
      <div className={cn('flex h-10 items-center gap-2 rounded-md border border-border bg-surface pl-1.5 pr-2', disabled && 'opacity-50')}>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Pick ${label.toLowerCase()}`}
          aria-expanded={open}
          className="relative size-7 shrink-0 overflow-hidden rounded-sm border border-border"
          style={{ background: checker }}
          onClick={() => setOpen((current) => !current)}
        >
          <span aria-hidden="true" className="absolute inset-0" style={{ background: shown }} />
        </button>
        <input
          aria-label={`${label} hex`}
          value={draft ?? shown}
          spellCheck={false}
          disabled={disabled}
          maxLength={9}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-xs uppercase focus:outline-none"
          onChange={(event) => {
            let next = event.target.value.toUpperCase().trim()
            if (next && !next.startsWith('#')) next = `#${next}`
            setDraft(next)
            if (HEX_WITH_ALPHA.test(next)) onChange(next.length === 9 && next.endsWith('FF') ? next.slice(0, 7) : next)
          }}
          onBlur={() => setDraft(null)}
        />
      </div>

      {open ? (
        <div className="absolute left-0 top-11 z-50 w-60 rounded-md border border-border bg-surface p-3" role="dialog" aria-label={`${label} colour picker`}>
          {/* Saturation / brightness */}
          <div
            className="relative h-36 w-full cursor-crosshair touch-none rounded-sm"
            style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
            onPointerDown={dragSv}
          >
            <span
              className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
            />
          </div>
          {/* Hue */}
          <div
            className="relative mt-3 h-3 cursor-pointer touch-none rounded-full"
            style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
            onPointerDown={dragHue}
            aria-label="Hue"
          >
            <span className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" style={{ left: `${(hsv.h / 360) * 100}%` }} />
          </div>
          {/* Opacity (alpha) */}
          <div className="relative mt-3 h-3 cursor-pointer touch-none rounded-full" style={{ background: checker }} onPointerDown={dragAlpha} aria-label="Opacity">
            <span className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(to right, transparent, ${rgb})` }} />
            <span className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" style={{ left: `${(alpha / 255) * 100}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted">
            <span className="font-mono">{shown}</span>
            <span className="tabular-nums">Opacity {Math.round((alpha / 255) * 100)}%</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
