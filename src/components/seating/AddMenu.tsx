import { ArrowLeft, Armchair, ChevronDown, Circle, RectangleHorizontal, SlidersHorizontal, Square, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { kindDefaults, kindLabel, type TableKind } from '@/seating/model'
import { cn } from '@/lib/cn'

type Panel = 'main' | 'shapes'

const moreShapes: TableKind[] = ['square', 'oval', 'crescent', 'ushape']

const shapeHint: Partial<Record<TableKind, string>> = {
  square: 'Chairs on all four sides',
  oval: 'Long banquet oval',
  crescent: 'Half-round, open side facing the stage',
  ushape: 'Head table wrapped on three sides',
}

/** Floating "Add to plan" popover anchored to the canvas toolbar. */
export function AddMenu({
  open,
  onClose,
  onQuickAdd,
  onCustomize,
}: {
  open: boolean
  onClose: () => void
  onQuickAdd: (kind: TableKind) => void
  onCustomize: (kind: TableKind) => void
}) {
  const [panel, setPanel] = useState<Panel>('main')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setPanel('main')
      return
    }
    function onPointer(event: PointerEvent) {
      const host = ref.current
      if (!host || host.contains(event.target as Node)) return
      if ((event.target as HTMLElement).closest('[data-add-trigger]')) return
      onClose()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  function run(action: () => void) {
    action()
    onClose()
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Add to plan"
      className="absolute left-3 top-14 z-30 w-[22rem] max-w-[calc(100%-1.5rem)] rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow)]"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {panel === 'main' ? (
        <>
          <div className="flex items-start justify-between gap-3 px-1">
            <div>
              <p className="text-sm font-semibold">Add to plan</p>
              <p className="text-xs text-muted">Every item can be added as a grid of rows × columns.</p>
            </div>
            <CloseButton onClick={onClose} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <TableTile kind="round" icon={<Circle className="size-5" />} onAdd={() => run(() => onQuickAdd('round'))} onCustomize={() => run(() => onCustomize('round'))} />
            <TableTile kind="rect" icon={<RectangleHorizontal className="size-5" />} onAdd={() => run(() => onQuickAdd('rect'))} onCustomize={() => run(() => onCustomize('rect'))} />
          </div>
          <div className="mt-3 grid gap-1">
            <MenuRow
              icon={<Armchair className="size-4" />}
              title="Seat rows"
              hint="Theatre or ceremony rows, in blocks and segments"
              onClick={() => run(() => onQuickAdd('row'))}
            />
            <MenuRow
              icon={<Square className="size-4" />}
              title="More table shapes"
              hint="Square, oval, half-round and U-shape"
              chevron
              onClick={() => setPanel('shapes')}
            />
            <MenuRow
              icon={<RectangleHorizontal className="size-4" />}
              title="Stage & areas"
              hint="Stage, dance floor, bar or any labelled zone"
              onClick={() => run(() => onQuickAdd('stage'))}
            />
          </div>
          <p className="mt-3 border-t border-border px-1 pt-2 text-xs text-muted">Select anything on the floor to edit it.</p>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="flex h-8 items-center gap-2 rounded-md px-1 text-sm font-semibold hover:bg-hover"
              onClick={() => setPanel('main')}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              More table shapes
            </button>
            <CloseButton onClick={onClose} />
          </div>
          <div className="mt-2 grid gap-1">
            {moreShapes.map((kind) => (
              <div key={kind} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-hover">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
                  {kind === 'square' || kind === 'ushape' ? <Square className="size-4" /> : <Circle className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{kindLabel[kind]}</p>
                  <p className="truncate text-xs text-muted">
                    {kindDefaults[kind].chairs} seats · {shapeHint[kind]}
                  </p>
                </div>
                <button
                  type="button"
                  title="Add one now"
                  className="h-8 rounded-md px-2 text-xs text-muted hover:bg-surface hover:text-foreground"
                  onClick={() => run(() => onQuickAdd(kind))}
                >
                  +1
                </button>
                <button
                  type="button"
                  title="Choose rows, columns and seats"
                  className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:bg-accent-soft"
                  onClick={() => run(() => onCustomize(kind))}
                >
                  <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                  Add…
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TableTile({ kind, icon, onAdd, onCustomize }: { kind: TableKind; icon: ReactNode; onAdd: () => void; onCustomize: () => void }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border">
      <button type="button" className="flex flex-col items-start gap-2 p-3 text-left hover:bg-hover" onClick={onCustomize}>
        <span className="text-accent">{icon}</span>
        <span className="text-sm font-medium">{kindLabel[kind]}</span>
        <span className="text-xs text-muted">Rows × columns, seats, size</span>
      </button>
      <button
        type="button"
        className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-xs text-muted hover:bg-hover hover:text-foreground"
        onClick={onAdd}
      >
        <SlidersHorizontal className="size-3.5" aria-hidden="true" />
        Add one now ({kindDefaults[kind].chairs} seats)
      </button>
    </div>
  )
}

function MenuRow({ icon, title, hint, chevron, onClick }: { icon: ReactNode; title: string; hint: string; chevron?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover" onClick={onClick}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
      <ChevronDown className={cn('size-4 shrink-0 -rotate-90 text-muted', !chevron && 'opacity-60')} aria-hidden="true" />
    </button>
  )
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Close" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground" onClick={onClick}>
      <X className="size-4" />
    </button>
  )
}
