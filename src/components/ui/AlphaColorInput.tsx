import { Pipette, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useBrandKit } from '@/brand/useBrandKit'
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

const toHex2 = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0').toUpperCase()

/**
 * Reads whatever was typed or pasted: "#1A2B3C", "1a2b3c", "#abc", "#1A2B3C80", "rgb(26, 43, 60)",
 * "rgba(26,43,60,0.5)", "rgb(26 43 60 / 50%)". Returns #RRGGBB / #RRGGBBAA, or null.
 */
export function parseColor(input: string): string | null {
  const text = input.trim().replace(/;$/, '')
  const hex = text.replace(/^#/, '')
  if (/^[0-9a-f]{3,4}$/i.test(hex)) {
    const full = hex.split('').map((char) => char + char).join('')
    return joinHex(`#${full.slice(0, 6)}`, full.length === 8 ? Number.parseInt(full.slice(6, 8), 16) : 255)
  }
  if (/^[0-9a-f]{6}$/i.test(hex) || /^[0-9a-f]{8}$/i.test(hex)) {
    return joinHex(`#${hex.slice(0, 6)}`, hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255)
  }
  const rgb = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i)
  if (rgb) {
    const alphaText = rgb[4]
    const alpha = alphaText === undefined ? 1 : alphaText.endsWith('%') ? Number.parseFloat(alphaText) / 100 : Number.parseFloat(alphaText)
    return joinHex(`#${toHex2(Number(rgb[1]))}${toHex2(Number(rgb[2]))}${toHex2(Number(rgb[3]))}`, Math.max(0, Math.min(1, alpha)) * 255)
  }
  return null
}

const checker = 'repeating-conic-gradient(#c7c7c7 0% 25%, #ffffff 0% 50%) 50% / 8px 8px'
const noneSwatch = 'linear-gradient(135deg, #ffffff 45%, #c0392b 45%, #c0392b 55%, #ffffff 55%)'

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

const RECENT_KEY = 'entourage.recentColors'

function readRecent(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && HEX_WITH_ALPHA.test(item)).slice(0, 12) : []
  } catch {
    return []
  }
}

function pushRecent(color: string) {
  try {
    const next = [color, ...readRecent().filter((item) => item !== color)].slice(0, 12)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Not remembered; fine.
  }
}

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> }

function Swatch({ color, title, onPick }: { color: string; title: string; onPick: () => void }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onPick} className="relative size-6 overflow-hidden rounded-sm border border-border" style={{ background: checker }}>
      <span aria-hidden="true" className="absolute inset-0" style={{ background: color }} />
    </button>
  )
}

/**
 * The one colour field used everywhere: a swatch and a hex box. Type or paste any hex (#abc, 1A2B3C,
 * #1A2B3C80) or rgb()/rgba(). The swatch opens a picker with opacity, the event's brand colours,
 * recently used colours and (in Chrome/Edge) an eyedropper. Stored as #RRGGBB, or #RRGGBBAA when see-through.
 * `value` may be null (no colour) when `onClear` is given.
 */
export function AlphaColorInput({
  value,
  onChange,
  label,
  disabled,
  className,
  onClear,
  emptyLabel = 'None',
}: {
  value: string | null
  onChange: (value: string) => void
  /** Used for screen-reader labels. */
  label: string
  /** Kept for compatibility; opacity is part of the picker. */
  slider?: boolean
  disabled?: boolean
  className?: string
  /** Shows a clear (×) button; the field then accepts "no colour". */
  onClear?: () => void
  /** Text shown when there is no colour (e.g. "None", "Mixed"). */
  emptyLabel?: string
}) {
  const empty = !value || !HEX_WITH_ALPHA.test(value)
  const { rgb, alpha } = splitHex(value)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [popDraft, setPopDraft] = useState<string | null>(null)
  const [recent, setRecent] = useState<string[]>([])
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  // Inside a modal <dialog> the picker must live in that dialog (the page behind it is inert).
  const [host, setHost] = useState<HTMLElement | null>(null)
  // Hue is kept while dragging through greys/black, where it cannot be read back from the colour.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(rgb))
  const root = useRef<HTMLDivElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const openedWith = useRef<string | null>(null)
  const { kit } = useBrandKit()
  const brandColors = kit.colors
  const eyeDropper = typeof window !== 'undefined' ? (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper : undefined

  useEffect(() => {
    if (hsvToHex(hsv) !== rgb) setHsv((current) => ({ ...hexToHsv(rgb), h: hexToHsv(rgb).s === 0 ? current.h : hexToHsv(rgb).h }))
  }, [rgb]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setOpen(false)
    setPopDraft(null)
    if (value && HEX_WITH_ALPHA.test(value) && value !== openedWith.current) pushRecent(value.toUpperCase())
  }

  // Placed on the page (not inside scrolling side panels) so it is never cut off.
  useLayoutEffect(() => {
    if (!open || !root.current) return
    const place = () => {
      const box = root.current!.getBoundingClientRect()
      const width = 256
      const height = popover.current?.offsetHeight ?? 380
      const left = Math.min(Math.max(8, box.left), window.innerWidth - width - 8)
      const below = box.bottom + 6
      const top = below + height > window.innerHeight - 8 ? Math.max(8, box.top - height - 6) : below
      setPosition({ left, top })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => {
      const target = event.target as Node
      if (!root.current?.contains(target) && !popover.current?.contains(target)) close()
    }
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && close()
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }) // re-bound each render so `close` sees the latest value

  const pick = (next: string) => {
    const parsed = parseColor(next)
    if (!parsed) return
    setHsv(hexToHsv(parsed.slice(0, 7)))
    onChange(parsed)
  }
  const setColor = (next: Hsv, nextAlpha = alpha) => {
    setHsv(next)
    onChange(joinHex(hsvToHex(next), nextAlpha))
  }
  const dragSv = useDrag((x, y) => setColor({ ...hsv, s: x, v: 1 - y }))
  const dragHue = useDrag((x) => setColor({ ...hsv, h: Math.min(359.9, x * 360) }))
  const dragAlpha = useDrag((x) => onChange(joinHex(rgb, x * 255)))
  const shown = joinHex(rgb, alpha)

  const typed = (text: string, setText: (value: string | null) => void) => {
    setText(text)
    const parsed = parseColor(text)
    if (parsed) pick(parsed)
  }

  return (
    <div ref={root} className={cn('relative', className)}>
      <div className={cn('flex h-10 items-center gap-2 rounded-md border border-border bg-surface pl-1.5 pr-2', disabled && 'opacity-50')}>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Pick ${label.toLowerCase()}`}
          aria-expanded={open}
          className="relative size-7 shrink-0 overflow-hidden rounded-sm border border-border"
          style={{ background: empty ? noneSwatch : checker }}
          onClick={() => {
            if (open) {
              close()
              return
            }
            openedWith.current = value
            setRecent(readRecent())
            setHost(root.current?.closest('dialog') ?? document.body)
            setOpen(true)
          }}
        >
          {empty ? null : <span aria-hidden="true" className="absolute inset-0" style={{ background: shown }} />}
        </button>
        <input
          aria-label={`${label} hex`}
          value={draft ?? (empty ? '' : shown)}
          placeholder={empty ? emptyLabel : undefined}
          spellCheck={false}
          disabled={disabled}
          maxLength={40}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-xs uppercase placeholder:normal-case placeholder:text-muted focus:outline-none"
          onChange={(event) => typed(event.target.value, setDraft)}
          onPaste={(event) => {
            const parsed = parseColor(event.clipboardData.getData('text'))
            if (parsed) {
              event.preventDefault()
              setDraft(null)
              pick(parsed)
            }
          }}
          onBlur={() => setDraft(null)}
        />
        {onClear && !empty ? (
          <button type="button" disabled={disabled} aria-label={`Clear ${label.toLowerCase()}`} className="text-muted hover:text-foreground" onClick={onClear}>
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {open && host
        ? createPortal(
            <div
              ref={popover}
              className="fixed z-[1000] w-64 rounded-md border border-border bg-surface p-3 text-foreground shadow-lg"
              style={{ left: position?.left ?? -9999, top: position?.top ?? -9999 }}
              role="dialog"
              aria-label={`${label} colour picker`}
            >
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

              {/* Hex / paste, opacity %, eyedropper */}
              <div className="mt-3 flex items-center gap-2">
                <input
                  aria-label="Hex or rgb"
                  value={popDraft ?? shown}
                  spellCheck={false}
                  maxLength={40}
                  className="h-8 min-w-0 flex-1 rounded-sm border border-border bg-background px-2 font-mono text-xs uppercase focus:border-accent"
                  onChange={(event) => typed(event.target.value, setPopDraft)}
                  onPaste={(event) => {
                    const parsed = parseColor(event.clipboardData.getData('text'))
                    if (parsed) {
                      event.preventDefault()
                      setPopDraft(null)
                      pick(parsed)
                    }
                  }}
                  onBlur={() => setPopDraft(null)}
                />
                <span className="w-12 text-right text-xs tabular-nums text-muted">{Math.round((alpha / 255) * 100)}%</span>
                {eyeDropper ? (
                  <button
                    type="button"
                    title="Pick a colour from the screen"
                    aria-label="Pick a colour from the screen"
                    className="inline-flex size-8 items-center justify-center rounded-sm border border-border text-muted hover:text-foreground"
                    onClick={() => {
                      void new eyeDropper()
                        .open()
                        .then((result) => pick(result.sRGBHex))
                        .catch(() => undefined)
                    }}
                  >
                    <Pipette className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              {brandColors.length ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Brand colours</p>
                  <div className="flex flex-wrap gap-1.5">
                    {brandColors.map((color, index) => (
                      <Swatch key={`${color.hex}-${index}`} color={color.hex} title={`${color.name} ${color.hex}`} onPick={() => pick(color.hex)} />
                    ))}
                  </div>
                </div>
              ) : null}
              {recent.length ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">Recent</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((color) => (
                      <Swatch key={color} color={color} title={color} onPick={() => pick(color)} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>,
            host,
          )
        : null}
    </div>
  )
}
