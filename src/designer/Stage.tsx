import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useDesignerSettings } from '@/designer/settings'

/* The shared canvas used by every designer: rulers, guides, snapping, grid, zoom, pan, select / move / resize. */

export type Box = { x: number; y: number; w: number; h: number }

export type StageItem = Box & {
  id: string
  label: string
  hidden?: boolean
  locked?: boolean
  /** Corner handles keep the width : height ratio. */
  keepRatio?: boolean
  /** Always square (QR codes). */
  square?: boolean
}

export type StageGuides = { vertical: number[]; horizontal: number[] }

/** The item being dragged and where it is right now. */
export type LiveBox = { id: string; box: Box }

/** Applies a live drag to any list of items with x / y / width / height (helper for `render`). */
export function withLive<T extends { id: string }>(list: T[], live: LiveBox | null, place: (item: T, box: Box) => T) {
  if (!live) return list
  return list.map((item) => (item.id === live.id ? place(item, live.box) : item))
}

export const emptyGuides: StageGuides = { vertical: [], horizontal: [] }

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type Lines = { x: number[]; y: number[] }

const PAD = 48
const RULER = 20
const SNAP_SCREEN_PX = 5

export function zoomLimits() {
  return { min: 0.05, max: 6 }
}

/** Ruler step (in units) so labelled ticks are at least ~60 screen px apart. */
function rulerStep(unit: 'mm' | 'px', scale: number) {
  const steps = unit === 'mm' ? [1, 2, 5, 10, 20, 50, 100, 200] : [5, 10, 20, 50, 100, 200, 500, 1000, 2000]
  return steps.find((step) => step * scale >= 60) ?? steps[steps.length - 1]
}

function nearest(values: number[], lines: number[], threshold: number) {
  let best: { shift: number; line: number } | null = null
  for (const value of values) {
    for (const line of lines) {
      const shift = line - value
      if (Math.abs(shift) <= threshold && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, line }
    }
  }
  return best
}

/**
 * Like `nearest`, but keeps the line it snapped to last time until the pointer moves clearly away,
 * so an item doesn't flicker between two lines that are close together.
 */
function sticky(values: number[], lines: number[], threshold: number, previous: number | null) {
  if (previous !== null) {
    let keep: { shift: number; line: number } | null = null
    for (const value of values) {
      const shift = previous - value
      if (Math.abs(shift) <= threshold * 1.5 && (!keep || Math.abs(shift) < Math.abs(keep.shift))) keep = { shift, line: previous }
    }
    if (keep) return keep
  }
  return nearest(values, lines, threshold)
}

/** Grid lines through the centre of the length, then every `step` either side. */
export function centredGrid(length: number, step: number) {
  if (length <= 0 || step <= 0) return []
  const centre = length / 2
  const lines = [centre]
  for (let offset = step; offset <= centre + 1e-6; offset += step) lines.push(centre - offset, centre + offset)
  return lines
}

const handles: { handle: Handle; style: CSSProperties; cursor: string }[] = [
  { handle: 'nw', style: { left: 0, top: 0 }, cursor: 'nwse-resize' },
  { handle: 'n', style: { left: '50%', top: 0 }, cursor: 'ns-resize' },
  { handle: 'ne', style: { left: '100%', top: 0 }, cursor: 'nesw-resize' },
  { handle: 'e', style: { left: '100%', top: '50%' }, cursor: 'ew-resize' },
  { handle: 'se', style: { left: '100%', top: '100%' }, cursor: 'nwse-resize' },
  { handle: 's', style: { left: '50%', top: '100%' }, cursor: 'ns-resize' },
  { handle: 'sw', style: { left: 0, top: '100%' }, cursor: 'nesw-resize' },
  { handle: 'w', style: { left: 0, top: '50%' }, cursor: 'ew-resize' },
]

export function Stage({
  width,
  height,
  unit,
  unitPx,
  zoom,
  onZoom,
  onFitChange,
  fitMode = 'contain',
  items,
  selectedId,
  onSelect,
  onItemChange,
  render,
  guides,
  onGuidesChange,
  minSize,
  editingId,
  renderEditor,
  onItemDoubleClick,
  pageHeight,
  artboardClassName,
  artboardStyle,
}: {
  /** Size of the design, in `unit`. */
  width: number
  height: number
  unit: 'mm' | 'px'
  /** Screen pixels per unit at 100 %. */
  unitPx: number
  zoom: number | 'fit'
  onZoom: (zoom: number | 'fit') => void
  /** Reports the "fit" zoom so the zoom box can show a number. */
  onFitChange?: (fit: number) => void
  /** "width" fits long pages (microsites) by width only. */
  fitMode?: 'contain' | 'width'
  /** Bottom to top. */
  items: StageItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onItemChange: (id: string, box: Box, phase: 'live' | 'end') => void
  /** Draws the design at `scale` screen px per unit. */
  /**
   * Draws the design at `scale` screen px per unit. While an item is being dragged, `live` holds its box:
   * draw that item there. The page itself is only told when the drag ends, so nothing else redraws mid-drag.
   */
  render: (scale: number, live: LiveBox | null) => ReactNode
  guides: StageGuides
  onGuidesChange: (guides: StageGuides) => void
  minSize?: number
  editingId?: string | null
  renderEditor?: (item: StageItem, scale: number) => ReactNode
  onItemDoubleClick?: (id: string) => void
  /** Bottom handle that changes the page height (long pages). */
  pageHeight?: { onLive: (height: number) => void; onEnd: () => void; min?: number; max?: number }
  artboardClassName?: string
  artboardStyle?: CSSProperties
}) {
  const { settings } = useDesignerSettings()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  /** The scroll area as state, so measuring and wheel-zoom follow it if it is ever re-created (e.g. rulers on/off). */
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null)
  const attachScroll = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node
    setScrollNode(node)
  }, [])
  const artboardRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 800, height: 600 })
  const [scroll, setScroll] = useState({ left: 0, top: 0 })
  const [snapLines, setSnapLines] = useState<Lines | null>(null)
  const [draftGuide, setDraftGuide] = useState<{ axis: 'x' | 'y'; value: number } | null>(null)
  const [panning, setPanning] = useState(false)
  /** The item being dragged: kept here (not in the page) so only the canvas redraws while dragging. */
  const [live, setLive] = useState<LiveBox | null>(null)
  const shownItems = useMemo(() => withLive(items, live, (item, box) => ({ ...item, ...box })), [items, live])
  const spaceDown = useRef(false)
  const round = useCallback((value: number) => (unit === 'mm' ? Math.round(value * 10) / 10 : Math.round(value)), [unit])
  const min = minSize ?? (unit === 'mm' ? 2 : 8)
  const gridStep = unit === 'mm' ? 5 : 20

  // The scroll area keeps its scrollbar space reserved (scrollbar-gutter), so its size doesn't change when a
  // scrollbar appears; tiny size changes are ignored. Both stop the "fit → scrollbar → refit" shaking loop.
  /** True while an item is dragged: the canvas never rescales mid-drag; it measures once afterwards. */
  const dragging = useRef(false)
  const measureRef = useRef<() => void>(() => undefined)
  useLayoutEffect(() => {
    const node = scrollNode
    if (!node) return
    const measure = () => {
      if (dragging.current) return
      setViewport((current) => {
        const next = { width: node.clientWidth, height: node.clientHeight }
        return Math.abs(current.width - next.width) < 2 && Math.abs(current.height - next.height) < 2 ? current : next
      })
    }
    measureRef.current = measure
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    measure()
    return () => observer.disconnect()
  }, [scrollNode])

  const handleSpace = pageHeight ? 32 : 0
  const fit = useMemo(() => {
    const byWidth = (viewport.width - PAD * 2) / (width * unitPx)
    const byHeight = (viewport.height - PAD * 2 - handleSpace) / (height * unitPx)
    const value = fitMode === 'width' ? Math.min(1, byWidth) : Math.min(byWidth, byHeight)
    // Rounded down so the fitted design never overflows by a fraction of a pixel.
    return Math.max(zoomLimits().min, Math.min(zoomLimits().max, Math.floor(value * 1000) / 1000))
  }, [viewport, width, height, unitPx, fitMode, handleSpace])
  useEffect(() => onFitChange?.(fit), [fit, onFitChange])

  const factor = zoom === 'fit' ? fit : zoom
  const scale = unitPx * factor
  const artWidth = width * scale
  const artHeight = height * scale
  const offsetX = Math.max(PAD, Math.floor((viewport.width - artWidth) / 2))
  const offsetY = fitMode === 'width' ? PAD : Math.max(PAD, Math.floor((viewport.height - artHeight - handleSpace) / 2))
  const contentWidth = Math.max(viewport.width, Math.ceil(artWidth + offsetX * 2))
  const contentHeight = Math.max(viewport.height, Math.ceil(artHeight + offsetY + PAD + handleSpace))

  // "Fit to screen" also brings the design back into view.
  useLayoutEffect(() => {
    if (zoom === 'fit' && scrollNode) scrollNode.scrollTo({ left: 0, top: 0 })
  }, [zoom, scrollNode])

  // Rulers follow scrolling at most once per frame.
  const scrollFrame = useRef<number | null>(null)
  useEffect(() => () => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current)
  }, [])
  const onScroll = () => {
    if (scrollFrame.current !== null) return
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null
      const node = scrollRef.current
      if (node) setScroll((current) => (current.left === node.scrollLeft && current.top === node.scrollTop ? current : { left: node.scrollLeft, top: node.scrollTop }))
    })
  }

  /* ---------- zoom with Ctrl + wheel, pan with Space / middle button ---------- */
  const scaleRef = useRef(factor)
  scaleRef.current = factor
  useEffect(() => {
    const node = scrollNode
    if (!node) return
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const next = scaleRef.current * (event.deltaY < 0 ? 1.1 : 1 / 1.1)
      onZoom(Math.max(zoomLimits().min, Math.min(zoomLimits().max, Math.round(next * 100) / 100)))
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => node.removeEventListener('wheel', wheel)
  }, [onZoom, scrollNode])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.code !== 'Space' || target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!spaceDown.current) {
        spaceDown.current = true
        setPanning(true)
      }
      event.preventDefault()
    }
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      spaceDown.current = false
      setPanning(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  function startPan(event: ReactPointerEvent) {
    const node = scrollRef.current
    if (!node) return
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const left = node.scrollLeft
    const top = node.scrollTop
    const move = (next: PointerEvent) => {
      node.scrollLeft = left - (next.clientX - startX)
      node.scrollTop = top - (next.clientY - startY)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /* ---------- snapping ---------- */
  /** Strong lines (canvas edges / centre, guides, other items) and, separately, grid lines (weaker). */
  function lines(exclude: string): Lines & { gx: number[]; gy: number[] } {
    const x = [0, width / 2, width, ...guides.vertical]
    const y = [0, height / 2, height, ...guides.horizontal]
    for (const item of items) {
      if (item.id === exclude || item.hidden) continue
      x.push(item.x, item.x + item.w / 2, item.x + item.w)
      y.push(item.y, item.y + item.h / 2, item.y + item.h)
    }
    // The grid runs out from the centre of the canvas.
    const gx = settings.grid ? centredGrid(width, gridStep) : []
    const gy = settings.grid ? centredGrid(height, gridStep) : []
    return { x, y, gx, gy }
  }

  /* ---------- move / resize ---------- */
  function startDrag(item: StageItem, event: ReactPointerEvent, handle: Handle | null) {
    if (event.button === 1 || spaceDown.current) {
      startPan(event)
      return
    }
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onSelect(item.id)
    if (item.locked) return
    dragging.current = true
    const start: Box = { x: item.x, y: item.y, w: item.w, h: item.h }
    const startX = event.clientX
    const startY = event.clientY
    const targets = lines(item.id)
    const threshold = SNAP_SCREEN_PX / scale
    const ratio = item.keepRatio && start.w > 0 ? start.h / start.w : null
    let moved = false
    let last: Box = start
    let lastShown = ''
    /** Lines snapped to on the previous move, per edge (sticky snapping). */
    const held: Record<string, number | null> = {}
    const snapOne = (key: string, values: number[], lines: number[]) => {
      const hit = sticky(values, lines, threshold, held[key] ?? null)
      held[key] = hit ? hit.line : null
      return hit
    }
    /** Strong lines first; the grid only when nothing stronger is near, and only for the leading edge. */
    const snapTo = (key: string, values: number[], axis: 'x' | 'y') => {
      const strong = snapOne(key, values, axis === 'x' ? targets.x : targets.y)
      if (strong) {
        held[`${key}-grid`] = null
        return strong
      }
      const grid = axis === 'x' ? targets.gx : targets.gy
      return grid.length ? snapOne(`${key}-grid`, values.slice(0, 1), grid) : null
    }

    // Pointer moves are handled at most once per screen frame: smoother, and far fewer redraws.
    let pending: PointerEvent | null = null
    let frame: number | null = null
    const schedule = (event: PointerEvent) => {
      pending = event
      if (frame === null)
        frame = requestAnimationFrame(() => {
          frame = null
          if (pending) apply(pending)
        })
    }

    const apply = (next: PointerEvent) => {
      const dx = (next.clientX - startX) / scale
      const dy = (next.clientY - startY) / scale
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3 / scale) return
      moved = true
      const snap = settings.snap && !next.altKey
      const shown: Lines = { x: [], y: [] }
      let box: Box
      if (!handle) {
        box = { ...start, x: start.x + dx, y: start.y + dy }
        if (next.shiftKey) {
          // Shift keeps the movement straight.
          if (Math.abs(dx) > Math.abs(dy)) box.y = start.y
          else box.x = start.x
        }
        if (snap) {
          const sx = snapTo('mx', [box.x, box.x + box.w / 2, box.x + box.w], 'x')
          const sy = snapTo('my', [box.y, box.y + box.h / 2, box.y + box.h], 'y')
          if (sx) {
            box.x += sx.shift
            shown.x.push(sx.line)
          }
          if (sy) {
            box.y += sy.shift
            shown.y.push(sy.line)
          }
        }
      } else {
        let { x, y, w, h } = start
        if (handle.includes('e')) w = start.w + dx
        if (handle.includes('s')) h = start.h + dy
        if (handle.includes('w')) {
          w = start.w - dx
          x = start.x + dx
        }
        if (handle.includes('n')) {
          h = start.h - dy
          y = start.y + dy
        }
        if (snap) {
          if (handle.includes('e')) {
            const s = snapTo('e', [x + w], 'x')
            if (s) {
              w += s.shift
              shown.x.push(s.line)
            }
          }
          if (handle.includes('w')) {
            const s = snapTo('w', [x], 'x')
            if (s) {
              x += s.shift
              w -= s.shift
              shown.x.push(s.line)
            }
          }
          if (handle.includes('s')) {
            const s = snapTo('s', [y + h], 'y')
            if (s) {
              h += s.shift
              shown.y.push(s.line)
            }
          }
          if (handle.includes('n')) {
            const s = snapTo('n', [y], 'y')
            if (s) {
              y += s.shift
              h -= s.shift
              shown.y.push(s.line)
            }
          }
        }
        w = Math.max(min, w)
        h = Math.max(min, h)
        if (item.square) {
          const size = handle === 'n' || handle === 's' ? h : w
          w = size
          h = size
          if (handle.includes('n')) y = start.y + start.h - size
          if (handle.includes('w')) x = start.x + start.w - size
        } else if (ratio !== null) {
          // Pictures keep their shape on every handle; side handles grow from the middle of that side.
          if (handle === 'e' || handle === 'w') {
            h = w * ratio
            y = start.y + (start.h - h) / 2
          } else if (handle === 'n' || handle === 's') {
            w = h / ratio
            x = start.x + (start.w - w) / 2
          } else {
            h = w * ratio
            if (handle.includes('n')) y = start.y + start.h - h
          }
        }
        if (handle.includes('w')) x = Math.min(x, start.x + start.w - min)
        if (handle.includes('n') && !item.square && ratio === null) y = Math.min(y, start.y + start.h - min)
        box = { x, y, w, h }
      }
      const next2 = { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) }
      // Only redraw when something actually changed.
      const shownKey = `${shown.x.join(',')}|${shown.y.join(',')}`
      if (shownKey !== lastShown) {
        lastShown = shownKey
        setSnapLines(shown.x.length || shown.y.length ? shown : null)
      }
      if (next2.x === last.x && next2.y === last.y && next2.w === last.w && next2.h === last.h) return
      last = next2
      setLive({ id: item.id, box: last })
    }
    const move = (event: PointerEvent) => schedule(event)
    const up = (event: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      apply(event)
      setSnapLines(null)
      // One change for the whole drag (one undo step); the live box goes away in the same update.
      if (moved) onItemChange(item.id, last, 'end')
      setLive(null)
      dragging.current = false
      measureRef.current()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  /* ---------- guides ---------- */
  function pointerToDesign(clientX: number, clientY: number) {
    const rect = artboardRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
  }

  function dragGuide(axis: 'x' | 'y', index: number | null, event: ReactPointerEvent) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const scrollRect = scrollRef.current?.getBoundingClientRect()
    let value: number | null = null
    let outside = false
    const move = (next: PointerEvent) => {
      const point = pointerToDesign(next.clientX, next.clientY)
      const raw = axis === 'x' ? point.x : point.y
      value = round(raw)
      outside =
        !scrollRect ||
        next.clientX < scrollRect.left ||
        next.clientY < scrollRect.top ||
        raw < 0 ||
        raw > (axis === 'x' ? width : height)
      setDraftGuide(outside ? null : { axis, value })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDraftGuide(null)
      const key = axis === 'x' ? 'vertical' : 'horizontal'
      const list = [...guides[key]]
      if (index !== null) list.splice(index, 1)
      if (value !== null && !outside) list.push(value)
      if (index !== null || (value !== null && !outside)) onGuidesChange({ ...guides, [key]: list.slice(0, 40) })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startPageResize(event: ReactPointerEvent) {
    if (!pageHeight) return
    event.preventDefault()
    const startY = event.clientY
    const startHeight = height
    const move = (next: PointerEvent) => {
      const value = Math.round(startHeight + (next.clientY - startY) / scale)
      pageHeight.onLive(Math.max(pageHeight.min ?? 100, Math.min(pageHeight.max ?? 20000, value)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      pageHeight.onEnd()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const selected = shownItems.find((item) => item.id === selectedId && !item.hidden) ?? null
  const handleSize = 9

  const board = (
    <div
      key="board"
      ref={attachScroll}
      className={cn('relative min-h-0 min-w-0 bg-[#e9e7e2] dark:bg-[#141413]', panning && 'cursor-grab')}
      style={{
        // At "fit" the whole design is on screen, so there is nothing to scroll: no scrollbars at all.
        overflow: zoom === 'fit' && fitMode === 'contain' ? 'hidden' : 'auto',
        scrollbarGutter: 'stable',
        overflowAnchor: 'none',
        gridArea: '2 / 2',
      }}
      onScroll={onScroll}
      onPointerDown={(event) => {
        if (event.button === 1 || spaceDown.current) {
          startPan(event)
          return
        }
        if (event.target === event.currentTarget || (event.target as HTMLElement).dataset.stageEmpty === 'true') onSelect(null)
      }}
    >
      {/* Clipped: an item dragged past the edge must not make scrollbars pop in (that resized the canvas mid-drag). */}
      <div className="relative overflow-hidden" style={{ width: contentWidth, height: contentHeight }} data-stage-empty="true">
        <div
          ref={artboardRef}
          className={cn('absolute outline outline-1 outline-black/10 dark:outline-white/10', artboardClassName)}
          style={{ left: offsetX, top: offsetY, width: artWidth, height: artHeight, ...artboardStyle }}
          onPointerDown={(event) => {
            if (event.button === 1 || spaceDown.current) {
              startPan(event)
              return
            }
            if (event.target === event.currentTarget) onSelect(null)
          }}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">{render(scale, live)}</div>

          {settings.grid ? (
            <>
              {/* Grid lines run out from the centre of the canvas, so the centre is always on a line. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(56,184,162,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,184,162,0.18) 1px, transparent 1px)',
                  backgroundSize: `${gridStep * scale}px ${gridStep * scale}px`,
                  backgroundPosition: `${(((artWidth / 2) % (gridStep * scale)) + gridStep * scale) % (gridStep * scale)}px ${(((artHeight / 2) % (gridStep * scale)) + gridStep * scale) % (gridStep * scale)}px`,
                }}
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-[rgba(56,184,162,0.6)]" style={{ left: artWidth / 2 }} />
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 h-px bg-[rgba(56,184,162,0.6)]" style={{ top: artHeight / 2 }} />
            </>
          ) : null}

          {/* Hit areas, bottom to top */}
          {shownItems.map((item) =>
            item.hidden ? null : editingId === item.id && renderEditor ? (
              <div key={item.id} className="absolute" style={{ left: item.x * scale, top: item.y * scale, width: item.w * scale, height: item.h * scale }}>
                {renderEditor(item, scale)}
              </div>
            ) : (
              <div
                key={item.id}
                role="button"
                tabIndex={-1}
                aria-label={item.label}
                title={item.locked ? `${item.label} (locked)` : undefined}
                className={cn(
                  'absolute',
                  item.locked ? 'pointer-events-none' : panning ? 'cursor-grab' : 'cursor-move',
                  item.id !== selectedId && !item.locked && 'hover:outline hover:outline-1 hover:outline-sky-400',
                )}
                style={{ left: item.x * scale, top: item.y * scale, width: item.w * scale, height: item.h * scale }}
                onPointerDown={(event) => startDrag(item, event, null)}
                onDoubleClick={() => onItemDoubleClick?.(item.id)}
              />
            ),
          )}

          {/* Guides */}
          {guides.vertical.map((value, index) => (
            <div
              key={`v${index}`}
              className="absolute inset-y-0 z-10 w-[7px] -translate-x-[3px] cursor-ew-resize"
              style={{ left: value * scale }}
              onPointerDown={(event) => dragGuide('x', index, event)}
              onDoubleClick={() => onGuidesChange({ ...guides, vertical: guides.vertical.filter((_, at) => at !== index) })}
              title="Guide — drag to move, drag onto the ruler or double-click to remove"
            >
              <span className="absolute inset-y-0 left-[3px] w-px bg-cyan-500" />
            </div>
          ))}
          {guides.horizontal.map((value, index) => (
            <div
              key={`h${index}`}
              className="absolute inset-x-0 z-10 h-[7px] -translate-y-[3px] cursor-ns-resize"
              style={{ top: value * scale }}
              onPointerDown={(event) => dragGuide('y', index, event)}
              onDoubleClick={() => onGuidesChange({ ...guides, horizontal: guides.horizontal.filter((_, at) => at !== index) })}
              title="Guide — drag to move, drag onto the ruler or double-click to remove"
            >
              <span className="absolute inset-x-0 top-[3px] h-px bg-cyan-500" />
            </div>
          ))}
          {draftGuide ? (
            draftGuide.axis === 'x' ? (
              <span className="pointer-events-none absolute inset-y-0 z-10 w-px bg-cyan-500" style={{ left: draftGuide.value * scale }} />
            ) : (
              <span className="pointer-events-none absolute inset-x-0 z-10 h-px bg-cyan-500" style={{ top: draftGuide.value * scale }} />
            )
          ) : null}

          {/* Snap lines */}
          {snapLines?.x.map((x, index) => (
            <span key={`sx${index}`} className="pointer-events-none absolute inset-y-0 z-20 w-px bg-fuchsia-500" style={{ left: x * scale }} />
          ))}
          {snapLines?.y.map((y, index) => (
            <span key={`sy${index}`} className="pointer-events-none absolute inset-x-0 z-20 h-px bg-fuchsia-500" style={{ top: y * scale }} />
          ))}

          {/* Selection */}
          {selected && editingId !== selected.id ? (
            <div
              className="pointer-events-none absolute z-30"
              style={{
                left: selected.x * scale,
                top: selected.y * scale,
                width: selected.w * scale,
                height: selected.h * scale,
                outline: `1.5px ${selected.locked ? 'dashed' : 'solid'} #0ea5e9`,
              }}
            >
              {selected.locked
                ? null
                : handles
                    .filter(({ handle }) => !selected.square || handle.length === 2)
                    .map(({ handle, style, cursor }) => (
                      <span
                        key={handle}
                        className="pointer-events-auto absolute rounded-[2px] border border-sky-500 bg-white"
                        style={{ ...style, width: handleSize, height: handleSize, marginLeft: -handleSize / 2, marginTop: -handleSize / 2, cursor }}
                        onPointerDown={(event) => startDrag(selected, event, handle)}
                      />
                    ))}
              {settings.advanced ? (
                <span className="absolute -bottom-6 left-0 whitespace-nowrap rounded-sm bg-sky-500 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
                  {selected.w} × {selected.h} {unit}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {pageHeight ? (
          <button
            type="button"
            aria-label="Drag to change the page height"
            title="Drag to change the page height"
            className="absolute flex h-5 w-24 -translate-x-1/2 cursor-ns-resize items-center justify-center rounded-full border border-border bg-surface text-[10px] tabular-nums text-muted"
            style={{ left: offsetX + artWidth / 2, top: offsetY + artHeight + 6 }}
            onPointerDown={startPageResize}
          >
            {Math.round(height)}
            {unit}
          </button>
        ) : null}
      </div>
    </div>
  )

  // One layout with or without rulers: the board always sits in a minmax(0, 1fr) cell, so it takes the
  // screen's size (and scrolls) instead of growing to the design's size, and it is never re-created.
  const ruler = settings.rulers ? RULER : 0
  return (
    <div
      className="grid min-h-0 min-w-0 flex-1 overflow-hidden"
      style={{ gridTemplateColumns: `${ruler}px minmax(0, 1fr)`, gridTemplateRows: `${ruler}px minmax(0, 1fr)` }}
    >
      {settings.rulers ? (
        <>
          <div key="corner" className="border-b border-r border-border bg-surface" style={{ gridArea: '1 / 1' }} aria-hidden="true">
            <span className="block pt-1 text-center text-[9px] text-muted">{unit}</span>
          </div>
          <div key="ruler-x" className="grid min-w-0" style={{ gridArea: '1 / 2' }}>
            <Ruler
              axis="x"
              length={viewport.width}
              origin={offsetX - scroll.left}
              scale={scale}
              unit={unit}
              highlight={selected ? [selected.x, selected.x + selected.w] : null}
              onPointerDown={(event) => dragGuide('y', null, event)}
            />
          </div>
          <div key="ruler-y" className="grid min-h-0" style={{ gridArea: '2 / 1' }}>
            <Ruler
              axis="y"
              length={viewport.height}
              origin={offsetY - scroll.top}
              scale={scale}
              unit={unit}
              highlight={selected ? [selected.y, selected.y + selected.h] : null}
              onPointerDown={(event) => dragGuide('x', null, event)}
            />
          </div>
        </>
      ) : null}
      {board}
    </div>
  )
}

/** Ruler along the top (x) or left (y). Drag from it to add a guide. */
export function Ruler({
  axis,
  length,
  origin,
  scale,
  unit,
  highlight,
  onPointerDown,
}: {
  axis: 'x' | 'y'
  length: number
  origin: number
  scale: number
  unit: 'mm' | 'px'
  highlight: [number, number] | null
  onPointerDown: (event: ReactPointerEvent) => void
}) {
  const step = rulerStep(unit, scale)
  const minor = step / (step % 5 === 0 ? 5 : 2)
  const first = Math.floor(-origin / scale / minor) * minor
  const last = (length - origin) / scale
  const ticks: { value: number; major: boolean }[] = []
  for (let value = first; value <= last && ticks.length < 2000; value += minor) {
    const rounded = Math.round(value * 1000) / 1000
    ticks.push({ value: rounded, major: Math.abs(rounded / step - Math.round(rounded / step)) < 1e-6 })
  }
  const horizontal = axis === 'x'
  return (
    <div
      className={cn('relative select-none overflow-hidden bg-surface text-muted', horizontal ? 'cursor-s-resize border-b border-border' : 'cursor-e-resize border-r border-border')}
      onPointerDown={onPointerDown}
      title="Drag onto the design to add a guide"
    >
      {highlight ? (
        <span
          className="absolute bg-sky-500/15"
          style={
            horizontal
              ? { left: origin + highlight[0] * scale, width: (highlight[1] - highlight[0]) * scale, top: 0, bottom: 0 }
              : { top: origin + highlight[0] * scale, height: (highlight[1] - highlight[0]) * scale, left: 0, right: 0 }
          }
        />
      ) : null}
      <svg className="absolute inset-0 size-full" aria-hidden="true">
        {ticks.map(({ value, major }) => {
          const position = Math.round(origin + value * scale) + 0.5
          const size = major ? RULER : RULER * 0.35
          return horizontal ? (
            <g key={value}>
              <line x1={position} x2={position} y1={RULER - size} y2={RULER} stroke="currentColor" strokeOpacity={major ? 0.7 : 0.35} />
              {major ? (
                <text x={position + 3} y={9} fontSize={9} fill="currentColor">
                  {value}
                </text>
              ) : null}
            </g>
          ) : (
            <g key={value}>
              <line y1={position} y2={position} x1={RULER - size} x2={RULER} stroke="currentColor" strokeOpacity={major ? 0.7 : 0.35} />
              {major ? (
                <text x={3} y={position + 3} fontSize={9} fill="currentColor" transform={`rotate(-90 3 ${position + 3})`}>
                  {value}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
