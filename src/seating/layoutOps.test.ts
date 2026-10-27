import assert from 'node:assert/strict'
import test from 'node:test'
import {
  alignArrangements,
  arrangementBox,
  distributeArrangements,
  groupArrangements,
  hitArrangements,
  readableOn,
  renumberSeats,
  renumberTables,
  rotateGroup,
  rotateSelection,
  selectionUnits,
  setSeatRotation,
  spaceArrangements,
  tableLabelPoint,
  ungroupArrangements,
  unionBounds,
  uprightRotation,
} from './layoutOps.ts'
import { buildArrangement, buildBlock, defaultBlock, resizeSide, sidesOf, validateBlock } from './geometry.ts'
import { findSeat, kindDefaults, normalizeDesign, type Arrangement, type BlockSpec, type Seat } from './model.ts'

function seat(id: string, x: number, y: number, extra?: Partial<Seat>): Seat {
  return { id, label: id, x, y, rotation: 0, guestId: null, fill: null, stroke: null, ...extra }
}

function table(id: string, x: number, y: number, extra?: Partial<Arrangement>): Arrangement {
  return {
    id,
    kind: 'rect',
    name: id,
    x,
    y,
    rotation: 0,
    chairs: 0,
    chairGap: 8,
    tableWidth: 100,
    tableHeight: 40,
    rows: 1,
    columns: 1,
    distribution: 'long',
    opening: 'even',
    groupId: null,
    fill: null,
    stroke: null,
    labelColor: null,
    chairSize: null,
    strokeWidth: null,
    showLabel: true,
    labelSize: null,
    block: null,
    seats: [],
    ...extra,
  }
}

test('marquee uses intersection in world space', () => {
  const items = [table('a', 0, 0), table('b', 400, 0)]
  const hits = hitArrangements(items, { x1: -10, y1: -10, x2: 40, y2: 40 })
  assert.deepEqual(hits, ['a'])
})

test('align left uses bounding boxes and keeps the other axis', () => {
  const items = [table('a', 0, 0), table('b', 200, 80)]
  const aligned = alignArrangements(items, ['a', 'b'], 'left')
  const boxes = aligned.map(arrangementBox)
  assert.equal(boxes[0].left, boxes[1].left)
  assert.equal(aligned[1].y, 80)
})

test('horizontal center shares one vertical line', () => {
  const aligned = alignArrangements([table('a', 0, 0), table('b', 300, 40)], ['a', 'b'], 'centerX')
  const [first, second] = aligned.map(arrangementBox)
  assert.ok(Math.abs(first.cx - second.cx) < 0.001)
})

test('vertical gap of zero packs boxes without overlap', () => {
  const spaced = spaceArrangements([table('a', 0, 0), table('b', 0, 200)], ['a', 'b'], 'y', 0)
  const [first, second] = spaced.map(arrangementBox)
  assert.ok(Math.abs(second.top - first.bottom) < 0.001)
})

test('a horizontal gap on a grid keeps rows and columns instead of making a staircase', () => {
  // 3 × 3 grid of 100-wide tables, 200 apart.
  const items: Arrangement[] = []
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      items.push(table(`r${row}c${column}`, column * 200, row * 200, { tableWidth: 100, tableHeight: 100 }))
    }
  }
  const spaced = spaceArrangements(items, items.map((item) => item.id), 'x', 60)
  const at = (id: string) => spaced.find((item) => item.id === id)!
  // Rows keep their y.
  for (const item of spaced) assert.equal(item.y, items.find((entry) => entry.id === item.id)!.y)
  // Columns stay aligned across rows, and columns are now 100 + 60 apart.
  for (const row of [0, 1, 2]) {
    assert.equal(at(`r${row}c0`).x, 0)
    assert.equal(at(`r${row}c1`).x, 160)
    assert.equal(at(`r${row}c2`).x, 320)
  }
})

test('distribution keeps outer objects and order', () => {
  const items = [table('a', 0, 0), table('b', 40, 0), table('c', 400, 0)]
  const { items: next, overlaps } = distributeArrangements(items, ['a', 'b', 'c'], 'x')
  const boxes = next.map(arrangementBox)
  assert.equal(overlaps, false)
  assert.ok(boxes[1].left > boxes[0].left)
  assert.ok(boxes[2].left > boxes[1].left)
  assert.equal(boxes[0].left, arrangementBox(items[0]).left)
  assert.equal(boxes[2].right, arrangementBox(items[2]).right)
})

test('renumber orders rows left to right and keeps the seat record', () => {
  const guest = 'guest-1'
  const items = [
    table('t', 0, 0, {
      kind: 'row',
      seats: [
        seat('s2', 80, 2, { label: '9', guestId: guest }),
        seat('s1', -40, 0, { label: '4' }),
        seat('s3', -20, 120, { label: '1' }),
      ],
    }),
  ]
  const next = renumberSeats(items, ['t'], 5, 2)
  const seats = next[0].seats
  assert.equal(seats.find((item) => item.id === 's1')?.label, '5')
  assert.equal(seats.find((item) => item.id === 's2')?.label, '7')
  assert.equal(seats.find((item) => item.id === 's3')?.label, '9')
  const kept = seats.find((item) => item.id === 's2')
  assert.equal(kept?.guestId, guest)
  assert.equal(kept?.x, 80)
  assert.equal(kept?.y, 2)
})

test('renumber uses world position after the table is rotated', () => {
  const items = [
    table('t', 0, 0, {
      kind: 'row',
      rotation: 90,
      seats: [seat('top', 0, -40), seat('bottom', 0, 40)],
    }),
  ]
  const next = renumberSeats(items, null, 1, 1)
  const labels = Object.fromEntries(next[0].seats.map((item) => [item.id, item.label]))
  assert.equal(labels.top, '2')
  assert.equal(labels.bottom, '1')
  assert.equal(next[0].seats[0].x, 0)
})

test('every table restarts at chair 1, clockwise from the top-left, even after turning', () => {
  const ring = [seat('n', 0, -60), seat('e', 60, 0), seat('s', 0, 60), seat('w', -60, 0)]
  const items = [
    table('a', 0, 0, { kind: 'round', tableWidth: 80, tableHeight: 80, seats: ring }),
    table('b', 400, 0, { kind: 'round', tableWidth: 80, tableHeight: 80, rotation: 180, seats: ring }),
  ]
  const next = renumberSeats(items, null, 1, 1)
  const a = Object.fromEntries(next[0].seats.map((item) => [item.id, item.label]))
  const b = Object.fromEntries(next[1].seats.map((item) => [item.id, item.label]))
  assert.deepEqual([a.n, a.e, a.s, a.w], ['1', '2', '3', '4'])
  // Turned upside down, the chair now at the top ("s") becomes 1 again; numbers do not run on to 5-8.
  assert.deepEqual([b.s, b.w, b.n, b.e], ['1', '2', '3', '4'])
})

test('tables are renamed in floor order after a group is turned around', () => {
  const items = [0, 1, 2].map((index) => table(`t${index}`, index * 300, 0, { kind: 'round', tableWidth: 120, tableHeight: 120 }))
  // Simulate a 180° group turn: the first table is now on the right.
  const turned = items.map((item) => ({ ...item, x: 600 - item.x }))
  const named = renumberTables(turned, null, 'Table', 1, 'rows')
  assert.deepEqual(named.map((item) => item.name), ['Table 3', 'Table 2', 'Table 1'])
  const rtl = renumberTables(turned, null, 'Table', 1, 'rows-rtl')
  assert.deepEqual(rtl.map((item) => item.name), ['Table 1', 'Table 2', 'Table 3'])
})

test('snake order can start from either side', () => {
  // Two lines of three: a b c on top, d e f below.
  const items = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) =>
    table(id, (index % 3) * 300, Math.floor(index / 3) * 300, { kind: 'round', tableWidth: 120, tableHeight: 120 }),
  )
  const names = (order: 'snake' | 'snake-rtl') =>
    Object.fromEntries(renumberTables(items, null, 'T', 1, order).map((item) => [item.id, item.name]))
  // → then ←
  assert.deepEqual(names('snake'), { a: 'T 1', b: 'T 2', c: 'T 3', f: 'T 4', e: 'T 5', d: 'T 6' })
  // ← then →
  assert.deepEqual(names('snake-rtl'), { c: 'T 1', b: 'T 2', a: 'T 3', d: 'T 4', e: 'T 5', f: 'T 6' })
})

test('renumber ignores tables outside the selection', () => {
  const items = [
    table('a', 0, 0, { seats: [seat('a1', 0, 0, { label: 'keep' })] }),
    table('b', 200, 0, { seats: [seat('b1', 0, 0, { label: 'old' })] }),
  ]
  const next = renumberSeats(items, ['b'], 1, 1)
  assert.equal(next[0].seats[0].label, 'keep')
  assert.equal(next[1].seats[0].label, '1')
})

test('group rotation keeps relative spacing and seat identity', () => {
  const items = groupArrangements(
    [
      table('a', 0, 0, { seats: [seat('s', 10, 0, { guestId: 'g' })] }),
      table('b', 100, 0),
    ],
    ['a', 'b'],
    'group-1',
  )
  const turned = rotateGroup(items, 'group-1', 90)
  const a = turned.find((item) => item.id === 'a')
  const b = turned.find((item) => item.id === 'b')
  assert.ok(a && b)
  assert.ok(Math.abs(b.x - a.x) < 0.05, 'horizontal offset closes')
  assert.ok(Math.abs(b.y - a.y - 100) < 0.05, 'the pair swings a quarter turn')
  assert.equal(a.rotation, 90)
  assert.equal(a.seats[0].id, 's')
  assert.equal(a.seats[0].guestId, 'g')
  const loose = ungroupArrangements(turned, ['a'])
  assert.equal(loose[0].groupId, null)
  assert.equal(loose[1].groupId, null)
  assert.equal(loose[0].x, a.x)
})

test('table names sit on the table center, and a half-round center scales with its radius', () => {
  assert.deepEqual(tableLabelPoint(table('wide', 10, 20, { tableWidth: 400, tableHeight: 80 })), { x: 0, y: 0 })
  const small = tableLabelPoint(table('half', 0, 0, { kind: 'crescent', tableWidth: 100, tableHeight: 50 }))
  const large = tableLabelPoint(table('half-large', 0, 0, { kind: 'crescent', tableWidth: 200, tableHeight: 100 }))
  assert.ok(small.y < 0 && large.y < small.y)
  assert.ok(Math.abs(large.y - small.y * 2) < 0.001)
  const row = tableLabelPoint(
    table('row', 0, 0, { kind: 'row', seats: [seat('a', -20, 0), seat('b', 20, 80)] }),
  )
  assert.deepEqual(row, { x: 0, y: 40 })
})

test('label ink stays dark on a light fill and light on a dark fill', () => {
  assert.equal(readableOn('#FCFCFB'), '#1C1D1A')
  assert.equal(readableOn('#0F5C4C'), '#F7F7F4')
})

test('saved plans without colors keep the theme fallback', () => {
  const design = normalizeDesign({
    activeLayoutId: 'floor',
    layouts: [
      {
        id: 'floor',
        name: 'Main floor',
        arrangements: [
          {
            id: 'table',
            kind: 'round',
            name: 'Table 1',
            fill: 'not-a-color',
            seats: [{ id: 'seat', label: '1', guestId: 'guest-1', fill: '#112233' }],
          },
        ],
      },
    ],
  })
  const item = design.layouts[0].arrangements[0]
  assert.equal(item.fill, null)
  assert.equal(item.stroke, null)
  assert.equal(item.labelColor, null)
  assert.equal(item.seats[0].fill, '#112233')
  assert.equal(item.seats[0].guestId, 'guest-1')
  assert.equal(item.seats[0].stroke, null)
})

test('renumber keeps a chair color on the same seat', () => {
  const items = [table('t', 0, 0, { seats: [seat('s', 0, 0, { fill: '#AA3300', guestId: 'guest-1' })] })]
  const next = renumberSeats(items, null, 1, 1)
  assert.equal(next[0].seats[0].fill, '#AA3300')
  assert.equal(next[0].seats[0].guestId, 'guest-1')
  assert.equal(next[0].seats[0].label, '1')
})

test('aligning one group does not pull its members onto the same edge', () => {
  const items = groupArrangements([table('a', 0, 0), table('b', 200, 40)], ['a', 'b'], 'g')
  const next = alignArrangements(items, ['a', 'b'], 'left')
  assert.equal(next[0].x, 0)
  assert.equal(next[1].x, 200)
  assert.equal(next[1].y, 40)
  assert.equal(selectionUnits(next, ['a', 'b']).length, 1)
})

test('align lines up group boxes and keeps the spacing inside each group', () => {
  const items = groupArrangements(
    groupArrangements([table('a', 0, 0), table('b', 120, 30), table('c', 500, 10), table('d', 640, -20)], ['a', 'b'], 'left-group'),
    ['c', 'd'],
    'right-group',
  )
  const next = alignArrangements(items, ['a', 'b', 'c', 'd'], 'top')
  const a = next.find((item) => item.id === 'a')
  const b = next.find((item) => item.id === 'b')
  const c = next.find((item) => item.id === 'c')
  const d = next.find((item) => item.id === 'd')
  assert.ok(a && b && c && d)
  assert.equal(b.x - a.x, 120)
  assert.equal(b.y - a.y, 30)
  assert.equal(d.x - c.x, 140)
  assert.equal(d.y - c.y, -30)
  assert.equal(a.groupId, 'left-group')
  assert.equal(d.groupId, 'right-group')
  const leftBox = unionBounds([arrangementBox(a), arrangementBox(b)])
  const rightBox = unionBounds([arrangementBox(c), arrangementBox(d)])
  assert.ok(leftBox && rightBox)
  assert.ok(Math.abs(leftBox.top - rightBox.top) < 0.001)
})

test('distribution spaces group boxes, not the tables inside them', () => {
  const items = groupArrangements(
    groupArrangements(
      [table('a', 0, 0), table('b', 80, 0), table('c', 400, 0), table('d', 480, 0), table('e', 900, 0), table('f', 960, 0)],
      ['a', 'b'],
      'g1',
    ),
    ['c', 'd'],
    'g2',
  ).map((item) => (item.id === 'e' || item.id === 'f' ? { ...item, groupId: 'g3' } : item))
  const ids = items.map((item) => item.id)
  const { items: next, overlaps } = distributeArrangements(items, ids, 'x')
  assert.equal(overlaps, false)
  const units = selectionUnits(next, ids).sort((p, q) => p.box.left - q.box.left)
  assert.equal(units.length, 3)
  const gap = (box: { right: number }, following: { left: number }) => following.left - box.right
  const first = gap(units[0].box, units[1].box)
  const second = gap(units[1].box, units[2].box)
  assert.ok(Math.abs(first - second) < 0.001)
  const a = next.find((item) => item.id === 'a')
  const b = next.find((item) => item.id === 'b')
  assert.ok(a && b)
  assert.equal(b.x - a.x, 80)
  assert.equal(a.groupId, 'g1')
})

test('a rotated table aligns on its visual bounds', () => {
  const wide = table('wide', 0, 0, { tableWidth: 200, tableHeight: 40, rotation: 90 })
  const plain = table('plain', 300, 0, { tableWidth: 200, tableHeight: 40 })
  const turned = arrangementBox(wide)
  assert.ok(turned.width < 50)
  assert.ok(turned.height > 190)
  const aligned = alignArrangements([wide, plain], ['wide', 'plain'], 'left')
  assert.ok(Math.abs(arrangementBox(aligned[0]).left - arrangementBox(aligned[1]).left) < 0.01)
})

test('four quarter turns bring a pair back, and one chair turns without moving', () => {
  let items = [table('a', 0, 0), table('b', 100, 0)]
  for (let step = 0; step < 4; step += 1) items = rotateSelection(items, ['a', 'b'], 90)
  assert.ok(Math.abs(items[0].x) < 0.05 && Math.abs(items[0].y) < 0.05)
  assert.ok(Math.abs(items[1].x - 100) < 0.05 && Math.abs(items[1].y) < 0.05)
  assert.equal(items[0].rotation, 0)
  const seated = [table('t', 40, 70, { seats: [seat('s', 12, -8, { guestId: 'guest-1', rotation: 15 })] })]
  const turned = setSeatRotation(seated, 't', 's', 200)
  assert.equal(turned[0].x, 40)
  assert.equal(turned[0].seats[0].x, 12)
  assert.equal(turned[0].seats[0].y, -8)
  assert.equal(turned[0].seats[0].rotation, 200)
  assert.equal(turned[0].seats[0].guestId, 'guest-1')
  assert.equal(turned[0].seats[0].id, 's')
})

test('an empty layout list stays empty and keeps the label size', () => {
  const design = normalizeDesign({ grid: 20, snap: true, labelFontSize: 18, activeLayoutId: 'gone', layouts: [] })
  assert.equal(design.layouts.length, 0)
  assert.equal(design.activeLayoutId, '')
  assert.equal(design.labelFontSize, 18)
  assert.equal(findSeat(design, 'guest-1'), null)
})

function recipe(extra?: Partial<BlockSpec>): BlockSpec {
  return { ...defaultBlock(), rows: 4, columns: 8, segments: 3, chairGap: 40, rowGap: 80, segmentGapX: 150, ...extra }
}

test('a block counts rows, chairs, and segments without a fixed layout', () => {
  const sample = buildBlock(recipe(), 52)
  assert.equal(sample.seats.length, 96)
  assert.equal(buildBlock(recipe({ rows: 10, columns: 12, segments: 1 }), 52).seats.length, 120)
  assert.equal(buildBlock(recipe({ rows: 5, columns: 8, segments: 3 }), 52).seats.length, 120)
  assert.equal(buildBlock(recipe({ rows: 3, columns: 6, segments: 2 }), 52).seats.length, 36)
  const first = sample.seats[7]
  const next = sample.seats[32]
  assert.equal(Math.round((next.x - first.x) * 100) / 100, 52 + 150)
  assert.equal(sample.seats[0].label, '1')
  assert.equal(sample.seats[7].label, '8')
})

test('numbering can restart, reverse, and keep a guest on the same index', () => {
  const numbered = buildBlock(recipe({ segments: 2, rows: 1, columns: 3, perSegment: true, reverse: true, prefix: 'A', start: 5 }), 52)
  assert.deepEqual(numbered.seats.map((item) => item.label), ['A7', 'A6', 'A5', 'A7', 'A6', 'A5'])
  const existing = [seat('keep', 0, 0, { guestId: 'guest-1', label: 'old' })]
  const rebuilt = buildBlock(recipe({ rows: 1, columns: 2, segments: 1 }), 52, existing)
  assert.equal(rebuilt.seats[0].id, 'keep')
  assert.equal(rebuilt.seats[0].guestId, 'guest-1')
  assert.equal(rebuilt.seats[0].label, '1')
  assert.notEqual(rebuilt.seats[1].id, 'keep')
})

test('every line of chairs gets its own row name and restarts its seat numbers', () => {
  const block = buildBlock(recipe({ rows: 3, columns: 4, segments: 2 }), 52)
  const rowOf = (index: number) => block.seats[index].row
  // Segment 1: rows 1-3, four chairs each. Segment 2 sits beside it and shares the same rows.
  assert.equal(rowOf(0), 'Row 1')
  assert.equal(rowOf(4), 'Row 2')
  assert.equal(rowOf(8), 'Row 3')
  assert.equal(rowOf(12), 'Row 1')
  assert.equal(block.seats.filter((seat) => seat.row === 'Row 1').length, 8)
  assert.deepEqual(block.seats.slice(4, 8).map((seat) => seat.label), ['1', '2', '3', '4'])
  // Across the aisle, Row 1 carries on from 5.
  assert.deepEqual(block.seats.slice(12, 16).map((seat) => seat.label), ['5', '6', '7', '8'])
  const stacked = buildBlock(recipe({ rows: 2, columns: 2, segments: 2, orientation: 'vertical', rowLabel: 'letter', frontRow: 'bottom' }), 52)
  assert.deepEqual(stacked.seats.map((seat) => seat.row), ['Row D', 'Row D', 'Row C', 'Row C', 'Row B', 'Row B', 'Row A', 'Row A'])
})

test('adding a chair on one side keeps every guest on the same chair', () => {
  const spec = { ...kindDefaults.square, chairs: 8 }
  const built = buildArrangement(spec)
  const square = table('sq', 0, 0, { kind: 'square', chairs: 8, tableWidth: built.tableWidth, tableHeight: built.tableHeight, distribution: 'all', seats: built.seats })
  const before = sidesOf(spec)
  assert.ok(before)
  // Sit someone on the first chair of the left side (the last side in build order).
  const leftIndex = before.top + before.right + before.bottom
  square.seats[leftIndex] = { ...square.seats[leftIndex], guestId: 'guest-1' }
  const grown = resizeSide(square, 'top', 1)
  assert.ok(grown.ok)
  if (!grown.ok) return
  assert.equal(grown.spec.sides?.top, before.top + 1)
  assert.equal(grown.seats.length, 9)
  const moved = grown.seats.find((seat) => seat.guestId === 'guest-1')
  assert.equal(moved?.id, square.seats[leftIndex].id)
  assert.ok((moved?.x ?? 0) < 0, 'guest stays on the left side')
  // The last chair on a side cannot be removed while someone sits on it.
  const occupiedLast = { ...square, seats: square.seats.map((seat, index) => (index === before.top - 1 ? { ...seat, guestId: 'guest-2' } : seat)) }
  const blocked = resizeSide(occupiedLast, 'top', -1)
  assert.equal(blocked.ok, false)
})

test('oval chairs are spread evenly along the edge, top and bottom alike', () => {
  const oval = buildArrangement({ ...kindDefaults.oval, chairs: 10 })
  const below = oval.seats.filter((seat) => seat.y > 1).length
  const above = oval.seats.filter((seat) => seat.y < -1).length
  assert.equal(below, 5)
  assert.equal(above, 5)
  // Neighbouring chairs sit roughly the same distance apart all the way round.
  const gaps = oval.seats.map((seat, index) => {
    const next = oval.seats[(index + 1) % oval.seats.length]
    return Math.hypot(next.x - seat.x, next.y - seat.y)
  })
  assert.ok(Math.max(...gaps) / Math.min(...gaps) < 1.25)
  // Chair 1 is the first chair clockwise from the top.
  assert.equal(oval.seats[0].label, '1')
  assert.ok(oval.seats[0].x > 0 && oval.seats[0].y < 0)
})

test('stacked segments use the vertical gap, and unsafe counts are rejected', () => {
  const stacked = buildBlock(recipe({ rows: 1, columns: 2, segments: 2, orientation: 'vertical', segmentGapY: 80, chairGap: 0, rowGap: 0 }), 40)
  assert.ok(stacked.seats[2].y > stacked.seats[0].y)
  assert.equal(Math.round(stacked.seats[2].y - stacked.seats[0].y), 40 + 80)
  assert.match(validateBlock(recipe({ rows: 0 }), 52) ?? '', /positive/)
  assert.match(validateBlock(recipe({ rows: 40, columns: 40, segments: 2 }), 52) ?? '', /500/)
  assert.match(validateBlock(recipe({ chairGap: -1 }), 52) ?? '', /negative/)
})

test('older layouts load without block or stage fields, and a stage keeps its size', () => {
  const design = normalizeDesign({
    grid: 20,
    snap: true,
    labelFontSize: 14,
    activeLayoutId: 'floor',
    layouts: [
      {
        id: 'floor',
        name: 'Main floor',
        arrangements: [
          {
            id: 'table',
            kind: 'round',
            name: 'Table 1',
            x: 10,
            y: 20,
            seats: [{ id: 's', label: '1', x: 0, y: 0, rotation: 0, guestId: 'guest-1' }],
          },
          { id: 'stage', kind: 'stage', name: 'STAGE', x: 40, y: 50, tableWidth: 300, tableHeight: 100, rotation: 15, showLabel: false, strokeWidth: 4, seats: [] },
        ],
      },
    ],
  })
  const tableItem = design.layouts[0].arrangements[0]
  assert.equal(tableItem.block, null)
  assert.equal(tableItem.showLabel, true)
  assert.equal(tableItem.chairSize, null)
  assert.equal(tableItem.seats[0].guestId, 'guest-1')
  const stage = design.layouts[0].arrangements[1]
  assert.equal(stage.kind, 'stage')
  assert.equal(stage.tableWidth, 300)
  assert.equal(stage.showLabel, false)
  assert.equal(stage.strokeWidth, 4)
  assert.equal(stage.seats.length, 0)
  assert.equal(findSeat(design, 'guest-1')?.seat.id, 's')
})

test('upright labels cancel parent rotation without flipping at intermediate angles', () => {
  for (const angle of [0, 45, 90, 135, 180, 270, 360]) {
    const local = uprightRotation(angle)
    const screen = (((angle + local) % 360) + 360) % 360
    assert.equal(screen, 0, `angle ${angle}`)
  }
  assert.equal(uprightRotation(10), uprightRotation(370))
})
