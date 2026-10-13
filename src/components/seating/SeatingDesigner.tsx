import type { ReactNode } from 'react'
import {
  Armchair,
  Circle,
  Copy,
  Hand,
  MousePointer2,
  Redo2,
  Square,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogoMark } from '@/components/brand/Logo'
import { FloorStage, readFloorColors, type FloorColors } from '@/components/seating/FloorStage'
import { Button, buttonClassName } from '@/components/ui/Button'
import { NumberField } from '@/components/ui/NumberField'
import { TextField } from '@/components/ui/TextField'
import { buildArrangement, gridPitch, nextArrangementName, snapValue } from '@/seating/geometry'
import {
  activeLayout,
  findSeat,
  kindDefaults,
  kindLabel,
  mapLayout,
  seatedGuestIds,
  specOf,
  tableKinds,
  type Arrangement,
  type ChairOpening,
  type Distribution,
  type SeatingDesign,
  type SeatSpec,
  type TableKind,
} from '@/seating/model'
import type { Guest } from '@/api/guestApi'
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
} as const

export function SeatingDesigner({
  eventId,
  eventName,
  guests,
  design,
  dirty,
  saving,
  onChange,
  onSave,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  eventId: string
  eventName: string
  guests: Guest[]
  design: SeatingDesign
  dirty: boolean
  saving: boolean
  onChange: (design: SeatingDesign) => void
  onSave: () => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  const [tool, setTool] = useState<Tool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null)
  const [spec, setSpec] = useState<SeatSpec>(kindDefaults.round)
  const [query, setQuery] = useState('')
  const [guestFilter, setGuestFilter] = useState<'all' | 'seated' | 'open'>('all')
  const [toolsOpen, setToolsOpen] = useState(false)
  const [guestsOpen, setGuestsOpen] = useState(false)
  const [colors, setColors] = useState<FloorColors>(() => readFloorColors())
  const [view, setView] = useState({ x: 48, y: 48, scale: 1 })
  const layout = activeLayout(design)
  const selected = layout?.arrangements.find((item) => item.id === selectedId) ?? null
  const selectedSeat = selected?.seats.find((seat) => seat.id === selectedSeatId) ?? null
  const seated = useMemo(() => seatedGuestIds(design), [design])

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
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selected) {
        event.preventDefault()
        duplicate(selected)
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedSeat) clearSeat(selectedSeat.id, selected!.id)
        else if (selected) removeArrangement(selected.id)
      } else if (event.key === 'Escape') {
        setTool('select')
        setSelectedId(null)
        setSelectedSeatId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function patchLayout(recipe: (arrangements: Arrangement[]) => Arrangement[]) {
    if (!layout) return
    onChange(mapLayout(design, layout.id, (current) => ({ ...current, arrangements: recipe(current.arrangements) })))
  }

  function place(x: number, y: number) {
    if (tool === 'select' || tool === 'pan' || !layout) return
    const kind = tool
    const grid = kind === 'row' ? { rows: 1, columns: 1 } : { rows: spec.rows, columns: spec.columns }
    const built = buildArrangement({
      ...spec,
      kind,
      rows: kind === 'row' ? spec.rows : 1,
      columns: kind === 'row' ? spec.columns : 1,
    })
    const pitch = gridPitch(built.tableWidth, built.tableHeight, spec.chairGap)
    const originX = x - ((grid.columns - 1) * pitch.x) / 2
    const originY = y - ((grid.rows - 1) * pitch.y) / 2
    const created: Arrangement[] = []
    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        const seats = buildArrangement({
          ...spec,
          kind,
          rows: kind === 'row' ? spec.rows : 1,
          columns: kind === 'row' ? spec.columns : 1,
        }).seats
        created.push({
          ...spec,
          id: crypto.randomUUID(),
          kind,
          name: nextArrangementName(kind, [...layout.arrangements, ...created]),
          x: snapValue(originX + column * pitch.x, design.grid, design.snap),
          y: snapValue(originY + row * pitch.y, design.grid, design.snap),
          rotation: 0,
          chairs: kind === 'row' ? spec.rows * spec.columns : spec.chairs,
          rows: kind === 'row' ? spec.rows : 1,
          columns: kind === 'row' ? spec.columns : 1,
          tableWidth: built.tableWidth,
          tableHeight: built.tableHeight,
          seats,
        })
      }
    }
    patchLayout((items) => [...items, ...created])
    setSelectedId(created[0]?.id ?? null)
    setSelectedSeatId(null)
    setTool('select')
    setToolsOpen(false)
  }

  function move(arrangementId: string, x: number, y: number, rotation: number) {
    patchLayout((items) =>
      items.map((item) =>
        item.id === arrangementId
          ? {
              ...item,
              x: snapValue(x, design.grid, design.snap),
              y: snapValue(y, design.grid, design.snap),
              rotation: design.snap ? Math.round(rotation / 15) * 15 : rotation,
            }
          : item,
      ),
    )
  }

  function updateSelected() {
    if (!selected) return
    const built = buildArrangement(
      { ...spec, kind: selected.kind, chairs: selected.kind === 'row' ? spec.rows * spec.columns : spec.chairs },
      selected.seats,
    )
    patchLayout((items) =>
      items.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              ...spec,
              kind: item.kind,
              chairs: item.kind === 'row' ? spec.rows * spec.columns : spec.chairs,
              tableWidth: built.tableWidth,
              tableHeight: built.tableHeight,
              seats: built.seats,
            }
          : item,
      ),
    )
  }

  function renumber() {
    if (!selected) return
    const built = buildArrangement(specOf(selected), selected.seats, false)
    patchLayout((items) =>
      items.map((item) => (item.id === selected.id ? { ...item, seats: built.seats } : item)),
    )
  }

  function duplicate(arrangement: Arrangement) {
    const copy: Arrangement = {
      ...arrangement,
      id: crypto.randomUUID(),
      name: nextArrangementName(arrangement.kind, layout?.arrangements ?? []),
      x: arrangement.x + design.grid * 2,
      y: arrangement.y + design.grid * 2,
      seats: arrangement.seats.map((seat) => ({ ...seat, id: crypto.randomUUID(), guestId: null })),
    }
    patchLayout((items) => [...items, copy])
    setSelectedId(copy.id)
    setSelectedSeatId(null)
  }

  function removeArrangement(id: string) {
    patchLayout((items) => items.filter((item) => item.id !== id))
    setSelectedId(null)
    setSelectedSeatId(null)
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
    setSelectedId(arrangementId)
    setSelectedSeatId(seatId)
    setGuestsOpen(false)
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
      layouts: [...design.layouts, { id, name: `Floor ${design.layouts.length + 1}`, arrangements: [] }],
    })
    setSelectedId(null)
    setSelectedSeatId(null)
  }

  const guestName = new Map(guests.map((guest) => [guest.id, guest.name]))
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
              setSelectedId(null)
              setSelectedSeatId(null)
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
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button variant="ghost" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
            <Undo2 className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
            <Redo2 className="size-4" aria-hidden="true" />
          </Button>
          <Button className="whitespace-nowrap" onClick={onSave} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save layout'}
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'z-20 w-72 shrink-0 flex-col border-r border-border bg-surface',
            toolsOpen ? 'absolute inset-y-14 left-0 flex shadow-[var(--shadow)]' : 'hidden',
            'lg:static lg:flex lg:shadow-none',
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex gap-1">
              <ToolButton label="Select" pressed={tool === 'select'} onClick={() => setTool('select')}>
                <MousePointer2 className="size-4" aria-hidden="true" />
              </ToolButton>
              <ToolButton label="Pan" pressed={tool === 'pan'} onClick={() => setTool('pan')}>
                <Hand className="size-4" aria-hidden="true" />
              </ToolButton>
            </div>
            <h2 className="mt-6 text-sm font-medium">Objects</h2>
            <div className="mt-2 grid grid-cols-1 gap-1">
              {tableKinds.map((kind) => {
                const Icon = kindIcon[kind]
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={tool === kind}
                    className={cn(
                      'flex h-9 items-center gap-2 rounded-md px-2 text-left text-sm',
                      tool === kind ? 'bg-selected font-medium text-foreground' : 'text-muted hover:bg-hover hover:text-foreground',
                    )}
                    onClick={() => {
                      setTool(kind)
                      setSpec(kindDefaults[kind])
                      setSelectedId(null)
                      setSelectedSeatId(null)
                    }}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {kindLabel[kind]}
                  </button>
                )
              })}
            </div>
            {selected || (tool !== 'select' && tool !== 'pan') ? (
              <SpecFields
                spec={spec}
                onChange={setSpec}
                showDistribution={(selected?.kind ?? spec.kind) === 'rect'}
                showOpening={(selected?.kind ?? spec.kind) === 'round' || (selected?.kind ?? spec.kind) === 'oval'}
                showGrid={!selected && tool !== 'row'}
              />
            ) : null}
            {tool !== 'select' && tool !== 'pan' ? (
              <p className="mt-3 text-sm text-muted">
                {tool !== 'row' && spec.rows * spec.columns > 1
                  ? `Click the floor to place ${spec.rows} × ${spec.columns} tables.`
                  : `Click the floor to place this ${kindLabel[tool].toLowerCase()}.`}
              </p>
            ) : null}
            {selected ? (
              <div className="mt-6 border-t border-border pt-4">
                <NameField value={selected.name} onCommit={rename} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={updateSelected}>
                    Update seats
                  </Button>
                  <Button variant="secondary" onClick={renumber}>
                    Renumber
                  </Button>
                  <Button variant="ghost" aria-label="Duplicate" onClick={() => duplicate(selected)}>
                    <Copy className="size-4" aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" aria-label="Delete" onClick={() => removeArrangement(selected.id)}>
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                {selectedSeat ? (
                  <div className="mt-4">
                    <p className="text-sm font-medium">Seat {selectedSeat.label}</p>
                    <p className="mt-1 text-sm text-muted">
                      {selectedSeat.guestId ? guestName.get(selectedSeat.guestId) ?? 'Guest' : 'Empty'}
                    </p>
                    {selectedSeat.guestId ? (
                      <Button className="mt-2" variant="secondary" onClick={() => clearSeat(selectedSeat.id, selected.id)}>
                        Clear seat
                      </Button>
                    ) : (
                      <p className="mt-2 text-sm text-muted">Choose a guest, or drag one onto this chair.</p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-muted">Snap</span>
            <button
              type="button"
              aria-pressed={design.snap}
              className={cn(
                'h-8 rounded-md px-2',
                design.snap ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-hover',
              )}
              onClick={() => onChange({ ...design, snap: !design.snap })}
            >
              {design.snap ? 'On' : 'Off'}
            </button>
          </div>
        </aside>
        <div className="relative flex min-w-0 flex-1 flex-col">
          {layout ? (
            <FloorStage
              layout={layout}
              colors={colors}
              grid={design.grid}
              snap={design.snap}
              tool={tool}
              selectedId={selectedId}
              selectedSeatId={selectedSeatId}
              view={view}
              onView={setView}
              onSelect={(arrangementId, seatId) => {
                setSelectedId(arrangementId)
                setSelectedSeatId(seatId)
                if (arrangementId) setTool('select')
              }}
              onMove={move}
              onPlace={place}
              onAssign={assign}
            />
          ) : null}
          <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-4 text-sm text-muted">
            <p className="tabular-nums">
              {layout?.arrangements.length ?? 0} objects · {filled} seated · {Math.max(0, seatCount - filled)} open
            </p>
            <div className="flex items-center gap-2">
              <span className="tabular-nums">{Math.round(view.scale * 100)}%</span>
              <button type="button" className="hover:text-foreground" onClick={() => setView({ x: 48, y: 48, scale: 1 })}>
                Reset
              </button>
              <span>{dirty ? 'Unsaved' : 'Saved'}</span>
            </div>
          </div>
          <div className="absolute bottom-14 left-3 flex gap-2 lg:hidden">
            <Button variant="secondary" onClick={() => { setToolsOpen((open) => !open); setGuestsOpen(false) }}>
              Tools
            </Button>
            <Button variant="secondary" onClick={() => { setGuestsOpen((open) => !open); setToolsOpen(false) }}>
              <Users className="size-4" aria-hidden="true" />
              Guests
            </Button>
          </div>
        </div>
        <aside
          className={cn(
            'z-20 w-80 shrink-0 flex-col border-l border-border bg-surface',
            guestsOpen ? 'absolute inset-y-14 right-0 flex shadow-[var(--shadow)]' : 'hidden',
            'lg:static lg:flex lg:shadow-none',
          )}
        >
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-medium">Guests</h2>
            <div className="mt-3">
              <TextField label="Search guests" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name" />
            </div>
            <div className="mt-3 flex gap-1">
              {(
                [
                  ['all', 'All'],
                  ['open', 'Not seated'],
                  ['seated', 'Seated'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={guestFilter === value}
                  className={cn(
                    'h-8 rounded px-2 text-sm',
                    guestFilter === value ? 'bg-selected font-medium text-foreground' : 'text-muted hover:bg-hover',
                  )}
                  onClick={() => setGuestFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {guests.length === 0 ? (
              <li className="px-4 py-6 text-sm text-muted">
                No guests yet.{' '}
                <Link to={`/events/${eventId}/guests`} className={buttonClassName('ghost')}>
                  Add guests
                </Link>
              </li>
            ) : visibleGuests.length === 0 ? (
              <li className="px-4 py-6 text-sm text-muted">No guests match.</li>
            ) : (
              visibleGuests.map((guest) => {
                const placed = findSeat(design, guest.id)
                return (
                  <li key={guest.id} className="border-b border-border">
                    <button
                      type="button"
                      draggable
                      className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-hover"
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/x-guest', guest.id)
                        event.dataTransfer.effectAllowed = 'copy'
                      }}
                      onClick={() => {
                        if (!selected) return
                        const seat = selectedSeat ?? selected.seats.find((item) => !item.guestId)
                        if (seat) assign(selected.id, seat.id, guest.id)
                      }}
                    >
                      <span className="text-sm font-medium">{guest.name}</span>
                      <span className="text-sm text-muted">
                        {placed ? `${placed.arrangement.name} · ${placed.seat.label}` : guest.guestTypeName ?? 'Not seated'}
                      </span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </aside>
      </div>
    </div>
  )
}

function NameField({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <TextField
      label="Name"
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

function ToolButton({
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
        'inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border text-sm',
        pressed ? 'border-foreground bg-selected font-medium' : 'border-border hover:bg-hover',
      )}
      onClick={onClick}
    >
      {children}
      {label}
    </button>
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
        <NumberField label="Chairs" value={spec.chairs} min={1} max={80} onChange={(value) => value !== null && onChange({ ...spec, chairs: value })} />
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
