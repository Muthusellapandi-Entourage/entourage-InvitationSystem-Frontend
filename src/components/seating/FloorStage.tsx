import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import Konva from 'konva'
import { Circle, Ellipse, Group, Layer, Line, Rect, Shape, Stage, Text, Transformer } from 'react-konva'
import { CHAIR, ROW_LABEL_GUTTER, seatPlace } from '@/seating/geometry'
import { arrangementBox, moveCohort, readableOn, rotateSelection, tableLabelPoint, unionBounds, uprightRotation, type WorldRect } from '@/seating/layoutOps'
import {
  defaultChairFill,
  defaultChairStroke,
  defaultStageFill,
  defaultStageStroke,
  defaultTableFill,
  defaultTableStroke,
  nameTagFill,
  nameTagText,
  type Arrangement,
  type FloorLayout,
  type TableKind,
} from '@/seating/model'

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
  /** Filled with an exporter that renders the whole floor (every table, seat and name tag) as a PNG. */
  exportRef?: MutableRefObject<FloorExporter | null>
}

export type FloorExporter = {
  /** The whole floor as a high-resolution PNG. `title` is drawn above the plan. */
  toPng: (options?: { pixelRatio?: number; title?: string; subtitle?: string }) => Promise<Blob>
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

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
  exportRef,
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
  // While exporting an image, every label is drawn whatever the zoom.
  const [exporting, setExporting] = useState(false)
  // Chair numbers are unreadable when zoomed far out; skipping them keeps big floors fast.
  const detail = view.scale >= 0.45 || exporting
  // Name tags for the whole floor, laid out together so tags from neighbouring tables never overlap.
  const floorTags = useMemo(() => (detail ? layoutFloorTags(layout.arrangements, guests) : []), [detail, layout.arrangements, guests])
  const tagsRef = useRef(floorTags)
  tagsRef.current = floorTags
  const [draggingIds, setDraggingIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!exportRef) return
    exportRef.current = {
      async toPng(options = {}) {
        const stage = stageRef.current
        if (!stage) throw new Error('The floor is not ready yet.')
        setExporting(true)
        transformerRef.current?.nodes([])
        // Let React draw every label and floating name tag first (zoomed-out floors draw them only now).
        await nextFrame()
        await nextFrame()
        const seated = live.current.layout.arrangements.some(
          (item) => item.kind !== 'row' && item.kind !== 'stage' && item.seats.some((seat) => seat.guestId),
        )
        for (let wait = 0; seated && tagsRef.current.length === 0 && wait < 30; wait += 1) await nextFrame()
        // Name tags must not be hidden by an unfinished drag.
        setDraggingIds(new Set())
        await nextFrame()
        stage.batchDraw()
        try {
          const boxes = live.current.layout.arrangements.map(arrangementBox)
          const area = unionBounds(boxes)
          if (!area) throw new Error('There is nothing on this floor yet.')
          let left = area.left
          let top = area.top
          let right = area.right
          let bottom = area.bottom
          for (const tag of tagsRef.current) {
            left = Math.min(left, tag.x)
            top = Math.min(top, tag.y)
            right = Math.max(right, tag.x + tag.width)
            bottom = Math.max(bottom, tag.y + TAG_HEIGHT)
          }
          const margin = 60
          const header = options.title ? 90 : 0
          left -= margin
          right += margin
          top -= margin + header
          bottom += margin
          const width = Math.ceil(right - left)
          const height = Math.ceil(bottom - top)
          // Stay inside browser canvas limits (about 16k px per side, ~200 megapixels in total).
          const wanted = options.pixelRatio ?? 3
          const pixelRatio = Math.max(1, Math.min(wanted, 16000 / Math.max(width, height), Math.sqrt(200_000_000 / (width * height))))

          const before = { x: stage.x(), y: stage.y(), scale: stage.scaleX(), width: stage.width(), height: stage.height() }
          const [gridLayer, floorLayer] = stage.getLayers()
          gridLayer?.visible(false)
          const extras: Konva.Node[] = []
          const background = new Konva.Rect({ x: left, y: top, width, height, fill: colors.background, listening: false })
          floorLayer?.add(background)
          background.moveToBottom()
          extras.push(background)
          if (options.title) {
            const title = new Konva.Text({
              x: left + margin,
              y: top + margin - 10,
              text: options.title,
              fontFamily: 'Inter, sans-serif',
              fontSize: 34,
              fontStyle: '700',
              fill: colors.foreground,
              listening: false,
            })
            floorLayer?.add(title)
            extras.push(title)
            if (options.subtitle) {
              const subtitle = new Konva.Text({
                x: left + margin,
                y: top + margin + 34,
                text: options.subtitle,
                fontFamily: 'Inter, sans-serif',
                fontSize: 16,
                fill: colors.muted,
                listening: false,
              })
              floorLayer?.add(subtitle)
              extras.push(subtitle)
            }
          }
          stage.size({ width, height })
          stage.scale({ x: 1, y: 1 })
          stage.position({ x: -left, y: -top })
          try {
            return await new Promise<Blob>((resolve, reject) =>
              stage.toBlob({
                pixelRatio,
                mimeType: 'image/png',
                callback: (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be created.'))),
              }),
            )
          } finally {
            for (const node of extras) node.destroy()
            gridLayer?.visible(true)
            stage.size({ width: before.width, height: before.height })
            stage.scale({ x: before.scale, y: before.scale })
            stage.position({ x: before.x, y: before.y })
            stage.batchDraw()
          }
        } finally {
          setExporting(false)
        }
      },
    }
    return () => {
      exportRef.current = null
    }
  }, [exportRef, colors])

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
                  setDraggingIds(new Set(ids))
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
                  setDraggingIds((current) => (current.size ? new Set() : current))
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
        <Layer listening={false}>
          <FloorNameTags
            tags={floorTags}
            hidden={draggingIds}
            accent={colors.accent}
            isMarked={(arrangementId, seatId) =>
              selectedSeatKeys.includes(`${arrangementId}:${seatId}`) || (arrangementId === primaryId && seatId === selectedSeatId)
            }
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
    previous.detail === next.detail,
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
  // Table names read large and bold in the centre of the table, like a place card.
  const nameSize =
    arrangement.kind === 'stage' && arrangement.labelSize
      ? arrangement.labelSize
      : arrangement.kind === 'row' || arrangement.kind === 'stage'
        ? labelFontSize
        : Math.round(labelFontSize * 1.4)
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
        const chairStroke = seat.stroke ?? defaultChairStroke
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
            {/* Numbered seat disc. Flat outline rings only: no blurred shadows (costly across thousands of seats). */}
            <SeatDisc radius={SEAT_RADIUS * chairScale} fill={chairFill} ring={chairStroke} marked={marked} assigned={Boolean(seat.guestId)} accent={colors.accent} />
            {detail ? (() => {
              const text = seat.label
              const radius = SEAT_RADIUS * chairScale
              const size = Math.max(8, Math.min(radius * 0.95, (radius * 1.5) / Math.max(1, text.length * 0.62)))
              return (
                <Text
                  name="chair-label"
                  text={text}
                  width={radius * 2}
                  height={size + 2}
                  offsetX={radius}
                  offsetY={(size + 2) / 2}
                  rotation={uprightRotation(arrangement.rotation + seat.rotation)}
                  align="center"
                  verticalAlign="middle"
                  wrap="none"
                  fontFamily="Inter, sans-serif"
                  fontSize={size}
                  fontStyle="700"
                  fill="#FFFFFF"
                  perfectDrawEnabled={false}
                  listening={false}
                />
              )
            })() : null}
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
          fontFamily="Inter, sans-serif"
          fontSize={nameSize}
          fontStyle={arrangement.kind === 'row' || arrangement.kind === 'stage' ? '600' : '700'}
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

/** Radius of a seat disc at chair scale 1 (chairs are spaced CHAIR = 52 apart). */
const SEAT_RADIUS = 16

/** Navy numbered disc with a light ring; a selected seat gets a mint-teal halo. */
function SeatDisc({
  radius,
  fill,
  ring,
  marked,
  assigned,
  accent,
}: {
  radius: number
  fill: string
  ring: string
  marked: boolean
  /** A guest sits here: the seat always carries the mint-teal glow. */
  assigned: boolean
  accent: string
}) {
  const glow = assigned || marked
  return (
    <>
      {/* Generous transparent hit area so small seats are easy to click and drop guests on. */}
      <Circle radius={radius + 6} fill="#000000" opacity={0.01} strokeEnabled={false} perfectDrawEnabled={false} />
      {/* Mint-teal glow on assigned seats; a selected seat glows stronger so the selection still stands out. */}
      {glow ? <Circle radius={radius + 6} fill={accent} opacity={marked ? 0.32 : 0.16} listening={false} perfectDrawEnabled={false} /> : null}
      {glow ? <Circle radius={radius + 4} stroke={accent} strokeWidth={marked ? 3 : 1.75} listening={false} perfectDrawEnabled={false} /> : null}
      <Circle radius={radius} fill={fill} stroke={ring} strokeWidth={2} perfectDrawEnabled={false} />
    </>
  )
}

/** "Bader Saleh Al Mansoori" → "Bader A." … first name plus the last name's initial. */
export function shortGuestName(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}

let measureContext: CanvasRenderingContext2D | null = null
function textWidth(text: string, font: string) {
  measureContext ??= document.createElement('canvas').getContext('2d')
  if (!measureContext) return text.length * 7
  measureContext.font = font
  return measureContext.measureText(text).width
}

/** Guest name tag size (half of the earlier 24.5px enlargement). */
const TAG_FONT = 12.25
const TAG_PAD_X = 8
const TAG_HEIGHT = 22

const TAG_GAP = 4
/** Room between a seat's ring and its tag, for the connector line. */
const TAG_LEAD = 10

/** Distance from a tag's centre to its edge along direction (dx, dy). */
function rayExtent(dx: number, dy: number, width: number) {
  const ex = Math.abs(dx) > 1e-6 ? width / 2 / Math.abs(dx) : Infinity
  const ey = Math.abs(dy) > 1e-6 ? TAG_HEIGHT / 2 / Math.abs(dy) : Infinity
  return Math.min(ex, ey)
}

/** Does an axis-aligned box touch a circle? */
function boxHitsCircle(left: number, top: number, right: number, bottom: number, cx: number, cy: number, r: number) {
  const nx = Math.min(Math.max(cx, left), right)
  const ny = Math.min(Math.max(cy, top), bottom)
  return (nx - cx) ** 2 + (ny - cy) ** 2 < r * r
}

type TagBox = {
  seatId: string
  name: string
  /** Seat centre, screen axes, relative to the table centre. */
  sx: number
  sy: number
  /** The chair's outward direction (the way it faces away from the table). */
  dx: number
  dy: number
  /** Distance from the seat centre to the tag centre along (dx, dy). */
  d: number
  width: number
}

/**
 * Places each seated guest's tag on the line the chair points along, straight out from the table,
 * so tags fan out around the table at the chair's own angle. Tags that would overlap another tag
 * or a seat slide further out along that same line.
 */
function layoutTags(arrangement: Arrangement, guests: Map<string, SeatGuest> | undefined, radius: number): TagBox[] {
  const angle = (arrangement.rotation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const seats = arrangement.seats.map((seat) => ({ seat, x: seat.x * cos - seat.y * sin, y: seat.x * sin + seat.y * cos }))
  const discR = radius + 5
  const roundTable = arrangement.kind === 'round'
  const halfW = Math.abs((arrangement.tableWidth / 2) * cos) + Math.abs((arrangement.tableHeight / 2) * sin) + 6
  const halfH = Math.abs((arrangement.tableWidth / 2) * sin) + Math.abs((arrangement.tableHeight / 2) * cos) + 6

  const placed: { left: number; top: number; right: number; bottom: number }[] = []
  const tags: TagBox[] = []
  // Clockwise from the top, so neighbours settle in order.
  const seated = seats.filter((item) => item.seat.guestId).sort((a, b) => Math.atan2(a.x, -a.y) - Math.atan2(b.x, -b.y))
  for (const { seat, x: sx, y: sy } of seated) {
    const name = shortGuestName(guests?.get(seat.guestId!)?.name) ?? 'Guest'
    const width = Math.ceil(textWidth(name, `500 ${TAG_FONT}px Inter, sans-serif`)) + TAG_PAD_X * 2
    // Outward direction: the chair's own facing (backrest side), checked against "away from the centre".
    const length = Math.hypot(sx, sy) || 1
    const radial = { x: sx / length, y: sy / length }
    const total = ((arrangement.rotation + seat.rotation) * Math.PI) / 180
    const facing = { x: Math.sin(total), y: -Math.cos(total) }
    const dir = facing.x * radial.x + facing.y * radial.y > 0.2 ? facing : radial
    const boxFor = (dx: number, dy: number, d: number) => {
      const cx = sx + dx * d
      const cy = sy + dy * d
      return {
        left: cx - width / 2 - TAG_GAP / 2,
        right: cx + width / 2 + TAG_GAP / 2,
        top: cy - TAG_HEIGHT / 2 - TAG_GAP / 2,
        bottom: cy + TAG_HEIGHT / 2 + TAG_GAP / 2,
      }
    }
    const blocked = ({ left, top, right, bottom }: { left: number; top: number; right: number; bottom: number }) =>
      placed.some((box) => !(right <= box.left || left >= box.right || bottom <= box.top || top >= box.bottom)) ||
      seats.some((other) => boxHitsCircle(left, top, right, bottom, other.x, other.y, discR)) ||
      (roundTable
        ? boxHitsCircle(left, top, right, bottom, 0, 0, arrangement.tableWidth / 2 + 6)
        : !(right <= -halfW || left >= halfW || bottom <= -halfH || top >= halfH))

    // Best free spot close to the chair: straight out along the chair's angle if there is room;
    // otherwise the nearest open space around the chair (turned up to 80°), not far down the line.
    // A short connector beats a long one, so distance costs more than turning.
    const base = Math.atan2(dir.y, dir.x)
    let best: { dx: number; dy: number; d: number; cost: number } | null = null
    for (let turn = -80; turn <= 80; turn += 10) {
      const a = base + (turn * Math.PI) / 180
      const dx = Math.cos(a)
      const dy = Math.sin(a)
      // Never point back toward the table.
      if (dx * radial.x + dy * radial.y < -0.15) continue
      const start = radius + TAG_LEAD + rayExtent(dx, dy, width)
      for (let extra = 0; extra <= 240; extra += 6) {
        const cost = extra + Math.abs(turn) * 0.7
        if (best && cost >= best.cost) break
        if (!blocked(boxFor(dx, dy, start + extra))) {
          best = { dx, dy, d: start + extra, cost }
          break
        }
      }
    }
    const chosen = best ?? { dx: dir.x, dy: dir.y, d: radius + TAG_LEAD + rayExtent(dir.x, dir.y, width) }
    placed.push(boxFor(chosen.dx, chosen.dy, chosen.d))
    tags.push({ seatId: seat.id, name, sx, sy, dx: chosen.dx, dy: chosen.dy, d: chosen.d, width })
  }
  return tags
}

/** One placed name tag in floor (world) coordinates. */
type FloorTag = {
  key: string
  arrangementId: string
  seatId: string
  name: string
  /** Seat centre and disc radius. */
  sx: number
  sy: number
  radius: number
  /** Direction from the seat to the tag (the chair's angle, or a nearby angle if that was full). */
  dx: number
  dy: number
  /** Top-left corner of the tag. */
  x: number
  y: number
  width: number
}

type Box = { left: number; top: number; right: number; bottom: number }
type Obstacle = { box: Box; circle?: { cx: number; cy: number; r: number } }

const BUCKET = 120

/**
 * Lays out every name tag on the floor so no tag overlaps another tag, any seat, or any table —
 * including tags and seats of neighbouring tables. Each table first arranges its own tags (stacked
 * beside their seats); a tag that still collides with something from another table is moved to the
 * nearest free spot (up/down, further out, or the other side), with a leader line to its seat.
 */
function layoutFloorTags(arrangements: Arrangement[], guests: Map<string, SeatGuest> | undefined): FloorTag[] {
  // Spatial buckets keep collision checks fast on big floors.
  const buckets = new Map<string, Obstacle[]>()
  const keysFor = (box: Box) => {
    const keys: string[] = []
    for (let i = Math.floor(box.left / BUCKET); i <= Math.floor(box.right / BUCKET); i += 1) {
      for (let j = Math.floor(box.top / BUCKET); j <= Math.floor(box.bottom / BUCKET); j += 1) keys.push(`${i},${j}`)
    }
    return keys
  }
  const add = (obstacle: Obstacle) => {
    for (const key of keysFor(obstacle.box)) {
      const list = buckets.get(key)
      if (list) list.push(obstacle)
      else buckets.set(key, [obstacle])
    }
  }
  const hits = (box: Box) => {
    for (const key of keysFor(box)) {
      for (const obstacle of buckets.get(key) ?? []) {
        const o = obstacle.box
        if (box.right <= o.left || box.left >= o.right || box.bottom <= o.top || box.top >= o.bottom) continue
        if (obstacle.circle) {
          const { cx, cy, r } = obstacle.circle
          const nx = Math.min(Math.max(cx, box.left), box.right)
          const ny = Math.min(Math.max(cy, box.top), box.bottom)
          if ((nx - cx) ** 2 + (ny - cy) ** 2 >= r * r) continue
        }
        return true
      }
    }
    return false
  }

  // Obstacles: every seat disc and every table body on the floor.
  for (const arrangement of arrangements) {
    const angle = (arrangement.rotation * Math.PI) / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const scale = (arrangement.chairSize ?? CHAIR) / CHAIR
    const discR = SEAT_RADIUS * scale + 4
    for (const seat of arrangement.seats) {
      const cx = arrangement.x + seat.x * cos - seat.y * sin
      const cy = arrangement.y + seat.x * sin + seat.y * cos
      add({ box: { left: cx - discR, top: cy - discR, right: cx + discR, bottom: cy + discR }, circle: { cx, cy, r: discR } })
    }
    if (arrangement.kind === 'row') continue
    const margin = 6
    if (arrangement.kind === 'round') {
      const r = arrangement.tableWidth / 2 + margin
      add({ box: { left: arrangement.x - r, top: arrangement.y - r, right: arrangement.x + r, bottom: arrangement.y + r }, circle: { cx: arrangement.x, cy: arrangement.y, r } })
    } else {
      const halfW = Math.abs((arrangement.tableWidth / 2) * cos) + Math.abs((arrangement.tableHeight / 2) * sin) + margin
      const halfH = Math.abs((arrangement.tableWidth / 2) * sin) + Math.abs((arrangement.tableHeight / 2) * cos) + margin
      add({ box: { left: arrangement.x - halfW, top: arrangement.y - halfH, right: arrangement.x + halfW, bottom: arrangement.y + halfH } })
    }
  }

  const placed: FloorTag[] = []
  for (const arrangement of arrangements) {
    if (arrangement.kind === 'row' || arrangement.kind === 'stage') continue
    const radius = SEAT_RADIUS * ((arrangement.chairSize ?? CHAIR) / CHAIR)
    for (const tag of layoutTags(arrangement, guests, radius)) {
      const sx = arrangement.x + tag.sx
      const sy = arrangement.y + tag.sy
      // Top-left of a tag whose centre is `d` out from the seat along direction (dx, dy).
      const at = (dx: number, dy: number, d: number) => ({ x: sx + dx * d - tag.width / 2, y: sy + dy * d - TAG_HEIGHT / 2 })
      const boxAt = (x: number, y: number): Box => ({ left: x - TAG_GAP / 2, top: y - TAG_GAP / 2, right: x + tag.width + TAG_GAP / 2, bottom: y + TAG_HEIGHT + TAG_GAP / 2 })

      let dir = { x: tag.dx, y: tag.dy }
      let spot = at(tag.dx, tag.dy, tag.d)
      if (hits(boxAt(spot.x, spot.y))) {
        // Nearest free spot that still follows the chair: further out on the same line first,
        // then a slightly turned line (±8°, ±16°, ±24°).
        const base = Math.atan2(tag.dy, tag.dx)
        const candidates: { dx: number; dy: number; d: number; cost: number }[] = []
        for (let turn = -80; turn <= 80; turn += 10) {
          const a = base + (turn * Math.PI) / 180
          const dx = Math.cos(a)
          const dy = Math.sin(a)
          const start = radius + TAG_LEAD + rayExtent(dx, dy, tag.width)
          for (let extra = 0; extra <= 300; extra += 6) {
            candidates.push({ dx, dy, d: start + extra, cost: extra + Math.abs(turn) * 0.7 })
          }
        }
        candidates.sort((a, b) => a.cost - b.cost)
        const free = candidates.find((candidate) => {
          const point = at(candidate.dx, candidate.dy, candidate.d)
          return !hits(boxAt(point.x, point.y))
        })
        if (free) {
          spot = at(free.dx, free.dy, free.d)
          dir = { x: free.dx, y: free.dy }
        }
      }
      add({ box: boxAt(spot.x, spot.y) })
      placed.push({
        key: `${arrangement.id}:${tag.seatId}`,
        arrangementId: arrangement.id,
        seatId: tag.seatId,
        name: tag.name,
        sx,
        sy,
        radius,
        dx: dir.x,
        dy: dir.y,
        x: spot.x,
        y: spot.y,
        width: tag.width,
      })
    }
  }
  return placed
}

/** Every guest name tag on the floor, drawn upright on top of all tables. */
function FloorNameTags({
  tags,
  hidden,
  isMarked,
  accent,
}: {
  tags: FloorTag[]
  /** Tables being dragged: their tags are hidden until the drop re-lays them out. */
  hidden: Set<string>
  isMarked: (arrangementId: string, seatId: string) => boolean
  accent: string
}) {
  return (
    <>
      {tags.map((tag) => {
        if (hidden.has(tag.arrangementId)) return null
        const radius = tag.radius
        const marked = isMarked(tag.arrangementId, tag.seatId)
        // Green connector straight along the chair's angle: from the seat's ring to where that line meets the tag.
        const cx = tag.x + tag.width / 2
        const cy = tag.y + TAG_HEIGHT / 2
        const extent = rayExtent(tag.dx, tag.dy, tag.width)
        const nearX = cx - tag.dx * extent
        const nearY = cy - tag.dy * extent
        const distance = Math.hypot(nearX - tag.sx, nearY - tag.sy)
        const moved = distance > radius + 2
        const ux = tag.dx
        const uy = tag.dy
        return (
          <Group key={tag.key}>
            {moved ? (
              <Line
                points={[tag.sx + ux * radius, tag.sy + uy * radius, nearX, nearY]}
                stroke={accent}
                strokeWidth={1.25}
                opacity={0.9}
                lineCap="round"
                perfectDrawEnabled={false}
              />
            ) : null}
            <Rect
              x={tag.x}
              y={tag.y}
              width={tag.width}
              height={TAG_HEIGHT}
              cornerRadius={6}
              fill={nameTagFill}
              stroke={accent}
              strokeWidth={marked ? 2.5 : 1.5}
              perfectDrawEnabled={false}
            />
            <Text
              x={tag.x}
              y={tag.y}
              width={tag.width}
              height={TAG_HEIGHT}
              text={tag.name}
              align="center"
              verticalAlign="middle"
              wrap="none"
              fontFamily="Inter, sans-serif"
              fontSize={TAG_FONT}
              fontStyle="500"
              fill={nameTagText}
              perfectDrawEnabled={false}
            />
          </Group>
        )
      })}
    </>
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
          fontFamily="Inter, sans-serif"
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
  // Plans saved with the old default rim (#9E5A58) get the new teal rim too.
  const saved = arrangement.stroke && arrangement.stroke.toUpperCase() !== '#9E5A58' ? arrangement.stroke : undefined
  const stroke = saved ?? defaultTableStroke
  const common = {
    fill: arrangement.fill ?? defaultTableFill,
    stroke,
    // A solid rim like the reference: thick teal edge on the cream top.
    strokeWidth: selected ? 4 : 3,
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
  // Soft mint-teal glow ring outside the rim (flat semi-transparent strokes, no blur), always in the accent.
  const halo = { stroke: colors.accent, listening: false, perfectDrawEnabled: false } as const
  if (arrangement.kind === 'round') {
    const radius = arrangement.tableWidth / 2
    return (
      <Group>
        <Circle radius={radius + 6} strokeWidth={8} opacity={0.18} {...halo} />
        <Circle radius={radius + 3} strokeWidth={2} opacity={0.75} {...halo} />
        <Circle radius={radius} {...common} />
      </Group>
    )
  }
  if (arrangement.kind === 'oval') {
    const rx = arrangement.tableWidth / 2
    const ry = arrangement.tableHeight / 2
    return (
      <Group>
        <Ellipse radiusX={rx + 6} radiusY={ry + 6} strokeWidth={8} opacity={0.18} {...halo} />
        <Ellipse radiusX={rx + 3} radiusY={ry + 3} strokeWidth={2} opacity={0.75} {...halo} />
        <Ellipse radiusX={rx} radiusY={ry} {...common} />
      </Group>
    )
  }
  if (arrangement.kind === 'rect' || arrangement.kind === 'square') {
    const width = arrangement.tableWidth
    const height = arrangement.tableHeight
    return (
      <Group>
        <Rect x={-width / 2 - 6} y={-height / 2 - 6} width={width + 12} height={height + 12} cornerRadius={12} strokeWidth={8} opacity={0.18} {...halo} />
        <Rect x={-width / 2 - 3} y={-height / 2 - 3} width={width + 6} height={height + 6} cornerRadius={9} strokeWidth={2} opacity={0.75} {...halo} />
        <Rect x={-width / 2} y={-height / 2} width={width} height={height} cornerRadius={6} {...common} />
      </Group>
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
