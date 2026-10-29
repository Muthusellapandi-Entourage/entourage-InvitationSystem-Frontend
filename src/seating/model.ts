export const tableKinds = ['round', 'square', 'rect', 'oval', 'crescent', 'ushape', 'row', 'stage'] as const

export type TableKind = (typeof tableKinds)[number]

export type Distribution = 'around' | 'long' | 'all'

export type ChairOpening = 'even' | 'mid' | 'uneven'

export type TableSide = 'top' | 'right' | 'bottom' | 'left'

/** Chairs on each side of a rectangular, square or U-shaped table. Null spreads them automatically. */
export type SideCounts = Record<TableSide, number>

export const tableSides: TableSide[] = ['top', 'right', 'bottom', 'left']

/** Kinds whose chairs sit along straight sides and can be counted side by side. */
export function hasSides(kind: TableKind) {
  return kind === 'rect' || kind === 'square' || kind === 'ushape'
}

export type BlockOrientation = 'horizontal' | 'vertical'

export type BlockAlign = 'left' | 'center' | 'right'

/** "Row 1, Row 2" or "Row A, Row B". */
export type RowLabelStyle = 'number' | 'letter'

/** Where the row name is drawn next to each row of chairs. */
export type RowLabelSide = 'left' | 'right' | 'both' | 'none'

/** perRow: every row restarts at the starting number. continuous: one running count. */
export type SeatNumbering = 'perRow' | 'continuous'

/** Which edge of the block holds Row 1 (the front row). */
export type FrontRow = 'top' | 'bottom'

/** Saved recipe for a generated block of chairs. Seats stay individually editable. */
export type BlockSpec = {
  rows: number
  columns: number
  segments: number
  chairGap: number
  rowGap: number
  segmentGapX: number
  segmentGapY: number
  /** Extra clear space between a chair and the next segment, on the segment axis. */
  chairEdgeGap: number
  orientation: BlockOrientation
  align: BlockAlign
  reverse: boolean
  start: number
  prefix: string
  perSegment: boolean
  margin: number
  rowLabel: RowLabelStyle
  /** Number of the first row (1 → "Row 1", or "Row A" for letters). */
  rowStart: number
  rowLabelSide: RowLabelSide
  numbering: SeatNumbering
  frontRow: FrontRow
}

export type Seat = {
  id: string
  label: string
  x: number
  y: number
  rotation: number
  guestId: string | null
  /** Null keeps the theme color. */
  fill: string | null
  stroke: string | null
  /** Row name for chairs built in rows, e.g. "Row 1". Null for chairs around a table. */
  row?: string | null
}

export type Arrangement = {
  id: string
  kind: TableKind
  name: string
  x: number
  y: number
  rotation: number
  chairs: number
  chairGap: number
  tableWidth: number
  tableHeight: number
  rows: number
  columns: number
  distribution: Distribution
  opening: ChairOpening
  /** Shared id for arrangements that move and rotate together. Null when ungrouped. */
  groupId: string | null
  /** Null keeps the theme color. */
  fill: string | null
  stroke: string | null
  labelColor: string | null
  /** Null uses the standard chair size. */
  chairSize: number | null
  /** Null uses the standard stroke. Stages use this as the border thickness. */
  strokeWidth: number | null
  showLabel: boolean
  /** Null uses the floor label size. */
  labelSize: number | null
  /** Present when the chairs were generated as one configurable block. */
  block: BlockSpec | null
  /** Chairs per side, set from the side + / − controls. Absent or null = spread automatically. */
  sides?: SideCounts | null
  seats: Seat[]
}

export type FloorLayout = {
  id: string
  name: string
  arrangements: Arrangement[]
}

/** Default floor colors: cream table with a mint-teal rim, navy numbered seats with a light ring. */
export const defaultTableFill = '#EDE4D6'
export const defaultTableStroke = '#38B8A2'
export const defaultChairFill = '#2C3A52'
export const defaultChairStroke = '#E6EBF2'
/** Guest name tags beside each seat. */
export const nameTagFill = '#1D1F1B'
export const nameTagStroke = '#E6EBF2'
export const nameTagText = '#F4F4F5'
export const defaultStageFill = '#C8BBA8'
export const defaultStageStroke = '#3E4A46'

export const DEFAULT_LABEL_FONT = 12
export const MIN_LABEL_FONT = 8
export const MAX_LABEL_FONT = 48

export type SeatingDesign = {
  grid: number
  snap: boolean
  /** Chair numbers and table names for this event's seating plan. */
  labelFontSize: number
  activeLayoutId: string
  layouts: FloorLayout[]
}

export type SeatSpec = {
  kind: TableKind
  chairs: number
  chairGap: number
  tableWidth: number
  tableHeight: number
  rows: number
  columns: number
  distribution: Distribution
  opening: ChairOpening
  sides?: SideCounts | null
}

export const kindLabel: Record<TableKind, string> = {
  round: 'Round table',
  square: 'Square table',
  rect: 'Rectangular table',
  oval: 'Oval table',
  crescent: 'Half-round',
  ushape: 'U-shape',
  row: 'Seats',
  stage: 'Stage',
}

export const kindDefaults: Record<TableKind, SeatSpec> = {
  round: { kind: 'round', chairs: 8, chairGap: 8, tableWidth: 168, tableHeight: 168, rows: 1, columns: 1, distribution: 'around', opening: 'even' },
  square: { kind: 'square', chairs: 8, chairGap: 8, tableWidth: 140, tableHeight: 140, rows: 1, columns: 1, distribution: 'all', opening: 'even' },
  rect: { kind: 'rect', chairs: 8, chairGap: 10, tableWidth: 240, tableHeight: 96, rows: 1, columns: 1, distribution: 'long', opening: 'even' },
  oval: { kind: 'oval', chairs: 10, chairGap: 8, tableWidth: 240, tableHeight: 128, rows: 1, columns: 1, distribution: 'around', opening: 'even' },
  crescent: { kind: 'crescent', chairs: 7, chairGap: 8, tableWidth: 220, tableHeight: 110, rows: 1, columns: 1, distribution: 'around', opening: 'even' },
  ushape: { kind: 'ushape', chairs: 12, chairGap: 8, tableWidth: 240, tableHeight: 160, rows: 1, columns: 1, distribution: 'all', opening: 'even' },
  row: { kind: 'row', chairs: 24, chairGap: 12, tableWidth: 0, tableHeight: 0, rows: 3, columns: 8, distribution: 'around', opening: 'even' },
  stage: { kind: 'stage', chairs: 0, chairGap: 0, tableWidth: 360, tableHeight: 120, rows: 1, columns: 1, distribution: 'around', opening: 'even' },
}

export function emptyDesign(): SeatingDesign {
  const id = crypto.randomUUID()
  return {
    grid: 20,
    snap: true,
    labelFontSize: DEFAULT_LABEL_FONT,
    activeLayoutId: id,
    layouts: [{ id, name: 'Main floor', arrangements: [] }],
  }
}

export function activeLayout(design: SeatingDesign) {
  return design.layouts.find((layout) => layout.id === design.activeLayoutId) ?? design.layouts[0]
}

export function specOf(arrangement: Arrangement): SeatSpec {
  return {
    kind: arrangement.kind,
    chairs: arrangement.chairs,
    chairGap: arrangement.chairGap,
    tableWidth: arrangement.tableWidth,
    tableHeight: arrangement.tableHeight,
    rows: arrangement.rows,
    columns: arrangement.columns,
    distribution: arrangement.distribution,
    opening: arrangement.opening,
    sides: arrangement.sides ?? null,
  }
}

function normalizeSides(value: unknown, kind: TableKind): SideCounts | null {
  if (!hasSides(kind) || !isRecord(value)) return null
  const read = (side: TableSide) => Math.min(40, Math.max(0, Math.round(numberOr(value[side], 0))))
  const sides = { top: kind === 'ushape' ? 0 : read('top'), right: read('right'), bottom: read('bottom'), left: read('left') }
  return sides.top + sides.right + sides.bottom + sides.left > 0 ? sides : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Accept #RRGGBB or #RRGGBBAA (with alpha). Anything else falls back to the theme color. */
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const hex = value.trim()
  return /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex) ? hex.toUpperCase() : null
}

function normalizeSeat(value: unknown): Seat | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  return {
    id: value.id,
    label: typeof value.label === 'string' ? value.label : '',
    x: numberOr(value.x, 0),
    y: numberOr(value.y, 0),
    rotation: numberOr(value.rotation, 0),
    guestId: typeof value.guestId === 'string' ? value.guestId : null,
    fill: normalizeColor(value.fill),
    stroke: normalizeColor(value.stroke),
    row: typeof value.row === 'string' && value.row.trim() ? value.row.slice(0, 24) : null,
  }
}

function normalizeArrangement(value: unknown): Arrangement | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  const kind = tableKinds.includes(value.kind as TableKind) ? (value.kind as TableKind) : 'round'
  const defaults = kindDefaults[kind]
  const seats = Array.isArray(value.seats) ? value.seats.map(normalizeSeat).filter((seat) => seat !== null) : []
  return {
    id: value.id,
    kind,
    name: typeof value.name === 'string' && value.name.trim() ? value.name : kindLabel[kind],
    x: numberOr(value.x, 0),
    y: numberOr(value.y, 0),
    rotation: numberOr(value.rotation, 0),
    chairs: Math.max(0, Math.round(numberOr(value.chairs, seats.length || defaults.chairs))),
    chairGap: numberOr(value.chairGap, defaults.chairGap),
    tableWidth: numberOr(value.tableWidth, defaults.tableWidth),
    tableHeight: numberOr(value.tableHeight, defaults.tableHeight),
    rows: Math.max(1, Math.round(numberOr(value.rows, defaults.rows))),
    columns: Math.max(1, Math.round(numberOr(value.columns, defaults.columns))),
    distribution: value.distribution === 'long' || value.distribution === 'all' ? value.distribution : 'around',
    opening: value.opening === 'mid' || value.opening === 'uneven' ? value.opening : 'even',
    groupId: typeof value.groupId === 'string' && value.groupId ? value.groupId : null,
    fill: normalizeColor(value.fill),
    stroke: normalizeColor(value.stroke),
    labelColor: normalizeColor(value.labelColor),
    chairSize: optionalUnit(value.chairSize, 28, 96),
    strokeWidth: optionalUnit(value.strokeWidth, 1, 24),
    showLabel: value.showLabel !== false,
    labelSize: optionalUnit(value.labelSize, 8, 72),
    block: normalizeBlock(value.block),
    sides: normalizeSides(value.sides, kind),
    seats,
  }
}

function optionalUnit(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, value))
}

function normalizeBlock(value: unknown): BlockSpec | null {
  if (!isRecord(value)) return null
  const rows = Math.round(numberOr(value.rows, 0))
  const columns = Math.round(numberOr(value.columns, 0))
  const segments = Math.round(numberOr(value.segments, 0))
  if (rows < 1 || columns < 1 || segments < 1) return null
  return {
    rows,
    columns,
    segments,
    chairGap: Math.max(0, numberOr(value.chairGap, 16)),
    rowGap: Math.max(0, numberOr(value.rowGap, 28)),
    segmentGapX: Math.max(0, numberOr(value.segmentGapX, 150)),
    segmentGapY: Math.max(0, numberOr(value.segmentGapY, 80)),
    chairEdgeGap: Math.max(0, numberOr(value.chairEdgeGap, 0)),
    orientation: value.orientation === 'vertical' ? 'vertical' : 'horizontal',
    align: value.align === 'left' || value.align === 'right' ? value.align : 'center',
    reverse: value.reverse === true,
    start: Math.max(0, Math.round(numberOr(value.start, 1))),
    prefix: typeof value.prefix === 'string' ? value.prefix.slice(0, 12) : '',
    perSegment: value.perSegment === true,
    margin: Math.max(0, numberOr(value.margin, 0)),
    rowLabel: value.rowLabel === 'letter' ? 'letter' : 'number',
    rowStart: Math.max(1, Math.round(numberOr(value.rowStart, 1))),
    // Blocks saved before row labels existed keep their old look until edited.
    rowLabelSide:
      value.rowLabelSide === 'left' || value.rowLabelSide === 'right' || value.rowLabelSide === 'both' ? value.rowLabelSide : 'none',
    numbering: value.numbering === 'perRow' ? 'perRow' : 'continuous',
    frontRow: value.frontRow === 'bottom' ? 'bottom' : 'top',
  }
}

export function normalizeDesign(raw: unknown): SeatingDesign {
  const empty = emptyDesign()
  if (!isRecord(raw) || !Array.isArray(raw.layouts)) return empty
  const grid = Math.max(8, Math.round(numberOr(raw.grid, 20)))
  const snap = raw.snap !== false
  const labelFontSize = Math.min(MAX_LABEL_FONT, Math.max(MIN_LABEL_FONT, Math.round(numberOr(raw.labelFontSize, DEFAULT_LABEL_FONT))))
  // An explicit empty list is a plan with no floors. Do not invent a replacement.
  if (raw.layouts.length === 0) {
    return { grid, snap, labelFontSize, activeLayoutId: '', layouts: [] }
  }
  const layouts = raw.layouts
    .map((layout) => {
      if (!isRecord(layout) || typeof layout.id !== 'string') return null
      const arrangements = Array.isArray(layout.arrangements)
        ? layout.arrangements.map(normalizeArrangement).filter((item) => item !== null)
        : []
      return {
        id: layout.id,
        name: typeof layout.name === 'string' && layout.name.trim() ? layout.name : 'Floor',
        arrangements,
      }
    })
    .filter((layout) => layout !== null)
  if (layouts.length === 0) return empty
  const active = typeof raw.activeLayoutId === 'string' && layouts.some((layout) => layout.id === raw.activeLayoutId)
    ? raw.activeLayoutId
    : layouts[0].id
  return { grid, snap, labelFontSize, activeLayoutId: active, layouts }
}

export function parseDesign(json: string | null | undefined) {
  if (!json) return emptyDesign()
  try {
    return normalizeDesign(JSON.parse(json))
  } catch {
    return emptyDesign()
  }
}

export function mapLayout(design: SeatingDesign, layoutId: string, recipe: (layout: FloorLayout) => FloorLayout) {
  return {
    ...design,
    layouts: design.layouts.map((layout) => (layout.id === layoutId ? recipe(layout) : layout)),
  }
}

export function seatedGuestIds(design: SeatingDesign) {
  const ids = new Set<string>()
  for (const layout of design.layouts) {
    if (layout.id !== design.activeLayoutId) continue
    for (const arrangement of layout.arrangements) {
      for (const seat of arrangement.seats) {
        if (seat.guestId) ids.add(seat.guestId)
      }
    }
  }
  return ids
}

export function findSeat(design: SeatingDesign, guestId: string) {
  const layout = activeLayout(design)
  if (!layout) return null
  for (const arrangement of layout.arrangements) {
    const seat = arrangement.seats.find((item) => item.guestId === guestId)
    if (seat) return { arrangement, seat }
  }
  return null
}
