import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Circle, Ellipse, Group, Layer, Rect, Shape, Stage, Text, Transformer } from 'react-konva'
import { CHAIR } from '@/seating/geometry'
import type { Arrangement, FloorLayout, TableKind } from '@/seating/model'

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

type FloorStageProps = {
  layout: FloorLayout
  colors: FloorColors
  grid: number
  snap: boolean
  tool: 'select' | 'pan' | TableKind
  selectedId: string | null
  selectedSeatId: string | null
  onSelect: (arrangementId: string | null, seatId: string | null) => void
  onMove: (arrangementId: string, x: number, y: number, rotation: number) => void
  onPlace: (x: number, y: number) => void
  onAssign: (arrangementId: string, seatId: string, guestId: string) => void
  view: { x: number; y: number; scale: number }
  onView: (view: { x: number; y: number; scale: number }) => void
}

export function FloorStage({
  layout,
  colors,
  grid,
  tool,
  selectedId,
  selectedSeatId,
  onSelect,
  onMove,
  onPlace,
  onAssign,
  view,
  onView,
}: FloorStageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const nodes = useRef(new Map<string, Konva.Group>())
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
    const node = selectedId ? nodes.current.get(selectedId) : undefined
    transformerRef.current?.nodes(node ? [node] : [])
    transformerRef.current?.getLayer()?.batchDraw()
  }, [selectedId, layout.arrangements])

  function zoomAt(pointer: { x: number; y: number }, nextScale: number) {
    const scale = Math.min(2.5, Math.max(0.25, nextScale))
    const point = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale }
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
      className="relative min-h-0 min-w-0 flex-1"
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
        onDragEnd={(event) => {
          if (event.target !== stageRef.current) return
          onView({ ...view, x: event.target.x(), y: event.target.y() })
        }}
        onWheel={(event) => {
          event.evt.preventDefault()
          const pointer = stageRef.current?.getPointerPosition()
          if (!pointer) return
          const next = event.evt.deltaY < 0 ? view.scale * 1.08 : view.scale / 1.08
          zoomAt(pointer, next)
        }}
        onMouseDown={(event) => {
          if (event.target !== stageRef.current) return
          if (tool !== 'select' && tool !== 'pan') {
            const point = stageRef.current.getRelativePointerPosition()
            if (point) onPlace(point.x, point.y)
            return
          }
          onSelect(null, null)
        }}
      >
        <Layer listening={false}>
          <Grid colors={colors} grid={grid} />
        </Layer>
        <Layer>
          {layout.arrangements.map((arrangement) => (
            <ArrangementNode
              key={arrangement.id}
              arrangement={arrangement}
              colors={colors}
              selected={arrangement.id === selectedId}
              selectedSeatId={arrangement.id === selectedId ? selectedSeatId : null}
              draggable={tool === 'select'}
              register={(node) => {
                if (node) nodes.current.set(arrangement.id, node)
                else nodes.current.delete(arrangement.id)
              }}
              onSelectSeat={(seatId) => onSelect(arrangement.id, seatId)}
              onSelectBody={() => onSelect(arrangement.id, null)}
              onMove={(x, y, rotation) => onMove(arrangement.id, x, y, rotation)}
            />
          ))}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            enabledAnchors={[]}
            borderStroke={colors.accent}
            anchorStroke={colors.accent}
            anchorFill={colors.surface}
            rotateAnchorOffset={18}
          />
        </Layer>
      </Stage>
      {layout.arrangements.length === 0 ? (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-muted">
          Choose a table or a row, then click the floor.
        </p>
      ) : null}
    </div>
  )
}

function Grid({ colors, grid }: { colors: FloorColors; grid: number }) {
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(context) => {
        const start = -2400
        const end = 4800
        context.beginPath()
        context.strokeStyle = colors.border
        context.lineWidth = 1
        for (let value = start; value <= end; value += grid) {
          context.moveTo(value, start)
          context.lineTo(value, end)
          context.moveTo(start, value)
          context.lineTo(end, value)
        }
        context.stroke()
      }}
    />
  )
}

function ArrangementNode({
  arrangement,
  colors,
  selected,
  selectedSeatId,
  draggable,
  register,
  onSelectSeat,
  onSelectBody,
  onMove,
}: {
  arrangement: Arrangement
  colors: FloorColors
  selected: boolean
  selectedSeatId: string | null
  draggable: boolean
  register: (node: Konva.Group | null) => void
  onSelectSeat: (seatId: string) => void
  onSelectBody: () => void
  onMove: (x: number, y: number, rotation: number) => void
}) {
  const dragged = useRef(false)
  return (
    <Group
      ref={register}
      x={arrangement.x}
      y={arrangement.y}
      rotation={arrangement.rotation}
      draggable={draggable}
      onDragStart={() => {
        dragged.current = true
      }}
      onDragEnd={(event) => {
        onMove(event.target.x(), event.target.y(), event.target.rotation())
        dragged.current = false
      }}
      onTransformEnd={(event) => {
        const node = event.target
        onMove(node.x(), node.y(), node.rotation())
      }}
    >
      <TableBody arrangement={arrangement} colors={colors} selected={selected} onSelect={onSelectBody} />
      <Text
        text={arrangement.name}
        width={Math.max(80, arrangement.tableWidth)}
        offsetX={Math.max(80, arrangement.tableWidth) / 2}
        y={arrangement.kind === 'row' ? -28 : -8}
        align="center"
        fontFamily="Geist Sans, sans-serif"
        fontSize={13}
        fontStyle="600"
        fill={colors.foreground}
        listening={false}
      />
      {arrangement.seats.map((seat) => (
        <Group
          key={seat.id}
          x={seat.x}
          y={seat.y}
          rotation={seat.rotation}
          name={`seat:${arrangement.id}:${seat.id}`}
          onClick={(event) => {
            event.cancelBubble = true
            if (!dragged.current) onSelectSeat(seat.id)
          }}
          onTap={(event) => {
            event.cancelBubble = true
            onSelectSeat(seat.id)
          }}
        >
          <Circle
            radius={CHAIR / 2}
            fill={seat.guestId ? colors.accentSoft : colors.surface}
            stroke={seat.id === selectedSeatId ? colors.accent : seat.guestId ? colors.accent : colors.border}
            strokeWidth={seat.id === selectedSeatId ? 2 : 1}
            perfectDrawEnabled={false}
          />
          <Rect
            x={-3}
            y={-CHAIR / 2 - 3}
            width={6}
            height={4}
            cornerRadius={1}
            fill={seat.guestId ? colors.accent : colors.muted}
            listening={false}
          />
          <Text
            text={seat.label}
            width={CHAIR}
            offsetX={CHAIR / 2}
            y={-5}
            align="center"
            fontFamily="Geist Sans, sans-serif"
            fontSize={10}
            fill={colors.foreground}
            listening={false}
          />
        </Group>
      ))}
    </Group>
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
  onSelect: () => void
}) {
  const stroke = selected ? colors.accent : colors.foreground
  const common = {
    fill: colors.surface,
    stroke,
    strokeWidth: selected ? 2 : 1.5,
    onMouseDown: (event: { cancelBubble: boolean }) => {
      event.cancelBubble = true
    },
    onClick: (event: { cancelBubble: boolean }) => {
      event.cancelBubble = true
      onSelect()
    },
    onTap: (event: { cancelBubble: boolean }) => {
      event.cancelBubble = true
      onSelect()
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
