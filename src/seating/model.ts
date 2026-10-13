export const tableKinds = ['round', 'square', 'rect', 'oval', 'crescent', 'ushape', 'row'] as const

export type TableKind = (typeof tableKinds)[number]

export type Distribution = 'around' | 'long' | 'all'

export type ChairOpening = 'even' | 'mid' | 'uneven'

export type Seat = {
  id: string
  label: string
  x: number
  y: number
  rotation: number
  guestId: string | null
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
  seats: Seat[]
}

export type FloorLayout = {
  id: string
  name: string
  arrangements: Arrangement[]
}

export type SeatingDesign = {
  grid: number
  snap: boolean
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
}

export const kindLabel: Record<TableKind, string> = {
  round: 'Round table',
  square: 'Square table',
  rect: 'Rectangular table',
  oval: 'Oval table',
  crescent: 'Half-round',
  ushape: 'U-shape',
  row: 'Row of seats',
}

export const kindDefaults: Record<TableKind, SeatSpec> = {
  round: { kind: 'round', chairs: 8, chairGap: 8, tableWidth: 168, tableHeight: 168, rows: 1, columns: 1, distribution: 'around', opening: 'even' },
  square: { kind: 'square', chairs: 8, chairGap: 8, tableWidth: 140, tableHeight: 140, rows: 1, columns: 1, distribution: 'all', opening: 'even' },
  rect: { kind: 'rect', chairs: 8, chairGap: 10, tableWidth: 240, tableHeight: 96, rows: 1, columns: 1, distribution: 'long', opening: 'even' },
  oval: { kind: 'oval', chairs: 10, chairGap: 8, tableWidth: 240, tableHeight: 128, rows: 1, columns: 1, distribution: 'around', opening: 'even' },
  crescent: { kind: 'crescent', chairs: 7, chairGap: 8, tableWidth: 220, tableHeight: 110, rows: 1, columns: 1, distribution: 'around', opening: 'even' },
  ushape: { kind: 'ushape', chairs: 12, chairGap: 8, tableWidth: 240, tableHeight: 160, rows: 1, columns: 1, distribution: 'all', opening: 'even' },
  row: { kind: 'row', chairs: 24, chairGap: 12, tableWidth: 0, tableHeight: 0, rows: 3, columns: 8, distribution: 'around', opening: 'even' },
}

export function emptyDesign(): SeatingDesign {
  const id = crypto.randomUUID()
  return {
    grid: 20,
    snap: true,
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
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
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
    seats,
  }
}

export function normalizeDesign(raw: unknown): SeatingDesign {
  const empty = emptyDesign()
  if (!isRecord(raw) || !Array.isArray(raw.layouts)) return empty
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
  return {
    grid: Math.max(8, Math.round(numberOr(raw.grid, 20))),
    snap: raw.snap !== false,
    activeLayoutId: active,
    layouts,
  }
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
  for (const arrangement of layout.arrangements) {
    const seat = arrangement.seats.find((item) => item.guestId === guestId)
    if (seat) return { arrangement, seat }
  }
  return null
}
