import { CHAIR, CHAIR_BOTTOM, CHAIR_LEFT, CHAIR_RIGHT, CHAIR_TOP } from '@/seating/geometry'
import type { Arrangement, Seat } from '@/seating/model'

export type Bounds = {
  id: string
  left: number
  right: number
  top: number
  bottom: number
  cx: number
  cy: number
  width: number
  height: number
}

export type WorldRect = { x1: number; y1: number; x2: number; y2: number }

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'

/** Chairs this close in world Y stay on the same numbering row. */
const ROW_TOLERANCE = Math.round(CHAIR * 0.75)

export function rotateLocal(x: number, y: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

export function seatWorld(arrangement: Arrangement, seat: Seat) {
  const local = rotateLocal(seat.x, seat.y, arrangement.rotation)
  return { x: arrangement.x + local.x, y: arrangement.y + local.y }
}

const CHAIR_CORNERS = [
  [CHAIR_LEFT, CHAIR_TOP],
  [CHAIR_RIGHT, CHAIR_TOP],
  [CHAIR_RIGHT, CHAIR_BOTTOM],
  [CHAIR_LEFT, CHAIR_BOTTOM],
] as const

function chairScale(item: Arrangement) {
  if (typeof item.chairSize !== 'number' || item.chairSize <= 0) return 1
  return item.chairSize / CHAIR
}

/** World corners of a chair after its own rotation and the table rotation. */
function chairWorldPoints(item: Arrangement, seat: Seat) {
  const scale = chairScale(item)
  return CHAIR_CORNERS.map(([lx, ly]) => {
    const spun = rotateLocal(lx * scale, ly * scale, seat.rotation)
    const placed = rotateLocal(seat.x + spun.x, seat.y + spun.y, item.rotation)
    return { x: item.x + placed.x, y: item.y + placed.y }
  })
}

export function arrangementBox(item: Arrangement): Bounds {
  const points: { x: number; y: number }[] = []
  const halfW = item.tableWidth / 2
  const halfH = item.tableHeight / 2
  if (halfW > 0 || halfH > 0) {
    for (const [lx, ly] of [
      [-halfW, -halfH],
      [halfW, -halfH],
      [halfW, halfH],
      [-halfW, halfH],
    ] as const) {
      const point = rotateLocal(lx, ly, item.rotation)
      points.push({ x: item.x + point.x, y: item.y + point.y })
    }
  }
  for (const seat of item.seats) points.push(...chairWorldPoints(item, seat))
  if (points.length === 0) {
    const pad = CHAIR / 2
    points.push({ x: item.x - pad, y: item.y - pad }, { x: item.x + pad, y: item.y + pad })
  }
  const left = Math.min(...points.map((point) => point.x))
  const right = Math.max(...points.map((point) => point.x))
  const top = Math.min(...points.map((point) => point.y))
  const bottom = Math.max(...points.map((point) => point.y))
  return {
    id: item.id,
    left,
    right,
    top,
    bottom,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  }
}

export function unionBounds(boxes: Bounds[]): Bounds | null {
  if (boxes.length === 0) return null
  const left = Math.min(...boxes.map((box) => box.left))
  const right = Math.max(...boxes.map((box) => box.right))
  const top = Math.min(...boxes.map((box) => box.top))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  return {
    id: 'selection',
    left,
    right,
    top,
    bottom,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  }
}

/** Intersection, used for both marquee hits and overlap checks. */
export function boundsIntersect(box: Bounds, rect: WorldRect) {
  const left = Math.min(rect.x1, rect.x2)
  const right = Math.max(rect.x1, rect.x2)
  const top = Math.min(rect.y1, rect.y2)
  const bottom = Math.max(rect.y1, rect.y2)
  return box.right >= left && box.left <= right && box.bottom >= top && box.top <= bottom
}

export function hitArrangements(items: Arrangement[], rect: WorldRect) {
  return items.filter((item) => boundsIntersect(arrangementBox(item), rect)).map((item) => item.id)
}

function shiftItems(items: Arrangement[], shifts: Map<string, { dx: number; dy: number }>) {
  return items.map((item) => {
    const shift = shifts.get(item.id)
    if (!shift) return item
    return { ...item, x: item.x + shift.dx, y: item.y + shift.dy }
  })
}

export type SelectionUnit = { id: string; ids: string[]; box: Bounds }

/**
 * Alignment targets. A group whose every member is selected is one target,
 * so the group moves as a single box. A partly selected group stays a set of
 * separate targets and keeps its group id.
 */
export function selectionUnits(items: Arrangement[], ids: string[]): SelectionUnit[] {
  const selected = new Set(ids)
  const membersByGroup = new Map<string, string[]>()
  for (const item of items) {
    if (!item.groupId) continue
    const list = membersByGroup.get(item.groupId) ?? []
    list.push(item.id)
    membersByGroup.set(item.groupId, list)
  }
  const consumed = new Set<string>()
  const units: SelectionUnit[] = []
  for (const [groupId, memberIds] of membersByGroup) {
    if (memberIds.length < 2 || !memberIds.every((id) => selected.has(id))) continue
    const members = items.filter((item) => memberIds.includes(item.id))
    const box = unionBounds(members.map(arrangementBox))
    if (!box) continue
    units.push({ id: groupId, ids: memberIds, box: { ...box, id: groupId } })
    for (const id of memberIds) consumed.add(id)
  }
  for (const id of ids) {
    if (consumed.has(id)) continue
    const item = items.find((entry) => entry.id === id)
    if (!item) continue
    units.push({ id, ids: [id], box: arrangementBox(item) })
  }
  return units
}

function shiftUnits(items: Arrangement[], units: SelectionUnit[], shiftFor: (box: Bounds) => { dx: number; dy: number }) {
  const shifts = new Map<string, { dx: number; dy: number }>()
  for (const unit of units) {
    const shift = shiftFor(unit.box)
    for (const id of unit.ids) shifts.set(id, shift)
  }
  return shiftItems(items, shifts)
}

export function alignArrangements(items: Arrangement[], ids: string[], mode: AlignMode) {
  const units = selectionUnits(items, ids)
  if (units.length < 2) return items
  const boxes = units.map((unit) => unit.box)
  const left = Math.min(...boxes.map((box) => box.left))
  const right = Math.max(...boxes.map((box) => box.right))
  const top = Math.min(...boxes.map((box) => box.top))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  return shiftUnits(items, units, (box) => {
    let dx = 0
    let dy = 0
    if (mode === 'left') dx = left - box.left
    if (mode === 'right') dx = right - box.right
    if (mode === 'centerX') dx = cx - box.cx
    if (mode === 'top') dy = top - box.top
    if (mode === 'bottom') dy = bottom - box.bottom
    if (mode === 'centerY') dy = cy - box.cy
    return { dx, dy }
  })
}

/**
 * Equal gaps between bounding boxes. The outermost objects stay put.
 * Returns overlaps when the outer span is too small to separate the boxes.
 */
export function distributeArrangements(items: Arrangement[], ids: string[], axis: 'x' | 'y') {
  const units = selectionUnits(items, ids)
  if (units.length < 3) return { items, overlaps: false }
  const ordered = [...units].sort((a, b) =>
    axis === 'x' ? a.box.left - b.box.left || a.box.cx - b.box.cx : a.box.top - b.box.top || a.box.cy - b.box.cy,
  )
  const first = ordered[0].box
  const last = ordered[ordered.length - 1].box
  const total = ordered.reduce((sum, unit) => sum + (axis === 'x' ? unit.box.width : unit.box.height), 0)
  const span = axis === 'x' ? last.right - first.left : last.bottom - first.top
  const gap = (span - total) / (ordered.length - 1)
  let cursor = axis === 'x' ? first.left : first.top
  const shifts = new Map<string, { dx: number; dy: number }>()
  for (const unit of ordered) {
    const dx = axis === 'x' ? cursor - unit.box.left : 0
    const dy = axis === 'y' ? cursor - unit.box.top : 0
    for (const id of unit.ids) shifts.set(id, { dx, dy })
    cursor += (axis === 'x' ? unit.box.width : unit.box.height) + gap
  }
  return { items: shiftItems(items, shifts), overlaps: gap < -0.5 }
}

/** Place selected objects in current axis order with a fixed gap. Zero is allowed. */
export function spaceArrangements(items: Arrangement[], ids: string[], axis: 'x' | 'y', gap: number) {
  if (!Number.isFinite(gap) || gap < 0) return items
  const units = selectionUnits(items, ids)
  if (units.length < 2) return items
  // Work in "slots" along the axis: objects that already share a column (for a horizontal gap)
  // or a row (for a vertical gap) stay together, so a grid keeps its rows and columns.
  // Each object only moves along the chosen axis; its row/column on the other axis is untouched.
  const center = (unit: SelectionUnit) => (axis === 'x' ? unit.box.cx : unit.box.cy)
  const size = (unit: SelectionUnit) => (axis === 'x' ? unit.box.width : unit.box.height)
  const slots: SelectionUnit[][] = []
  for (const unit of [...units].sort((a, b) => center(a) - center(b))) {
    const slot = slots[slots.length - 1]
    if (slot) {
      const slotCenter = slot.reduce((sum, member) => sum + center(member), 0) / slot.length
      const tolerance = Math.min(size(unit), ...slot.map(size)) / 2
      if (Math.abs(center(unit) - slotCenter) <= tolerance) {
        slot.push(unit)
        continue
      }
    }
    slots.push([unit])
  }
  if (slots.length < 2) return items
  const shifts = new Map<string, { dx: number; dy: number }>()
  // The first slot stays where it is; each next slot starts `gap` after the widest member of the previous one.
  let edge = Math.min(...slots[0].map((unit) => (axis === 'x' ? unit.box.left : unit.box.top)))
  for (const slot of slots) {
    const width = Math.max(...slot.map(size))
    const slotCenter = edge + width / 2
    for (const unit of slot) {
      const delta = slotCenter - center(unit)
      for (const id of unit.ids) shifts.set(id, axis === 'x' ? { dx: delta, dy: 0 } : { dx: 0, dy: delta })
    }
    edge += width + gap
  }
  return shiftItems(items, shifts)
}

type NumberedSeat = { arrangementId: string; seat: Seat; x: number; y: number }

/**
 * Rewrite chair labels in row-then-left-to-right order. Positions, ids, and guest
 * assignments stay on the same seat records.
 */
function readingOrder(refs: NumberedSeat[]) {
  const rows: NumberedSeat[][] = []
  const orderedByY = [...refs].sort((a, b) => a.y - b.y || a.x - b.x)
  for (const ref of orderedByY) {
    const row = rows.find((entry) => Math.abs(entry.reduce((sum, item) => sum + item.y, 0) / entry.length - ref.y) <= ROW_TOLERANCE)
    if (row) row.push(ref)
    else rows.push([ref])
  }
  return rows
    .map((row) => ({
      y: row.reduce((sum, item) => sum + item.y, 0) / row.length,
      seats: [...row].sort((a, b) => a.x - b.x || a.y - b.y),
    }))
    .sort((a, b) => a.y - b.y || a.seats[0].x - b.seats[0].x)
    .flatMap((row) => row.seats)
}

/**
 * Chair order for one object, as seen on the floor right now (after any rotation):
 * - tables: clockwise, starting at the top-left;
 * - seat rows: row by row, left to right, restarting in every named row unless the block counts continuously.
 */
function orderedSeats(item: Arrangement): NumberedSeat[][] {
  const refs = item.seats.map((seat) => {
    const world = seatWorld(item, seat)
    return { arrangementId: item.id, seat, x: world.x, y: world.y }
  })
  if (item.kind === 'row') {
    const restart = item.block ? item.block.numbering !== 'continuous' : true
    if (!restart || refs.every((ref) => !ref.seat.row)) return [readingOrder(refs)]
    const byRow = new Map<string, NumberedSeat[]>()
    for (const ref of refs) {
      const key = ref.seat.row ?? ''
      byRow.set(key, [...(byRow.get(key) ?? []), ref])
    }
    // Rows themselves go front to back on screen, but each restarts at the first number.
    return [...byRow.values()].map(readingOrder)
  }
  const box = arrangementBox(item)
  // Angles are measured clockwise from straight up on screen: atan2(dx, -dy).
  // Round and oval: chair 1 is the first chair clockwise from the top (same as when they are built).
  // Half-round: from the left end. Straight-sided tables: from the top-left corner.
  const start =
    (item.kind === 'round' || item.kind === 'oval'
      ? 0
      : item.kind === 'crescent'
        ? -Math.PI / 2
        : Math.atan2(-box.width / 2, box.height / 2)) - 0.0001
  const clockwise = (ref: NumberedSeat) => {
    const angle = Math.atan2(ref.x - item.x, -(ref.y - item.y))
    let delta = angle - start
    while (delta < 0) delta += Math.PI * 2
    while (delta >= Math.PI * 2) delta -= Math.PI * 2
    return delta
  }
  return [[...refs].sort((a, b) => clockwise(a) - clockwise(b))]
}

/**
 * Rewrite chair labels so every table starts again at `start` (Table 1 · Seat 1, Table 2 · Seat 1 …),
 * following what is on screen after rotation. Positions, ids, and guest assignments stay on the same seat records.
 */
export function renumberSeats(items: Arrangement[], scopeIds: string[] | null, start: number, step: number) {
  const safeStart = Number.isFinite(start) ? Math.round(start) : 1
  const safeStep = Number.isFinite(step) && step >= 1 ? Math.round(step) : 1
  const scope = scopeIds ? new Set(scopeIds) : null
  const labels = new Map<string, string>()
  for (const item of items) {
    if (scope && !scope.has(item.id)) continue
    const prefix = item.block?.prefix ?? ''
    for (const run of orderedSeats(item)) {
      run.forEach((ref, index) => {
        labels.set(`${item.id}:${ref.seat.id}`, `${prefix}${safeStart + index * safeStep}`)
      })
    }
  }
  return items.map((item) => ({
    ...item,
    seats: item.seats.map((seat) => {
      const label = labels.get(`${item.id}:${seat.id}`)
      return label === undefined ? seat : { ...seat, label }
    }),
  }))
}

export type TableOrder = 'rows' | 'rows-rtl' | 'columns' | 'columns-btt' | 'snake' | 'snake-rtl'

/**
 * Rename tables "<prefix> <n>" in the order they appear on the floor now.
 * rows: left to right, then down. rows-rtl: right to left, then down.
 * columns: top to bottom, then right. columns-btt: bottom to top, then right.
 * snake: left to right, then right to left on the next line.
 * snake-rtl: right to left, then left to right on the next line.
 * Seat rows and stages are left alone.
 */
export function renumberTables(items: Arrangement[], scopeIds: string[] | null, prefix: string, start: number, order: TableOrder) {
  const scope = scopeIds ? new Set(scopeIds) : null
  const tables = items.filter((item) => item.kind !== 'row' && item.kind !== 'stage' && (!scope || scope.has(item.id)))
  if (tables.length === 0) return items
  const boxes = tables.map((item) => ({ item, box: arrangementBox(item) }))
  const byColumns = order === 'columns' || order === 'columns-btt'
  // Two objects share a line when their centers are closer than half the smaller object.
  const lines: typeof boxes[] = []
  const primary = (entry: (typeof boxes)[number]) => (byColumns ? entry.box.cx : entry.box.cy)
  const secondary = (entry: (typeof boxes)[number]) => (byColumns ? entry.box.cy : entry.box.cx)
  const span = (entry: (typeof boxes)[number]) => (byColumns ? entry.box.width : entry.box.height)
  for (const entry of [...boxes].sort((a, b) => primary(a) - primary(b))) {
    const line = lines.find((members) => {
      const center = members.reduce((sum, member) => sum + primary(member), 0) / members.length
      const tolerance = Math.min(span(entry), ...members.map(span)) / 2
      return Math.abs(center - primary(entry)) <= tolerance
    })
    if (line) line.push(entry)
    else lines.push([entry])
  }
  const ordered = lines
    .sort((a, b) => primary(a[0]) - primary(b[0]))
    .flatMap((line, index) => {
      const sorted = [...line].sort((a, b) => secondary(a) - secondary(b))
      const reverse =
        order === 'rows-rtl' ||
        order === 'columns-btt' ||
        (order === 'snake' && index % 2 === 1) ||
        (order === 'snake-rtl' && index % 2 === 0)
      return reverse ? sorted.reverse() : sorted
    })
  const safeStart = Number.isFinite(start) ? Math.round(start) : 1
  const name = prefix.trim() || 'Table'
  const names = new Map(ordered.map((entry, index) => [entry.item.id, `${name} ${safeStart + index}`]))
  return items.map((item) => (names.has(item.id) ? { ...item, name: names.get(item.id) ?? item.name } : item))
}

export function groupArrangements(items: Arrangement[], ids: string[], groupId: string) {
  const unique = [...new Set(ids)]
  if (unique.length < 2) return items
  return dissolveSingleGroups(items.map((item) => (unique.includes(item.id) ? { ...item, groupId } : item)))
}

export function ungroupArrangements(items: Arrangement[], ids: string[]) {
  const selected = new Set(ids)
  const groupIds = new Set(items.filter((item) => selected.has(item.id) && item.groupId).map((item) => item.groupId))
  return items.map((item) => (item.groupId && groupIds.has(item.groupId) ? { ...item, groupId: null } : item))
}

export function dissolveSingleGroups(items: Arrangement[]) {
  const counts = new Map<string, number>()
  for (const item of items) {
    if (item.groupId) counts.set(item.groupId, (counts.get(item.groupId) ?? 0) + 1)
  }
  return items.map((item) => (item.groupId && (counts.get(item.groupId) ?? 0) < 2 ? { ...item, groupId: null } : item))
}

/** Wrap degrees into [0, 360) and drop float noise. */
export function normalizeAngle(degrees: number) {
  if (!Number.isFinite(degrees)) return 0
  const wrapped = ((degrees % 360) + 360) % 360
  return Math.round(wrapped * 1000) / 1000
}

/** Signed turn from `from` to `to`, in (-180, 180]. */
export function shortestDelta(from: number, to: number) {
  const delta = normalizeAngle(to) - normalizeAngle(from)
  if (delta > 180) return delta - 360
  if (delta < -180) return delta + 360
  return delta
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

/**
 * Turn every selected object around the center of the selection's transformed
 * bounds, and add the same angle to each object's own rotation. One object
 * turns in place.
 */
export function rotateSelection(items: Arrangement[], ids: string[], degrees: number) {
  if (!Number.isFinite(degrees) || Math.abs(degrees) < 0.001) return items
  const idSet = new Set(ids)
  const selected = items.filter((item) => idSet.has(item.id))
  if (selected.length === 0) return items
  if (selected.length === 1) {
    const only = selected[0]
    return items.map((item) => (item.id === only.id ? { ...item, rotation: normalizeAngle(item.rotation + degrees) } : item))
  }
  const box = unionBounds(selected.map(arrangementBox))
  if (!box) return items
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return items.map((item) => {
    if (!idSet.has(item.id)) return item
    const dx = item.x - box.cx
    const dy = item.y - box.cy
    return {
      ...item,
      x: round2(box.cx + dx * cos - dy * sin),
      y: round2(box.cy + dx * sin + dy * cos),
      rotation: normalizeAngle(item.rotation + degrees),
    }
  })
}

export function rotateGroup(items: Arrangement[], groupId: string, degrees: number) {
  const ids = items.filter((item) => item.groupId === groupId).map((item) => item.id)
  if (ids.length < 2) return items
  return rotateSelection(items, ids, degrees)
}

/** Set one chair's facing. The seat record, guest, and position stay put. */
export function setSeatRotation(items: Arrangement[], arrangementId: string, seatId: string, degrees: number) {
  const rotation = normalizeAngle(degrees)
  return items.map((item) =>
    item.id === arrangementId
      ? { ...item, seats: item.seats.map((seat) => (seat.id === seatId ? { ...seat, rotation } : seat)) }
      : item,
  )
}

/** Move one object forward (drawn later) or backward (drawn earlier). */
export function reorderArrangement(items: Arrangement[], id: string, direction: 'forward' | 'backward') {
  const index = items.findIndex((item) => item.id === id)
  if (index < 0) return items
  const next = direction === 'forward' ? index + 1 : index - 1
  if (next < 0 || next >= items.length) return items
  const copy = items.slice()
  const [item] = copy.splice(index, 1)
  copy.splice(next, 0, item)
  return copy
}

/**
 * Turn one multi-segment block into one arrangement per segment.
 * The first segment keeps the original id. Seat ids and guests stay.
 */
export function splitSegments(item: Arrangement): Arrangement[] | null {
  const block = item.block
  if (!block || block.segments < 2) return null
  const perSegment = block.rows * block.columns
  if (perSegment < 1 || item.seats.length < perSegment * 2) return null
  const parts: Arrangement[] = []
  for (let segment = 0; segment < block.segments; segment += 1) {
    const seats = item.seats.slice(segment * perSegment, (segment + 1) * perSegment)
    if (seats.length === 0) continue
    const worlds = seats.map((seat) => seatWorld(item, seat))
    const cx = worlds.reduce((sum, point) => sum + point.x, 0) / worlds.length
    const cy = worlds.reduce((sum, point) => sum + point.y, 0) / worlds.length
    parts.push({
      ...item,
      id: segment === 0 ? item.id : crypto.randomUUID(),
      name: `${item.name} ${segment + 1}`,
      x: Math.round(cx * 100) / 100,
      y: Math.round(cy * 100) / 100,
      groupId: null,
      chairs: seats.length,
      block: { ...block, segments: 1 },
      seats: seats.map((seat, index) => {
        const local = rotateLocal(worlds[index].x - cx, worlds[index].y - cy, -item.rotation)
        return { ...seat, x: Math.round(local.x * 100) / 100, y: Math.round(local.y * 100) / 100 }
      }),
    })
  }
  return parts.length > 1 ? parts : null
}

/** Ids that should move with the dragged arrangement. */
export function moveCohort(items: Arrangement[], id: string, selectedIds: string[]) {
  const item = items.find((entry) => entry.id === id)
  if (!item) return [id]
  if (item.groupId) return items.filter((entry) => entry.groupId === item.groupId).map((entry) => entry.id)
  if (selectedIds.includes(id) && selectedIds.length > 1) {
    return selectedIds.filter((selectedId) => {
      const other = items.find((entry) => entry.id === selectedId)
      return other !== undefined && !other.groupId
    })
  }
  return [id]
}

/**
 * Local point where the table name sits. Round, oval, rectangular, square, and
 * U-shape tables are drawn around the arrangement origin, so that origin is
 * their center. A half-round is the top half of a disk, so its center is the
 * semicircle centroid, which scales with the radius. A row has no table, so
 * the name sits at the center of its chairs.
 */
export function tableLabelPoint(item: Arrangement) {
  if (item.kind === 'crescent') {
    const radius = item.tableWidth / 2
    return { x: 0, y: radius === 0 ? 0 : (-4 * radius) / (3 * Math.PI) }
  }
  if (item.kind === 'row' && item.seats.length > 0) {
    const xs = item.seats.map((seat) => seat.x)
    const ys = item.seats.map((seat) => seat.y)
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    }
  }
  return { x: 0, y: 0 }
}

/** Dark or light ink that stays readable on a chosen fill. */
export function readableOn(fill: string) {
  const hex = fill.replace('#', '')
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return '#F7F7F4'
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  return luminance > 0.62 ? '#1C1D1A' : '#F7F7F4'
}

/**
 * Local rotation that cancels the parent's screen rotation, so a label stays at 0°.
 * Full cancellation never flips the text as the parent turns.
 */
export function uprightRotation(parentDegrees: number) {
  if (!Number.isFinite(parentDegrees)) return 0
  const wrapped = ((parentDegrees % 360) + 360) % 360
  return wrapped === 0 ? 0 : -wrapped
}
