import type { Arrangement, Distribution, Seat, SeatSpec, TableKind } from '@/seating/model'

export const CHAIR = 26
const OUTSET = 20

type Point = { x: number; y: number; rotation: number }

function clampCount(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function seatAt(index: number, point: Point, existing: Seat[] | undefined, label: string, keepLabel: boolean): Seat {
  const previous = existing?.[index]
  return {
    id: previous?.id ?? crypto.randomUUID(),
    label: keepLabel && previous?.label ? previous.label : label,
    x: point.x,
    y: point.y,
    rotation: point.rotation,
    guestId: previous?.guestId ?? null,
  }
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
  let counts = sideCounts(width, height, chairs, distribution === 'long' ? 'long' : 'all')
  width = fitSpan(Math.max(counts.top, counts.bottom), spec.chairGap, width)
  height = fitSpan(Math.max(counts.left, counts.right), spec.chairGap, height)
  if (spec.kind === 'square') {
    const side = Math.max(width, height)
    width = side
    height = side
  }
  counts = sideCounts(width, height, chairs, distribution === 'long' ? 'long' : 'all')
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

function ellipse(spec: SeatSpec, existing: Seat[] | undefined, keepLabel: boolean, crescent: boolean) {
  const chairs = clampCount(spec.chairs, 1, 80)
  const span = chairs * (CHAIR + spec.chairGap)
  const radiusX = Math.max(spec.tableWidth / 2, crescent ? span / Math.PI : span / (2 * Math.PI))
  const radiusY = crescent ? radiusX : Math.max(spec.tableHeight / 2, radiusX * (spec.tableHeight / Math.max(spec.tableWidth, 1)))
  const angles = crescent
    ? Array.from({ length: chairs }, (_, index) => -Math.PI + ((index + 0.5) / chairs) * Math.PI)
    : circleAngles(chairs, spec.opening)
  const points: Point[] = angles.map((theta) => ({
    x: (radiusX + OUTSET) * Math.cos(theta),
    y: (radiusY + OUTSET) * Math.sin(theta),
    rotation: facing(theta),
  }))
  return {
    tableWidth: radiusX * 2,
    tableHeight: crescent ? radiusY : radiusY * 2,
    seats: points.map((point, index) => seatAt(index, point, existing, String(index + 1), keepLabel)),
  }
}

function ushape(spec: SeatSpec, existing: Seat[] | undefined, keepLabel: boolean) {
  const chairs = clampCount(spec.chairs, 3, 80)
  const left = Math.floor(chairs / 3)
  const right = Math.floor(chairs / 3)
  const bottom = chairs - left - right
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
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      points.push({
        x: (column - (columnCount - 1) / 2) * gapX,
        y: row * gapY,
        rotation: 0,
      })
      labels.push(`${rowLetter(row)}${column + 1}`)
    }
  }
  const width = Math.max(CHAIR, (columnCount - 1) * gapX + CHAIR)
  const height = Math.max(CHAIR, (rowCount - 1) * gapY + CHAIR)
  return {
    tableWidth: width,
    tableHeight: height,
    seats: points.map((point, index) => seatAt(index, point, existing, labels[index], keepLabel)),
  }
}

export function buildArrangement(spec: SeatSpec, existing?: Seat[], keepLabel = true) {
  if (spec.kind === 'row') return rows(spec, existing, keepLabel)
  if (spec.kind === 'rect' || spec.kind === 'square') return rectangle(spec, existing, keepLabel)
  if (spec.kind === 'ushape') return ushape(spec, existing, keepLabel)
  if (spec.kind === 'crescent') return ellipse({ ...spec, kind: 'crescent' }, existing, keepLabel, true)
  return ellipse(spec, existing, keepLabel, false)
}

export function nextArrangementName(kind: TableKind, arrangements: Arrangement[]) {
  if (kind === 'row') {
    const names = new Set(arrangements.filter((item) => item.kind === 'row').map((item) => item.name))
    let index = 0
    while (names.has(`Row ${rowLetter(index)}`)) index += 1
    return `Row ${rowLetter(index)}`
  }
  const numbers = arrangements
    .filter((item) => item.kind !== 'row')
    .map((item) => {
      const match = item.name.match(/(\d+)\s*$/)
      return match ? Number(match[1]) : 0
    })
  return `Table ${Math.max(0, ...numbers) + 1}`
}

export function gridPitch(width: number, height: number, gap: number) {
  const pad = OUTSET * 2 + CHAIR + Math.max(16, gap)
  return { x: width + pad, y: height + pad }
}

export function snapValue(value: number, grid: number, enabled: boolean) {
  if (!enabled) return value
  return Math.round(value / grid) * grid
}
