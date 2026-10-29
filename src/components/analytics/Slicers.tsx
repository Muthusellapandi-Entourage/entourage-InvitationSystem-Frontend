import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

/** Multi-select slicer (like a Power BI dropdown slicer): checkbox list with counts, search, all / clear. */
export function MultiSlicer({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { value: string; count: number }[]
  selected: string[]
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const shown = options.filter((option) => option.value.toLowerCase().includes(term.trim().toLowerCase()))
  const summary = selected.length === 0 ? 'All' : selected.length === 1 ? selected[0] : `${selected.length} selected`

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        className={cn(
          'flex h-10 min-w-44 items-center justify-between gap-3 rounded-md border bg-surface px-3 text-left text-sm',
          selected.length ? 'border-accent' : 'border-border hover:bg-hover',
        )}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0 truncate">
          <span className="text-muted">{label}: </span>
          <span className={cn('font-medium', selected.length && 'text-accent')}>{summary}</span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute left-0 top-11 z-40 w-72 rounded-md border border-border bg-surface p-2">
          {options.length > 6 ? (
            <input
              autoFocus
              aria-label={`Search ${label.toLowerCase()}`}
              placeholder="Search…"
              className="mb-2 h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
          ) : null}
          <div className="mb-1 flex justify-between px-1 text-xs">
            <button type="button" className="text-accent hover:underline" onClick={() => onChange(options.map((option) => option.value))}>
              Select all
            </button>
            <button type="button" className="text-muted hover:text-foreground" onClick={() => onChange([])}>
              Clear
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {shown.map((option) => {
              const checked = selected.includes(option.value)
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-hover"
                    onClick={() => onChange(checked ? selected.filter((value) => value !== option.value) : [...selected, option.value])}
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-sm border',
                        checked ? 'border-accent bg-accent text-accent-foreground' : 'border-border',
                      )}
                    >
                      {checked ? <Check className="size-3" aria-hidden="true" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{option.value}</span>
                    <span className="text-xs text-muted tabular-nums">{option.count}</span>
                  </button>
                </li>
              )
            })}
            {shown.length === 0 ? <li className="px-2 py-3 text-sm text-muted">Nothing matches.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/** Single-choice slicer as a compact select (All / option A / option B). */
export function ChoiceSlicer<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T | null
  options: { value: T; label: string }[]
  onChange: (value: T | null) => void
}) {
  return (
    <label className={cn('flex h-10 items-center gap-2 rounded-md border bg-surface pl-3 text-sm', value ? 'border-accent' : 'border-border')}>
      <span className="text-muted">{label}:</span>
      <select
        aria-label={label}
        className={cn('h-full rounded-md bg-transparent pr-2 text-sm font-medium focus:outline-none', value && 'text-accent')}
        value={value ?? ''}
        onChange={(event) => onChange((event.target.value || null) as T | null)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
