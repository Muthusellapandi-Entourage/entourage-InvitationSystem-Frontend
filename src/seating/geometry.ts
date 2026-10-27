// Type-only import: this file also runs under plain `node --test`, where the "@/" alias does not resolve.
import type { Arrangement, BlockSpec, Distribution, RowLabelStyle, Seat, SeatSpec, SideCounts, TableKind, TableSide } from '@/seating/model'

function hasSides(kind: TableKind) {
  return kind === 'rect' || kind === 'square' || kind === 'ushape'
}

/** Chair diameter in floor units. This is a renderer constant, not a stored size, so it cannot compound when a layout is reloaded. */
export const CHAIR = 52

/**
 * Plan-view chair around the seat origin. The backrest points toward -Y,
 * which is the outward side of a chair whose rotation is 0.
 * Width and height stay near the 52-unit chair size.
 */
export const CHAIR_LEFT = -24
export const CHAIR_RIGHT = 24
export const CHAIR_TOP = -28
export const CHAIR_BOTTOM = 24

const OUTSET = 20

/**
 * Seat rotation for a chair whose occupant faces the top of the floor.
 * A chair at rotation 0 has its backrest toward -Y (top), so its occupant faces down; 180 turns it to face up.
 */
export const FACE_UP = 180

type Point = { x: number; y: number; rotation: number }

function clampCount(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function seatAt(index: number, point: Point, existing: Seat[] | undefined, label: string, keepLabel: boolean, row: string | null = null): Seat {
  const previous = existing?.[index]
  return {
    id: previous?.id ?? crypto.randomUUID(),
    label: keepLabel && previous?.label ? previous.label : label,
    x: point.x,
    y: point.y,
    rotation: point.rotation,
    guestId: previous?.guestId ?? null,
    fill: previous?.fill ?? null,
    stroke: previous?.stroke ?? null,
    row,
  }
}

/** "Row 1" / "Row A" for the zero-based row index inside a block. */
export function rowName(index: number, style: RowLabelStyle, start: number) {
  const first = Math.max(1, Math.round(start))
  return style === 'letter' ? `Row ${rowLetter(first - 1 + index)}` : `Row ${first + index}`
}

/** "Row 1 · Seat 4", or just "Seat 4" for chairs around a table. */
export function seatPlace(seat: Pick<Seat, 'label' | 'row'>) {
  return seat.row ? `${seat.row} · Seat ${seat.label}` : `Seat ${seat.label}`
}

function facing(theta: number) {
  return (theta * 180) / Math.PI + 90
}

function alongSide(count: number, length: number, axis: 'x' | 'y', fixed: number, outward: number) {
  const points: Point[] = []
  if (count <= 0) return points
  const step = length / count
  for (let index = 0; index < count; index += 1) {
    const along = -length / 2 + step * (index + 0.5)
    const x = axis === 'x' ? along : fixed
    const y = axis === 'y' ? along : fixed
    const theta = outward
    points.push({ x, y, rotation: facing(theta) })
  }
  return points
}

function sideCounts(width: number, height: number, chairs: number, distribution: Distribution) {
  if (distribution === 'long') {
    const horizontal = width >= height
    const first = Math.ceil(chairs / 2)
    const second = chairs - first
    return horizontal
      ? { top: first, right: 0, bottom: second, left: 0 }
      : { top: 0, right: first, bottom: 0, left: second }
  }
  const perimeter = 2 * (width + height)
  let top = Math.round((chairs * width) / perimeter)
  let bottom = Math.round((chairs * width) / perimeter)
  let left = Math.round((chairs * height) / perimeter)
  let right = chairs - top - bottom - left
  if (right < 0) {
    top = Math.max(0, top + right)
    right = 0
  }
  return { top, right, bottom, left }
}

function fitSpan(count: number, gap: number, current: number) {
  if (count <= 0) return current
  return Math.max(current, count * (CHAIR + gap))
}

function rectangle(spec: SeatSpec, existing: Seat[] | undefined, keepLabel: boolean) {
  const distribution = spec.kind === 'rect' ? spec.distribution : 'all'
  let width = Math.max(72, spec.tableWidth)
  let height = Math.max(72, spec.kind === 'square' ? spec.tableWidth : spec.tableHeight)
  if (spec.kind === 'square') height = width
  const chairs = clampCount(spec.chairs, 1, 80)
  const fixed = spec.sides ?? null
  let counts = fixed ?? sideCounts(width, height, chairs, distribution === 'long' ? 'long' : 'all')
  width = fitSpan(Math.max(counts.top, counts.bottom), spec.chairGap, width)
  height = fitSpan(Math.max(counts.left, counts.right), spec.chairGap, height)
  if (spec.kind === 'square') {
    const side = Math.max(width, height)
    width = side
    height = side
  }
  // Chosen per-side counts are kept exactly; only automatic spreads are recomputed for the grown table.
  counts = fixed ?? sideCounts(width, height, chairs, distribution === 'long' ? 'long' : 'all')
  const points = [
    ...alongSide(counts.top, width, 'x', -height / 2 - OUTSET, -Math.PI / 2),
    ...alongSide(counts.right, height, 'y', width / 2 + OUTSET, 0),
    ...alongSide(counts.bottom, width, 'x', height / 2 + OUTSET, Math.PI / 2),
    ...alongSide(counts.left, height, 'y', -width / 2 - OUTSET, Math.PI),
  ]
  return {
    tableWidth: width,
    tableHeight: height,
    seats: points.map((point, index) => seatAt(index, point, existing, String(index + 1), keepLabel)),
  }
}

function circleAngles(chairs: number, opening: SeatSpec['opening']) {
  if (opening === 'mid') {
    const gap = Math.max(Math.PI / 2.2, (Math.PI * 2) / (chairs + 2))
    const start = Math.PI / 2 + gap / 2
    const sweep = Math.PI * 2 - gap
    return Array.from({ length: chairs }, (_, index) => start + ((index + 0.5) / chairs) * sweep)
  }
  if (opening === 'uneven') {
    const weights = Array.from({ length: chairs }, (_, index) => (index % 2 === 0 ? 0.62 : 1.38))
    const sum = weights.reduce((total, weight) => total + weight, 0)
    const angles: number[] = []
    let theta = -Math.PI / 2
    for (let index = 0; index < chairs; index += 1) {
      angles.push(theta)
      theta += (weights[index] / sum) * Math.PI * 2
    }
    return angles
  }
  return Array.from({ length: chairs }, (_, index) => -Math.PI / 2 + ((index + 0.5) / chairs) * Math.PI * 2)
}

/** Ramanujan's approximation of an ellipse perimeter. */
function ellipsePerimeter(a: number, b: number) {
  const h = ((a - b) * (a - b)) / ((a + b) * (a + b))
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
}

/**
 * Chairs around an oval, spaced by distance along the edge (not by angle, which bunches
 * chairs at the narrow ends), each turned square to the edge so it faces the table.
 * Fractions run clockwise from the top: 0 = top, 0.25 = right, 0.5 = bottom.
 */
function ovalPoints(rx: number, ry: number, fractions: number[]): Point[] {
  const samples = 720
  const lengths = [0]
  let previous = { x: 0, y: -ry }
  for (let index = 1; index <= samples; index += 1) {
    const t = -Math.PI / 2 + (index / samples) * Math.PI * 2
    const point = { x: rx * Math.cos(t), y: ry * Math.sin(t) }
    lengths.push(lengths[index - 1] + Math.hypot(point.x - previous.x, point.y - previous.y))
    previous = point
  }
  const total = lengths[samples]
  return fractions.map((fraction) => {
    const target = (((fraction % 1) + 1) % 1) * total
    let low = 0
    let high = samples
    while (high - low > 1) {
      const mid = (low + high) >> 1
      if (lengths[mid] < target) low = mid
      else high = mid
    }
    const share = (target - lengths[low]) / Math.max(1e-9, lengths[high] - lengths[low])
    const t = -Math.PI / 2 + ((low + share) / samples) * Math.PI * 2
    // Outward normal of the ellipse at parameter t.
    const normal = Math.atan2(Math.sin(t) * rx, Math.cos(t) * ry)
    return { x: rx * Math.cos(t), y: ry * Math.sin(t), rotation: facing(normal) }
  })
}

function ellipse(spec: SeatSpec, existing: Seat[] | undefined, keepLabel: boolean, crescent: boolean) {
  const chairs = clampCount(spec.chairs, 1, 80)
  const span = chairs * (CHAIR + spec.chairGap)
  if (!crescent) {
    let radiusX = Math.max(36, spec.tableWidth / 2)
    let radiusY = Math.max(36, spec.kind === 'round' ? radiusX : spec.tableHeight / 2)
    // Grow the table evenly until every chair fits around the chair line.
    // Measured on the table edge, matching how round tables have always been sized.
    const around = ellipsePerimeter(radiusX, radiusY)
    if (around < span) {
      const scale = span / around
      radiusX *= scale
      radiusY *= scale
    }
    const fractions = circleAngles(chairs, spec.opening).map((theta) => (theta + Math.PI / 2) / (Math.PI * 2))
    const points = ovalPoints(radiusX + OUTSET, radiusY + OUTSET, fractions)
    return {
      tableWidth: radiusX * 2,
      tableHeight: radiusY * 2,
      seats: points.map((point, index) => seatAt(index, point, existing, String(index + 1), keepLabel)),
    }
  }
  const radiusX = Math.max(spec.tableWidth / 2, span / Math.PI)
  const radiusY = radiusX
  const angles = Array.from({ length: chairs }, (_, index) => -Math.PI + ((index + 0.5) / chairs) * Math.PI)
  const points: Point[] = angles.map((theta) => ({
    x: (radiusX + OUTSET) * Math.cos(theta),
    y: (radiusY + OUTSET) * Math.sin(theta),
    rotation: facing(theta),
  }))
  return {
    tableWidth: radiusX * 2,
    tableHeight: radiusY,
    seats: points.map((point, index) => seatAt(index, point, existing, String(index + 1), keepLabel)),
  }
}

function ushape(spec: SeatSpec, existing: Seat[] | undefined, keepLabel: boolean) {
  const chairs = clampCount(spec.chairs, 3, 80)
  const left = spec.sides ? spec.sides.left : Math.floor(chairs / 3)
  const right = spec.sides ? spec.sides.right : Math.floor(chairs / 3)
  const bottom = spec.sides ? spec.sides.bottom : chairs - left - right
  let width = fitSpan(bottom, spec.chairGap, Math.max(120, spec.tableWidth))
  let height = fitSpan(Math.max(left, right), spec.chairGap, Math.max(100, spec.tableHeight))
  const points = [
    ...alongSide(left, height, 'y', -width / 2 - OUTSET, Math.PI),
    ...alongSide(bottom, width, 'x', height / 2 + OUTSET, Math.PI / 2),
    ...alongSide(right, height, 'y', width / 2 + OUTSET, 0),
  ]
  return {
    tableWidth: width,
    tableHeight: height,
    seats: points.map((point, index) => seatAt(index, point, existing, String(index + 1), keepLabel)),
  }
}

function rowLetter(index: number) {
  let value = index
  let label = ''
  do {
    label = String.fromCharCode(65 + (value % 26)) + label
    value = Math.floor(value / 26) - 1
  } while (value >= 0)
  return label
}

function rows(spec: SeatSpec, existing: Seat[] | undefined, keepLabel: boolean) {
  const rowCount = clampCount(spec.rows, 1, 40)
  const columnCount = clampCount(spec.columns, 1, 40)
  const gapX = CHAIR + Math.max(4, spec.chairGap)
  const gapY = CHAIR + Math.max(16, spec.chairGap + 8)
  const points: Point[] = []
  const labels: string[] = []
  const rowNames: string[] = []
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      points.push({
        x: (column - (columnCount - 1) / 2) * gapX,
        y: row * gapY,
        rotation: FACE_UP,
      })
      labels.push(String(column + 1))
      rowNames.push(rowName(row, 'number', 1))
    }
  }
  const width = Math.max(CHAIR, (columnCount - 1) * gapX + CHAIR)
  const height = Math.max(CHAIR, (rowCount - 1) * gapY + CHAIR)
  return {
    tableWidth: width,
    tableHeight: height,
    seats: points.map((point, index) => seatAt(index, point, existing, labels[index], keepLabel, rowNames[index])),
  }
}

export function buildArrangement(spec: SeatSpec, existing?: Seat[], keepLabel = true) {
  if (spec.kind === 'stage') return { tableWidth: Math.max(80, spec.tableWidth), tableHeight: Math.max(48, spec.tableHeight), seats: [] }
  if (spec.kind === 'row') return rows(spec, existing, keepLabel)
  if (spec.kind === 'rect' || spec.kind === 'square') return rectangle(spec, existing, keepLabel)
  if (spec.kind === 'ushape') return ushape(spec, existing, keepLabel)
  if (spec.kind === 'crescent') return ellipse({ ...spec, kind: 'crescent' }, existing, keepLabel, true)
  return ellipse(spec, existing, keepLabel, false)
}

export function nextArrangementName(kind: TableKind, arrangements: Arrangement[]) {
  if (kind === 'row') {
    // A block holds many rows, so it is named as a section, never "Row …".
    const names = new Set(arrangements.filter((item) => item.kind === 'row').map((item) => item.name))
    let index = 1
    while (names.has(`Section ${index}`)) index += 1
    return `Section ${index}`
  }
  if (kind === 'stage') {
    const stages = arrangements.filter((item) => item.kind === 'stage')
    if (stages.length === 0) return 'STAGE'
    return `STAGE ${stages.length + 1}`
  }
  const numbers = arrangements
    .filter((item) => item.kind !== 'row' && item.kind !== 'stage')
    .map((item) => {
      const match = item.name.match(/(\d+)\s*$/)
      return match ? Number(match[1]) : 0
    })
  return `Table ${Math.max(0, ...numbers) + 1}`
}

/** Space beside a row of chairs reserved for its "Row 1" label. */
export const ROW_LABEL_GUTTER = 80

/** Hard stop so a typo cannot flood the canvas. */
export const MAX_BLOCK_CHAIRS = 500
export const MIN_CHAIR_SIZE = 28
export const MAX_CHAIR_SIZE = 96

export function defaultBlock(): BlockSpec {
  return {
    rows: 4,
    columns: 8,
    segments: 1,
    chairGap: 16,
    rowGap: 28,
    segmentGapX: 150,
    segmentGapY: 80,
    chairEdgeGap: 0,
    orientation: 'horizontal',
    align: 'center',
    reverse: false,
    start: 1,
    prefix: '',
    perSegment: false,
    margin: 0,
    rowLabel: 'number',
    rowStart: 1,
    rowLabelSide: 'left',
    numbering: 'perRow',
    frontRow: 'top',
  }
}

export function blockChairCount(block: Pick<BlockSpec, 'rows' | 'columns' | 'segments'>) {
  return block.rows * block.columns * block.segments
}

export function occupiedBeyond(seats: Seat[], count: number) {
  return seats.slice(Math.max(0, count)).filter((seat) => seat.guestId).length
}

export function validateBlock(block: BlockSpec, chairSize: number): string | null {
  if (!Number.isInteger(block.rows) || block.rows < 1) return 'Rows must be a positive whole number.'
  if (!Number.isInteger(block.columns) || block.columns < 1) return 'Chairs per row must be a positive whole number.'
  if (!Number.isInteger(block.segments) || block.segments < 1) return 'Segments must be a positive whole number.'
  if (block.rows > 40 || block.columns > 40) return 'Use 40 or fewer rows and chairs per row.'
  if (block.segments > 20) return 'Use 20 or fewer segments.'
  if (block.chairGap < 0 || block.rowGap < 0 || block.segmentGapX < 0 || block.segmentGapY < 0 || block.chairEdgeGap < 0 || block.margin < 0) {
    return 'Gaps and margins cannot be negative.'
  }
  if (!Number.isFinite(chairSize) || chairSize < MIN_CHAIR_SIZE || chairSize > MAX_CHAIR_SIZE) {
    return `Chair size must be between ${MIN_CHAIR_SIZE} and ${MAX_CHAIR_SIZE}.`
  }
  const total = blockChairCount(block)
  if (!Number.isFinite(total) || total > MAX_BLOCK_CHAIRS) {
    return `This arrangement would create ${Number.isFinite(total) ? total : 'too many'} chairs. Use ${MAX_BLOCK_CHAIRS} or fewer.`
  }
  return null
}

/**
 * Build one seating block. Segments sit side by side or stacked.
 * Existing seats keep their id, guest, and colors by index. Labels follow the recipe.
 */
export function buildBlock(block: BlockSpec, chairSize: number, existing?: Seat[]) {
  const pitchX = chairSize + Math.max(0, block.chairGap)
  const pitchY = chairSize + Math.max(0, block.rowGap)
  const spanX = Math.max(0, block.columns - 1) * pitchX
  const spanY = Math.max(0, block.rows - 1) * pitchY
  const stepX = block.orientation === 'horizontal' ? spanX + chairSize + block.segmentGapX + block.chairEdgeGap : 0
  const stepY = block.orientation === 'vertical' ? spanY + chairSize + block.segmentGapY + block.chairEdgeGap : 0
  const points: { x: number; y: number; label: string; row: string }[] = []
  // Side-by-side segments share rows (Row 1 runs across the aisle).
  // Stacked segments continue the count (the second block starts after the last row of the first).
  const totalRows = block.orientation === 'vertical' ? block.rows * block.segments : block.rows
  const rowCursor = new Map<number, number>()
  let cursor = block.start
  for (let segment = 0; segment < block.segments; segment += 1) {
    if (block.perSegment) cursor = block.start
    for (let row = 0; row < block.rows; row += 1) {
      const globalRow = block.orientation === 'vertical' ? segment * block.rows + row : row
      // Row 1 is the front row. With the front at the bottom, the last drawn line is Row 1.
      const rowIndex = block.frontRow === 'bottom' ? totalRows - 1 - globalRow : globalRow
      const name = rowName(rowIndex, block.rowLabel, block.rowStart)
      const numbers: number[] = []
      let rowNext = block.numbering === 'perRow' ? (block.perSegment ? block.start : rowCursor.get(globalRow) ?? block.start) : cursor
      for (let column = 0; column < block.columns; column += 1) {
        numbers.push(rowNext)
        rowNext += 1
      }
      if (block.numbering === 'perRow') rowCursor.set(globalRow, rowNext)
      else cursor = rowNext
      if (block.reverse) numbers.reverse()
      for (let column = 0; column < block.columns; column += 1) {
        points.push({
          x: segment * stepX + column * pitchX,
          y: segment * stepY + row * pitchY,
          label: `${block.prefix}${numbers[column]}`,
          row: name,
        })
      }
    }
  }
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const shiftX = block.align === 'left' ? -minX : block.align === 'right' ? -maxX : -(minX + maxX) / 2
  const shiftY = -(minY + maxY) / 2
  // Keep room for the "Row 1" labels inside the block's box so selection and spacing include them.
  const gutter = block.rowLabelSide === 'none' ? 0 : ROW_LABEL_GUTTER * 2
  const width = Math.max(chairSize, maxX - minX + chairSize + block.margin * 2 + gutter)
  const height = Math.max(chairSize, maxY - minY + chairSize + block.margin * 2)
  return {
    tableWidth: Math.round(width),
    tableHeight: Math.round(height),
    seats: points.map((point, index) =>
      seatAt(
        index,
        // Chairs face the front row: up by default (backrest toward the back of the room).
        { x: Math.round((point.x + shiftX) * 100) / 100, y: Math.round((point.y + shiftY) * 100) / 100, rotation: block.frontRow === 'bottom' ? 0 : FACE_UP },
        existing,
        point.label,
        false,
        point.row,
      ),
    ),
  }
}

/**
 * How many chairs sit on each side of a straight-sided table right now.
 * Seats are always built in the order top, right, bottom, left (U-shape: left, bottom, right).
 */
export function sidesOf(spec: SeatSpec): SideCounts | null {
  if (!hasSides(spec.kind)) return null
  if (spec.sides) return { ...spec.sides }
  if (spec.kind === 'ushape') {
    const chairs = clampCount(spec.chairs, 3, 80)
    const left = Math.floor(chairs / 3)
    const right = Math.floor(chairs / 3)
    return { top: 0, left, right, bottom: chairs - left - right }
  }
  const distribution = spec.kind === 'rect' ? spec.distribution : 'all'
  const chairs = clampCount(spec.chairs, 1, 80)
  let width = Math.max(72, spec.tableWidth)
  let height = Math.max(72, spec.kind === 'square' ? spec.tableWidth : spec.tableHeight)
  let counts = sideCounts(width, height, chairs, distribution === 'long' ? 'long' : 'all')
  width = fitSpan(Math.max(counts.top, counts.bottom), spec.chairGap, width)
  height = fitSpan(Math.max(counts.left, counts.right), spec.chairGap, height)
  if (spec.kind === 'square') width = height = Math.max(width, height)
  counts = sideCounts(width, height, chairs, distribution === 'long' ? 'long' : 'all')
  return counts
}

function sideOrder(kind: TableKind): TableSide[] {
  return kind === 'ushape' ? ['left', 'bottom', 'right'] : ['top', 'right', 'bottom', 'left']
}

/** Split a seat list into its sides, following the build order. */
function seatsBySide(kind: TableKind, sides: SideCounts, seats: Seat[]) {
  const result: Record<TableSide, Seat[]> = { top: [], right: [], bottom: [], left: [] }
  let cursor = 0
  for (const side of sideOrder(kind)) {
    result[side] = seats.slice(cursor, cursor + sides[side])
    cursor += sides[side]
  }
  return result
}

/**
 * Add or remove one chair on a single side. Guests stay on the same physical chair:
 * chairs are matched side by side, so adding a chair on top never moves someone sitting on the left.
 * The last chair of a side is the one removed.
 */
export function resizeSide(arrangement: Arrangement, side: TableSide, delta: number):
  | { ok: true; spec: SeatSpec; tableWidth: number; tableHeight: number; seats: Seat[] }
  | { ok: false; reason: string } {
  const spec: SeatSpec = {
    kind: arrangement.kind,
    chairs: arrangement.seats.length,
    chairGap: arrangement.chairGap,
    tableWidth: arrangement.tableWidth,
    tableHeight: arrangement.tableHeight,
    rows: 1,
    columns: 1,
    distribution: arrangement.distribution,
    opening: arrangement.opening,
    sides: arrangement.sides ?? null,
  }
  const current = sidesOf(spec)
  if (!current) return { ok: false, reason: 'This table has no straight sides.' }
  if (arrangement.kind === 'ushape' && side === 'top') return { ok: false, reason: 'The open end of a U-shape has no chairs.' }
  const next = { ...current, [side]: Math.max(0, Math.min(40, current[side] + delta)) }
  const total = next.top + next.right + next.bottom + next.left
  if (next[side] === current[side]) return { ok: false, reason: delta > 0 ? 'That side is full.' : 'That side has no chairs.' }
  if (total < 1) return { ok: false, reason: 'A table needs at least one chair.' }
  if (total > 80) return { ok: false, reason: 'Use 80 or fewer chairs on one table.' }
  const before = seatsBySide(arrangement.kind, current, arrangement.seats)
  if (delta < 0 && before[side][before[side].length - 1]?.guestId) {
    return { ok: false, reason: 'The last chair on that side has a guest. Clear that seat first.' }
  }
  // Keep each side's original table size so the table only grows when chairs no longer fit.
  const nextSpec: SeatSpec = { ...spec, chairs: total, sides: next }
  const built = buildArrangement(nextSpec, undefined, false)
  const fresh = seatsBySide(arrangement.kind, next, built.seats)
  const seats: Seat[] = []
  for (const name of sideOrder(arrangement.kind)) {
    fresh[name].forEach((seat, index) => {
      const old = before[name][index]
      seats.push(old ? { ...seat, id: old.id, guestId: old.guestId, fill: old.fill, stroke: old.stroke } : seat)
    })
  }
  return { ok: true, spec: nextSpec, tableWidth: built.tableWidth, tableHeight: built.tableHeight, seats }
}

/** Point just outside the chairs on one side, in the table's own (unrotated) coordinates. */
export function sideAnchor(arrangement: Pick<Arrangement, 'tableWidth' | 'tableHeight' | 'chairSize'>, side: TableSide) {
  const reach = OUTSET + (arrangement.chairSize ?? CHAIR) * 0.55 + 26
  if (side === 'top') return { x: 0, y: -arrangement.tableHeight / 2 - reach }
  if (side === 'bottom') return { x: 0, y: arrangement.tableHeight / 2 + reach }
  if (side === 'left') return { x: -arrangement.tableWidth / 2 - reach, y: 0 }
  return { x: arrangement.tableWidth / 2 + reach, y: 0 }
}

/** Width and height an object really covers on the floor: the table plus every chair around it. */
export function footprint(built: { tableWidth: number; tableHeight: number; seats: Pick<Seat, 'x' | 'y'>[] }, chairSize = CHAIR) {
  let left = -built.tableWidth / 2
  let right = built.tableWidth / 2
  let top = -built.tableHeight / 2
  let bottom = built.tableHeight / 2
  for (const seat of built.seats) {
    left = Math.min(left, seat.x - chairSize / 2)
    right = Math.max(right, seat.x + chairSize / 2)
    top = Math.min(top, seat.y - chairSize / 2)
    bottom = Math.max(bottom, seat.y + chairSize / 2)
  }
  return { width: right - left, height: bottom - top, cx: (left + right) / 2, cy: (top + bottom) / 2 }
}

/**
 * rows × columns of identical objects inside one segment, repeated segmentsX across and segmentsY down.
 * gapX/gapY are the clear space between neighbours; aisleX/aisleY the clear space between segments.
 */
export type GridSpec = {
  rows: number
  columns: number
  gapX: number
  gapY: number
  segmentsX?: number
  segmentsY?: number
  aisleX?: number
  aisleY?: number
}

export const MAX_GRID_OBJECTS = 200

export function gridCount(grid: GridSpec) {
  return grid.rows * grid.columns * (grid.segmentsX ?? 1) * (grid.segmentsY ?? 1)
}

export function validateGrid(grid: GridSpec): string | null {
  if (!Number.isInteger(grid.rows) || grid.rows < 1 || grid.rows > 30) return 'Rows must be a whole number from 1 to 30.'
  if (!Number.isInteger(grid.columns) || grid.columns < 1 || grid.columns > 30) return 'Columns must be a whole number from 1 to 30.'
  const sx = grid.segmentsX ?? 1
  const sy = grid.segmentsY ?? 1
  if (!Number.isInteger(sx) || sx < 1 || sx > 10 || !Number.isInteger(sy) || sy < 1 || sy > 10) return 'Segments must be a whole number from 1 to 10.'
  if (grid.gapX < 0 || grid.gapY < 0 || (grid.aisleX ?? 0) < 0 || (grid.aisleY ?? 0) < 0) return 'Spacing cannot be negative.'
  if (gridCount(grid) > MAX_GRID_OBJECTS) return `Use ${MAX_GRID_OBJECTS} or fewer objects in one go.`
  return null
}

/**
 * Origins for the whole grid, in floor reading order: top line first, left to right across every segment.
 * `row` and `column` count across segments (row 0 is the top line of the top segments).
 * The whole grid is centered on (x, y).
 */
export function gridCenters(grid: GridSpec, size: { width: number; height: number; cx: number; cy: number }, x: number, y: number) {
  const sx = grid.segmentsX ?? 1
  const sy = grid.segmentsY ?? 1
  const aisleX = grid.aisleX ?? grid.gapX
  const aisleY = grid.aisleY ?? grid.gapY
  const pitchX = size.width + grid.gapX
  const pitchY = size.height + grid.gapY
  const segmentW = (grid.columns - 1) * pitchX + size.width
  const segmentH = (grid.rows - 1) * pitchY + size.height
  const totalW = sx * segmentW + (sx - 1) * aisleX
  const totalH = sy * segmentH + (sy - 1) * aisleY
  const centers: { x: number; y: number; row: number; column: number; segment: number }[] = []
  for (let segRow = 0; segRow < sy; segRow += 1) {
    for (let row = 0; row < grid.rows; row += 1) {
      for (let segColumn = 0; segColumn < sx; segColumn += 1) {
        for (let column = 0; column < grid.columns; column += 1) {
          const left = -totalW / 2 + segColumn * (segmentW + aisleX) + column * pitchX
          const top = -totalH / 2 + segRow * (segmentH + aisleY) + row * pitchY
          centers.push({
            // Shift by the footprint offset so chairs, not just the table, line up.
            x: x + left + size.width / 2 - size.cx,
            y: y + top + size.height / 2 - size.cy,
            row: segRow * grid.rows + row,
            column: segColumn * grid.columns + column,
            segment: segRow * sx + segColumn,
          })
        }
      }
    }
  }
  return centers
}

/** Full grid size, used to place the grid's first cell at a chosen spot. */
export function gridSpan(grid: GridSpec, size: { width: number; height: number }) {
  const sx = grid.segmentsX ?? 1
  const sy = grid.segmentsY ?? 1
  const segmentW = (grid.columns - 1) * (size.width + grid.gapX) + size.width
  const segmentH = (grid.rows - 1) * (size.height + grid.gapY) + size.height
  return {
    width: sx * segmentW + (sx - 1) * (grid.aisleX ?? grid.gapX),
    height: sy * segmentH + (sy - 1) * (grid.aisleY ?? grid.gapY),
  }
}

export function gridPitch(width: number, height: number, gap: number) {
  const pad = OUTSET * 2 + CHAIR + Math.max(16, gap)
  return { x: width + pad, y: height + pad }
}

export function snapValue(value: number, grid: number, enabled: boolean) {
  if (!enabled) return value
  return Math.round(value / grid) * grid
}
