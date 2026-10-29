import { Eye, EyeOff, GripVertical, Lock, Unlock } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type LayerRow = {
  id: string
  /** Name shown in the list (the element's own name, or its kind). */
  label: string
  icon?: ReactNode
  hidden?: boolean
  locked?: boolean
}

/**
 * Layers, top first: click to select, drag to reorder, eye to hide, lock to stop accidental moves,
 * double-click to rename. `rows` are given bottom → top (drawing order).
 */
export function LayersPanel({
  rows,
  selectedId,
  onSelect,
  onReorder,
  onToggleHidden,
  onToggleLocked,
  onRename,
  empty = 'Nothing on the design yet.',
}: {
  rows: LayerRow[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** New drawing order, bottom → top. */
  onReorder: (ids: string[]) => void
  onToggleHidden?: (id: string) => void
  onToggleLocked?: (id: string) => void
  onRename?: (id: string, name: string) => void
  empty?: string
}) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const topFirst = [...rows].reverse()

  function drop(targetId: string) {
    if (!dragging || dragging === targetId) return
    const order = topFirst.map((row) => row.id).filter((id) => id !== dragging)
    const at = order.indexOf(targetId)
    order.splice(at, 0, dragging)
    onReorder([...order].reverse())
  }

  if (rows.length === 0) return <p className="px-1 py-2 text-xs text-muted">{empty}</p>

  return (
    <ul className="grid gap-0.5" aria-label="Layers">
      {topFirst.map((row) => (
        <li
          key={row.id}
          draggable={renaming !== row.id}
          onDragStart={(event) => {
            setDragging(row.id)
            event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setOver(row.id)
          }}
          onDragLeave={() => setOver((current) => (current === row.id ? null : current))}
          onDrop={(event) => {
            event.preventDefault()
            drop(row.id)
            setDragging(null)
            setOver(null)
          }}
          onDragEnd={() => {
            setDragging(null)
            setOver(null)
          }}
          className={cn(
            'group flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs',
            row.id === selectedId ? 'bg-accent-soft text-accent' : 'hover:bg-hover',
            over === row.id && dragging && dragging !== row.id && 'outline outline-1 outline-accent',
            row.hidden && 'opacity-50',
          )}
        >
          <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted opacity-0 group-hover:opacity-100" aria-hidden="true" />
          <span className="shrink-0 [&_svg]:size-3.5">{row.icon}</span>
          {renaming === row.id && onRename ? (
            <input
              autoFocus
              defaultValue={row.label}
              aria-label="Layer name"
              className="h-6 min-w-0 flex-1 rounded-sm border border-border bg-background px-1 text-xs text-foreground"
              onBlur={(event) => {
                onRename(row.id, event.target.value.trim())
                setRenaming(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
                if (event.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => onSelect(row.id)}
              onDoubleClick={() => onRename && setRenaming(row.id)}
              title={onRename ? 'Double-click to rename' : undefined}
            >
              {row.label}
            </button>
          )}
          {onToggleLocked ? (
            <button
              type="button"
              aria-label={row.locked ? `Unlock ${row.label}` : `Lock ${row.label}`}
              title={row.locked ? 'Locked — click to unlock' : 'Lock'}
              className={cn('inline-flex size-6 items-center justify-center rounded-sm hover:bg-background', row.locked ? 'text-foreground' : 'text-muted opacity-0 group-hover:opacity-100')}
              onClick={() => onToggleLocked(row.id)}
            >
              {row.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
            </button>
          ) : null}
          {onToggleHidden ? (
            <button
              type="button"
              aria-label={row.hidden ? `Show ${row.label}` : `Hide ${row.label}`}
              title={row.hidden ? 'Hidden — click to show' : 'Hide'}
              className={cn('inline-flex size-6 items-center justify-center rounded-sm hover:bg-background', row.hidden ? 'text-foreground' : 'text-muted opacity-0 group-hover:opacity-100')}
              onClick={() => onToggleHidden(row.id)}
            >
              {row.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
