import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ColorSwatchField } from '@/components/invitations/designerControls'
import type { TableOrder } from '@/seating/layoutOps'
import { Button } from '@/components/ui/Button'
import { NumberField } from '@/components/ui/NumberField'
import { TextField } from '@/components/ui/TextField'
import {
  blockChairCount,
  buildArrangement,
  buildBlock,
  footprint,
  gridCenters,
  gridCount,
  gridSpan,
  MAX_BLOCK_CHAIRS,
  MAX_CHAIR_SIZE,
  MIN_CHAIR_SIZE,
  occupiedBeyond,
  validateBlock,
  validateGrid,
  type GridSpec,
} from '@/seating/geometry'
import {
  defaultStageFill,
  defaultStageStroke,
  kindLabel,
  type BlockAlign,
  type BlockOrientation,
  type BlockSpec,
  type ChairOpening,
  type Distribution,
  type SeatSpec,
  type TableKind,
  type FrontRow,
  type RowLabelSide,
  type RowLabelStyle,
  type Seat,
  type SeatNumbering,
} from '@/seating/model'

function SelectBox({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: [string, string][]
  onChange: (value: string) => void
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium">{label}</span>
      <select
        aria-label={label}
        className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  )
}

export type BlockDraft = {
  name: string
  chairSize: number
  rotation: number
  block: BlockSpec
  /** Copies of the whole section, laid out in rows and columns. Create only. */
  grid: GridSpec
  groupCopies: boolean
}

export type StageDraft = {
  name: string
  width: number
  height: number
  rotation: number
  fill: string
  stroke: string
  strokeWidth: number
  showLabel: boolean
  labelSize: number
  grid: GridSpec
  groupCopies: boolean
}

export type TableDraft = {
  spec: SeatSpec
  /** Copies are named "<prefix> <number>", row by row. */
  prefix: string
  start: number
  /** Order the new tables are numbered in. */
  order: TableOrder
  grid: GridSpec
  groupCopies: boolean
}

export function singleGrid(): GridSpec {
  return { rows: 1, columns: 1, gapX: 60, gapY: 60, segmentsX: 1, segmentsY: 1, aisleX: 160, aisleY: 160 }
}

/** Shared "how many, in what grid" controls used by every Add dialog. */
function GridFields({
  grid,
  groupCopies,
  noun,
  onChange,
  onGroup,
}: {
  grid: GridSpec
  groupCopies: boolean
  noun: string
  onChange: (grid: GridSpec) => void
  onGroup: (value: boolean) => void
}) {
  const total = gridCount(grid)
  const sx = grid.segmentsX ?? 1
  const sy = grid.segmentsY ?? 1
  return (
    <div className="mt-6 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">How many</h3>
      <p className="mt-1 text-sm text-muted">Place several at once in rows and columns. Gaps are the clear space between neighbours.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <NumberField label="Rows" value={grid.rows} min={1} max={30} onChange={(value) => value !== null && onChange({ ...grid, rows: value })} />
        <NumberField label="Columns" value={grid.columns} min={1} max={30} onChange={(value) => value !== null && onChange({ ...grid, columns: value })} />
        <NumberField label="Gap between columns" value={grid.gapX} min={0} max={2000} disabled={grid.columns < 2} onChange={(value) => value !== null && onChange({ ...grid, gapX: value })} />
        <NumberField label="Gap between rows" value={grid.gapY} min={0} max={2000} disabled={grid.rows < 2} onChange={(value) => value !== null && onChange({ ...grid, gapY: value })} />
      </div>
      <h4 className="mt-4 text-sm font-medium">Segments</h4>
      <p className="mt-1 text-sm text-muted">Repeat that whole block with aisles in between — e.g. 2 across for a centre aisle.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <NumberField label="Segments across" value={sx} min={1} max={10} onChange={(value) => value !== null && onChange({ ...grid, segmentsX: value })} />
        <NumberField label="Segments down" value={sy} min={1} max={10} onChange={(value) => value !== null && onChange({ ...grid, segmentsY: value })} />
        <NumberField label="Aisle between segments (across)" value={grid.aisleX ?? 160} min={0} max={3000} disabled={sx < 2} onChange={(value) => value !== null && onChange({ ...grid, aisleX: value })} />
        <NumberField label="Aisle between segments (down)" value={grid.aisleY ?? 160} min={0} max={3000} disabled={sy < 2} onChange={(value) => value !== null && onChange({ ...grid, aisleY: value })} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted tabular-nums">
          {grid.rows} × {grid.columns}
          {sx * sy > 1 ? ` × ${sx * sy} segments` : ''} = {total} {total === 1 ? noun : `${noun}s`}
        </span>
        {total > 1 ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={groupCopies} onChange={(event) => onGroup(event.target.checked)} />
            Group them so they move together
          </label>
        ) : null}
      </div>
    </div>
  )
}

export function TableDialog({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean
  initial: TableDraft
  onClose: () => void
  onSubmit: (draft: TableDraft) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const initialRef = useRef(initial)
  initialRef.current = initial
  const [draft, setDraft] = useState(initial)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setDraft(initialRef.current)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const spec = draft.spec
  const kind = spec.kind
  const error =
    validateGrid(draft.grid) ??
    (spec.chairs < 0 || spec.chairs > 80 ? 'Chairs must be between 0 and 80.' : null) ??
    (gridCount(draft.grid) * spec.chairs > 2000 ? 'That is more than 2000 chairs. Use fewer tables or chairs.' : null)
  const built = useMemo(() => buildArrangement({ ...spec, rows: 1, columns: 1 }), [spec])
  const size = footprint(built)
  const total = gridCount(draft.grid)

  function patchSpec(next: Partial<SeatSpec>) {
    setDraft((current) => ({ ...current, spec: { ...current.spec, ...next } }))
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(56rem,calc(100vw-2rem))]"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        className="grid max-h-[min(44rem,calc(100vh-2rem))] gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_17rem]"
        onSubmit={(event) => {
          event.preventDefault()
          if (error) return
          onSubmit(draft)
        }}
      >
        <div>
          <h2 id={titleId} className="text-base font-semibold">
            Add {kindLabel[kind].toLowerCase()}s
          </h2>
          <p className="mt-1 text-sm text-muted">Set up one table, then choose how many rows and columns of them to place.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <NumberField label="Chairs per table" value={spec.chairs} min={kind === 'ushape' ? 3 : 1} max={80} onChange={(value) => value !== null && patchSpec({ chairs: value })} />
            <NumberField
              label={kind === 'round' || kind === 'crescent' ? 'Table diameter' : 'Table width'}
              value={spec.tableWidth}
              min={72}
              max={800}
              onChange={(value) => value !== null && patchSpec({ tableWidth: value, tableHeight: kind === 'square' ? value : spec.tableHeight })}
            />
            {kind === 'rect' || kind === 'oval' || kind === 'ushape' ? (
              <NumberField label="Table depth" value={spec.tableHeight} min={72} max={800} onChange={(value) => value !== null && patchSpec({ tableHeight: value })} />
            ) : null}
            <NumberField label="Space between chairs" value={spec.chairGap} min={0} max={80} onChange={(value) => value !== null && patchSpec({ chairGap: value })} />
            {kind === 'rect' ? (
              <SelectBox
                label="Chairs on"
                value={spec.distribution}
                onChange={(value) => patchSpec({ distribution: value as Distribution })}
                options={[
                  ['long', 'Long sides only'],
                  ['all', 'All four sides'],
                ]}
              />
            ) : null}
            {kind === 'round' || kind === 'oval' ? (
              <SelectBox
                label="Chair spacing"
                value={spec.opening}
                onChange={(value) => patchSpec({ opening: value as ChairOpening })}
                options={[
                  ['even', 'Even all round'],
                  ['mid', 'Open side (facing the stage)'],
                  ['uneven', 'Paired'],
                ]}
              />
            ) : null}
            <TextField label="Name" value={draft.prefix} onChange={(event) => setDraft({ ...draft, prefix: event.target.value.slice(0, 24) })} />
            <NumberField label="First number" value={draft.start} min={0} max={9999} onChange={(value) => value !== null && setDraft({ ...draft, start: value })} />
            <SelectBox
              label="Number tables"
              value={draft.order}
              onChange={(value) => setDraft({ ...draft, order: value as TableOrder })}
              options={[
                ['rows', 'Left → right, then down'],
                ['rows-rtl', 'Right → left, then down'],
                ['snake', 'Snake (→ then ←)'],
                ['snake-rtl', 'Snake (← then →)'],
                ['columns', 'Top → bottom, then right'],
                ['columns-btt', 'Bottom → top, then right'],
              ]}
            />
          </div>
          <GridFields
            grid={draft.grid}
            groupCopies={draft.groupCopies}
            noun="table"
            onChange={(grid) => setDraft({ ...draft, grid })}
            onGroup={(groupCopies) => setDraft({ ...draft, groupCopies })}
          />
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-sm text-muted">Total</p>
            <p className="text-3xl font-semibold tabular-nums">{total * built.seats.length}</p>
            <p className="text-xs text-muted tabular-nums">
              chairs · {total} {total === 1 ? 'table' : 'tables'} × {built.seats.length}
            </p>
            <GridPreview grid={draft.grid} size={size} kind={kind} built={built} />
            <p className="mt-2 truncate text-xs text-muted">
              {(draft.prefix.trim() || 'Table') + ' ' + draft.start}
              {total > 1 ? ` … ${(draft.prefix.trim() || 'Table') + ' ' + (draft.start + total - 1)}` : ''}
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="mt-auto flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={Boolean(error)}>
              {total === 1 ? 'Add table' : `Add ${total} tables`}
            </Button>
          </div>
        </div>
      </form>
    </dialog>
  )
}

/** Small top-down sketch of the whole grid so rows × columns can be checked before placing. */
function GridPreview({
  grid,
  size,
  kind,
  built,
}: {
  grid: GridSpec
  size: { width: number; height: number; cx: number; cy: number }
  kind: TableKind | 'block' | 'stage'
  built?: { tableWidth: number; tableHeight: number; seats: { x: number; y: number }[] }
}) {
  if (validateGrid(grid)) return null
  const centers = gridCenters(grid, size, 0, 0)
  const pad = 20
  const span = gridSpan(grid, size)
  const width = span.width + pad * 2
  const height = span.height + pad * 2
  const chairs = built && built.seats.length * centers.length <= 1200
  return (
    <svg viewBox={`${-width / 2} ${-height / 2} ${width} ${height}`} className="mt-3 h-44 w-full" role="img" aria-label="Layout preview">
      {centers.map((center, index) => {
        const tw = built?.tableWidth ?? size.width
        const th = built?.tableHeight ?? size.height
        return (
          <g key={index} transform={`translate(${center.x} ${center.y})`}>
            {kind === 'round' ? (
              <circle r={tw / 2} fill="#E8D9C4" stroke="#9E5A58" strokeWidth={3} />
            ) : kind === 'oval' ? (
              <ellipse rx={tw / 2} ry={th / 2} fill="#E8D9C4" stroke="#9E5A58" strokeWidth={3} />
            ) : kind === 'crescent' ? (
              <path d={`M ${-tw / 2} 0 A ${tw / 2} ${tw / 2} 0 0 1 ${tw / 2} 0 Z`} transform="scale(1 -1)" fill="#E8D9C4" stroke="#9E5A58" strokeWidth={3} />
            ) : kind === 'block' ? null : (
              <rect
                x={-tw / 2}
                y={-th / 2}
                width={tw}
                height={th}
                rx={6}
                fill={kind === 'stage' ? '#C8BBA8' : '#E8D9C4'}
                stroke={kind === 'stage' ? '#3E4A46' : '#9E5A58'}
                strokeWidth={3}
              />
            )}
            {chairs && built
              ? built.seats.map((seat, seatIndex) => (
                  <rect key={seatIndex} x={seat.x - 15} y={seat.y - 15} width={30} height={30} rx={6} fill="#3A5170" />
                ))
              : null}
          </g>
        )
      })}
    </svg>
  )
}

export function BlockDialog({
  open,
  mode,
  initial,
  existingSeats,
  onClose,
  onSubmit,
}: {
  open: boolean
  mode: 'create' | 'edit'
  initial: BlockDraft
  existingSeats: Seat[]
  onClose: () => void
  onSubmit: (draft: BlockDraft) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const initialRef = useRef(initial)
  initialRef.current = initial
  const [draft, setDraft] = useState(initial)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setDraft(initialRef.current)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const error = validateBlock(draft.block, draft.chairSize) ?? (mode === 'create' ? validateGrid(draft.grid) : null)
  const copies = mode === 'create' ? gridCount(draft.grid) : 1
  const total = blockChairCount(draft.block) * copies
  const dropping = error ? 0 : occupiedBeyond(existingSeats, blockChairCount(draft.block))
  const preview = useMemo(() => (error ? null : buildBlock(draft.block, draft.chairSize)), [draft.block, draft.chairSize, error])

  function patch(block: Partial<BlockSpec>) {
    setDraft((current) => ({ ...current, block: { ...current.block, ...block } }))
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(56rem,calc(100vw-2rem))]"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        className="grid max-h-[min(40rem,calc(100vh-2rem))] gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_16rem]"
        onSubmit={(event) => {
          event.preventDefault()
          if (error) return
          onSubmit(draft)
        }}
      >
        <div>
          <h2 id={titleId} className="text-base font-semibold">
            {mode === 'create' ? 'Create seating arrangement' : 'Edit seating arrangement'}
          </h2>
          <p className="mt-1 text-sm text-muted">Chairs are placed where you clicked. You can still move, rotate, or delete each one afterwards.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TextField label="Arrangement name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            <NumberField label="Chair size" value={draft.chairSize} min={MIN_CHAIR_SIZE} max={MAX_CHAIR_SIZE} onChange={(value) => value !== null && setDraft({ ...draft, chairSize: value })} />
            <NumberField label="Rows per segment" value={draft.block.rows} min={1} max={40} onChange={(value) => value !== null && patch({ rows: value })} />
            <NumberField label="Chairs per row" value={draft.block.columns} min={1} max={40} onChange={(value) => value !== null && patch({ columns: value })} />
            <NumberField label="Segments" value={draft.block.segments} min={1} max={20} onChange={(value) => value !== null && patch({ segments: value })} />
            <NumberField label="Initial rotation" value={draft.rotation} min={0} max={359} hint="Degrees, clockwise." onChange={(value) => value !== null && setDraft({ ...draft, rotation: value })} />
            <NumberField label="Horizontal chair gap" value={draft.block.chairGap} min={0} max={400} onChange={(value) => value !== null && patch({ chairGap: value })} />
            <NumberField label="Vertical row gap" value={draft.block.rowGap} min={0} max={400} onChange={(value) => value !== null && patch({ rowGap: value })} />
            <NumberField label="Horizontal segment distance" value={draft.block.segmentGapX} min={0} max={2000} onChange={(value) => value !== null && patch({ segmentGapX: value })} />
            <NumberField label="Vertical segment distance" value={draft.block.segmentGapY} min={0} max={2000} onChange={(value) => value !== null && patch({ segmentGapY: value })} />
            <NumberField label="Chair to segment gap" value={draft.block.chairEdgeGap} min={0} max={400} hint="Extra space between a chair and the next segment." onChange={(value) => value !== null && patch({ chairEdgeGap: value })} />
            <NumberField label="Outer margin" value={draft.block.margin} min={0} max={200} onChange={(value) => value !== null && patch({ margin: value })} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Direction</span>
              <select
                aria-label="Segment direction"
                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                value={draft.block.orientation}
                onChange={(event) => patch({ orientation: event.target.value as BlockOrientation })}
              >
                <option value="horizontal">Segments side by side</option>
                <option value="vertical">Segments stacked</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium">Alignment</span>
              <select
                aria-label="Arrangement alignment"
                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                value={draft.block.align}
                onChange={(event) => patch({ align: event.target.value as BlockAlign })}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
          <h3 className="mt-6 border-t border-border pt-4 text-sm font-semibold">Rows</h3>
          <p className="mt-1 text-sm text-muted">
            Every line of chairs is its own row. Side-by-side segments share row names across the aisle; stacked segments carry on counting.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <SelectBox
              label="Row names"
              value={draft.block.rowLabel}
              onChange={(value) => patch({ rowLabel: value as RowLabelStyle })}
              options={[
                ['number', 'Row 1, Row 2, Row 3'],
                ['letter', 'Row A, Row B, Row C'],
              ]}
            />
            <NumberField
              label={draft.block.rowLabel === 'letter' ? 'First row (1 = A)' : 'First row number'}
              value={draft.block.rowStart}
              min={1}
              max={999}
              onChange={(value) => value !== null && patch({ rowStart: value })}
            />
            <SelectBox
              label="Row 1 is the"
              value={draft.block.frontRow}
              onChange={(value) => patch({ frontRow: value as FrontRow })}
              options={[
                ['top', 'Top line (nearest the stage above)'],
                ['bottom', 'Bottom line (nearest the stage below)'],
              ]}
            />
            <SelectBox
              label="Show row names"
              value={draft.block.rowLabelSide}
              onChange={(value) => patch({ rowLabelSide: value as RowLabelSide })}
              options={[
                ['left', 'Left of each row'],
                ['right', 'Right of each row'],
                ['both', 'Both sides'],
                ['none', 'Hidden'],
              ]}
            />
          </div>
          <h3 className="mt-6 border-t border-border pt-4 text-sm font-semibold">Seat numbers</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <SelectBox
              label="Numbering"
              value={draft.block.numbering}
              onChange={(value) => patch({ numbering: value as SeatNumbering })}
              options={[
                ['perRow', 'Restart in every row (Row 2 · Seat 1)'],
                ['continuous', 'One running count across rows'],
              ]}
            />
            <NumberField label="Starting number" value={draft.block.start} min={0} max={9999} onChange={(value) => value !== null && patch({ start: value })} />
            <TextField label="Seat prefix" hint="Optional, e.g. A → A1, A2" value={draft.block.prefix} onChange={(event) => patch({ prefix: event.target.value.slice(0, 12) })} />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.block.reverse} onChange={(event) => patch({ reverse: event.target.checked })} />
              Number right to left
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.block.perSegment} onChange={(event) => patch({ perSegment: event.target.checked })} />
              Restart numbering in each segment
            </label>
          </div>
          {mode === 'create' ? (
            <GridFields
              grid={draft.grid}
              groupCopies={draft.groupCopies}
              noun="section"
              onChange={(grid) => setDraft({ ...draft, grid })}
              onGroup={(groupCopies) => setDraft({ ...draft, groupCopies })}
            />
          ) : null}
          <p className="mt-3 text-sm text-muted">
            Up to {MAX_BLOCK_CHAIRS} chairs per section.
            {mode === 'create' && draft.grid.rows > 1 ? ' Sections further back carry on the row names (Row 5, Row 6…).' : ''}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-background p-3">
            <p className="text-sm text-muted">Total chairs</p>
            <p className="text-3xl font-semibold tabular-nums">{Number.isFinite(total) ? total : '—'}</p>
            <p className="mt-1 text-xs text-muted tabular-nums">
              {draft.block.rows} {draft.block.rows === 1 ? 'row' : 'rows'} × {draft.block.columns} chairs
              {draft.block.segments > 1 ? ` × ${draft.block.segments} segments` : ''}
              {copies > 1 ? ` × ${copies} sections` : ''}
            </p>
            {copies > 1 && preview ? (
              <GridPreview grid={draft.grid} size={footprint(preview, draft.chairSize)} kind="block" built={preview} />
            ) : null}
            {preview ? (
              <>
                <BlockPreview seats={preview.seats} chairSize={draft.chairSize} showRows={draft.block.rowLabelSide !== 'none'} />
                <RowSummary seats={preview.seats} />
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">The preview appears when the values are valid.</p>
            )}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          {dropping > 0 ? (
            <p role="alert" className="text-sm text-danger">
              This removes {dropping} occupied {dropping === 1 ? 'seat' : 'seats'}. Those guests stay on the guest list, and their invitations and check-in codes stay.
            </p>
          ) : null}
          <div className="mt-auto flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={Boolean(error)}>
              {mode === 'create' ? (copies > 1 ? `Create ${copies} sections` : 'Create section') : dropping > 0 ? 'Remove occupied seats and update' : 'Update arrangement'}
            </Button>
          </div>
        </div>
      </form>
    </dialog>
  )
}

type PreviewSeat = { x: number; y: number; label: string; row?: string | null }

function rowLines(seats: PreviewSeat[]) {
  const lines = new Map<string, { minX: number; y: number; count: number; labels: string[] }>()
  for (const seat of seats) {
    if (!seat.row) continue
    const line = lines.get(seat.row)
    if (line) {
      line.minX = Math.min(line.minX, seat.x)
      line.y = Math.min(line.y, seat.y)
      line.count += 1
      line.labels.push(seat.label)
    } else {
      lines.set(seat.row, { minX: seat.x, y: seat.y, count: 1, labels: [seat.label] })
    }
  }
  return lines
}

function BlockPreview({ seats, chairSize, showRows }: { seats: PreviewSeat[]; chairSize: number; showRows: boolean }) {
  const gutter = showRows ? chairSize * 2.2 : 0
  const minX = Math.min(...seats.map((seat) => seat.x)) - chairSize / 2 - gutter
  const maxX = Math.max(...seats.map((seat) => seat.x)) + chairSize / 2
  const minY = Math.min(...seats.map((seat) => seat.y)) - chairSize / 2
  const maxY = Math.max(...seats.map((seat) => seat.y)) + chairSize / 2
  const width = Math.max(chairSize, maxX - minX)
  const height = Math.max(chairSize, maxY - minY)
  const lines = showRows ? [...rowLines(seats).entries()] : []
  return (
    <svg viewBox={`${minX} ${minY} ${width} ${height}`} className="mt-3 h-44 w-full" role="img" aria-label="Arrangement preview">
      {seats.map((seat, index) => (
        <rect
          key={index}
          x={seat.x - chairSize * 0.32}
          y={seat.y - chairSize * 0.38}
          width={chairSize * 0.64}
          height={chairSize * 0.7}
          rx={4}
          fill="#3A5170"
        />
      ))}
      {lines.map(([name, line]) => (
        <text
          key={name}
          x={line.minX - chairSize * 0.6}
          y={line.y + chairSize * 0.15}
          textAnchor="end"
          fontSize={chairSize * 0.55}
          fontWeight={600}
          fill="currentColor"
          fontFamily="Geist Sans, sans-serif"
        >
          {name.replace(/^Row\s+/, 'R')}
        </text>
      ))}
    </svg>
  )
}

/** First rows of the block, so the planner can check names and numbers before creating it. */
function RowSummary({ seats }: { seats: PreviewSeat[] }) {
  const lines = [...rowLines(seats).entries()]
  if (lines.length === 0) return null
  const shown = lines.slice(0, 4)
  return (
    <ul className="mt-3 space-y-1 text-xs">
      {shown.map(([name, line]) => (
        <li key={name} className="flex justify-between gap-2">
          <span className="font-medium">{name}</span>
          <span className="truncate text-muted tabular-nums">
            {line.count} seats · {line.labels[0]}–{line.labels[line.labels.length - 1]}
          </span>
        </li>
      ))}
      {lines.length > shown.length ? <li className="text-muted">+ {lines.length - shown.length} more rows</li> : null}
    </ul>
  )
}

export function StageDialog({
  open,
  mode,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean
  mode: 'create' | 'edit'
  initial: StageDraft
  onClose: () => void
  onSubmit: (draft: StageDraft) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const initialRef = useRef(initial)
  initialRef.current = initial
  const [draft, setDraft] = useState(initial)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setDraft(initialRef.current)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const error = stageError(draft) ?? (mode === 'create' ? validateGrid(draft.grid) : null)
  const stageCopies = mode === 'create' ? gridCount(draft.grid) : 1

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(32rem,calc(100vw-2rem))]"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        className="max-h-[min(40rem,calc(100vh-2rem))] space-y-3 overflow-y-auto p-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (error) return
          onSubmit({ ...draft, name: draft.name.trim() || 'STAGE' })
        }}
      >
        <h2 id={titleId} className="text-base font-semibold">
          {mode === 'create' ? 'Create stage' : 'Edit stage'}
        </h2>
        <p className="text-sm text-muted">A stage is a platform only. It does not take guests or change the seat count.</p>
        <TextField label="Stage name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Width" value={draft.width} min={80} max={2000} onChange={(value) => value !== null && setDraft({ ...draft, width: value })} />
          <NumberField label="Height" value={draft.height} min={48} max={1200} onChange={(value) => value !== null && setDraft({ ...draft, height: value })} />
          <NumberField label="Rotation" value={draft.rotation} min={0} max={359} onChange={(value) => value !== null && setDraft({ ...draft, rotation: value })} />
          <NumberField label="Border thickness" value={draft.strokeWidth} min={1} max={16} onChange={(value) => value !== null && setDraft({ ...draft, strokeWidth: value })} />
          <NumberField label="Label size" value={draft.labelSize} min={8} max={72} disabled={!draft.showLabel} onChange={(value) => value !== null && setDraft({ ...draft, labelSize: value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <ColorSwatchField label="Fill" value={draft.fill} onChange={(fill) => setDraft({ ...draft, fill })} />
          <ColorSwatchField label="Border" value={draft.stroke} onChange={(stroke) => setDraft({ ...draft, stroke })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.showLabel} onChange={(event) => setDraft({ ...draft, showLabel: event.target.checked })} />
          Show label
        </label>
        <StagePreview draft={draft} />
        {mode === 'create' ? (
          <GridFields
            grid={draft.grid}
            groupCopies={draft.groupCopies}
            noun="area"
            onChange={(grid) => setDraft({ ...draft, grid })}
            onGroup={(groupCopies) => setDraft({ ...draft, groupCopies })}
          />
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={Boolean(error)}>
            {mode === 'create' ? (stageCopies > 1 ? `Create ${stageCopies}` : 'Create') : 'Update'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}

function stageError(draft: StageDraft) {
  if (!Number.isFinite(draft.width) || draft.width < 80) return 'Width must be at least 80.'
  if (!Number.isFinite(draft.height) || draft.height < 48) return 'Height must be at least 48.'
  if (draft.strokeWidth < 1) return 'Border thickness cannot be negative.'
  return null
}

function StagePreview({ draft }: { draft: StageDraft }) {
  const fill = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(draft.fill) ? draft.fill : defaultStageFill
  const stroke = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(draft.stroke) ? draft.stroke : defaultStageStroke
  return (
    <svg viewBox="0 0 360 120" className="h-24 w-full rounded-md border border-border bg-background" role="img" aria-label="Stage preview">
      <g transform={`rotate(${draft.rotation} 180 60)`}>
        <rect x="40" y="28" width="280" height="64" rx="4" fill={fill} stroke={stroke} strokeWidth={Math.min(8, draft.strokeWidth)} />
        <rect x="40" y="80" width="280" height="12" fill="#0F5C4C" />
        {draft.showLabel ? (
          <text x="180" y="64" textAnchor="middle" fill="#1C1D1A" fontSize={Math.min(28, draft.labelSize)} fontFamily="Geist Sans, sans-serif">
            {draft.name.trim() || 'STAGE'}
          </text>
        ) : null}
      </g>
    </svg>
  )
}
