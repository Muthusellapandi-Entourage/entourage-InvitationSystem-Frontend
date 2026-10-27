import { memo, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Circle, Ellipse, Group, Layer, Line, Rect, Shape, Stage, Text, Transformer } from 'react-konva'
import { CHAIR, CHAIR_BOTTOM, CHAIR_LEFT, CHAIR_RIGHT, CHAIR_TOP, ROW_LABEL_GUTTER, seatPlace } from '@/seating/geometry'
import { arrangementBox, moveCohort, readableOn, rotateSelection, tableLabelPoint, unionBounds, uprightRotation, type WorldRect } from '@/seating/layoutOps'
import { defaultChairFill, defaultChairStroke, defaultStageFill, defaultStageStroke, defaultTableFill, defaultTableStroke, type Arrangement, type FloorLayout, type TableKind } from '@/seating/model'

export type FloorColors = {
  background: string
  surface: string
  foreground: string
  muted: string
  border: string
  accent: string
  accentSoft: string
}

export function readFloorColors(): FloorColors {
  const style = getComputedStyle(document.documentElement)
  const pick = (name: string) => style.getPropertyValue(name).trim()
  return {
    background: pick('--background'),
    surface: pick('--surface'),
    foreground: pick('--foreground'),
    muted: pick('--muted'),
    border: pick('--border'),
    accent: pick('--accent'),
    accentSoft: pick('--accent-soft'),
  }
}

type SelectMode = 'replace' | 'add' | 'toggle'

/** What the hover card shows about a seated guest. */
export type SeatGuest = {
  name: string
  guestTypeName: string | null
  position: string | null
  email: string | null
  checkInCode: string | null
}

type SeatHover = {
  guestId: string
  place: string
  left: number
  top: number
}

type FloorStageProps = {
  layout: FloorLayout
  colors: FloorColors
  grid: number
  snap: boolean
  tool: 'select' | 'pan' | TableKind
  selectedIds: string[]
  primaryId: string | null
  selectedSeatId: string | null
  selectedSeatKeys: string[]
  labelFontSize: number
  onSelect: (arrangementId: string | null, seatId: string | null, mode: SelectMode) => void
  onMarquee: (rect: WorldRect, additive: boolean) => void
  onMove: (arrangementId: string, x: number, y: number, rotation: number, size?: { width: number; height: number }) => void
  onSeatMove: (arrangementId: string, seatId: string, x: number, y: number) => void
  onRotateSeat: (arrangementId: string, seatId: string, rotation: number) => void
  onRotateSelection: (degrees: number) => void
  onPlace: (x: number, y: number) => void
  onAssign: (arrangementId: string, seatId: string, guestId: string) => void
  view: { x: number; y: number; scale: number }
  onView: (view: { x: number; y: number; scale: number }) => void
  /** Guest details by id, for the seated marker's hover card. */
  guests?: Map<string, SeatGuest>
}

function selectMode(event: { evt: MouseEvent | TouchEvent }): SelectMode {
  if (!('ctrlKey' in event.evt)) return 'replace'
  if (event.evt.ctrlKey || event.evt.metaKey) return 'toggle'
  if (event.evt.shiftKey) return 'add'
  return 'replace'
}

export function FloorStage({
  layout,
  colors,
  grid,
  snap,
  tool,
  selectedIds,
  primaryId,
  selectedSeatId,
  selectedSeatKeys,
  labelFontSize,
  onSelect,
  onMarquee,
  onMove,
  onSeatMove,
  onRotateSeat,
  onRotateSelection,
  onPlace,
  onAssign,
  view,
  onView,
  guests,
}: FloorStageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<SeatHover | null>(null)
  // Latest props for callbacks handed to memoized tables.
  const live = useRef({ layout, selectedIds, onSelect, onRotateSeat, onMove, onSeatMove, view, onView })
  live.current = { layout, selectedIds, onSelect, onRotateSeat, onMove, onSeatMove, view, onView }

  // Middle mouse button pans the floor with any tool, like most design apps.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let pan: { pointerId: number; startX: number; startY: number; viewX: number; viewY: number } | null = null
    let latest = { x: 0, y: 0 }
    let frame: number | null = null

    const apply = () => {
      frame = null
      if (!pan) return
      const view = live.current.view
      live.current.onView({ ...view, x: pan.viewX + latest.x - pan.startX, y: pan.viewY + latest.y - pan.startY })
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 1) return
      // Stop the browser's auto-scroll and keep Konva from starting a selection box or drag.
      event.preventDefault()
      event.stopPropagation()
      const view = live.current.view
      pan = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y }
      latest = { x: event.clientX, y: event.clientY }
      host.setPointerCapture(event.pointerId)
      host.style.cursor = 'grabbing'
      setHover(null)
    }
    const move = (event: PointerEvent) => {
      if (!pan || event.pointerId !== pan.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      latest = { x: event.clientX, y: event.clientY }
      if (frame === null) frame = requestAnimationFrame(apply)
    }
    const up = (event: PointerEvent) => {
      if (!pan || event.pointerId !== pan.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      latest = { x: event.clientX, y: event.clientY }
      if (frame !== null) cancelAnimationFrame(frame)
      apply()
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId)
      pan = null
      host.style.cursor = ''
    }
    // Some browsers trigger auto-scroll or paste from mousedown/auxclick, not pointerdown.
    const blockMiddle = (event: MouseEvent) => {
      if (event.button !== 1) return
      event.preventDefault()
      event.stopPropagation()
    }
    host.addEventListener('pointerdown', down, true)
    host.addEventListener('pointermove', move, true)
    host.addEventListener('pointerup', up, true)
    host.addEventListener('pointercancel', up, true)
    host.addEventListener('mousedown', blockMiddle, true)
    host.addEventListener('auxclick', blockMiddle, true)
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      host.removeEventListener('pointerdown', down, true)
      host.removeEventListener('pointermove', move, true)
      host.removeEventListener('pointerup', up, true)
      host.removeEventListener('pointercancel', up, true)
      host.removeEventListener('mousedown', blockMiddle, true)
      host.removeEventListener('auxclick', blockMiddle, true)
    }
  }, [])
  const panFrame = useRef<number | null>(null)
  const zoomFrame = useRef<{ id: number; scale: number; pointer: { x: number; y: number } } | null>(null)
  // Chair numbers are unreadable when zoomed far out; skipping them keeps big floors fast.
  const detail = view.scale >= 0.45

  function showGuest(arrangement: Arrangement, seat: Arrangement['seats'][number] | null) {
    const stage = stageRef.current
    if (!seat?.guestId || !stage) {
      setHover(null)
      return
    }
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const next = { guestId: seat.guestId, place: `${arrangement.name} · ${seatPlace(seat)}`, left: pointer.x, top: pointer.y }
    // Skip tiny pointer moves on the same chair so a large floor is not redrawn on every pixel.
    setHover((current) =>
      current && current.guestId === next.guestId && current.place === next.place && Math.hypot(current.left - next.left, current.top - next.top) < 6
        ? current
        : next,
    )
  }
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const nodes = useRef(new Map<string, Konva.Group>())
  const seatNodes = useRef(new Map<string, Konva.Group>())
  const marquee = useRef<{ x: number; y: number } | null>(null)
  const dragOrigin = useRef<{ id: string; positions: Map<string, { x: number; y: number }> } | null>(null)
  const [draft, setDraft] = useState<WorldRect | null>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver(() => {
      setSize({ width: host.clientWidth, height: host.clientHeight })
    })
    observer.observe(host)
    setSize({ width: host.clientWidth, height: host.clientHeight })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const seatKey = selectedSeatKeys.length === 1 ? selectedSeatKeys[0] : null
    const singleTable = !seatKey && selectedIds.length === 1
    const node =
      tool !== 'select'
        ? undefined
        : seatKey
          ? seatNodes.current.get(seatKey)
          : singleTable && primaryId
            ? nodes.current.get(primaryId)
            : undefined
    transformerRef.current?.nodes(node ? [node] : [])
    transformerRef.current?.getLayer()?.batchDraw()
  }, [primaryId, selectedIds, selectedSeatKeys, tool, layout.arrangements])

  function finishMarquee(additive: boolean) {
    const start = marquee.current
    const stage = stageRef.current
    marquee.current = null
    if (!start || !stage) {
      setDraft(null)
      return
    }
    const point = stage.getRelativePointerPosition() ?? { x: start.x, y: start.y }
    const rect = { x1: start.x, y1: start.y, x2: point.x, y2: point.y }
    setDraft(null)
    if (Math.abs(rect.x2 - rect.x1) < 4 && Math.abs(rect.y2 - rect.y1) < 4) {
      onSelect(null, null, 'replace')
      return
    }
    onMarquee(rect, additive)
  }

  const selecting = draft !== null
  useEffect(() => {
    if (!selecting) return
    const up = (event: MouseEvent) => {
      if (!marquee.current) return
      finishMarquee(event.shiftKey || event.ctrlKey || event.metaKey)
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [selecting])

  function beginGroupRotate(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    event.cancelBubble = true
    const stage = stageRef.current
    const bounds = unionBounds(
      selectedIds.flatMap((id) => {
        const item = layout.arrangements.find((entry) => entry.id === id)
        return item ? [arrangementBox(item)] : []
      }),
    )
    const pointer = stage?.getRelativePointerPosition()
    if (!stage || !bounds || !pointer || selectedIds.length < 2) return
    const snapshot = layout.arrangements
    const ids = selectedIds
    let last = Math.atan2(pointer.y - bounds.cy, pointer.x - bounds.cx)
    let total = 0
    const apply = (delta: number) => {
      const next = rotateSelection(snapshot, ids, delta)
      for (const item of next) {
        if (!ids.includes(item.id)) continue
        const node = nodes.current.get(item.id)
        if (!node) continue
        node.position({ x: item.x, y: item.y })
        node.rotation(item.rotation)
        node.findOne('.table-label')?.rotation(uprightRotation(item.rotation))
        node.find('.row-label').forEach((label) => label.rotation(uprightRotation(item.rotation)))
        for (const seat of item.seats) {
          seatNodes.current.get(`${item.id}:${seat.id}`)?.findOne('.chair-label')?.rotation(uprightRotation(item.rotation + seat.rotation))
        }
      }
    }
    const move = (native: MouseEvent) => {
      stage.setPointersPositions(native)
      const point = stage.getRelativePointerPosition()
      if (!point) return
      const angle = Math.atan2(point.y - bounds.cy, point.x - bounds.cx)
      let step = ((angle - last) * 180) / Math.PI
      if (step > 180) step -= 360
      if (step < -180) step += 360
      last = angle
      total += step
      apply(snap ? Math.round(total / 15) * 15 : total)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      const delta = snap ? Math.round(total / 15) * 15 : total
      if (Math.abs(delta) < 0.01) {
        for (const item of snapshot) {
          if (!ids.includes(item.id)) continue
          nodes.current.get(item.id)?.position({ x: item.x, y: item.y })
          nodes.current.get(item.id)?.rotation(item.rotation)
        }
        return
      }
      onRotateSelection(delta)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  function zoomAt(pointer: { x: number; y: number }, nextScale: number) {
    // Read the newest view: this can run from an animation frame scheduled during an older render.
    const current = live.current.view
    const scale = Math.min(2.5, Math.max(0.25, nextScale))
    const point = { x: (pointer.x - current.x) / current.scale, y: (pointer.y - current.y) / current.scale }
    onView({ scale, x: pointer.x - point.x * scale, y: pointer.y - point.y * scale })
  }

  function dropGuest(event: React.DragEvent) {
    event.preventDefault()
    const guestId = event.dataTransfer.getData('application/x-guest')
    const stage = stageRef.current
    if (!guestId || !stage) return
    stage.setPointersPositions(event.nativeEvent)
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    let node: Konva.Node | null = stage.getIntersection(pointer)
    while (node) {
      const name = node.name()
      if (name.startsWith('seat:')) {
        const [, arrangementId, seatId] = name.split(':')
        if (arrangementId && seatId) onAssign(arrangementId, seatId, guestId)
        return
      }
      node = node.getParent()
    }
  }

  return (
    <div
      ref={hostRef}
      className="relative min-h-0 min-w-0 flex-1 select-none"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('application/x-guest')) event.preventDefault()
      }}
      onDrop={dropGuest}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable={tool === 'pan'}
        style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair', background: colors.background }}
        onDragMove={(event) => {
          // Keep the grid filling the screen while panning. One update per animation frame at most.
          if (event.target !== stageRef.current || panFrame.current !== null) return
          panFrame.current = requestAnimationFrame(() => {
            panFrame.current = null
            const stage = stageRef.current
            if (stage) onView({ ...live.current.view, x: stage.x(), y: stage.y() })
          })
        }}
        onDragEnd={(event) => {
          if (event.target !== stageRef.current) return
          if (panFrame.current !== null) {
            cancelAnimationFrame(panFrame.current)
            panFrame.current = null
          }
          onView({ ...view, x: event.target.x(), y: event.target.y() })
        }}
        onWheel={(event) => {
          event.evt.preventDefault()
          setHover(null)
          const pointer = stageRef.current?.getPointerPosition()
          if (!pointer) return
          // Trackpads fire many wheel events per frame; fold them into one zoom per animation frame.
          const factor = event.evt.deltaY < 0 ? 1.08 : 1 / 1.08
          if (zoomFrame.current) {
            zoomFrame.current.scale *= factor
            zoomFrame.current.pointer = pointer
            return
          }
          zoomFrame.current = {
            scale: factor,
            pointer,
            id: requestAnimationFrame(() => {
              const pending = zoomFrame.current
              zoomFrame.current = null
              if (pending) zoomAt(pending.pointer, live.current.view.scale * pending.scale)
            }),
          }
        }}
        onMouseDown={(event) => {
          // Only the left button selects or places; the middle button pans (handled on the host).
          if ('button' in event.evt && event.evt.button !== 0) return
          if (event.target !== stageRef.current) return
          if (tool !== 'select' && tool !== 'pan') {
            const point = stageRef.current.getRelativePointerPosition()
            if (point) onPlace(point.x, point.y)
            return
          }
          if (tool !== 'select') return
          const point = stageRef.current.getRelativePointerPosition()
          if (!point) return
          marquee.current = { x: point.x, y: point.y }
          setDraft({ x1: point.x, y1: point.y, x2: point.x, y2: point.y })
        }}
        onMouseMove={() => {
          if (!marquee.current || !stageRef.current) return
          const point = stageRef.current.getRelativePointerPosition()
          if (!point) return
          setDraft({ x1: marquee.current.x, y1: marquee.current.y, x2: point.x, y2: point.y })
        }}
        onMouseUp={(event) => {
          if (!marquee.current) return
          finishMarquee(event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey)
        }}
      >
        <Layer listening={false}>
          <Grid colors={colors} grid={grid} view={view} width={size.width} height={size.height} />
        </Layer>
        <Layer>
          {layout.arrangements.map((arrangement) => {
            // Callbacks read the latest state through `live`, so a table that is not re-rendered
            // (see the memo on ArrangementNode) still acts on the current selection and handlers.
            const id = arrangement.id
            const ownSeatKeys = selectedSeatKeys.filter((key) => key.startsWith(`${id}:`))
            return (
              <ArrangementNode
                key={id}
                arrangement={arrangement}
                colors={colors}
                selected={selectedIds.includes(id)}
                selectedSeatId={id === primaryId ? selectedSeatId : null}
                selectedSeatKeys={ownSeatKeys}
                labelFontSize={labelFontSize}
                draggable={tool === 'select'}
                detail={detail}
                guests={guests}
                register={(node) => {
                  if (node) nodes.current.set(id, node)
                  else nodes.current.delete(id)
                }}
                onSelectSeat={(seatId, mode) => live.current.onSelect(id, seatId, mode)}
                onSelectBody={(mode) => live.current.onSelect(id, null, mode)}
                registerSeat={(seatId, node) => {
                  const key = `${id}:${seatId}`
                  if (node) seatNodes.current.set(key, node)
                  else seatNodes.current.delete(key)
                }}
                onRotateSeat={(seatId, rotation) => live.current.onRotateSeat(id, seatId, rotation)}
                onDragStart={() => {
                  const current = live.current.layout.arrangements
                  const ids = moveCohort(current, id, live.current.selectedIds)
                  dragOrigin.current = {
                    id,
                    positions: new Map(
                      ids.map((memberId) => {
                        const item = current.find((entry) => entry.id === memberId)
                        return [memberId, { x: item?.x ?? 0, y: item?.y ?? 0 }]
                      }),
                    ),
                  }
                }}
                onDragMove={(x, y) => {
                  const origin = dragOrigin.current
                  if (!origin || origin.id !== id) return
                  const start = origin.positions.get(id)
                  if (!start) return
                  const dx = x - start.x
                  const dy = y - start.y
                  for (const [memberId, position] of origin.positions) {
                    if (memberId === id) continue
                    nodes.current.get(memberId)?.position({ x: position.x + dx, y: position.y + dy })
                  }
                }}
                onMove={(x, y, rotation, size) => {
                  dragOrigin.current = null
                  live.current.onMove(id, x, y, rotation, size)
                }}
                onSeatMove={(seatId, x, y) => live.current.onSeatMove(id, seatId, x, y)}
                onHoverSeat={(seat) => {
                  const current = live.current.layout.arrangements.find((entry) => entry.id === id)
                  if (current) showGuest(current, seat)
                }}
              />
            )
          })}
          {draft ? (
            <Rect
              listening={false}
              x={Math.min(draft.x1, draft.x2)}
              y={Math.min(draft.y1, draft.y2)}
              width={Math.abs(draft.x2 - draft.x1)}
              height={Math.abs(draft.y2 - draft.y1)}
              fill={colors.accentSoft}
              stroke={colors.accent}
              strokeWidth={1}
              dash={[4, 4]}
            />
          ) : null}
          <SelectionFrame ids={selectedIds} arrangements={layout.arrangements} color={colors.accent} />
          {selectedIds.length > 1 ? (
            <GroupRotateHandle arrangements={layout.arrangements} ids={selectedIds} color={colors.accent} surface={colors.surface} onRotateStart={beginGroupRotate} />
          ) : null}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            enabledAnchors={
              selectedIds.length === 1 && !selectedSeatId && layout.arrangements.find((item) => item.id === primaryId)?.kind === 'stage'
                ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                : []
            }
            borderStroke={colors.accent}
            anchorStroke={colors.accent}
            anchorFill={colors.surface}
            rotateAnchorOffset={18}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 40 || newBox.height < 24 ? oldBox : newBox)}
          />
        </Layer>
      </Stage>
      {hover ? <GuestCard hover={hover} guest={guests?.get(hover.guestId) ?? null} host={hostRef.current} /> : null}
    </div>
  )
}

/** Hover card for a seated guest. Pointer-transparent so it never blocks dragging. */
function GuestCard({ hover, guest, host }: { hover: SeatHover; guest: SeatGuest | null; host: HTMLDivElement | null }) {
  const width = 240
  const hostWidth = host?.clientWidth ?? 0
  // Flip to the left of the pointer near the right edge, and below it near the top.
  const left = hostWidth > 0 && hover.left + 16 + width > hostWidth ? hover.left - 16 - width : hover.left + 16
  const below = hover.top < 120
  // Same rule as the chair: first and last name, so "Abdulla A Owaid" is "AO", not "AA".
  const initials = guestInitials(guest?.name)
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-30 rounded-lg border border-border bg-surface p-3 text-sm shadow-[var(--shadow)]"
      style={{ left, top: below ? hover.top + 16 : hover.top - 12, width, transform: below ? undefined : 'translateY(-100%)' }}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {initials || '?'}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{guest?.name ?? 'Guest no longer on the list'}</p>
          <p className="truncate text-xs text-muted">{guest?.guestTypeName ?? 'Guest'}</p>
        </div>
      </div>
      <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">Seat</dt>
        <dd className="truncate font-medium">{hover.place}</dd>
        {guest?.position ? (
          <>
            <dt className="text-muted">Position</dt>
            <dd className="truncate">{guest.position}</dd>
          </>
        ) : null}
        {guest?.email ? (
          <>
            <dt className="text-muted">Email</dt>
            <dd className="truncate">{guest.email}</dd>
          </>
        ) : null}
        {guest?.checkInCode ? (
          <>
            <dt className="text-muted">Check-in</dt>
            <dd className="truncate font-mono">{guest.checkInCode}</dd>
          </>
        ) : null}
      </dl>
    </div>
  )
}

/**
 * Grid lines for exactly the part of the floor on screen, so the grid never runs out however far
 * you pan, and the line count stays small however far you zoom out (spacing doubles below ~8px).
 */
function Grid({
  colors,
  grid,
  view,
  width,
  height,
}: {
  colors: FloorColors
  grid: number
  view: { x: number; y: number; scale: number }
  width: number
  height: number
}) {
  let step = Math.max(4, grid)
  while (step * view.scale < 8) step *= 2
  const left = Math.floor(-view.x / view.scale / step) * step - step
  const top = Math.floor(-view.y / view.scale / step) * step - step
  const right = left + width / view.scale + step * 3
  const bottom = top + height / view.scale + step * 3
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(context) => {
        context.beginPath()
        for (let x = left; x <= right; x += step) {
          context.moveTo(x, top)
          context.lineTo(x, bottom)
        }
        for (let y = top; y <= bottom; y += step) {
          context.moveTo(left, y)
          context.lineTo(right, y)
        }
        context.strokeStyle = colors.border
        // Keep lines one screen pixel wide at any zoom.
        context.lineWidth = 1 / view.scale
        context.stroke()
      }}
    />
  )
}

function SelectionFrame({
  ids,
  arrangements,
  color,
}: {
  ids: string[]
  arrangements: Arrangement[]
  color: string
}) {
  if (ids.length < 2) return null
  const bounds = unionBounds(ids.flatMap((id) => {
    const item = arrangements.find((entry) => entry.id === id)
    return item ? [arrangementBox(item)] : []
  }))
  if (!bounds) return null
  return (
    <Rect
      listening={false}
      x={bounds.left - 10}
      y={bounds.top - 10}
      width={bounds.width + 20}
      height={bounds.height + 20}
      stroke={color}
      strokeWidth={1}
      dash={[6, 4]}
    />
  )
}

type ArrangementNodeProps = Parameters<typeof ArrangementNodeView>[0]

function sameKeys(a: string[], b: string[]) {
  return a.length === b.length && a.every((key, index) => key === b[index])
}

/**
 * A table only redraws when its own data or selection changes, not on every zoom, pan, or edit
 * elsewhere on the floor. Callbacks are ignored here because they read the latest state through a ref.
 */
const ArrangementNode = memo(
  ArrangementNodeView,
  (previous: ArrangementNodeProps, next: ArrangementNodeProps) =>
    previous.arrangement === next.arrangement &&
    previous.colors === next.colors &&
    previous.selected === next.selected &&
    previous.selectedSeatId === next.selectedSeatId &&
    sameKeys(previous.selectedSeatKeys, next.selectedSeatKeys) &&
    previous.labelFontSize === next.labelFontSize &&
    previous.draggable === next.draggable &&
    previous.detail === next.detail &&
    previous.guests === next.guests,
)

/**
 * First letter of the first name + first letter of the last name:
 * "Abdulla A Owaid" → "AO", "Priya Raman" → "PR", "Madonna" → "MA". Null when there is no name.
 * Splits on anything that is not a letter or digit (non-breaking spaces, dots, commas, tabs…),
 * so "Abdulla A. Owaid" or a name pasted from Excel still gives "AO".
 */
export function guestInitials(name: string | null | undefined) {
  const parts = (name ?? '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function ArrangementNodeView({
  arrangement,
  colors,
  selected,
  selectedSeatId,
  selectedSeatKeys,
  labelFontSize,
  draggable,
  detail,
  guests,
  register,
  onSelectSeat,
  onSelectBody,
  onDragStart,
  onDragMove,
  onMove,
  onSeatMove,
  registerSeat,
  onRotateSeat,
  onHoverSeat,
}: {
  onHoverSeat: (seat: Arrangement['seats'][number] | null) => void
  /** False when zoomed far out: chair numbers and badges are skipped. */
  detail: boolean
  /** Guest details by id; an occupied chair shows the guest's initials instead of its number. */
  guests?: Map<string, SeatGuest>
  arrangement: Arrangement
  colors: FloorColors
  selected: boolean
  selectedSeatId: string | null
  selectedSeatKeys: string[]
  labelFontSize: number
  draggable: boolean
  register: (node: Konva.Group | null) => void
  onSelectSeat: (seatId: string, mode: SelectMode) => void
  onSelectBody: (mode: SelectMode) => void
  onDragStart: () => void
  onDragMove: (x: number, y: number) => void
  onMove: (x: number, y: number, rotation: number, size?: { width: number; height: number }) => void
  onSeatMove: (seatId: string, x: number, y: number) => void
  registerSeat: (seatId: string, node: Konva.Group | null) => void
  onRotateSeat: (seatId: string, rotation: number) => void
}) {
  const dragged = useRef(false)
  const nameWidth = Math.max(80, arrangement.tableWidth || 80)
  const labelPoint = tableLabelPoint(arrangement)
  const labelFill = arrangement.labelColor
    ?? (arrangement.kind === 'row'
      ? '#FFFFFF'
      : readableOn(arrangement.fill ?? (arrangement.kind === 'stage' ? defaultStageFill : defaultTableFill)))
  const nameSize = arrangement.kind === 'stage' && arrangement.labelSize ? arrangement.labelSize : labelFontSize
  const chairScale = (arrangement.chairSize ?? CHAIR) / CHAIR
  return (
    <Group
      ref={register}
      x={arrangement.x}
      y={arrangement.y}
      rotation={arrangement.rotation}
      draggable={draggable && selectedSeatId == null}
      onDragStart={() => {
        dragged.current = true
        onDragStart()
      }}
      onDragMove={(event) => {
        onDragMove(event.target.x(), event.target.y())
      }}
      onDragEnd={(event) => {
        onMove(event.target.x(), event.target.y(), event.target.rotation())
        dragged.current = false
      }}
      onTransform={(event) => {
        const node = event.target as unknown as Konva.Container
        node.findOne('.table-label')?.rotation(uprightRotation(node.rotation()))
        node.find('.row-label').forEach((label) => label.rotation(uprightRotation(node.rotation())))
      }}
      onTransformEnd={(event) => {
        const node = event.target
        const width = Math.max(80, Math.round(arrangement.tableWidth * node.scaleX()))
        const height = Math.max(48, Math.round(arrangement.tableHeight * node.scaleY()))
        node.scaleX(1)
        node.scaleY(1)
        onMove(node.x(), node.y(), node.rotation(), arrangement.kind === 'stage' ? { width, height } : undefined)
      }}
    >
      <TableBody arrangement={arrangement} colors={colors} selected={selected} onSelect={onSelectBody} />
      {arrangement.seats.map((seat) => {
        const marked = selectedSeatKeys.includes(`${arrangement.id}:${seat.id}`) || seat.id === selectedSeatId || (selected && selectedSeatId == null && arrangement.kind === 'row')
        const chairFill = seat.fill ?? defaultChairFill
        const chairStroke = seat.stroke ?? (marked ? colors.accent : defaultChairStroke)
        const seatSelected = seat.id === selectedSeatId
        return (
          <Group
            key={seat.id}
            ref={(node) => registerSeat(seat.id, node)}
            x={seat.x}
            y={seat.y}
            rotation={seat.rotation}
            draggable={draggable && seatSelected}
            name={`seat:${arrangement.id}:${seat.id}`}
            onDragStart={(event) => {
              event.cancelBubble = true
              onHoverSeat(null)
            }}
            onDragEnd={(event) => {
              event.cancelBubble = true
              onSeatMove(seat.id, event.target.x(), event.target.y())
            }}
            onMouseEnter={(event) => {
              if (!seat.guestId) return
              const stage = event.target.getStage()
              if (stage) stage.container().style.cursor = 'pointer'
              onHoverSeat(seat)
            }}
            onMouseMove={() => {
              if (seat.guestId) onHoverSeat(seat)
            }}
            onMouseLeave={(event) => {
              const stage = event.target.getStage()
              if (stage) stage.container().style.cursor = ''
              onHoverSeat(null)
            }}
            onClick={(event) => {
              event.cancelBubble = true
              if (!dragged.current) onSelectSeat(seat.id, selectMode(event))
            }}
            onDblClick={(event) => {
              event.cancelBubble = true
              onSelectBody('replace')
            }}
            onTap={(event) => {
              event.cancelBubble = true
              onSelectSeat(seat.id, 'replace')
            }}
            onTransform={(event) => {
              const node = event.target as unknown as Konva.Container
              node.findOne('.chair-label')?.rotation(uprightRotation(arrangement.rotation + node.rotation()))
            }}
            onTransformEnd={(event) => {
              const node = event.target
              node.position({ x: seat.x, y: seat.y })
              onRotateSeat(seat.id, node.rotation())
            }}
          >
            <Group scaleX={chairScale} scaleY={chairScale}>
              <ChairGlyph fill={chairFill} stroke={chairStroke} strokeWidth={marked ? 2 : 1} seated={Boolean(seat.guestId)} accent={colors.accent} />
            </Group>
            {/* Outline, not a blurred shadow: shadows are the costliest thing to redraw across thousands of chairs. */}
            {/* Taken chairs show the guest's initials; the seat number stays in the hover card. */}
            {detail ? (() => {
              const text = (seat.guestId ? guestInitials(guests?.get(seat.guestId)?.name) : null) ?? seat.label
              // One line, never wrapped: "AO" used to break onto two lines and only "A" was visible.
              // Shrink the text if it is wider than the chair seat (~0.62em per character).
              const box = 40 * chairScale
              const size = Math.max(7, Math.min(labelFontSize, (34 * chairScale) / Math.max(1, text.length * 0.62)))
              return (
              <Text
                name="chair-label"
                text={text}
                y={4}
                width={box}
                height={size + 2}
                offsetX={box / 2}
                offsetY={(size + 2) / 2}
                rotation={uprightRotation(arrangement.rotation + seat.rotation)}
                align="center"
                verticalAlign="middle"
                wrap="none"
                fontFamily="Geist Sans, sans-serif"
                fontSize={size}
                fill="#FFFFFF"
                stroke="#1C1D1A"
                strokeWidth={1.1}
                fillAfterStrokeEnabled
                perfectDrawEnabled={false}
                listening={false}
              />
              )
            })() : null}
            {seat.guestId && detail ? (
              <SeatedMarker
                rotation={uprightRotation(arrangement.rotation + seat.rotation)}
                chairScale={chairScale}
                accent={colors.accent}
                surface={colors.surface}
              />
            ) : null}
          </Group>
        )
      })}
      {arrangement.kind === 'row' ? <RowLabels arrangement={arrangement} color={colors.foreground} fontSize={labelFontSize} /> : null}
      {arrangement.kind === 'stage' && !arrangement.showLabel ? null : (
      <Group
        name="table-label"
        x={labelPoint.x}
        y={labelPoint.y}
        rotation={uprightRotation(arrangement.rotation)}
        listening={arrangement.kind === 'row'}
        onClick={(event) => {
          event.cancelBubble = true
          onSelectBody(selectMode(event))
        }}
        onTap={(event) => {
          event.cancelBubble = true
          onSelectBody('replace')
        }}
      >
        {arrangement.kind === 'row' ? (
          <Rect x={-48} y={-12} width={96} height={24} fill="rgba(0,0,0,0.01)" />
        ) : null}
        <Text
          text={arrangement.name}
          width={nameWidth}
          height={nameSize + 4}
          offsetX={nameWidth / 2}
          offsetY={(nameSize + 4) / 2}
          align="center"
          verticalAlign="middle"
          fontFamily="Geist Sans, sans-serif"
          fontSize={nameSize}
          fontStyle="600"
          fill={labelFill}
          stroke={arrangement.kind === 'row' && !arrangement.labelColor ? '#1C1D1A' : undefined}
          strokeWidth={arrangement.kind === 'row' && !arrangement.labelColor ? 0.6 : 0}
          listening={false}
        />
      </Group>
      )}
    </Group>
  )
}

/**
 * Small "person sitting on a chair" badge on the corner of an occupied chair.
 * Kept upright on screen so it reads the same however the table is turned.
 */
function SeatedMarker({ rotation, chairScale, accent, surface }: { rotation: number; chairScale: number; accent: string; surface: string }) {
  const corner = 20 * chairScale
  return (
    <Group name="seat-marker" rotation={rotation} listening={false}>
      <Group x={corner} y={-corner}>
        <Circle radius={10} fill={accent} stroke={surface} strokeWidth={1.5} />
        {/* Head */}
        <Circle x={0.5} y={-4.6} radius={2} fill={surface} />
        {/* Chair back and seat */}
        <Line points={[-4.5, -2.5, -4.5, 6]} stroke={surface} strokeWidth={1.4} lineCap="round" />
        <Line points={[-4.5, 2.6, 2.5, 2.6]} stroke={surface} strokeWidth={1.4} lineCap="round" />
        {/* Body: back, thigh along the seat, shin down */}
        <Line points={[-0.2, -2.2, -1.6, 1.2, 3.6, 1.2, 3.6, 6]} stroke={surface} strokeWidth={1.8} lineCap="round" lineJoin="round" />
      </Group>
    </Group>
  )
}

/** "Row 1", "Row 2" … drawn beside each line of chairs in a seat block. */
function RowLabels({ arrangement, color, fontSize }: { arrangement: Arrangement; color: string; fontSize: number }) {
  const side = arrangement.block?.rowLabelSide ?? 'none'
  if (side === 'none') return null
  const half = ((arrangement.chairSize ?? CHAIR) / 2) | 0
  const lines = new Map<string, { minX: number; maxX: number; y: number; count: number }>()
  for (const seat of arrangement.seats) {
    if (!seat.row) continue
    // Side-by-side segments share a row name, so one label goes at each outer end.
    const line = lines.get(seat.row)
    if (line) {
      line.minX = Math.min(line.minX, seat.x)
      line.maxX = Math.max(line.maxX, seat.x)
      line.y += seat.y
      line.count += 1
    } else {
      lines.set(seat.row, { minX: seat.x, maxX: seat.x, y: seat.y, count: 1 })
    }
  }
  // Room for the full name ("Row 12") on one line; the gutter keeps it clear of the chairs.
  const width = Math.max(ROW_LABEL_GUTTER - 8, 120)
  const size = Math.max(9, Math.min(Math.round(fontSize * 0.95), 18))
  const labels: { key: string; text: string; x: number; y: number }[] = []
  for (const [text, line] of lines) {
    const y = line.y / line.count
    // Centre each label inside the gutter beside the row so it never overlaps the first chair.
    if (side === 'left' || side === 'both') labels.push({ key: `${text}:l`, text, x: line.minX - half - 4 - (ROW_LABEL_GUTTER - 8) / 2, y })
    if (side === 'right' || side === 'both') labels.push({ key: `${text}:r`, text, x: line.maxX + half + 4 + (ROW_LABEL_GUTTER - 8) / 2, y })
  }
  return (
    <>
      {labels.map((label) => (
        <Text
          key={label.key}
          name="row-label"
          text={label.text}
          x={label.x}
          y={label.y}
          width={width}
          height={size + 4}
          offsetX={width / 2}
          offsetY={(size + 4) / 2}
          rotation={uprightRotation(arrangement.rotation)}
          align="center"
          verticalAlign="middle"
          wrap="none"
          fontFamily="Geist Sans, sans-serif"
          fontSize={size}
          fontStyle="600"
          fill={color}
          listening={false}
        />
      ))}
    </>
  )
}

function TableBody({
  arrangement,
  colors,
  selected,
  onSelect,
}: {
  arrangement: Arrangement
  colors: FloorColors
  selected: boolean
  onSelect: (mode: SelectMode) => void
}) {
  const stroke = arrangement.stroke ?? (selected ? colors.accent : defaultTableStroke)
  const common = {
    fill: arrangement.fill ?? defaultTableFill,
    stroke,
    strokeWidth: selected ? 2 : 1.5,
    onMouseDown: (event: { cancelBubble: boolean }) => {
      event.cancelBubble = true
    },
    onClick: (event: { cancelBubble: boolean; evt: MouseEvent | TouchEvent }) => {
      event.cancelBubble = true
      onSelect(selectMode(event))
    },
    onTap: (event: { cancelBubble: boolean }) => {
      event.cancelBubble = true
      onSelect('replace')
    },
  }
  if (arrangement.kind === 'round') {
    return <Circle radius={arrangement.tableWidth / 2} {...common} />
  }
  if (arrangement.kind === 'oval') {
    return <Ellipse radiusX={arrangement.tableWidth / 2} radiusY={arrangement.tableHeight / 2} {...common} />
  }
  if (arrangement.kind === 'rect' || arrangement.kind === 'square') {
    return (
      <Rect
        x={-arrangement.tableWidth / 2}
        y={-arrangement.tableHeight / 2}
        width={arrangement.tableWidth}
        height={arrangement.tableHeight}
        cornerRadius={6}
        {...common}
      />
    )
  }
  if (arrangement.kind === 'crescent') {
    const radius = arrangement.tableWidth / 2
    return (
      <Shape
        {...common}
        sceneFunc={(context, shape) => {
          context.beginPath()
          context.arc(0, 0, radius, Math.PI, 0, true)
          context.closePath()
          context.fillStrokeShape(shape)
        }}
        hitFunc={(context, shape) => {
          context.beginPath()
          context.arc(0, 0, radius, Math.PI, 0, true)
          context.closePath()
          context.fillStrokeShape(shape)
        }}
      />
    )
  }
  if (arrangement.kind === 'stage') {
    const width = arrangement.tableWidth
    const height = arrangement.tableHeight
    const border = arrangement.strokeWidth ?? 2
    return (
      <Group>
        <Rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          cornerRadius={4}
          fill={arrangement.fill ?? defaultStageFill}
          stroke={arrangement.stroke ?? (selected ? colors.accent : defaultStageStroke)}
          strokeWidth={selected ? Math.max(border, 2.5) : border}
          onMouseDown={(event) => {
            event.cancelBubble = true
          }}
          onClick={(event) => {
            event.cancelBubble = true
            onSelect(selectMode(event))
          }}
          onTap={(event) => {
            event.cancelBubble = true
            onSelect('replace')
          }}
        />
        <Rect
          x={-width / 2}
          y={height / 2 - 12}
          width={width}
          height={12}
          fill={colors.accent}
          listening={false}
          cornerRadius={[0, 0, 4, 4]}
        />
      </Group>
    )
  }
  if (arrangement.kind === 'ushape') {
    const width = arrangement.tableWidth
    const height = arrangement.tableHeight
    const thickness = 18
    return (
      <Shape
        {...common}
        sceneFunc={(context, shape) => {
          context.beginPath()
          context.moveTo(-width / 2, -height / 2)
          context.lineTo(-width / 2, height / 2)
          context.lineTo(width / 2, height / 2)
          context.lineTo(width / 2, -height / 2)
          context.lineTo(width / 2 - thickness, -height / 2)
          context.lineTo(width / 2 - thickness, height / 2 - thickness)
          context.lineTo(-width / 2 + thickness, height / 2 - thickness)
          context.lineTo(-width / 2 + thickness, -height / 2)
          context.closePath()
          context.fillStrokeShape(shape)
        }}
        hitFunc={(context, shape) => {
          context.beginPath()
          context.rect(-width / 2 - 8, -height / 2 - 8, width + 16, height + 16)
          context.fillStrokeShape(shape)
        }}
      />
    )
  }
  return null
}

/** Top-down chair: a seat, a backrest toward -Y, and two front feet. */
function ChairGlyph({
  fill,
  stroke,
  strokeWidth,
  seated,
  accent,
}: {
  fill: string
  stroke: string
  strokeWidth: number
  seated: boolean
  accent: string
}) {
  // Taken chairs are drawn fully grey (backrest, seat and legs) so open seats stand out at a glance.
  // A selected taken chair keeps the accent outline so the selection is still visible.
  const selectedStroke = stroke === accent
  if (seated) {
    fill = TAKEN_SEAT
    stroke = selectedStroke ? accent : TAKEN_EDGE
  }
  const back = seated ? TAKEN_BACK : readableOn(fill) === '#1C1D1A' ? '#3A5170' : '#E7EEF6'
  const legs = seated ? TAKEN_EDGE : stroke
  return (
    <>
      <Rect
        x={CHAIR_LEFT}
        y={CHAIR_TOP}
        width={CHAIR_RIGHT - CHAIR_LEFT}
        height={CHAIR_BOTTOM - CHAIR_TOP}
        fill="#000000"
        opacity={0.01}
        strokeEnabled={false}
        perfectDrawEnabled={false}
      />
      <Rect
        x={-22}
        y={-28}
        width={44}
        height={14}
        cornerRadius={[10, 10, 3, 3]}
        fill={back}
        stroke={stroke}
        strokeWidth={strokeWidth}
        perfectDrawEnabled={false}
      />
      <Rect
        x={-16}
        y={-12}
        width={32}
        height={32}
        cornerRadius={6}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        perfectDrawEnabled={false}
      />
      <Rect x={-16} y={16} width={6} height={8} cornerRadius={1} fill={legs} listening={false} perfectDrawEnabled={false} />
      <Rect x={10} y={16} width={6} height={8} cornerRadius={1} fill={legs} listening={false} perfectDrawEnabled={false} />
    </>
  )
}

/** Greyed-out palette for chairs that already have a guest. */
const TAKEN_SEAT = '#9CA3AB'
const TAKEN_BACK = '#BCC2C9'
const TAKEN_EDGE = '#6F767E'

function GroupRotateHandle({
  arrangements,
  ids,
  color,
  surface,
  onRotateStart,
}: {
  arrangements: Arrangement[]
  ids: string[]
  color: string
  surface: string
  onRotateStart: (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
}) {
  const bounds = unionBounds(
    ids.flatMap((id) => {
      const item = arrangements.find((entry) => entry.id === id)
      return item ? [arrangementBox(item)] : []
    }),
  )
  if (!bounds) return null
  const x = bounds.cx
  const y = bounds.top - 28
  return (
    <Group>
      <Line points={[bounds.cx, bounds.top - 8, x, y]} stroke={color} strokeWidth={1} listening={false} />
      <Circle
        x={x}
        y={y}
        radius={7}
        fill={surface}
        stroke={color}
        strokeWidth={1.5}
        onMouseDown={onRotateStart}
        onTouchStart={onRotateStart}
      />
    </Group>
  )
}
