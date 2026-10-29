import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Armchair,
  ArrowDown,
  ArrowUp,
  Circle,
  Copy,
  Group,
  Hand,
  ImageDown,
  Loader2,
  Maximize2,
  Minus,
  MousePointer2,
  Move,
  Plus,
  RectangleHorizontal,
  Redo2,
  RotateCw,
  SlidersHorizontal,
  Square,
  Trash2,
  Undo2,
  Ungroup,
  UnfoldHorizontal,
  UnfoldVertical,
  Check,
  ChevronDown,
  Info,
  ListOrdered,
  Palette,
  UserMinus,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark } from '@/components/brand/Logo'
import { ColorSwatchField } from '@/components/invitations/designerControls'
import { AddMenu } from '@/components/seating/AddMenu'
import { GuestPanel } from '@/components/seating/GuestPanel'
import {
  BlockDialog,
  singleGrid,
  StageDialog,
  TableDialog,
  type BlockDraft,
  type StageDraft,
  type TableDraft,
} from '@/components/seating/ArrangementDialogs'
import { FloorStage, readFloorColors, type FloorColors, type FloorExporter, type SeatGuest } from '@/components/seating/FloorStage'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { NumberField } from '@/components/ui/NumberField'
import { TextField } from '@/components/ui/TextField'
import { buildArrangement, buildBlock, CHAIR, defaultBlock, gridPitch, nextArrangementName, occupiedBeyond, seatPlace, snapValue, validateBlock } from '@/seating/geometry'
import { footprint, gridCenters, gridSpan, resizeSide, sideAnchor, sidesOf, validateGrid, type GridSpec } from '@/seating/geometry'
import { hasSides, tableSides, type SideCounts, type TableSide } from '@/seating/model'
import {
  alignArrangements,
  arrangementBox,
  dissolveSingleGroups,
  distributeArrangements,
  groupArrangements,
  hitArrangements,
  moveCohort,
  normalizeAngle,
  readableOn,
  renumberSeats,
  renumberTables,
  reorderArrangement,
  rotateLocal,
  rotateSelection,
  seatWorld,
  selectionUnits,
  setSeatRotation,
  shortestDelta,
  spaceArrangements,
  splitSegments,
  ungroupArrangements,
  unionBounds,
  type AlignMode,
  type TableOrder,
  type WorldRect,
} from '@/seating/layoutOps'
import {
  activeLayout,
  defaultChairFill,
  defaultChairStroke,
  defaultStageFill,
  defaultStageStroke,
  defaultTableFill,
  defaultTableStroke,
  DEFAULT_LABEL_FONT,
  findSeat,
  kindDefaults,
  kindLabel,
  mapLayout,
  MAX_LABEL_FONT,
  MIN_LABEL_FONT,
  seatedGuestIds,
  specOf,
  type Arrangement,
  type ChairOpening,
  type FloorLayout,
  type Distribution,
  type SeatingDesign,
  type SeatSpec,
  type TableKind,
} from '@/seating/model'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { guestApi, type Guest } from '@/api/guestApi'
import { cn } from '@/lib/cn'

type Tool = 'select' | 'pan' | TableKind

const kindIcon = {
  round: Circle,
  square: Square,
  rect: Square,
  oval: Circle,
  crescent: Circle,
  ushape: Square,
  row: Armchair,
  stage: RectangleHorizontal,
} as const

export function SeatingDesigner({
  eventId,
  eventName,
  guests,
  design,
  dirty,
  saving,
  onChange,
  onPreview,
  onCommitFrom,
  onSave,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  persistedLayoutIds,
  onDeleteLayout,
  onResetLayout,
}: {
  eventId: string
  eventName: string
  guests: Guest[]
  design: SeatingDesign
  dirty: boolean
  saving: boolean
  onChange: (design: SeatingDesign) => void
  onPreview: (design: SeatingDesign) => void
  onCommitFrom: (before: SeatingDesign, after: SeatingDesign) => void
  onSave: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  persistedLayoutIds: string[]
  onDeleteLayout: (layoutId: string) => Promise<void>
  onResetLayout: (layoutId: string) => Promise<void>
}) {
  const [tool, setTool] = useState<Tool>('select')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [primaryId, setPrimaryId] = useState<string | null>(null)
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null)
  const [selectedSeatKeys, setSelectedSeatKeys] = useState<string[]>([])
  const [numberStart, setNumberStart] = useState(1)
  const [numberStep, setNumberStep] = useState(1)
  const [tablePrefix, setTablePrefix] = useState('Table')
  const [tableStart, setTableStart] = useState(1)
  const [tableOrder, setTableOrder] = useState<TableOrder>('rows')
  const [spec, setSpec] = useState<SeatSpec>(kindDefaults.round)
  const toolSpec = spec
  const [addOpen, setAddOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [guestFilter, setGuestFilter] = useState<'all' | 'seated' | 'open'>('all')
  const [toolsOpen, setToolsOpen] = useState(false)
  const [guestsOpen, setGuestsOpen] = useState(false)
  const [colors, setColors] = useState<FloorColors>(() => readFloorColors())
  const [view, setView] = useState({ x: 48, y: 48, scale: 1 })
  const [layoutAction, setLayoutAction] = useState<'delete' | 'reset' | null>(null)
  const [layoutActionError, setLayoutActionError] = useState<string | null>(null)
  const [layoutActionPending, setLayoutActionPending] = useState(false)
  const [composer, setComposer] = useState<
    | { kind: 'block'; mode: 'create'; x: number; y: number }
    | { kind: 'block'; mode: 'edit'; id: string }
    | { kind: 'stage'; mode: 'create'; x: number; y: number }
    | { kind: 'stage'; mode: 'edit'; id: string }
    | { kind: 'table'; tableKind: TableKind; x: number; y: number }
    | null
  >(null)
  const [pendingRemoval, setPendingRemoval] = useState<
    | { kind: 'seat'; arrangementId: string; seatId: string; guestName: string }
    | { kind: 'arrangements'; guests: number }
    | null
  >(null)
  const gesture = useRef<{ x: number; y: number; base: SeatingDesign } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const tableDetailsRef = useRef<HTMLDivElement>(null)
  const exporterRef = useRef<FloorExporter | null>(null)
  const [exportingImage, setExportingImage] = useState(false)
  /** Table whose chairs are about to be cleared (waiting for confirmation). */
  const [clearTableId, setClearTableId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const layout = activeLayout(design)
  const selected = layout?.arrangements.find((item) => item.id === primaryId) ?? null
  const groupedSelection = selectedIds.length > 1 && selectedIds.every((id) => {
    const item = layout?.arrangements.find((entry) => entry.id === id)
    const first = layout?.arrangements.find((entry) => entry.id === selectedIds[0])
    return item?.groupId && item.groupId === first?.groupId
  })
  const canUngroup = selectedIds.some((id) => layout?.arrangements.find((entry) => entry.id === id)?.groupId)
  const selectedSeat = selected?.seats.find((seat) => seat.id === selectedSeatId) ?? null
  // The seat & table panel replaces the plain header when one table (not the stage) is selected.
  const showSeatPanel = Boolean(selected && selected.kind !== 'stage' && selectedIds.length === 1 && tool === 'select')
  // Tables (not seat blocks) get the full configuration panel under the seat list.
  const configMode = showSeatPanel && selected?.kind !== 'row'
  const seated = useMemo(() => seatedGuestIds(design), [design])
  const guestDetails = useMemo(
    () =>
      new Map<string, SeatGuest>(
        guests.map((guest) => [
          guest.id,
          { name: guest.name, guestTypeName: guest.guestTypeName, position: guest.position, email: guest.email, checkInCode: guest.checkInCode },
        ]),
      ),
    [guests],
  )

  useEffect(() => {
    const sync = () => setColors(readFloorColors())
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (selected) setSpec(specOf(selected))
  }, [selected?.id])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) onRedo()
        else onUndo()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedIds.length > 0) {
        event.preventDefault()
        duplicateSelected()
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!composer) requestRemoval()
      } else if (event.key === 'Escape') {
        setTool('select')
        setSelectedIds([])
        setPrimaryId(null)
        setSelectedSeatId(null)
        setSelectedSeatKeys([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function patchLayout(recipe: (arrangements: Arrangement[]) => Arrangement[]) {
    if (!layout) return
    onChange(mapLayout(design, layout.id, (current) => ({ ...current, arrangements: recipe(current.arrangements) })))
  }

  function place(x: number, y: number, kindOverride?: TableKind, specOverride?: SeatSpec) {
    const kind = kindOverride ?? tool
    if (kind === 'select' || kind === 'pan' || !layout) return
    if (kind === 'row') {
      setComposer({ kind: 'block', mode: 'create', x, y })
      return
    }
    if (kind === 'stage') {
      setComposer({ kind: 'stage', mode: 'create', x, y })
      return
    }
    const spec = specOverride ?? toolSpec
    const grid = { rows: spec.rows, columns: spec.columns }
    const built = buildArrangement({ ...spec, kind, rows: 1, columns: 1 })
    const pitch = gridPitch(built.tableWidth, built.tableHeight, spec.chairGap)
    const originX = x - ((grid.columns - 1) * pitch.x) / 2
    const originY = y - ((grid.rows - 1) * pitch.y) / 2
    const created: Arrangement[] = []
    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        const seats = buildArrangement({ ...spec, kind, rows: 1, columns: 1 }).seats
        created.push({
          ...spec,
          id: crypto.randomUUID(),
          kind,
          name: nextArrangementName(kind, [...layout.arrangements, ...created]),
          x: snapValue(originX + column * pitch.x, design.grid, design.snap),
          y: snapValue(originY + row * pitch.y, design.grid, design.snap),
          rotation: 0,
          chairs: spec.chairs,
          rows: 1,
          columns: 1,
          tableWidth: built.tableWidth,
          tableHeight: built.tableHeight,
          groupId: null,
          fill: null,
          stroke: null,
          labelColor: null,
          chairSize: null,
          strokeWidth: null,
          showLabel: true,
          labelSize: null,
          block: null,
          seats,
        })
      }
    }
    patchLayout((items) => [...items, ...created])
    setSelectedIds(created[0] ? [created[0].id] : [])
    setPrimaryId(created[0]?.id ?? null)
    setSelectedSeatId(null)
        setSelectedSeatKeys([])
    setTool('select')
    setToolsOpen(false)
  }

  function canvasSize() {
    const host = canvasRef.current
    return { width: host?.clientWidth ?? 800, height: host?.clientHeight ?? 600 }
  }

  function viewCenter() {
    const { width, height } = canvasSize()
    return { x: (width / 2 - view.x) / view.scale, y: (height / 2 - view.y) / view.scale }
  }

  /** Next open spot to the right of the last object, wrapping into a new row. */
  function freeSpot(kind: TableKind) {
    if (!layout || layout.arrangements.length === 0) return viewCenter()
    const defaults = kindDefaults[kind]
    const built = buildArrangement({ ...defaults, rows: 1, columns: 1 })
    const pitch = gridPitch(built.tableWidth, built.tableHeight, defaults.chairGap)
    const all = unionBounds(layout.arrangements.map(arrangementBox))
    const last = arrangementBox(layout.arrangements[layout.arrangements.length - 1])
    if (!all) return viewCenter()
    const x = last.right + pitch.x / 2
    if (x - all.left > 1400) return { x: all.left + pitch.x / 2, y: all.bottom + pitch.y / 2 }
    return { x, y: last.cy }
  }

  function reveal(point: { x: number; y: number }) {
    const { width, height } = canvasSize()
    const sx = view.x + point.x * view.scale
    const sy = view.y + point.y * view.scale
    if (sx > 80 && sx < width - 80 && sy > 80 && sy < height - 80) return
    setView({ ...view, x: width / 2 - point.x * view.scale, y: height / 2 - point.y * view.scale })
  }

  function quickAdd(kind: TableKind) {
    const point = freeSpot(kind)
    if (kind !== 'row' && kind !== 'stage') {
      setSpec(kindDefaults[kind])
      place(point.x, point.y, kind, kindDefaults[kind])
    } else {
      place(point.x, point.y, kind)
    }
    reveal(point)
  }

  /** Open the Add dialog (rows × columns, sizes, numbering) for any kind of object. */
  function openAdd(kind: TableKind) {
    const point = freeSpot(kind)
    if (kind === 'row' || kind === 'stage') {
      place(point.x, point.y, kind)
      return
    }
    setComposer({ kind: 'table', tableKind: kind, x: point.x, y: point.y })
  }

  /** Origins for a rows × columns grid whose first cell sits at (x, y). */
  function gridOrigins(grid: GridSpec, size: { width: number; height: number; cx: number; cy: number }, x: number, y: number) {
    const span = gridSpan(grid, size)
    return gridCenters(grid, size, x + (span.width - size.width) / 2 + size.cx, y + (span.height - size.height) / 2 + size.cy)
  }

  function adopt(created: Arrangement[], groupCopies: boolean) {
    if (created.length === 0) return
    const groupId = groupCopies && created.length > 1 ? crypto.randomUUID() : null
    const items = created.map((item) => ({ ...item, groupId }))
    patchLayout((current) => [...current, ...items])
    setSelectedIds(items.map((item) => item.id))
    setPrimaryId(items[0].id)
    setSelectedSeatId(null)
    setSelectedSeatKeys([])
    setTool('select')
    const box = unionBounds(items.map(arrangementBox))
    if (box) reveal({ x: box.cx, y: box.cy })
    if (items.length > 1) toast.success(`Added ${items.length} objects.`)
  }

  function finishTables(draft: TableDraft) {
    if (!layout || composer?.kind !== 'table' || validateGrid(draft.grid)) return
    const kind = composer.tableKind
    const spec = { ...draft.spec, kind, rows: 1, columns: 1 }
    const sample = buildArrangement(spec)
    const origins = gridOrigins(draft.grid, footprint(sample), composer.x, composer.y)
    const prefix = draft.prefix.trim() || 'Table'
    const created: Arrangement[] = origins.map((origin, index) => {
      const built = buildArrangement(spec)
      return {
        ...spec,
        id: crypto.randomUUID(),
        name: `${prefix} ${draft.start + index}`,
        x: snapValue(origin.x, design.grid, design.snap),
        y: snapValue(origin.y, design.grid, design.snap),
        rotation: 0,
        chairs: built.seats.length,
        tableWidth: built.tableWidth,
        tableHeight: built.tableHeight,
        groupId: null,
        fill: null,
        stroke: null,
        labelColor: null,
        chairSize: null,
        strokeWidth: null,
        showLabel: true,
        labelSize: null,
        block: null,
        seats: built.seats,
      }
    })
    setSpec(spec)
    adopt(renumberTables(created, null, prefix, draft.start, draft.order), draft.groupCopies)
    setComposer(null)
  }

  function zoomBy(factor: number) {
    const { width, height } = canvasSize()
    const scale = Math.min(2.5, Math.max(0.25, view.scale * factor))
    const cx = (width / 2 - view.x) / view.scale
    const cy = (height / 2 - view.y) / view.scale
    setView({ scale, x: width / 2 - cx * scale, y: height / 2 - cy * scale })
  }

  function fitView() {
    const box = layout ? unionBounds(layout.arrangements.map(arrangementBox)) : null
    if (!box) {
      setView({ x: 48, y: 48, scale: 1 })
      return
    }
    const { width, height } = canvasSize()
    const pad = 96
    const scale = Math.min(2.5, Math.max(0.25, Math.min((width - pad * 2) / Math.max(1, box.right - box.left), (height - pad * 2) / Math.max(1, box.bottom - box.top))))
    setView({ scale, x: width / 2 - box.cx * scale, y: height / 2 - ((box.top + box.bottom) / 2) * scale })
  }

  /** Every selected table (seat rows and stages excluded). A group selection counts each table in it. */
  function selectedTables() {
    if (!layout) return []
    const ids = new Set(selectedIds)
    return layout.arrangements.filter((item) => ids.has(item.id) && item.kind !== 'row' && item.kind !== 'stage')
  }

  /** Report what happened when a change was applied to several tables at once. */
  function reportBatch(changed: number, skipped: { name: string; reason: string }[], what: string) {
    if (skipped.length === 0) {
      if (changed > 1) toast.success(`${what} on ${changed} tables.`)
      return
    }
    const names = skipped.slice(0, 3).map((item) => item.name).join(', ') + (skipped.length > 3 ? ` +${skipped.length - 3} more` : '')
    if (changed === 0) toast.error(skipped.length === 1 ? skipped[0].reason : `No table changed. ${skipped[0].reason} (${names})`)
    else toast.message(`${what} on ${changed} ${changed === 1 ? 'table' : 'tables'}. Skipped ${names}: ${skipped[0].reason}`)
  }

  /** Add or remove one chair on the same side of every selected straight-sided table. */
  function adjustSide(side: TableSide, delta: number) {
    const targets = selectedTables().filter((item) => hasSides(item.kind))
    if (targets.length === 0) return
    const updates = new Map<string, Partial<Arrangement>>()
    const skipped: { name: string; reason: string }[] = []
    let primarySpec: SeatSpec | null = null
    for (const item of targets) {
      const result = resizeSide(item, side, delta)
      if (!result.ok) {
        skipped.push({ name: item.name, reason: result.reason })
        continue
      }
      updates.set(item.id, {
        chairs: result.seats.length,
        sides: result.spec.sides ?? null,
        tableWidth: result.tableWidth,
        tableHeight: result.tableHeight,
        seats: result.seats,
      })
      if (item.id === selected?.id) primarySpec = result.spec
    }
    if (updates.size > 0) {
      patchLayout((items) => items.map((item) => (updates.has(item.id) ? { ...item, ...updates.get(item.id) } : item)))
      if (primarySpec) setSpec(primarySpec)
    }
    reportBatch(updates.size, skipped, delta > 0 ? `Added a chair (${side})` : `Removed a chair (${side})`)
  }

  /** Add or remove one chair on every selected round, oval or half-round table. */
  function adjustChairs(delta: number) {
    const targets = selectedTables().filter((item) => !hasSides(item.kind))
    if (targets.length === 0) return
    const updates = new Map<string, Partial<Arrangement>>()
    const skipped: { name: string; reason: string }[] = []
    let primarySpec: SeatSpec | null = null
    for (const item of targets) {
      const next = Math.max(1, Math.min(80, item.seats.length + delta))
      if (next === item.seats.length) {
        skipped.push({ name: item.name, reason: delta > 0 ? 'A table holds at most 80 chairs.' : 'A table needs at least one chair.' })
        continue
      }
      if (delta < 0 && occupiedBeyond(item.seats, next) > 0) {
        skipped.push({ name: item.name, reason: 'The last chair has a guest. Clear that seat first.' })
        continue
      }
      const nextSpec = { ...specOf(item), chairs: next }
      const built = buildArrangement(nextSpec, item.seats)
      updates.set(item.id, { chairs: next, tableWidth: built.tableWidth, tableHeight: built.tableHeight, seats: built.seats })
      if (item.id === selected?.id) primarySpec = nextSpec
    }
    if (updates.size > 0) {
      patchLayout((items) => items.map((item) => (updates.has(item.id) ? { ...item, ...updates.get(item.id) } : item)))
      if (primarySpec) setSpec(primarySpec)
      setSelectedSeatId(null)
      setSelectedSeatKeys([])
    }
    reportBatch(updates.size, skipped, delta > 0 ? 'Added a chair' : 'Removed a chair')
  }

  function move(arrangementId: string, x: number, y: number, rotation: number, size?: { width: number; height: number }) {
    patchLayout((items) => {
      const item = items.find((entry) => entry.id === arrangementId)
      if (!item) return items
      if (size && item.kind === 'stage') {
        const nextRotation = design.snap ? (Math.round(normalizeAngle(rotation) / 15) * 15) % 360 : normalizeAngle(rotation)
        return items.map((entry) =>
          entry.id === arrangementId
            ? {
                ...entry,
                x: snapValue(x, design.grid, design.snap),
                y: snapValue(y, design.grid, design.snap),
                rotation: nextRotation,
                tableWidth: size.width,
                tableHeight: size.height,
              }
            : entry,
        )
      }
      const nextRotation = design.snap ? (Math.round(normalizeAngle(rotation) / 15) * 15) % 360 : normalizeAngle(rotation)
      const delta = shortestDelta(item.rotation, nextRotation)
      if (Math.abs(delta) > 0.01 && selectedIds.length > 1 && selectedIds.includes(arrangementId)) {
        return rotateSelection(items, selectedIds, delta)
      }
      if (Math.abs(delta) > 0.01) {
        return items.map((entry) => (entry.id === arrangementId ? { ...entry, rotation: normalizeAngle(entry.rotation + delta) } : entry))
      }
      const cohort = moveCohort(items, arrangementId, selectedIds)
      const dx = cohort.length > 1 ? x - item.x : snapValue(x, design.grid, design.snap) - item.x
      const dy = cohort.length > 1 ? y - item.y : snapValue(y, design.grid, design.snap) - item.y
      const snappedDx = cohort.length > 1 && design.snap ? Math.round(dx / design.grid) * design.grid : dx
      const snappedDy = cohort.length > 1 && design.snap ? Math.round(dy / design.grid) * design.grid : dy
      return items.map((entry) => {
        if (!cohort.includes(entry.id)) return entry
        return { ...entry, x: entry.x + snappedDx, y: entry.y + snappedDy }
      })
    })
  }

  function moveSeat(arrangementId: string, seatId: string, x: number, y: number) {
    patchLayout((items) =>
      items.map((item) =>
        item.id === arrangementId
          ? {
              ...item,
              seats: item.seats.map((seat) =>
                seat.id === seatId
                  ? { ...seat, x: snapValue(x, design.grid, design.snap), y: snapValue(y, design.grid, design.snap) }
                  : seat,
              ),
            }
          : item,
      ),
    )
  }

  function finishBlock(draft: BlockDraft) {
    if (!layout || validateBlock(draft.block, draft.chairSize)) return
    const editing = composer?.kind === 'block' && composer.mode === 'edit' ? layout.arrangements.find((item) => item.id === composer.id) : null
    const built = buildBlock(draft.block, draft.chairSize, editing?.seats)
    const name = draft.name.trim() || editing?.name || nextArrangementName('row', layout.arrangements)
    if (editing) {
      patchLayout((items) =>
        items.map((item) =>
          item.id === editing.id
            ? {
                ...item,
                name,
                kind: 'row',
                rotation: normalizeAngle(draft.rotation),
                chairs: built.seats.length,
                chairGap: draft.block.chairGap,
                rows: draft.block.rows,
                columns: draft.block.columns,
                tableWidth: built.tableWidth,
                tableHeight: built.tableHeight,
                chairSize: draft.chairSize,
                block: draft.block,
                seats: built.seats,
              }
            : item,
        ),
      )
    } else if (composer?.kind === 'block' && composer.mode === 'create') {
      if (validateGrid(draft.grid)) return
      const width = built.tableWidth
      const alignShift = draft.block.align === 'left' ? width / 2 : draft.block.align === 'right' ? -width / 2 : 0
      const origins = gridOrigins(draft.grid, { width: built.tableWidth, height: built.tableHeight, cx: 0, cy: 0 }, composer.x + alignShift, composer.y)
      // Sections further back continue the row names: a second line of sections starts at Row 5 after Rows 1-4.
      const rowsPerSection = draft.block.orientation === 'vertical' ? draft.block.rows * draft.block.segments : draft.block.rows
      const typedName = draft.name.trim()
      const created: Arrangement[] = []
      for (const origin of origins) {
        const gridRow = draft.block.frontRow === 'bottom' ? draft.grid.rows - 1 - origin.row : origin.row
        const block = { ...draft.block, rowStart: draft.block.rowStart + gridRow * rowsPerSection }
        const copy = buildBlock(block, draft.chairSize)
        const sectionName =
          origins.length === 1
            ? name
            : typedName && typedName !== blockDraft.name
              ? `${typedName} ${created.length + 1}`
              : nextArrangementName('row', [...layout.arrangements, ...created])
        created.push({
          id: crypto.randomUUID(),
          kind: 'row' as const,
          name: sectionName,
          x: snapValue(origin.x, design.grid, design.snap),
          y: snapValue(origin.y, design.grid, design.snap),
          rotation: normalizeAngle(draft.rotation),
          chairs: copy.seats.length,
          chairGap: block.chairGap,
          tableWidth: copy.tableWidth,
          tableHeight: copy.tableHeight,
          rows: block.rows,
          columns: block.columns,
          distribution: 'around' as const,
          opening: 'even' as const,
          groupId: null,
          fill: null,
          stroke: null,
          labelColor: null,
          chairSize: draft.chairSize,
          strokeWidth: null,
          showLabel: true,
          labelSize: null,
          block,
          seats: copy.seats,
        })
      }
      adopt(created, draft.groupCopies)
    }
    setComposer(null)
  }

  function finishStage(draft: StageDraft) {
    if (!layout) return
    const editing = composer?.kind === 'stage' && composer.mode === 'edit' ? layout.arrangements.find((item) => item.id === composer.id) : null
    if (editing) {
      patchLayout((items) =>
        items.map((item) =>
          item.id === editing.id
            ? {
                ...item,
                name: draft.name,
                rotation: normalizeAngle(draft.rotation),
                tableWidth: draft.width,
                tableHeight: draft.height,
                fill: draft.fill,
                stroke: draft.stroke,
                strokeWidth: draft.strokeWidth,
                showLabel: draft.showLabel,
                labelSize: draft.labelSize,
              }
            : item,
        ),
      )
    } else if (composer?.kind === 'stage' && composer.mode === 'create') {
      if (validateGrid(draft.grid)) return
      const origins = gridOrigins(draft.grid, { width: draft.width, height: draft.height, cx: 0, cy: 0 }, composer.x, composer.y)
      adopt(
        origins.map((origin, index) => ({
          id: crypto.randomUUID(),
          kind: 'stage' as const,
          name: origins.length > 1 ? `${draft.name} ${index + 1}` : draft.name,
          x: snapValue(origin.x, design.grid, design.snap),
          y: snapValue(origin.y, design.grid, design.snap),
          rotation: normalizeAngle(draft.rotation),
          chairs: 0,
          chairGap: 0,
          tableWidth: draft.width,
          tableHeight: draft.height,
          rows: 1,
          columns: 1,
          distribution: 'around' as const,
          opening: 'even' as const,
          groupId: null,
          fill: draft.fill,
          stroke: draft.stroke,
          labelColor: null,
          chairSize: null,
          strokeWidth: draft.strokeWidth,
          showLabel: draft.showLabel,
          labelSize: draft.labelSize,
          block: null,
          seats: [],
        })),
        draft.groupCopies,
      )
    }
    setComposer(null)
  }

  function openEditor() {
    if (!selected) return
    if (selected.kind === 'stage') {
      setComposer({ kind: 'stage', mode: 'edit', id: selected.id })
      return
    }
    if (selected.kind === 'row') setComposer({ kind: 'block', mode: 'edit', id: selected.id })
  }

  function requestRemoval() {
    if (selectedSeat && selected && selectedIds.length === 1 && selectedSeatKeys.length <= 1) {
      if (selectedSeat.guestId) {
        setPendingRemoval({
          kind: 'seat',
          arrangementId: selected.id,
          seatId: selectedSeat.id,
          guestName: guestName.get(selectedSeat.guestId) ?? 'a guest',
        })
        return
      }
      deleteSeat(selected.id, selectedSeat.id)
      return
    }
    const chosen = layout?.arrangements.filter((item) => selectedIds.includes(item.id)) ?? []
    const guestsSeated = chosen.reduce((sum, item) => sum + item.seats.filter((seat) => seat.guestId).length, 0)
    if (guestsSeated > 0) {
      setPendingRemoval({ kind: 'arrangements', guests: guestsSeated })
      return
    }
    removeSelected()
  }

  function deleteSeat(arrangementId: string, seatId: string) {
    patchLayout((items) =>
      items.map((item) =>
        item.id === arrangementId
          ? { ...item, chairs: Math.max(0, item.seats.length - 1), seats: item.seats.filter((seat) => seat.id !== seatId) }
          : item,
      ),
    )
    setSelectedSeatId(null)
    setSelectedSeatKeys([])
    setPendingRemoval(null)
  }

  function confirmRemoval() {
    if (!pendingRemoval) return
    if (pendingRemoval.kind === 'seat') deleteSeat(pendingRemoval.arrangementId, pendingRemoval.seatId)
    else removeSelected()
    setPendingRemoval(null)
  }

  function nudgeRotation(degrees: number) {
    if (selectedSeat && selected) {
      patchLayout((items) => setSeatRotation(items, selected.id, selectedSeat.id, selectedSeat.rotation + degrees))
      return
    }
    if (selectedIds.length === 0) return
    patchLayout((items) => rotateSelection(items, selectedIds, degrees))
  }

  function resetRotation() {
    if (selectedSeat && selected) {
      patchLayout((items) => setSeatRotation(items, selected.id, selectedSeat.id, 0))
      return
    }
    commitRotation(0)
  }

  function shiftSelection(base: SeatingDesign, dx: number, dy: number) {
    const current = activeLayout(base)
    if (!current || (dx === 0 && dy === 0)) return base
    return mapLayout(base, current.id, (floor) => ({
      ...floor,
      arrangements: floor.arrangements.map((item) => {
        if (selectedSeat && selected && item.id === selected.id && selectedIds.length === 1) {
          const local = rotateLocal(dx, dy, -item.rotation)
          return {
            ...item,
            seats: item.seats.map((seat) => (seat.id === selectedSeat.id ? { ...seat, x: seat.x + local.x, y: seat.y + local.y } : seat)),
          }
        }
        const cohort = moveCohort(floor.arrangements, primaryId ?? selectedIds[0] ?? '', selectedIds)
        if (!cohort.includes(item.id) || selectedSeat) return item
        return { ...item, x: item.x + dx, y: item.y + dy }
      }),
    }))
  }

  function beginNudge(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    gesture.current = { x: event.clientX, y: event.clientY, base: design }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function dragNudge(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current
    if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const dx = (event.clientX - current.x) / view.scale
    const dy = (event.clientY - current.y) / view.scale
    onPreview(shiftSelection(current.base, dx, dy))
  }

  function endNudge(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current
    if (!current) return
    gesture.current = null
    const dx = (event.clientX - current.x) / view.scale
    const dy = (event.clientY - current.y) / view.scale
    const sdx = current.base.snap ? Math.round(dx / current.base.grid) * current.base.grid : dx
    const sdy = current.base.snap ? Math.round(dy / current.base.grid) * current.base.grid : dy
    if (Math.abs(sdx) < 0.5 && Math.abs(sdy) < 0.5) {
      onPreview(current.base)
      return
    }
    onCommitFrom(current.base, shiftSelection(current.base, sdx, sdy))
  }

  function splitSelected() {
    if (!selected?.block || selected.block.segments < 2) return
    const parts = splitSegments(selected)
    if (!parts) return
    patchLayout((items) => items.flatMap((item) => (item.id === selected.id ? parts : [item])))
    setSelectedIds(parts.map((item) => item.id))
    setPrimaryId(parts[0]?.id ?? null)
    setSelectedSeatId(null)
    setSelectedSeatKeys([])
  }

  function restack(direction: 'forward' | 'backward') {
    const id = primaryId ?? selectedIds[0]
    if (!id) return
    patchLayout((items) => reorderArrangement(items, id, direction))
  }

  function rotateSeat(arrangementId: string, seatId: string, rotation: number) {
    const next = design.snap ? Math.round(normalizeAngle(rotation) / 15) * 15 % 360 : normalizeAngle(rotation)
    patchLayout((items) => setSeatRotation(items, arrangementId, seatId, next))
  }

  function rotateSelectionBy(degrees: number) {
    if (!Number.isFinite(degrees) || Math.abs(degrees) < 0.01) return
    patchLayout((items) => rotateSelection(items, selectedIds, degrees))
  }

  function commitRotation(degrees: number) {
    if (selectedSeat && selected && selectedSeatKeys.length > 0) {
      patchLayout((items) => setSeatRotation(items, selected.id, selectedSeat.id, degrees))
      return
    }
    if (selected && selectedIds.length <= 1) {
      patchLayout((items) => items.map((item) => (item.id === selected.id ? { ...item, rotation: normalizeAngle(degrees) } : item)))
      return
    }
    const primary = layout?.arrangements.find((item) => item.id === (primaryId ?? selectedIds[0]))
    if (!primary) return
    rotateSelectionBy(shortestDelta(primary.rotation, degrees))
  }

  /** Apply the panel's settings to the primary object and every other selected object of the same kind. */
  function updateSelected() {
    if (!selected || !layout) return
    const ids = new Set(selectedIds.length > 0 ? selectedIds : [selected.id])
    const targets = layout.arrangements.filter((item) => ids.has(item.id) && item.kind === selected.kind)
    const updates = new Map<string, Partial<Arrangement>>()
    const skipped: { name: string; reason: string }[] = []
    for (const item of targets) {
      const chairs = item.kind === 'row' ? spec.rows * spec.columns : spec.chairs
      if (occupiedBeyond(item.seats, chairs) > 0) {
        skipped.push({ name: item.name, reason: 'Fewer chairs would remove a seated guest. Clear those seats first.' })
        continue
      }
      const built = buildArrangement({ ...spec, kind: item.kind, chairs }, item.seats)
      updates.set(item.id, {
        ...spec,
        kind: item.kind,
        chairs,
        tableWidth: built.tableWidth,
        tableHeight: built.tableHeight,
        seats: built.seats,
      })
    }
    if (updates.size > 0) {
      patchLayout((items) => items.map((item) => (updates.has(item.id) ? { ...item, ...updates.get(item.id) } : item)))
    }
    reportBatch(updates.size, skipped, 'Updated seats')
  }

  function renumber() {
    if (!layout) return
    const scope = selectedIds.length > 0 ? selectedIds : null
    const targets = layout.arrangements.filter((item) => !scope || scope.includes(item.id))
    const chairCount = targets.reduce((sum, item) => sum + item.seats.length, 0)
    if (chairCount === 0) {
      toast.error('There are no chairs to renumber.')
      return
    }
    patchLayout((items) => renumberSeats(items, scope, numberStart, numberStep))
    toast.success(`Renumbered ${chairCount} chairs.`)
  }

  function renameTables() {
    if (!layout) return
    const scope = selectedIds.length > 0 ? selectedIds : null
    const count = layout.arrangements.filter((item) => item.kind !== 'row' && item.kind !== 'stage' && (!scope || scope.includes(item.id))).length
    if (count === 0) {
      toast.error('There are no tables to renumber.')
      return
    }
    patchLayout((items) => renumberTables(items, scope, tablePrefix, tableStart, tableOrder))
    toast.success(`Renumbered ${count} ${count === 1 ? 'table' : 'tables'}.`)
  }

  function duplicateSelected() {
    const source = layout?.arrangements.filter((item) => selectedIds.includes(item.id)) ?? []
    if (source.length === 0) return
    const copies: Arrangement[] = []
    for (const arrangement of source) {
      copies.push({
        ...arrangement,
        id: crypto.randomUUID(),
        groupId: null,
        name: nextArrangementName(arrangement.kind, [...(layout?.arrangements ?? []), ...copies]),
        x: arrangement.x + design.grid * 2,
        y: arrangement.y + design.grid * 2,
        seats: arrangement.seats.map((seat) => ({ ...seat, id: crypto.randomUUID(), guestId: null })),
      })
    }
    patchLayout((items) => [...items, ...copies])
    setSelectedIds(copies.map((item) => item.id))
    setPrimaryId(copies[0]?.id ?? null)
    setSelectedSeatId(null)
        setSelectedSeatKeys([])
  }

  function removeSelected() {
    const ids = new Set(selectedIds)
    patchLayout((items) => dissolveSingleGroups(items.filter((item) => !ids.has(item.id))))
    setSelectedIds([])
    setPrimaryId(null)
    setSelectedSeatId(null)
        setSelectedSeatKeys([])
  }

  function choose(arrangementId: string | null, seatId: string | null, mode: 'replace' | 'add' | 'toggle') {
    if (!layout || !arrangementId) {
      setSelectedIds([])
      setPrimaryId(null)
      setSelectedSeatId(null)
      setSelectedSeatKeys([])
      return
    }
    const item = layout.arrangements.find((entry) => entry.id === arrangementId)
    if (!item) return
    if (seatId) {
      const key = `${arrangementId}:${seatId}`
      if (mode === 'toggle') {
        setSelectedSeatKeys((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]))
      } else if (mode === 'add') {
        setSelectedSeatKeys((current) => (current.includes(key) ? current : [...current, key]))
      } else {
        setSelectedSeatKeys([key])
        setSelectedIds([arrangementId])
      }
      setPrimaryId(arrangementId)
      setSelectedSeatId(seatId)
      setTool('select')
      return
    }
    const bundle = item.groupId
      ? layout.arrangements.filter((entry) => entry.groupId === item.groupId).map((entry) => entry.id)
      : [arrangementId]
    setSelectedSeatKeys([])
    if (mode === 'toggle') {
      setSelectedIds((current) => (current.includes(arrangementId) ? current.filter((id) => id !== arrangementId) : [...current, arrangementId]))
      setPrimaryId(arrangementId)
      setSelectedSeatId(null)
    } else if (mode === 'add') {
      setSelectedIds((current) => [...new Set([...current, ...bundle])])
      setPrimaryId(arrangementId)
      setSelectedSeatId(null)
    } else {
      setSelectedIds(bundle)
      setPrimaryId(arrangementId)
      setSelectedSeatId(null)
    }
    setTool('select')
  }

  function applyMarquee(rect: WorldRect, additive: boolean) {
    if (!layout) return
    const hits = hitArrangements(layout.arrangements, rect)
    setSelectedIds((current) => (additive ? [...new Set([...current, ...hits])] : hits))
    setPrimaryId(hits[0] ?? null)
    setSelectedSeatId(null)
        setSelectedSeatKeys([])
  }

  function align(mode: AlignMode) {
    if (!layout || selectionUnits(layout.arrangements, selectedIds).length < 2) return
    patchLayout((items) => alignArrangements(items, selectedIds, mode))
  }

  function distribute(axis: 'x' | 'y') {
    if (!layout || selectionUnits(layout.arrangements, selectedIds).length < 3) return
    const result = distributeArrangements(layout.arrangements, selectedIds, axis)
    if (result.overlaps) toast.message('These objects overlap at that spacing.')
    patchLayout(() => result.items)
  }

  function applyGap(axis: 'x' | 'y', gap: number | null) {
    if (gap === null || gap < 0 || !layout || selectionUnits(layout.arrangements, selectedIds).length < 2) return
    patchLayout((items) => spaceArrangements(items, selectedIds, axis, gap))
  }

  function groupSelection() {
    if (selectedIds.length < 2) return
    const groupId = crypto.randomUUID()
    patchLayout((items) => groupArrangements(items, selectedIds, groupId))
  }

  function ungroupSelection() {
    if (!canUngroup) return
    patchLayout((items) => ungroupArrangements(items, selectedIds))
  }

  function assign(arrangementId: string, seatId: string, guestId: string) {
    if (!layout) return
    onChange(
      mapLayout(design, layout.id, (current) => ({
        ...current,
        arrangements: current.arrangements.map((arrangement) => ({
          ...arrangement,
          seats: arrangement.seats.map((seat) => {
            if (seat.guestId === guestId) return { ...seat, guestId: null }
            if (arrangement.id === arrangementId && seat.id === seatId) return { ...seat, guestId }
            return seat
          }),
        })),
      })),
    )
    setSelectedIds([arrangementId])
    setPrimaryId(arrangementId)
    setSelectedSeatId(seatId)
    setSelectedSeatKeys([`${arrangementId}:${seatId}`])
    setGuestsOpen(false)
  }

  /** Fixes a guest's name (spelling) everywhere: saves it on the guest record and refreshes the list. */
  async function renameGuest(guestId: string, name: string) {
    const guest = guests.find((item) => item.id === guestId)
    const next = name.trim()
    if (!guest || !next || next === guest.name) return
    try {
      await guestApi.update(eventId, guest.id, {
        name: next,
        email: guest.email,
        position: guest.position,
        guestTypeId: guest.guestTypeId,
        guestGroupId: guest.guestGroupId ?? null,
        acknowledgeTypeChange: false,
      })
      await queryClient.invalidateQueries({ queryKey: ['guests', eventId] })
      toast.success(`Name updated to ${next}.`)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'The name could not be saved.')
    }
  }

  /** Downloads the whole active floor, with every seat number and guest name tag, as a high-resolution PNG. */
  async function saveImage() {
    const exporter = exporterRef.current
    if (!exporter || !layout) return
    setExportingImage(true)
    // Nothing selected, so no handles or highlights end up in the picture.
    setSelectedIds([])
    setPrimaryId(null)
    setSelectedSeatId(null)
    setSelectedSeatKeys([])
    try {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      const seatedCount = layout.arrangements.reduce((sum, item) => sum + item.seats.filter((seat) => seat.guestId).length, 0)
      const chairs = layout.arrangements.reduce((sum, item) => sum + item.seats.length, 0)
      const blob = await exporter.toPng({
        pixelRatio: 3,
        title: `${eventName} · ${layout.name}`,
        subtitle: `${seatedCount} of ${chairs} seats assigned · ${new Date().toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
      })
      const safe = (value: string) => value.trim().replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'seating'
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${safe(eventName)}-${safe(layout.name)}-seating.png`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      toast.success('Seating plan saved as an image.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The image could not be created.')
    } finally {
      setExportingImage(false)
    }
  }

  function clearTable(arrangementId: string) {
    patchLayout((items) =>
      items.map((item) => (item.id === arrangementId ? { ...item, seats: item.seats.map((seat) => ({ ...seat, guestId: null })) } : item)),
    )
  }

  function clearSeat(seatId: string, arrangementId: string) {
    patchLayout((items) =>
      items.map((item) =>
        item.id === arrangementId
          ? { ...item, seats: item.seats.map((seat) => (seat.id === seatId ? { ...seat, guestId: null } : seat)) }
          : item,
      ),
    )
  }

  function rename(name: string) {
    if (!selected) return
    patchLayout((items) => items.map((item) => (item.id === selected.id ? { ...item, name } : item)))
  }

  function addLayout() {
    const id = crypto.randomUUID()
    onChange({
      ...design,
      activeLayoutId: id,
      layouts: [...design.layouts, { id, name: design.layouts.length === 0 ? 'Main floor' : `Floor ${design.layouts.length + 1}`, arrangements: [] }],
    })
    clearSelection()
  }

  function clearSelection() {
    setSelectedIds([])
    setPrimaryId(null)
    setSelectedSeatId(null)
    setSelectedSeatKeys([])
  }

  async function runLayoutAction() {
    if (!layout || !layoutAction) return
    setLayoutActionPending(true)
    setLayoutActionError(null)
    const persisted = persistedLayoutIds.includes(layout.id)
    try {
      if (layoutAction === 'delete') {
        if (persisted) await onDeleteLayout(layout.id)
        else {
          const index = design.layouts.findIndex((item) => item.id === layout.id)
          const remaining = design.layouts.filter((item) => item.id !== layout.id)
          const neighbor = remaining[Math.min(Math.max(index - 1, 0), remaining.length - 1)]?.id ?? ''
          onChange({
            ...design,
            layouts: remaining,
            activeLayoutId: design.activeLayoutId === layout.id ? neighbor : design.activeLayoutId,
          })
          toast.success('Layout deleted.')
        }
      } else if (persisted) {
        await onResetLayout(layout.id)
      } else {
        onChange(mapLayout(design, layout.id, (current) => ({ ...current, arrangements: [] })))
        toast.success('Layout reset.')
      }
      clearSelection()
      setLayoutAction(null)
    } catch (error) {
      setLayoutActionError(error instanceof ApiError ? error.message : layoutAction === 'delete' ? 'The layout could not be deleted.' : 'The layout could not be reset.')
    } finally {
      setLayoutActionPending(false)
    }
  }

  const guestName = new Map(guests.map((guest) => [guest.id, guest.name]))
  const editingBlock = composer?.kind === 'block' && composer.mode === 'edit' ? layout?.arrangements.find((item) => item.id === composer.id) ?? null : null
  const editingStage = composer?.kind === 'stage' && composer.mode === 'edit' ? layout?.arrangements.find((item) => item.id === composer.id) ?? null : null
  const blockDraft: BlockDraft = {
    name: editingBlock?.name ?? (layout ? nextArrangementName('row', layout.arrangements) : 'Seats'),
    chairSize: editingBlock?.chairSize ?? CHAIR,
    rotation: Math.round(normalizeAngle(editingBlock?.rotation ?? 0)),
    block: editingBlock?.block ?? {
      ...defaultBlock(),
      ...(editingBlock ? { rows: editingBlock.rows, columns: editingBlock.columns, chairGap: Math.max(0, editingBlock.chairGap) } : {}),
    },
    grid: { ...singleGrid(), gapX: 120, gapY: 120 },
    groupCopies: false,
  }
  const tableDraft: TableDraft = {
    spec: kindDefaults[composer?.kind === 'table' ? composer.tableKind : 'round'],
    prefix: 'Table',
    start: layout ? Number(nextArrangementName('round', layout.arrangements).replace(/\D+/g, '')) || 1 : 1,
    order: 'rows',
    grid: singleGrid(),
    groupCopies: false,
  }
  const stageDraft: StageDraft = {
    name: editingStage?.name ?? (layout ? nextArrangementName('stage', layout.arrangements) : 'STAGE'),
    width: Math.round(editingStage?.tableWidth || 360),
    height: Math.round(editingStage?.tableHeight || 120),
    rotation: Math.round(normalizeAngle(editingStage?.rotation ?? 0)),
    fill: editingStage?.fill ?? defaultStageFill,
    stroke: editingStage?.stroke ?? defaultStageStroke,
    strokeWidth: editingStage?.strokeWidth ?? 2,
    showLabel: editingStage?.showLabel ?? true,
    labelSize: editingStage?.labelSize ?? 18,
    grid: singleGrid(),
    groupCopies: false,
  }
  // Per-side chair steppers for straight-sided tables (rect, square, U-shape).
  // Round, oval and half-round tables in the selection: the toolbar − / + changes all of them.
  const roundTargets = selectedTables().filter((item) => !hasSides(item.kind))
  // Side steppers sit around the primary table but change that side on every selected square/rect/U table.
  const sideTargets = selectedTables().filter((item) => hasSides(item.kind))
  const sideControls: { sides: TableSide[]; counts: SideCounts } | null = (() => {
    if (!selected || selectedSeat || tool !== 'select' || !hasSides(selected.kind) || sideTargets.length === 0) return null
    const counts = sidesOf(specOf(selected))
    if (!counts) return null
    return { sides: tableSides.filter((side) => !(selected.kind === 'ushape' && side === 'top')), counts }
  })()
  const toolbarPoint = (() => {
    if (!layout || selectedIds.length === 0 || tool === 'pan') return null
    if (selectedSeat && selected) {
      const world = seatWorld(selected, selectedSeat)
      return { x: world.x, y: world.y - 40 }
    }
    const box = unionBounds(layout.arrangements.filter((item) => selectedIds.includes(item.id)).map(arrangementBox))
    return box ? { x: box.cx, y: box.top } : null
  })()
  // Table names and chair numbers for the selection or the whole floor (shown in every panel state).
  const numberingSection = (
    <ConfigSection
      icon={<ListOrdered className="size-5" aria-hidden="true" />}
      title="Numbering"
      hint={`${selectedIds.length > 0 ? `${selectedIds.length} selected` : 'The whole floor'}. Uses what you see now, so it puts things back in order after you turn a group.`}
    >
      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">Tables</p>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Name" value={tablePrefix} onChange={(event) => setTablePrefix(event.target.value.slice(0, 24))} />
          <NumberField label="First" value={tableStart} min={0} max={9999} onChange={(value) => value !== null && setTableStart(value)} />
        </div>
        <label className="mt-3 block text-sm">
          <span className="mb-1.5 block font-medium">Order</span>
          <select
            aria-label="Table order"
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            value={tableOrder}
            onChange={(event) => setTableOrder(event.target.value as TableOrder)}
          >
            <option value="rows">Left → right, then down</option>
            <option value="rows-rtl">Right → left, then down</option>
            <option value="snake">Snake (→ then ←)</option>
            <option value="snake-rtl">Snake (← then →)</option>
            <option value="columns">Top → bottom, then right</option>
            <option value="columns-btt">Bottom → top, then right</option>
          </select>
        </label>
        <Button className="mt-3 w-full border-accent text-accent hover:bg-accent-soft" variant="secondary" onClick={renameTables}>
          <RotateCw className="size-4" aria-hidden="true" />
          {selectedIds.length > 0 ? 'Renumber selected tables' : 'Renumber all tables'}
        </Button>
      </div>
      <div className="border-t border-border pt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Chairs</p>
        <p className="mb-3 flex items-start gap-3 rounded-md border border-border bg-background px-3 py-2.5 text-xs text-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          Each table starts again at the first number, clockwise from the top-left. Seat rows restart in every row.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Start" value={numberStart} min={0} max={9999} onChange={(value) => value !== null && setNumberStart(value)} />
          <NumberField label="Step" value={numberStep} min={1} max={100} onChange={(value) => value !== null && setNumberStep(value)} />
        </div>
        <Button className="mt-3 w-full border-accent text-accent hover:bg-accent-soft" variant="secondary" onClick={renumber}>
          <RotateCw className="size-4" aria-hidden="true" />
          {selectedIds.length > 0 ? 'Renumber chairs in selection' : 'Renumber all chairs'}
        </Button>
      </div>
    </ConfigSection>
  )
  const visibleGuests = guests.filter((guest) => {
    const matches = guest.name.toLowerCase().includes(query.trim().toLowerCase())
    if (!matches) return false
    if (guestFilter === 'seated') return seated.has(guest.id)
    if (guestFilter === 'open') return !seated.has(guest.id)
    return true
  })
  const seatCount = layout?.arrangements.reduce((sum, item) => sum + item.seats.length, 0) ?? 0
  const filled = layout?.arrangements.reduce((sum, item) => sum + item.seats.filter((seat) => seat.guestId).length, 0) ?? 0

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 overflow-x-auto border-b border-border bg-surface px-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <LogoMark className="size-6 text-accent" />
          <span className="whitespace-nowrap text-sm font-semibold">Seating</span>
        </div>
        <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        <Link to={`/events/${eventId}`} className="shrink-0 whitespace-nowrap text-sm text-muted hover:text-foreground">
          {eventName}
        </Link>
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <span className="text-muted">Layout</span>
          <select
            aria-label="Floor layout"
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
            value={design.activeLayoutId}
            onChange={(event) => {
              onChange({ ...design, activeLayoutId: event.target.value })
              setSelectedIds([])
              setPrimaryId(null)
              setSelectedSeatId(null)
        setSelectedSeatKeys([])
            }}
          >
            {design.layouts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" className="shrink-0 whitespace-nowrap" onClick={addLayout}>
          New layout
        </Button>
        <Button
          variant="secondary"
          className="shrink-0 whitespace-nowrap"
          disabled={!layout || layout.arrangements.length === 0 || saving || layoutActionPending}
          onClick={() => {
            setLayoutActionError(null)
            setLayoutAction('reset')
          }}
        >
          Reset layout
        </Button>
        <Button
          variant="secondary"
          className="shrink-0 whitespace-nowrap"
          disabled={!layout || saving || layoutActionPending}
          onClick={() => {
            setLayoutActionError(null)
            setLayoutAction('delete')
          }}
        >
          Delete layout
        </Button>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className={cn('mr-2 flex items-center gap-1.5 whitespace-nowrap text-xs', dirty ? 'text-accent' : 'text-muted')}>
            <span className={cn('size-1.5 rounded-full', dirty ? 'bg-accent' : 'bg-muted')} aria-hidden="true" />
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <Button variant="ghost" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
            <Undo2 className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
            <Redo2 className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            className="whitespace-nowrap"
            disabled={!layout || layout.arrangements.length === 0 || exportingImage}
            title="Download the whole floor with every guest name as a high-resolution PNG"
            onClick={() => void saveImage()}
          >
            {exportingImage ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ImageDown className="size-4" aria-hidden="true" />}
            {exportingImage ? 'Creating image…' : 'Save as image'}
          </Button>
          <Button className="whitespace-nowrap" onClick={onSave} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save layout'}
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'z-20 order-3 w-[26rem] max-w-full shrink-0 flex-col border-l border-border bg-surface',
            toolsOpen ? 'absolute inset-y-14 right-0 flex shadow-[var(--shadow)]' : 'hidden',
            'lg:static lg:flex lg:shadow-none',
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {selected && showSeatPanel ? (
              <SeatPanel
                arrangement={selected}
                layoutName={layout?.name ?? ''}
                seat={selectedSeat}
                guests={guests}
                seatedIds={seated}
                onClose={() => {
                  setSelectedIds([])
                  setPrimaryId(null)
                  setSelectedSeatId(null)
                  setSelectedSeatKeys([])
                }}
                onSelectSeat={(seatId) => {
                  setSelectedSeatId(seatId)
                  setSelectedSeatKeys([`${selected.id}:${seatId}`])
                }}
                onAssign={(seatId, guestId) => assign(selected.id, seatId, guestId)}
                onRemove={(seatId) => clearSeat(seatId, selected.id)}
                onRename={renameGuest}
                onClearAll={() => setClearTableId(selected.id)}
                onEditTable={() => tableDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              />
            ) : null}
            {selected && configMode ? (
              <div ref={tableDetailsRef} className="mt-8 scroll-mt-4 border-t border-border pt-6">
                <TableConfig
                  arrangement={selected}
                  spec={spec}
                  onSpec={setSpec}
                  seat={selectedSeat}
                  snap={design.snap}
                  onSnap={(snap) => onChange({ ...design, snap })}
                  firstNumber={numberStart}
                  onFirstNumber={setNumberStart}
                  step={numberStep}
                  onStep={setNumberStep}
                  onRename={rename}
                  onTableColors={(patch) => patchLayout((items) => items.map((item) => (item.id === selected.id ? { ...item, ...patch } : item)))}
                  pickedSeats={selected.seats.filter((seat) => selectedSeatKeys.includes(`${selected.id}:${seat.id}`))}
                  onSeatColors={(patch) => {
                    const keys = new Set(selectedSeatKeys)
                    patchLayout((items) =>
                      items.map((item) => ({
                        ...item,
                        seats: item.seats.map((seat) => (keys.has(`${item.id}:${seat.id}`) ? { ...seat, ...patch } : seat)),
                      })),
                    )
                  }}
                  onRotate={commitRotation}
                  onRenumber={renumber}
                  onDuplicate={duplicateSelected}
                  onDelete={requestRemoval}
                  onSave={updateSelected}
                />
              </div>
            ) : (
            <>
            <div className={cn('flex items-center justify-between gap-3', showSeatPanel && 'mt-8 border-t border-border pt-6')}>
              <div className="flex min-w-0 items-center gap-3">
                {(() => {
                  const kind = selected?.kind ?? (tool !== 'select' && tool !== 'pan' ? tool : null)
                  const Icon = kind ? kindIcon[kind] : SlidersHorizontal
                  return (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                  )
                })()}
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold tracking-tight">
                    {selectedIds.length > 1
                      ? `${selectedIds.length} objects`
                      : selected
                        ? selected.name
                        : tool !== 'select' && tool !== 'pan'
                          ? `New ${kindLabel[tool].toLowerCase()}`
                          : 'Floor settings'}
                  </h2>
                  <p className="truncate text-sm text-muted tabular-nums">
                    {selected
                      ? `${kindLabel[selected.kind]}${selected.seats.length ? ` · ${selected.seats.filter((seat) => seat.guestId).length} of ${selected.seats.length} seated` : ''}`
                      : tool !== 'select' && tool !== 'pan'
                        ? 'Set it up, then click the floor'
                        : 'Select an object on the floor to edit it'}
                  </p>
                </div>
              </div>
              {tool !== 'select' && tool !== 'pan' ? (
                <Button variant="secondary" className="h-9 px-3" onClick={() => setTool('select')}>
                  Cancel
                </Button>
              ) : null}
            </div>

            <div className="mt-6 grid gap-6">
              {(selected ? selected.kind !== 'row' && selected.kind !== 'stage' : tool !== 'select' && tool !== 'pan') ? (
                <ConfigSection
                  defaultOpen
                  icon={<Armchair className="size-5" aria-hidden="true" />}
                  title="Seats & dimensions"
                  hint={selected ? 'Applies to every selected table of this kind when you update seats.' : 'Set it up, then click the floor to place it.'}
                >
                  {(selected ? selected.kind !== 'row' && selected.kind !== 'stage' : tool !== 'row' && tool !== 'stage') ? (
                    <div className="-mt-4">
                      <SpecFields
                        spec={spec}
                        onChange={setSpec}
                        showDistribution={(selected?.kind ?? spec.kind) === 'rect'}
                        showOpening={(selected?.kind ?? spec.kind) === 'round' || (selected?.kind ?? spec.kind) === 'oval'}
                        showGrid={!selected}
                      />
                    </div>
                  ) : null}
                  {tool === 'row' ? (
                    <PanelNote>Click the floor to set rows, chairs, segments, and gaps before the chairs are placed.</PanelNote>
                  ) : tool === 'stage' ? (
                    <PanelNote>Click the floor to set the stage size, colors, and label before it is placed.</PanelNote>
                  ) : tool !== 'select' && tool !== 'pan' ? (
                    <PanelNote>
                      {spec.rows * spec.columns > 1
                        ? `Click the floor to place ${spec.rows} × ${spec.columns} tables.`
                        : `Click the floor to place this ${kindLabel[tool].toLowerCase()}.`}
                    </PanelNote>
                  ) : null}
                  {selected && selected.kind !== 'row' && selected.kind !== 'stage' ? (
                    <Button className="w-full" onClick={updateSelected}>
                      <Check className="size-4" aria-hidden="true" />
                      Update seats
                    </Button>
                  ) : null}
                </ConfigSection>
              ) : null}

              {selected ? (
                <ConfigSection
                  defaultOpen
                  icon={<SlidersHorizontal className="size-5" aria-hidden="true" />}
                  title="Details & actions"
                  hint={selectedIds.length > 1 ? `Name, rotation and actions · ${selectedIds.length} objects selected.` : 'Name, rotation and actions for this object.'}
                >
                  <NameField value={selected.name} onCommit={rename} />
                  {selected && !selectedSeat ? (
                    <RotationField
                      label="Rotation"
                      hint="Turns this table around its center. The name stays upright."
                      value={normalizeAngle(selected.rotation)}
                      onCommit={commitRotation}
                    />
                  ) : null}
                  {selectedSeat && selected ? (
                    <div>
                      <p className="mb-2 text-sm font-medium">{seatPlace(selectedSeat)}</p>
                      <RotationField
                        label="Chair rotation"
                        hint="Turns this chair. The number stays upright."
                        value={normalizeAngle(selectedSeat.rotation)}
                        onCommit={commitRotation}
                      />
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    {selected.kind === 'row' || selected.kind === 'stage' ? (
                      <Button onClick={openEditor}>
                        <SlidersHorizontal className="size-4" aria-hidden="true" />
                        {selected.kind === 'stage' ? 'Edit stage' : 'Edit arrangement'}
                      </Button>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" onClick={duplicateSelected}>
                        <Copy className="size-4" aria-hidden="true" />
                        Duplicate
                      </Button>
                      <Button variant="danger" onClick={requestRemoval}>
                        <Trash2 className="size-4" aria-hidden="true" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </ConfigSection>
              ) : null}

              {selected &&
              ((layout?.arrangements ?? []).some((item) => selectedIds.includes(item.id) && item.kind !== 'row') || selectedSeatKeys.length > 0) ? (
                <ConfigSection icon={<Palette className="size-5" aria-hidden="true" />} title="Colors & appearance" hint="Choose how the selection looks on your plan.">
                  <div className="-mt-4">
                    <ColorSettings
                      tables={(layout?.arrangements ?? []).filter((item) => selectedIds.includes(item.id) && item.kind !== 'row')}
                      seats={selectedSeatKeys.flatMap((key) => {
                        const split = key.indexOf(':')
                        const arrangementId = key.slice(0, split)
                        const seatId = key.slice(split + 1)
                        const arrangement = layout?.arrangements.find((item) => item.id === arrangementId)
                        const seat = arrangement?.seats.find((item) => item.id === seatId)
                        return seat ? [{ seat }] : []
                      })}
                      onTables={(patch) => {
                        const ids = new Set(selectedIds)
                        patchLayout((items) => items.map((item) => (ids.has(item.id) && item.kind !== 'row' ? { ...item, ...patch } : item)))
                      }}
                      onSeats={(patch) => {
                        const keys = new Set(selectedSeatKeys)
                        patchLayout((items) =>
                          items.map((item) => ({
                            ...item,
                            seats: item.seats.map((seat) => (keys.has(`${item.id}:${seat.id}`) ? { ...seat, ...patch } : seat)),
                          })),
                        )
                      }}
                    />
                  </div>
                </ConfigSection>
              ) : null}

              {numberingSection}
            </div>
            </>
            )}

            {configMode ? <div className="mt-6 border-t border-border pt-6">{numberingSection}</div> : null}

            <div className="mt-6 border-t border-border pt-6">
              <ConfigSection icon={<Maximize2 className="size-5" aria-hidden="true" />} title="Floor display" hint="Settings for the whole floor plan.">
                <NumberField
                  label="Label size"
                  hint="Chair numbers and table names on this event."
                  value={design.labelFontSize || DEFAULT_LABEL_FONT}
                  min={MIN_LABEL_FONT}
                  max={MAX_LABEL_FONT}
                  onChange={(value) => {
                    if (value === null) return
                    onChange({ ...design, labelFontSize: value })
                  }}
                />
                {!configMode ? <SnapSwitch value={design.snap} onChange={(snap) => onChange({ ...design, snap })} /> : null}
              </ConfigSection>
            </div>
          </div>
        </aside>
        <div ref={canvasRef} className="relative order-2 flex min-w-0 flex-1 flex-col overflow-hidden">
          {layout ? (
            <>
            {selectedIds.length >= 2 ? (
              <SelectionBar
                count={selectedIds.length}
                unitCount={layout ? selectionUnits(layout.arrangements, selectedIds).length : selectedIds.length}
                grouped={groupedSelection}
                canUngroup={canUngroup}
                rotation={normalizeAngle(layout.arrangements.find((item) => item.id === (primaryId ?? selectedIds[0]))?.rotation ?? 0)}
                onAlign={align}
                onDistribute={distribute}
                onGap={applyGap}
                onGroup={groupSelection}
                onUngroup={ungroupSelection}
                onRotate={commitRotation}
              />
            ) : null}
            <FloorStage
              layout={layout}
              colors={colors}
              grid={design.grid}
              snap={design.snap}
              tool={tool}
              selectedIds={selectedIds}
              primaryId={primaryId}
              selectedSeatId={selectedSeatId}
              selectedSeatKeys={selectedSeatKeys}
              labelFontSize={design.labelFontSize || DEFAULT_LABEL_FONT}
              view={view}
              onView={setView}
              onSelect={choose}
              onMarquee={applyMarquee}
              onMove={move}
              onSeatMove={moveSeat}
              onRotateSeat={rotateSeat}
              onRotateSelection={rotateSelectionBy}
              onPlace={place}
              onAssign={assign}
              guests={guestDetails}
              exportRef={exporterRef}
            />
            {toolbarPoint ? (
              <ObjectToolbar
                left={view.x + toolbarPoint.x * view.scale}
                top={view.y + toolbarPoint.y * view.scale - (sideControls ? 48 : 0)}
                canvas={canvasRef.current}
                seatSelected={Boolean(selectedSeat)}
                canEdit={selected?.kind === 'row' || selected?.kind === 'stage'}
                canSplit={Boolean(selected && !selectedSeat && selected.block && selected.block.segments > 1)}
                onMoveDown={beginNudge}
                onMove={dragNudge}
                onMoveUp={endNudge}
                onRotate={() => nudgeRotation(15)}
                onReset={resetRotation}
                onDuplicate={duplicateSelected}
                onEdit={openEditor}
                onForward={() => restack('forward')}
                onBackward={() => restack('backward')}
                onDelete={requestRemoval}
                onArrangement={() => {
                  setSelectedSeatId(null)
                  setSelectedSeatKeys([])
                }}
                onSplit={splitSelected}
                seatGuestName={selectedSeat?.guestId ? guestName.get(selectedSeat.guestId) ?? 'Guest' : null}
                onRemoveGuest={() => {
                  if (selectedSeat && selected) clearSeat(selectedSeat.id, selected.id)
                }}
                canResizeChairs={!selectedSeat && roundTargets.length > 0}
                chairCount={new Set(roundTargets.map((item) => item.seats.length)).size === 1 ? roundTargets[0].seats.length : null}
                tableCount={roundTargets.length}
                onChairs={adjustChairs}
              />
            ) : null}
            {sideControls && selected
              ? sideControls.sides.map((side) => {
                  const local = sideAnchor(selected, side)
                  const world = rotateLocal(local.x, local.y, selected.rotation)
                  const vertical = side === 'left' || side === 'right'
                  return (
                    <SideStepper
                      key={side}
                      side={side}
                      count={sideControls.counts[side]}
                      left={view.x + (selected.x + world.x) * view.scale}
                      top={view.y + (selected.y + world.y) * view.scale}
                      rotation={selected.rotation}
                      vertical={vertical}
                      tables={sideTargets.length}
                      onStep={(delta) => adjustSide(side, delta)}
                    />
                  )
                })
              : null}
            <div className="absolute left-3 top-3 z-20 flex items-center gap-2" onPointerDown={(event) => event.stopPropagation()}>
              <Button data-add-trigger aria-expanded={addOpen} className="h-9 shadow-[var(--shadow)]" onClick={() => setAddOpen((open) => !open)}>
                <Plus className="size-4" aria-hidden="true" />
                Add
              </Button>
              <div className="flex rounded-md border border-border bg-surface p-0.5 shadow-[var(--shadow)]">
                <CanvasToggle label="Select" pressed={tool === 'select'} onClick={() => setTool('select')}>
                  <MousePointer2 className="size-4" aria-hidden="true" />
                </CanvasToggle>
                <CanvasToggle label="Pan" pressed={tool === 'pan'} onClick={() => setTool('pan')}>
                  <Hand className="size-4" aria-hidden="true" />
                </CanvasToggle>
              </div>
            </div>
            <AddMenu open={addOpen} onClose={() => setAddOpen(false)} onQuickAdd={quickAdd} onCustomize={openAdd} />
            {tool !== 'select' && tool !== 'pan' ? (
              <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-[var(--shadow)]">
                Click the floor to place {kindLabel[tool].toLowerCase()} · Esc to cancel
              </div>
            ) : null}
            {layout.arrangements.length === 0 && tool === 'select' && !addOpen ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
                <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-[var(--shadow)]">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted">{layout.name}</p>
                  <h2 className="mt-2 text-xl font-semibold">Start your floor plan</h2>
                  <p className="mt-1 text-sm text-muted">
                    Add a first table, then drag guests from the list onto its chairs.
                    {guests.length > 0 ? ` ${guests.length} guests are waiting to be seated.` : ''}
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {(['round', 'rect'] as const).map((kind) => {
                      const Icon = kindIcon[kind]
                      return (
                        <button
                          key={kind}
                          type="button"
                          className="flex flex-col items-center gap-1.5 rounded-xl border border-border px-3 py-4 hover:border-accent hover:bg-accent-soft"
                          onClick={() => openAdd(kind)}
                        >
                          <Icon className="size-6 text-accent" aria-hidden="true" />
                          <span className="text-sm font-medium">{kindLabel[kind]}</span>
                          <span className="text-xs text-muted">Rows × columns</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Button variant="secondary" onClick={() => quickAdd('row')}>
                      <Armchair className="size-4" aria-hidden="true" />
                      Seat rows
                    </Button>
                    <Button variant="secondary" onClick={() => quickAdd('stage')}>
                      <RectangleHorizontal className="size-4" aria-hidden="true" />
                      Stage
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
            <div
              className="absolute bottom-3 right-3 z-20 flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 text-sm shadow-[var(--shadow)]"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <IconButton label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
                <Minus className="size-4" />
              </IconButton>
              <button
                type="button"
                title="Reset to 100%"
                className="h-8 min-w-14 rounded-md px-1 text-xs font-medium tabular-nums hover:bg-hover"
                onClick={() => zoomBy(1 / view.scale)}
              >
                {Math.round(view.scale * 100)}%
              </button>
              <IconButton label="Zoom in" onClick={() => zoomBy(1.2)}>
                <Plus className="size-4" />
              </IconButton>
              <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
              <button type="button" className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-hover" onClick={fitView}>
                <Maximize2 className="size-3.5" aria-hidden="true" />
                Fit
              </button>
            </div>
            </>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
              <p className="max-w-sm text-sm text-muted">This event has no floor layout. Create one to start arranging.</p>
              <Button onClick={addLayout}>New layout</Button>
            </div>
          )}
          <div className="absolute bottom-3 left-3 z-20 flex gap-2 lg:hidden">
            <Button variant="secondary" onClick={() => { setGuestsOpen((open) => !open); setToolsOpen(false) }}>
              <Users className="size-4" aria-hidden="true" />
              Guests
            </Button>
            <Button variant="secondary" onClick={() => { setToolsOpen((open) => !open); setGuestsOpen(false) }}>
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Edit
            </Button>
          </div>
        </div>
        <aside
          className={cn(
            'z-20 order-1 w-80 shrink-0 flex-col border-r border-border bg-surface',
            guestsOpen ? 'absolute inset-y-14 left-0 flex shadow-[var(--shadow)]' : 'hidden',
            'lg:static lg:flex lg:shadow-none',
          )}
        >
          <GuestPanel
            eventId={eventId}
            guests={guests}
            visibleGuests={visibleGuests}
            seatedCount={guests.filter((guest) => seated.has(guest.id)).length}
            query={query}
            onQuery={setQuery}
            filter={guestFilter}
            onFilter={setGuestFilter}
            placeOf={(guestId) => {
              const placed = findSeat(design, guestId)
              return placed ? `${placed.arrangement.name} · ${seatPlace(placed.seat)}` : null
            }}
            canPick={Boolean(selected)}
            onPick={(guest) => {
              if (!selected) return
              const seat = selectedSeat ?? selected.seats.find((item) => !item.guestId)
              if (seat) assign(selected.id, seat.id, guest.id)
              else toast.message(`${selected.name} is full.`)
            }}
            stats={{
              tables: layout?.arrangements.filter((item) => item.kind !== 'stage').length ?? 0,
              seats: seatCount,
              seated: filled,
              open: Math.max(0, seatCount - filled),
            }}
          />
        </aside>
      </div>
      <ConfirmDialog
        open={clearTableId !== null}
        title={`Clear all seats at ${layout?.arrangements.find((item) => item.id === clearTableId)?.name ?? 'this table'}?`}
        description="Every guest at this table leaves their chair. The chairs, guest records, invitations and check-in codes stay. You can undo this."
        confirmLabel="Clear all seats"
        pendingLabel="Clearing…"
        onConfirm={() => {
          if (clearTableId) clearTable(clearTableId)
          setClearTableId(null)
        }}
        onClose={() => setClearTableId(null)}
      />
      <ConfirmDialog
        open={layoutAction === 'delete'}
        title={layout ? `Delete ${layout.name}?` : 'Delete layout?'}
        description={layout ? layoutActionCopy(layout, 'delete', dirty, persistedLayoutIds.includes(layout.id)) : ''}
        confirmLabel="Delete layout"
        pendingLabel="Deleting…"
        pending={layoutActionPending}
        error={layoutActionError}
        onConfirm={() => void runLayoutAction()}
        onClose={() => {
          if (layoutActionPending) return
          setLayoutAction(null)
          setLayoutActionError(null)
        }}
      />
      <ConfirmDialog
        open={layoutAction === 'reset'}
        title={layout ? `Reset ${layout.name}?` : 'Reset layout?'}
        description={layout ? layoutActionCopy(layout, 'reset', dirty, persistedLayoutIds.includes(layout.id)) : ''}
        confirmLabel="Reset layout"
        pendingLabel="Resetting…"
        pending={layoutActionPending}
        error={layoutActionError}
        onConfirm={() => void runLayoutAction()}
        onClose={() => {
          if (layoutActionPending) return
          setLayoutAction(null)
          setLayoutActionError(null)
        }}
      />
      <ConfirmDialog
        open={pendingRemoval !== null}
        title={pendingRemoval?.kind === 'seat' ? 'Remove this chair?' : 'Delete this arrangement?'}
        description={
          pendingRemoval?.kind === 'seat'
            ? `${pendingRemoval.guestName} is assigned to this chair. Removing the chair clears that seat. The guest, invitation, and check-in code stay.`
            : pendingRemoval?.kind === 'arrangements'
              ? `${pendingRemoval.guests} assigned ${pendingRemoval.guests === 1 ? 'guest' : 'guests'} will leave these seats. Guest records, invitations, and check-in codes stay.`
              : ''
        }
        confirmLabel={pendingRemoval?.kind === 'seat' ? 'Remove chair' : 'Delete arrangement'}
        pendingLabel="Removing…"
        onConfirm={confirmRemoval}
        onClose={() => setPendingRemoval(null)}
      />
      <BlockDialog
        open={composer?.kind === 'block'}
        mode={composer?.kind === 'block' ? composer.mode : 'create'}
        initial={blockDraft}
        existingSeats={editingBlock?.seats ?? []}
        onClose={() => setComposer(null)}
        onSubmit={finishBlock}
      />
      <TableDialog open={composer?.kind === 'table'} initial={tableDraft} onClose={() => setComposer(null)} onSubmit={finishTables} />
      <StageDialog
        open={composer?.kind === 'stage'}
        mode={composer?.kind === 'stage' ? composer.mode : 'create'}
        initial={stageDraft}
        onClose={() => setComposer(null)}
        onSubmit={finishStage}
      />
    </div>
  )
}

/** Navy numbered seat disc, matching the floor. */
function SeatBadge({ label, active, size = 'md' }: { label: string; active?: boolean; size?: 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border-2 bg-[#2C3A52] font-bold text-white tabular-nums',
        size === 'lg' ? 'size-9 text-sm' : 'size-7 text-xs',
        active ? 'border-accent' : 'border-[#E6EBF2]',
      )}
    >
      {label}
    </span>
  )
}

/**
 * Right-panel view for one table: the selected chair's guest (fix the name in place, remove,
 * or reassign to another guest), every chair at the table with Edit / Remove, and table actions.
 */
function SeatPanel({
  arrangement,
  layoutName,
  seat,
  guests,
  seatedIds,
  onClose,
  onSelectSeat,
  onAssign,
  onRemove,
  onRename,
  onClearAll,
  onEditTable,
}: {
  arrangement: Arrangement
  layoutName: string
  seat: Arrangement['seats'][number] | null
  guests: Guest[]
  /** Guests seated anywhere on this event. */
  seatedIds: Set<string>
  onClose: () => void
  onSelectSeat: (seatId: string) => void
  onAssign: (seatId: string, guestId: string) => void
  onRemove: (seatId: string) => void
  onRename: (guestId: string, name: string) => Promise<void>
  onClearAll: () => void
  onEditTable: () => void
}) {
  const byId = useMemo(() => new Map(guests.map((guest) => [guest.id, guest])), [guests])
  const seats = [...arrangement.seats].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
  const assigned = seats.filter((item) => item.guestId).length
  const seatGuest = seat?.guestId ? byId.get(seat.guestId) ?? null : null
  const title = seat ? `${arrangement.name} — ${arrangement.kind === 'row' ? seatPlace(seat) : `Seat ${seat.label}`}` : arrangement.name
  const nameInput = useRef<HTMLInputElement>(null)

  // Name editing: starts from the guest's saved name; saved on Enter or when leaving the field.
  const [draftName, setDraftName] = useState(seatGuest?.name ?? '')
  const [savingName, setSavingName] = useState(false)
  useEffect(() => setDraftName(seatGuest?.name ?? ''), [seatGuest?.id, seatGuest?.name])

  // Reassign picker: open by default on an empty chair.
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')
  useEffect(() => {
    setPicking(Boolean(seat && !seat.guestId))
    setSearch('')
  }, [seat?.id, seat?.guestId])

  async function commitName() {
    if (!seatGuest || savingName) return
    const next = draftName.trim()
    if (!next) {
      setDraftName(seatGuest.name)
      return
    }
    if (next === seatGuest.name) return
    setSavingName(true)
    try {
      await onRename(seatGuest.id, next)
    } finally {
      setSavingName(false)
    }
  }

  const matches = guests
    .filter((guest) => guest.id !== seat?.guestId && guest.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Number(seatedIds.has(a.id)) - Number(seatedIds.has(b.id)) || a.name.localeCompare(b.name))
    .slice(0, 8)

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <button
          type="button"
          aria-label="Close"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground"
          onClick={onClose}
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      {seat ? (
        <>
          <div className="mt-5 flex items-center gap-4">
            <span className="relative flex size-16 shrink-0 items-center justify-center rounded-md border border-border bg-background">
              <Armchair className="size-7 text-foreground/80" aria-hidden="true" />
              <span className="absolute -bottom-1 -right-1">
                <SeatBadge label={seat.label} active={Boolean(seat.guestId)} size="lg" />
              </span>
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{title}</p>
              <p className="truncate text-sm text-muted">{layoutName}</p>
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium">{seatGuest ? 'Assigned guest' : 'Assign a guest'}</p>
            {seat.guestId ? (
              <div className="flex items-stretch gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    ref={nameInput}
                    aria-label="Guest name"
                    className="h-11 w-full rounded-md border border-border bg-surface pl-3 pr-10 text-sm text-foreground focus:border-accent"
                    value={draftName}
                    disabled={!seatGuest || savingName}
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={() => void commitName()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') setDraftName(seatGuest?.name ?? '')
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Remove guest from this chair"
                    title="Remove guest from this chair"
                    className="absolute inset-y-0 right-1 my-auto flex size-8 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onRemove(seat.id)}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <Button className="h-11 shrink-0" onClick={() => setPicking((open) => !open)}>
                  {picking ? 'Cancel' : 'Edit / Reassign'}
                </Button>
              </div>
            ) : null}
            {seat.guestId ? (
              <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
                <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                {seatGuest
                  ? 'Wrong name or spelling? Edit it here (saved on the guest everywhere), or click Reassign to choose another guest.'
                  : 'This guest is no longer on the guest list. Remove them or reassign the chair.'}
              </p>
            ) : null}

            {picking ? (
              <div className="mt-3 rounded-md border border-border">
                <input
                  autoFocus
                  aria-label="Search guests"
                  placeholder="Search guests by name…"
                  className="h-10 w-full rounded-t-md border-b border-border bg-surface px-3 text-sm focus:border-accent"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                {matches.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted">No guests match.</p>
                ) : (
                  <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                    {matches.map((guest) => {
                      const elsewhere = seatedIds.has(guest.id)
                      return (
                        <li key={guest.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-hover"
                            onClick={() => {
                              onAssign(seat.id, guest.id)
                              setPicking(false)
                            }}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">{guest.name}</span>
                              <span className="block truncate text-xs text-muted">
                                {[guest.guestTypeName, guest.position].filter(Boolean).join(' · ') || 'Guest'}
                              </span>
                            </span>
                            {elsewhere ? (
                              <span className="shrink-0 rounded-sm bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning" title="Choosing this guest moves them here">
                                Seated · move here
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-sm bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">Unseated</span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted tabular-nums">
          {layoutName ? `${layoutName} · ` : ''}
          {assigned} of {arrangement.seats.length} seats assigned
        </p>
      )}

      <div className="mt-6 border-t border-border pt-5">
        <ConfigSection
          defaultOpen
          icon={<Users className="size-5" aria-hidden="true" />}
          title={`${arrangement.name} — All seats`}
          hint={`${assigned} of ${arrangement.seats.length} seats assigned.`}
        >
        {seats.length === 0 ? (
          <p className="text-sm text-muted">This table has no chairs.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-md border border-border">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-background">
                <tr className="border-b border-border">
                  <th className="w-12 px-3 py-2.5">Seat</th>
                  <th className="px-3 py-2.5">Guest full name</th>
                  <th className="w-[5.5rem] px-2 py-2.5">Status</th>
                  <th className="w-[6.75rem] px-2 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {seats.map((item) => {
                  const guest = item.guestId ? byId.get(item.guestId) : undefined
                  const active = item.id === seat?.id
                  return (
                    <tr key={item.id} className={cn('transition-colors', active ? 'bg-accent-soft/50' : 'hover:bg-hover/60')}>
                      <td className="px-3 py-2.5 tabular-nums">
                        <button type="button" className="font-medium hover:text-accent" onClick={() => onSelectSeat(item.id)}>
                          {item.label}
                        </button>
                      </td>
                      <td className="truncate px-3 py-2.5">
                        {item.guestId ? (
                          <button type="button" className="max-w-full truncate text-left hover:text-accent" onClick={() => onSelectSeat(item.id)}>
                            {guest?.name ?? 'Guest no longer on the list'}
                          </button>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', item.guestId ? 'text-accent' : 'text-muted')}>
                          <span className={cn('size-2 rounded-full', item.guestId ? 'bg-accent' : 'bg-placeholder')} aria-hidden="true" />
                          {item.guestId ? 'Assigned' : 'Empty'}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-end gap-1 text-xs font-medium">
                          {item.guestId ? (
                            <>
                              <button
                                type="button"
                                className="rounded-sm px-1.5 py-1 text-accent hover:bg-accent-soft"
                                onClick={() => {
                                  onSelectSeat(item.id)
                                  window.setTimeout(() => nameInput.current?.focus(), 0)
                                }}
                              >
                                Edit
                              </button>
                              <span className="h-3.5 w-px bg-border" aria-hidden="true" />
                              <button type="button" className="rounded-sm px-1.5 py-1 text-danger hover:bg-danger-soft" onClick={() => onRemove(item.id)}>
                                Remove
                              </button>
                            </>
                          ) : (
                            <button type="button" className="rounded-sm px-1.5 py-1 text-accent hover:bg-accent-soft" onClick={() => onSelectSeat(item.id)}>
                              Assign
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        </ConfigSection>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <ConfigSection
          defaultOpen
          icon={<SlidersHorizontal className="size-5" aria-hidden="true" />}
          title="Table actions"
          hint="Edit this table's setup or clear its seats."
        >
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onEditTable}>
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Edit table details
          </Button>
          <Button variant="danger" disabled={assigned === 0} onClick={onClearAll}>
            <Trash2 className="size-4" aria-hidden="true" />
            Clear all seats
          </Button>
        </div>
        </ConfigSection>
      </div>
    </div>
  )
}

function ObjectToolbar({
  left,
  top,
  canvas,
  seatSelected,
  canEdit,
  canSplit,
  onMoveDown,
  onMove,
  onMoveUp,
  onRotate,
  onReset,
  onDuplicate,
  onEdit,
  onForward,
  onBackward,
  onDelete,
  onArrangement,
  onSplit,
  seatGuestName,
  onRemoveGuest,
  canResizeChairs,
  chairCount,
  tableCount,
  onChairs,
}: {
  /** Name of the guest on the selected chair; null when no chair or an empty chair is selected. */
  seatGuestName: string | null
  onRemoveGuest: () => void
  canResizeChairs: boolean
  /** Null when the selected tables have different chair counts. */
  chairCount: number | null
  tableCount: number
  onChairs: (delta: number) => void
  left: number
  top: number
  canvas: HTMLDivElement | null
  seatSelected: boolean
  canEdit: boolean
  canSplit: boolean
  onMoveDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onMoveUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onRotate: () => void
  onReset: () => void
  onDuplicate: () => void
  onEdit: () => void
  onForward: () => void
  onBackward: () => void
  onDelete: () => void
  onArrangement: () => void
  onSplit: () => void
}) {
  const width = canvas?.clientWidth ?? 0
  const height = canvas?.clientHeight ?? 0
  const clampedLeft = width > 0 ? Math.min(Math.max(left, 132), width - 132) : left
  const clampedTop = height > 0 ? Math.min(Math.max(top - 8, 40), height - 48) : top - 8
  return (
    <div
      className="absolute z-20 flex items-center gap-0.5 rounded-md border border-border bg-surface p-1 shadow-[var(--shadow)]"
      style={{ left: clampedLeft, top: clampedTop, transform: 'translate(-50%, -100%)' }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {seatSelected && seatGuestName ? (
        <>
          <button
            type="button"
            title={`Remove ${seatGuestName} from this chair`}
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium text-danger hover:bg-danger-soft"
            onClick={onRemoveGuest}
          >
            <UserMinus className="size-4" aria-hidden="true" />
            Remove guest
          </button>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
        </>
      ) : null}
      {canResizeChairs ? (
        <>
          <ToolbarButton label={tableCount > 1 ? `Remove a chair from each of ${tableCount} tables` : 'Remove a chair'} onClick={() => onChairs(-1)}>
            <Minus className="size-4" />
          </ToolbarButton>
          <span
            className="flex h-8 min-w-12 items-center justify-center gap-1 px-1 text-xs font-medium tabular-nums"
            title={tableCount > 1 ? `Chairs per table · ${tableCount} tables` : 'Chairs'}
          >
            <Armchair className="size-3.5 text-muted" aria-hidden="true" />
            {chairCount ?? 'Mixed'}
            {tableCount > 1 ? <span className="text-muted">×{tableCount}</span> : null}
          </span>
          <ToolbarButton label={tableCount > 1 ? `Add a chair to each of ${tableCount} tables` : 'Add a chair'} onClick={() => onChairs(1)}>
            <Plus className="size-4" />
          </ToolbarButton>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
        </>
      ) : null}
      <ToolbarButton label="Move" onPointerDown={onMoveDown} onPointerMove={onMove} onPointerUp={onMoveUp}>
        <Move className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Rotate 15 degrees" onClick={onRotate}>
        <RotateCw className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Reset rotation" onClick={onReset}>
        <span className="text-xs font-medium">0°</span>
      </ToolbarButton>
      <ToolbarButton label="Duplicate" onClick={onDuplicate}>
        <Copy className="size-4" />
      </ToolbarButton>
      {canEdit ? (
        <ToolbarButton label="Edit properties" onClick={onEdit}>
          <SlidersHorizontal className="size-4" />
        </ToolbarButton>
      ) : null}
      <ToolbarButton label="Bring forward" onClick={onForward}>
        <ArrowUp className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Send backward" onClick={onBackward}>
        <ArrowDown className="size-4" />
      </ToolbarButton>
      {seatSelected ? (
        <ToolbarButton label="Select arrangement" onClick={onArrangement}>
          <Group className="size-4" />
        </ToolbarButton>
      ) : null}
      {canSplit ? (
        <ToolbarButton label="Split segments" onClick={onSplit}>
          <Ungroup className="size-4" />
        </ToolbarButton>
      ) : null}
      <ToolbarButton label="Delete" onClick={onDelete}>
        <Trash2 className="size-4" />
      </ToolbarButton>
    </div>
  )
}

/** − / count / + pill sitting just outside one side of a table, turned with the table. */
function SideStepper({
  side,
  count,
  left,
  top,
  rotation,
  vertical,
  tables,
  onStep,
}: {
  side: TableSide
  count: number
  left: number
  top: number
  rotation: number
  vertical: boolean
  /** How many selected tables a step changes. */
  tables: number
  onStep: (delta: number) => void
}) {
  const label = tables > 1 ? `${side} side of all ${tables} tables` : `${side} side`
  return (
    <div
      role="group"
      aria-label={`Chairs on the ${label}`}
      className={cn(
        'absolute z-20 flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5 shadow-[var(--shadow)]',
        vertical ? 'flex-col-reverse' : 'flex-row',
      )}
      style={{ left, top, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        title={`Remove a chair from the ${label}`}
        aria-label={`Remove a chair from the ${label}`}
        className="flex size-7 items-center justify-center rounded-full text-foreground hover:bg-hover disabled:text-muted"
        disabled={count === 0 && tables <= 1}
        onClick={(event) => {
          event.stopPropagation()
          onStep(-1)
        }}
      >
        <Minus className="size-3.5" />
      </button>
      <span
        className="flex min-w-7 items-center justify-center gap-0.5 text-xs font-semibold tabular-nums"
        style={{ transform: `rotate(${-rotation}deg)` }}
        title={`${count} ${count === 1 ? 'chair' : 'chairs'}`}
      >
        <Armchair className="size-3 text-muted" aria-hidden="true" />
        {count}
        {tables > 1 ? <span className="font-normal text-muted">×{tables}</span> : null}
      </span>
      <button
        type="button"
        title={`Add a chair to the ${label}`}
        aria-label={`Add a chair to the ${label}`}
        className="flex size-7 items-center justify-center rounded-full text-foreground hover:bg-hover"
        onClick={(event) => {
          event.stopPropagation()
          onStep(1)
        }}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}

function ToolbarButton({
  label,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  children,
}: {
  label: string
  onClick?: () => void
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-md text-foreground hover:bg-hover"
      onClick={(event) => {
        event.stopPropagation()
        onClick?.()
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {children}
    </button>
  )
}

function layoutActionCopy(layout: FloorLayout, action: 'delete' | 'reset', dirty: boolean, persisted: boolean) {
  const objects = layout.arrangements.length
  const seated = layout.arrangements.reduce((sum, item) => sum + item.seats.filter((seat) => seat.guestId).length, 0)
  const objectText = `${objects} placed ${objects === 1 ? 'object' : 'objects'}`
  const seatText = seated === 0 ? 'No guests are seated on this layout.' : `${seated} ${seated === 1 ? 'guest' : 'guests'} will be removed from seats on this layout.`
  const kept = 'Guest records, invitations, and check-in codes stay as they are.'
  const unsaved = dirty ? ' Unsaved changes on this plan will be discarded.' : ''
  const recovery = persisted ? ' This cannot be undone.' : ' You can undo this until you leave the page.'
  if (action === 'delete') {
    return `This deletes “${layout.name}” and its ${objectText}. The layout will leave this event. ${seatText} ${kept}${unsaved}${recovery}`
  }
  return `This removes all ${objectText} from “${layout.name}”. The layout itself stays, including its name and this event’s label size. ${seatText} ${kept}${unsaved}${recovery}`
}

function SelectionBar({
  count,
  unitCount,
  grouped,
  canUngroup,
  rotation,
  onAlign,
  onDistribute,
  onGap,
  onGroup,
  onUngroup,
  onRotate,
}: {
  count: number
  unitCount: number
  grouped: boolean
  canUngroup: boolean
  rotation: number
  onAlign: (mode: AlignMode) => void
  onDistribute: (axis: 'x' | 'y') => void
  onGap: (axis: 'x' | 'y', gap: number | null) => void
  onGroup: () => void
  onUngroup: () => void
  onRotate: (degrees: number) => void
}) {
  return (
    <div className="absolute left-3 top-14 z-10 w-72 rounded-md border border-border bg-surface p-3 shadow-[var(--shadow)]">
      <p className="text-sm font-medium">
        {count} selected{grouped ? ' · Group' : ''}
      </p>
      <p className="mt-1 text-sm text-muted">
        {unitCount === 1 ? 'This group moves as one object.' : 'A whole group lines up as one object.'}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        <IconButton label="Align left" disabled={unitCount < 2} onClick={() => onAlign('left')}><AlignStartVertical className="size-4" /></IconButton>
        <IconButton label="Align horizontal center" disabled={unitCount < 2} onClick={() => onAlign('centerX')}><AlignCenterVertical className="size-4" /></IconButton>
        <IconButton label="Align right" disabled={unitCount < 2} onClick={() => onAlign('right')}><AlignEndVertical className="size-4" /></IconButton>
        <IconButton label="Align top" disabled={unitCount < 2} onClick={() => onAlign('top')}><AlignStartHorizontal className="size-4" /></IconButton>
        <IconButton label="Align vertical center" disabled={unitCount < 2} onClick={() => onAlign('centerY')}><AlignCenterHorizontal className="size-4" /></IconButton>
        <IconButton label="Align bottom" disabled={unitCount < 2} onClick={() => onAlign('bottom')}><AlignEndHorizontal className="size-4" /></IconButton>
        <IconButton label="Distribute horizontally" disabled={unitCount < 3} onClick={() => onDistribute('x')}><UnfoldHorizontal className="size-4" /></IconButton>
        <IconButton label="Distribute vertically" disabled={unitCount < 3} onClick={() => onDistribute('y')}><UnfoldVertical className="size-4" /></IconButton>
      </div>
      <div className="mt-3">
        <RotationField label="Group rotation" hint="Turns the selection around its center." value={rotation} onCommit={onRotate} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <GapField label="Horizontal gap" onCommit={(gap) => onGap('x', gap)} />
        <GapField label="Vertical gap" onCommit={(gap) => onGap('y', gap)} />
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" disabled={grouped || count < 2} onClick={onGroup}>
          <Group className="size-4" aria-hidden="true" />
          Group
        </Button>
        <Button variant="secondary" disabled={!canUngroup} onClick={onUngroup}>
          <Ungroup className="size-4" aria-hidden="true" />
          Ungroup
        </Button>
      </div>
    </div>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      className="flex size-8 items-center justify-center rounded-md text-foreground hover:bg-hover disabled:text-muted"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function RotationField({
  label,
  hint,
  value,
  onCommit,
}: {
  label: string
  hint: string
  value: number
  onCommit: (degrees: number) => void
}) {
  return <RotationFieldInput key={Math.round(value)} label={label} hint={hint} value={value} onCommit={onCommit} />
}

function RotationFieldInput({
  label,
  hint,
  value,
  onCommit,
}: {
  label: string
  hint: string
  value: number
  onCommit: (degrees: number) => void
}) {
  const [text, setText] = useState(String(Math.round(value)))
  function commit() {
    if (!/^\d+$/.test(text.trim())) return
    onCommit(normalizeAngle(Number(text)))
  }
  return (
    <TextField
      label={label}
      hint={hint}
      value={text}
      inputMode="numeric"
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        }
      }}
    />
  )
}

function GapField({ label, onCommit }: { label: string; onCommit: (gap: number) => void }) {
  const [text, setText] = useState('16')
  function commit() {
    if (!/^\d+$/.test(text.trim())) return
    onCommit(Number(text))
  }
  return (
    <TextField
      label={label}
      value={text}
      inputMode="numeric"
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        }
      }}
    />
  )
}

function ColorSettings({
  tables,
  seats,
  onTables,
  onSeats,
}: {
  tables: Arrangement[]
  seats: { seat: { fill: string | null; stroke: string | null; guestId: string | null } }[]
  onTables: (patch: { fill?: string | null; stroke?: string | null; labelColor?: string | null }) => void
  onSeats: (patch: { fill?: string | null; stroke?: string | null }) => void
}) {
  if (tables.length === 0 && seats.length === 0) return null
  return (
    <div className="mt-4 grid gap-3">
      {tables.length > 0 ? (
        <div className="grid gap-3">
          <p className="text-sm font-medium">{tables.length > 1 ? `${tables.length} tables` : 'Table color'}</p>
          <ColorChoice
            label="Fill"
            stored={tables.map((item) => item.fill)}
            effective={tables.map((item) => item.fill ?? defaultTableFill)}
            onPick={(color) => onTables({ fill: color })}
            onReset={() => onTables({ fill: null })}
          />
          <ColorChoice
            label="Border"
            stored={tables.map((item) => item.stroke)}
            effective={tables.map((item) => item.stroke ?? defaultTableStroke)}
            onPick={(color) => onTables({ stroke: color })}
            onReset={() => onTables({ stroke: null })}
          />
          <ColorChoice
            label="Label"
            resetLabel="Auto"
            stored={tables.map((item) => item.labelColor)}
            effective={tables.map((item) => item.labelColor ?? readableOn(item.fill ?? defaultTableFill))}
            onPick={(color) => onTables({ labelColor: color })}
            onReset={() => onTables({ labelColor: null })}
          />
        </div>
      ) : null}
      {seats.length > 0 ? (
        <div className="grid gap-3">
          <p className="text-sm font-medium">{seats.length > 1 ? `${seats.length} chairs` : 'Chair color'}</p>
          <ColorChoice
            label="Fill"
            stored={seats.map((item) => item.seat.fill)}
            effective={seats.map((item) => item.seat.fill ?? defaultChairFill)}
            onPick={(color) => onSeats({ fill: color })}
            onReset={() => onSeats({ fill: null })}
          />
          <ColorChoice
            label="Border"
            stored={seats.map((item) => item.seat.stroke)}
            effective={seats.map((item) => item.seat.stroke ?? defaultChairStroke)}
            onPick={(color) => onSeats({ stroke: color })}
            onReset={() => onSeats({ stroke: null })}
          />
        </div>
      ) : null}
    </div>
  )
}

function ColorChoice({
  label,
  stored,
  effective,
  onPick,
  onReset,
  resetLabel = 'Reset',
}: {
  label: string
  stored: Array<string | null>
  effective: string[]
  onPick: (color: string) => void
  onReset: () => void
  resetLabel?: string
}) {
  const unique = [...new Set(effective.map((color) => color.toUpperCase()))]
  const mixed = unique.length > 1
  const custom = stored.some((color) => color !== null)
  return (
    <div>
      <ColorSwatchField
        label={label}
        value={mixed ? '#FFFFFF' : unique[0] ?? '#FFFFFF'}
        none={mixed}
        noneLabel="Mixed"
        onChange={onPick}
      />
      {mixed ? <p className="mt-1 text-sm text-muted">These use different colors.</p> : null}
      {custom ? (
        <button type="button" className="mt-1 text-sm text-muted hover:text-foreground" onClick={onReset}>
          {resetLabel}
        </button>
      ) : null}
    </div>
  )
}

function NameField({ value, onCommit, label = 'Name' }: { value: string; onCommit: (name: string) => void; label?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <TextField
      label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim()
        if (next && next !== value) onCommit(next)
        else setDraft(value)
      }}
    />
  )
}

function CanvasToggle({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-8 items-center justify-center rounded',
        pressed ? 'bg-selected text-foreground' : 'text-muted hover:bg-hover hover:text-foreground',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** Preset table-top colors offered as one-click swatches. */
const tablePresets = [
  { label: 'Deep charcoal', color: '#1D1F1B' },
  { label: 'Warm sand', color: '#EDE4D6' },
  { label: 'Sage mint', color: '#B9D3C2' },
  { label: 'Slate', color: '#9AA3B2' },
] as const

/** Which panel sections are open, by title. Kept for the session so choosing another table keeps the same sections open. */
const openSections = new Map<string, boolean>()

/**
 * Collapsible block of the right panel: a dropdown header (icon, title, one-line help, chevron)
 * that opens and closes its fields. Nothing inside is removed when closed; it is only hidden.
 */
function ConfigSection({
  icon,
  title,
  hint,
  children,
  defaultOpen = false,
}: {
  icon: ReactNode
  title: string
  hint: string
  children: ReactNode
  /** Open the first time this section is shown. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(() => openSections.get(title) ?? defaultOpen)
  const bodyId = useId()
  function toggle() {
    setOpen((current) => {
      openSections.set(title, !current)
      return !current
    })
  }
  return (
    <section className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        className="group flex w-full items-start gap-3 rounded-md text-left"
        onClick={toggle}
      >
        <span className="mt-0.5 text-accent">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold group-hover:text-accent">{title}</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
        <ChevronDown
          className={cn('mt-1 size-5 shrink-0 text-muted transition-transform duration-150 group-hover:text-foreground', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      <div id={bodyId} hidden={!open} className="mt-5 grid gap-5">
        {children}
      </div>
    </section>
  )
}

/** Short guidance line inside a panel section. */
function PanelNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-3 rounded-md border border-border bg-background px-3 py-2.5 text-sm text-muted">
      <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

/** "Snap to grid" On/Off switch, shared by every panel. */
function SnapSwitch({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">Snap to grid</p>
        <p className="text-xs text-muted">Keep tables aligned to the layout grid.</p>
      </div>
      <button type="button" role="switch" aria-checked={value} aria-label="Snap to grid" className="flex items-center gap-2 text-sm" onClick={() => onChange(!value)}>
        <span className={cn('relative h-6 w-11 rounded-full transition-colors', value ? 'bg-accent' : 'bg-border')}>
          <span className={cn('absolute top-0.5 size-5 rounded-full bg-white transition-all', value ? 'left-[1.375rem]' : 'left-0.5')} />
        </span>
        <span className="w-6 text-left">{value ? 'On' : 'Off'}</span>
      </button>
    </div>
  )
}

/** Label + helper text above a field, as in the configuration mockup. */
function ConfigLabel({ title, hint, value }: { title: string; hint?: string; value?: ReactNode }) {
  return (
    <div className="mb-2 flex items-end justify-between gap-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      {value ? <span className="shrink-0 text-sm font-medium tabular-nums">{value}</span> : null}
    </div>
  )
}

/** Slider with min / max captions; commits whole numbers. */
function ConfigSlider({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (value: number) => void; label: string }) {
  return (
    <div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={2}
        value={Math.min(max, Math.max(min, value))}
        className="h-2 w-full cursor-pointer accent-[var(--accent)]"
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}

/**
 * Vertical "Table configuration" for one table in the right panel:
 * Seats & dimensions · Colors & appearance · Auto numbering & actions, then Duplicate / Delete /
 * Save & update seats. Name and colors apply at once; chair count and size apply on Save.
 */
function TableConfig({
  arrangement,
  spec,
  onSpec,
  seat,
  pickedSeats,
  snap,
  onSnap,
  firstNumber,
  onFirstNumber,
  step,
  onStep,
  onRename,
  onTableColors,
  onSeatColors,
  onRotate,
  onRenumber,
  onDuplicate,
  onDelete,
  onSave,
}: {
  arrangement: Arrangement
  spec: SeatSpec
  onSpec: (spec: SeatSpec) => void
  /** Selected chair, if any: its rotation and colors are shown too. */
  seat: Arrangement['seats'][number] | null
  /** Every chair picked on this table (Ctrl/Shift-click can pick several); colors apply to all. */
  pickedSeats: Arrangement['seats']
  snap: boolean
  onSnap: (snap: boolean) => void
  firstNumber: number
  onFirstNumber: (value: number) => void
  step: number
  onStep: (value: number) => void
  onRename: (name: string) => void
  onTableColors: (patch: { fill?: string | null; stroke?: string | null; labelColor?: string | null }) => void
  onSeatColors: (patch: { fill?: string | null; stroke?: string | null }) => void
  onRotate: (degrees: number) => void
  onRenumber: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSave: () => void
}) {
  const sided = hasSides(arrangement.kind)
  const round = arrangement.kind === 'round' || arrangement.kind === 'crescent'
  const tall = arrangement.kind === 'rect' || arrangement.kind === 'oval' || arrangement.kind === 'ushape'
  const fill = (arrangement.fill ?? defaultTableFill).toUpperCase()
  // Unsaved chair-count or size changes, so Save stands out.
  const pending =
    spec.chairs !== arrangement.seats.length ||
    Math.round(spec.tableWidth) !== Math.round(arrangement.tableWidth) ||
    (tall && Math.round(spec.tableHeight) !== Math.round(arrangement.tableHeight)) ||
    spec.chairGap !== arrangement.chairGap ||
    spec.opening !== arrangement.opening ||
    spec.distribution !== arrangement.distribution ||
    (sided && JSON.stringify(sidesOf(spec)) !== JSON.stringify(sidesOf(specOf(arrangement))))

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <SlidersHorizontal className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-tight">{arrangement.name} configuration</h2>
          <p className="text-sm text-muted tabular-nums">
            {kindLabel[arrangement.kind]} · {arrangement.seats.length} {arrangement.seats.length === 1 ? 'seat' : 'seats'}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6">
        <ConfigSection defaultOpen icon={<Armchair className="size-5" aria-hidden="true" />} title="Seats & dimensions" hint="Set the basic details for this table.">
          <NameField value={arrangement.name} onCommit={onRename} label="Table name" />

          {sided ? (
            <div>
              <ConfigLabel title="Chairs per side" hint="How many seats on each side of the table?" />
              <div className="grid grid-cols-2 gap-2">
                {tableSides
                  .filter((side) => !(arrangement.kind === 'ushape' && side === 'top'))
                  .map((side) => {
                    const counts = sidesOf(spec) ?? { top: 0, right: 0, bottom: 0, left: 0 }
                    return (
                      <NumberField
                        key={side}
                        label={side[0].toUpperCase() + side.slice(1)}
                        value={counts[side]}
                        min={0}
                        max={40}
                        onChange={(value) => {
                          if (value === null) return
                          const sides = { ...counts, [side]: value }
                          const chairs = sides.top + sides.right + sides.bottom + sides.left
                          if (chairs >= 1) onSpec({ ...spec, sides, chairs })
                        }}
                      />
                    )
                  })}
              </div>
            </div>
          ) : (
            <div>
              <ConfigLabel title="Number of chairs" hint="How many seats around this table?" />
              <div className="flex h-11 items-stretch overflow-hidden rounded-md border border-border">
                <button
                  type="button"
                  aria-label="One chair fewer"
                  className="flex w-14 items-center justify-center border-r border-border hover:bg-hover disabled:opacity-50"
                  disabled={spec.chairs <= 1}
                  onClick={() => onSpec({ ...spec, chairs: Math.max(1, spec.chairs - 1), sides: null })}
                >
                  <Minus className="size-4" aria-hidden="true" />
                </button>
                <span className="flex flex-1 items-center justify-center text-sm font-medium tabular-nums">
                  {spec.chairs} {spec.chairs === 1 ? 'chair' : 'chairs'}
                </span>
                <button
                  type="button"
                  aria-label="One chair more"
                  className="flex w-14 items-center justify-center border-l border-border hover:bg-hover disabled:opacity-50"
                  disabled={spec.chairs >= 80}
                  onClick={() => onSpec({ ...spec, chairs: Math.min(80, spec.chairs + 1), sides: null })}
                >
                  <Plus className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          <div>
            <ConfigLabel
              title="Table size"
              hint={round ? 'Diameter of the round table.' : 'Width of the table.'}
              value={`${Math.round(spec.tableWidth)} px`}
            />
            <ConfigSlider
              label={round ? 'Diameter' : 'Width'}
              value={spec.tableWidth}
              min={72}
              max={800}
              onChange={(value) => onSpec({ ...spec, tableWidth: value, tableHeight: arrangement.kind === 'square' ? value : spec.tableHeight })}
            />
          </div>
          {tall ? (
            <div>
              <ConfigLabel title="Table depth" hint="Height of the table on the plan." value={`${Math.round(spec.tableHeight)} px`} />
              <ConfigSlider label="Height" value={spec.tableHeight} min={72} max={800} onChange={(value) => onSpec({ ...spec, tableHeight: value })} />
            </div>
          ) : null}

          {arrangement.kind === 'round' || arrangement.kind === 'oval' ? (
            <label className="block">
              <ConfigLabel title="Chair spacing" hint="How the chairs are spread around the table." />
              <select
                aria-label="Chair spacing"
                className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                value={spec.opening}
                onChange={(event) => onSpec({ ...spec, opening: event.target.value as ChairOpening })}
              >
                <option value="even">Even (comfortable)</option>
                <option value="mid">Open in the middle</option>
                <option value="uneven">Uneven</option>
              </select>
            </label>
          ) : null}
          {arrangement.kind === 'rect' ? (
            <label className="block">
              <ConfigLabel title="Chair placement" hint="Which sides of the table get chairs." />
              <select
                aria-label="Chair placement"
                className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                value={spec.distribution}
                onChange={(event) => onSpec({ ...spec, distribution: event.target.value as Distribution })}
              >
                <option value="long">Long sides</option>
                <option value="all">All sides</option>
              </select>
            </label>
          ) : null}
          <div>
            <ConfigLabel title="Gap between chairs" hint="Extra room between neighbouring chairs." value={`${spec.chairGap} px`} />
            <ConfigSlider label="Gap between chairs" value={spec.chairGap} min={0} max={80} onChange={(value) => onSpec({ ...spec, chairGap: value })} />
          </div>
          {seat ? null : (
            <RotationField label="Rotation" hint="Turns the table around its centre. The name stays upright." value={normalizeAngle(arrangement.rotation)} onCommit={onRotate} />
          )}
        </ConfigSection>

        <ConfigSection icon={<Palette className="size-5" aria-hidden="true" />} title="Colors & appearance" hint="Choose how this table looks on your plan.">
          <div>
            <ConfigLabel title="Table color" hint="Pick a color or choose a custom one." />
            <div className="grid grid-cols-4 gap-2">
              {tablePresets.map((preset) => {
                const active = fill === preset.color.toUpperCase()
                return (
                  <button key={preset.color} type="button" className="flex flex-col items-center gap-1.5" onClick={() => onTableColors({ fill: preset.color })}>
                    <span
                      className={cn('size-12 rounded-full border-2', active ? 'border-accent' : 'border-border')}
                      style={{ background: preset.color }}
                      aria-hidden="true"
                    />
                    <span className={cn('text-center text-xs leading-tight', active ? 'font-medium text-foreground' : 'text-muted')}>{preset.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <ColorChoice
            label="Custom color"
            stored={[arrangement.fill]}
            effective={[arrangement.fill ?? defaultTableFill]}
            onPick={(color) => onTableColors({ fill: color })}
            onReset={() => onTableColors({ fill: null })}
          />
          <ColorChoice
            label="Border color"
            stored={[arrangement.stroke]}
            effective={[arrangement.stroke ?? defaultTableStroke]}
            onPick={(color) => onTableColors({ stroke: color })}
            onReset={() => onTableColors({ stroke: null })}
          />
          <ColorChoice
            label="Name color"
            resetLabel="Auto"
            stored={[arrangement.labelColor]}
            effective={[arrangement.labelColor ?? readableOn(arrangement.fill ?? defaultTableFill)]}
            onPick={(color) => onTableColors({ labelColor: color })}
            onReset={() => onTableColors({ labelColor: null })}
          />
          <SnapSwitch value={snap} onChange={onSnap} />
          {pickedSeats.length > 0 ? (
            <div className="rounded-md border border-border p-4">
              <p className="text-sm font-medium">
                {pickedSeats.length > 1 ? `${pickedSeats.length} chairs` : `Chair ${pickedSeats[0].label}`}
              </p>
              <div className="mt-3 grid gap-3">
                <ColorChoice
                  label="Chair color"
                  stored={pickedSeats.map((item) => item.fill)}
                  effective={pickedSeats.map((item) => item.fill ?? defaultChairFill)}
                  onPick={(color) => onSeatColors({ fill: color })}
                  onReset={() => onSeatColors({ fill: null })}
                />
                <ColorChoice
                  label="Chair ring"
                  stored={pickedSeats.map((item) => item.stroke)}
                  effective={pickedSeats.map((item) => item.stroke ?? defaultChairStroke)}
                  onPick={(color) => onSeatColors({ stroke: color })}
                  onReset={() => onSeatColors({ stroke: null })}
                />
                {seat ? (
                  <RotationField
                    label="Chair rotation"
                    hint="Turns this chair. The number stays upright."
                    value={normalizeAngle(seat.rotation)}
                    onCommit={onRotate}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </ConfigSection>

        <ConfigSection icon={<ListOrdered className="size-5" aria-hidden="true" />} title="Auto numbering & actions" hint="Configure seat numbers and manage this table.">
          <p className="flex items-start gap-3 rounded-md border border-border bg-background px-4 py-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
            Numbers seats clockwise, starting from the top-left.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="First chair number" value={firstNumber} min={0} max={9999} onChange={(value) => value !== null && onFirstNumber(value)} />
            <NumberField label="Step" value={step} min={1} max={100} onChange={(value) => value !== null && onStep(value)} />
          </div>
          <div>
            <Button variant="secondary" className="w-full border-accent text-accent hover:bg-accent-soft" onClick={onRenumber}>
              <RotateCw className="size-4" aria-hidden="true" />
              Renumber chairs now
            </Button>
            <p className="mt-2 text-xs text-muted">Updates every chair number around this table in clockwise order.</p>
          </div>
        </ConfigSection>
      </div>

      <div className="mt-8 grid gap-2 border-t border-border pt-5">
        <Button disabled={!pending} onClick={onSave} title={pending ? undefined : 'Change chairs or size above, then save'}>
          <Check className="size-4" aria-hidden="true" />
          Save & update seats
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onDuplicate}>
            <Copy className="size-4" aria-hidden="true" />
            Duplicate table
          </Button>
          <Button variant="danger" onClick={onDelete}>
            <Trash2 className="size-4" aria-hidden="true" />
            Delete table
          </Button>
        </div>
      </div>
    </div>
  )
}

function SpecFields({
  spec,
  onChange,
  showDistribution,
  showOpening,
  showGrid,
}: {
  spec: SeatSpec
  onChange: (spec: SeatSpec) => void
  showDistribution: boolean
  showOpening: boolean
  showGrid: boolean
}) {
  const row = spec.kind === 'row'
  return (
    <div className="mt-4 space-y-3">
      {row ? (
        <>
          <NumberField label="Rows" value={spec.rows} min={1} max={40} onChange={(value) => value !== null && onChange({ ...spec, rows: value })} />
          <NumberField label="Seats in each row" value={spec.columns} min={1} max={40} onChange={(value) => value !== null && onChange({ ...spec, columns: value })} />
        </>
      ) : (
        <>
          <NumberField
            label="Chairs"
            hint={hasSides(spec.kind) && spec.sides ? 'Changing this spreads chairs evenly again.' : undefined}
            value={spec.chairs}
            min={1}
            max={80}
            onChange={(value) => value !== null && onChange({ ...spec, chairs: value, sides: null })}
          />
          {hasSides(spec.kind) ? (
            <div>
              <p className="mb-1.5 text-sm font-medium">Chairs per side</p>
              <div className="grid grid-cols-2 gap-2">
                {tableSides
                  .filter((side) => !(spec.kind === 'ushape' && side === 'top'))
                  .map((side) => {
                    const counts = sidesOf(spec) ?? { top: 0, right: 0, bottom: 0, left: 0 }
                    return (
                      <NumberField
                        key={side}
                        label={side[0].toUpperCase() + side.slice(1)}
                        value={counts[side]}
                        min={0}
                        max={40}
                        onChange={(value) => {
                          if (value === null) return
                          const sides = { ...counts, [side]: value }
                          const chairs = sides.top + sides.right + sides.bottom + sides.left
                          if (chairs < 1) return
                          onChange({ ...spec, sides, chairs })
                        }}
                      />
                    )
                  })}
              </div>
            </div>
          ) : null}
        </>
      )}
      {showGrid ? (
        <>
          <NumberField label="Rows" value={spec.rows} min={1} max={8} onChange={(value) => value !== null && onChange({ ...spec, rows: value })} />
          <NumberField label="Columns" value={spec.columns} min={1} max={8} onChange={(value) => value !== null && onChange({ ...spec, columns: value })} />
        </>
      ) : null}
      <NumberField label="Gap" value={spec.chairGap} min={0} max={80} onChange={(value) => value !== null && onChange({ ...spec, chairGap: value })} />
      {spec.kind !== 'row' ? (
        <NumberField
          label={spec.kind === 'round' || spec.kind === 'crescent' ? 'Diameter' : 'Width'}
          value={spec.tableWidth}
          min={72}
          max={800}
          onChange={(value) => value !== null && onChange({ ...spec, tableWidth: value, tableHeight: spec.kind === 'square' ? value : spec.tableHeight })}
        />
      ) : null}
      {spec.kind === 'rect' || spec.kind === 'oval' || spec.kind === 'ushape' ? (
        <NumberField label="Height" value={spec.tableHeight} min={72} max={800} onChange={(value) => value !== null && onChange({ ...spec, tableHeight: value })} />
      ) : null}
      {showDistribution ? (
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Chairs</span>
          <select
            aria-label="Chair placement"
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            value={spec.distribution}
            onChange={(event) => onChange({ ...spec, distribution: event.target.value as Distribution })}
          >
            <option value="long">Long sides</option>
            <option value="all">All sides</option>
          </select>
        </label>
      ) : null}
      {showOpening ? (
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Chair spacing</span>
          <select
            aria-label="Chair spacing"
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            value={spec.opening}
            onChange={(event) => onChange({ ...spec, opening: event.target.value as ChairOpening })}
          >
            <option value="even">Even</option>
            <option value="mid">Mid open</option>
            <option value="uneven">Uneven</option>
          </select>
        </label>
      ) : null}
    </div>
  )
}
