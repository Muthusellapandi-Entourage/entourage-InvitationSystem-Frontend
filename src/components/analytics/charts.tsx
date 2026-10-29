import { useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/* Tooltip                                                             */
/* ------------------------------------------------------------------ */

type Tip = { x: number; y: number; title: string; lines: { label: string; value: string; swatch?: string }[] }

/** A small hover card that follows the pointer. Shared by every chart. */
export function useTooltip() {
  const [tip, setTip] = useState<Tip | null>(null)
  return {
    show: (event: { clientX: number; clientY: number }, title: string, lines: Tip['lines']) =>
      setTip({ x: event.clientX, y: event.clientY, title, lines }),
    hide: () => setTip(null),
    node: tip ? (
      <div
        role="tooltip"
        className="pointer-events-none fixed z-50 min-w-36 rounded-md border border-border bg-surface px-3 py-2 text-xs"
        style={{
          left: Math.min(tip.x + 14, window.innerWidth - 220),
          top: Math.min(tip.y + 14, window.innerHeight - 120),
        }}
      >
        <p className="mb-1 font-semibold text-foreground">{tip.title}</p>
        {tip.lines.map((line) => (
          <p key={line.label} className="flex items-center justify-between gap-4 tabular-nums">
            <span className="flex items-center gap-1.5 text-muted">
              {line.swatch ? <span className={cn('size-2 rounded-sm', line.swatch)} aria-hidden="true" /> : null}
              {line.label}
            </span>
            <span className="font-medium text-foreground">{line.value}</span>
          </p>
        ))}
      </div>
    ) : null,
  }
}

const additive = (event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => event.ctrlKey || event.metaKey || event.shiftKey

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
  filtered,
  onClear,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** This visual has its own selection: show a clear button. */
  filtered?: boolean
  onClear?: () => void
}) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-md border border-border bg-surface p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {filtered && onClear ? (
            <button type="button" className="rounded-sm px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft" onClick={onClear}>
              Clear selection
            </button>
          ) : null}
          {actions}
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

/** Segmented switch for chart options (Daily / Cumulative, dimensions…). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="flex rounded-md border border-border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={cn(
            'h-7 rounded-sm px-2.5 text-xs font-medium',
            value === option.value ? 'bg-accent-soft text-accent' : 'text-muted hover:text-foreground',
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* KPI card                                                            */
/* ------------------------------------------------------------------ */

export function KpiCard({
  label,
  value,
  detail,
  tone = 'default',
  active,
  progress,
  onClick,
}: {
  label: string
  value: string | number
  detail?: string
  tone?: 'default' | 'accent' | 'danger' | 'warning'
  active?: boolean
  /** 0–100: a thin progress bar under the value. */
  progress?: number
  onClick?: () => void
}) {
  const color = tone === 'accent' ? 'text-accent' : tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-foreground'
  const bar = tone === 'accent' ? 'bg-accent' : tone === 'danger' ? 'bg-danger' : tone === 'warning' ? 'bg-warning' : 'bg-foreground/60'
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={!onClick}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col rounded-md border bg-surface p-4 text-left transition-colors',
        active ? 'border-accent bg-accent-soft/40' : 'border-border',
        onClick ? 'hover:border-accent/60' : 'cursor-default',
      )}
    >
      <span className="truncate text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
      <span className={cn('mt-2 text-2xl font-semibold tabular-nums', color)}>{value}</span>
      {progress !== undefined ? (
        <span className="mt-2 h-1 overflow-hidden rounded-full bg-hover">
          <span className={cn('block h-full rounded-full', bar)} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </span>
      ) : null}
      {detail ? <span className="mt-1.5 truncate text-xs text-muted">{detail}</span> : null}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Donut                                                               */
/* ------------------------------------------------------------------ */

export type Slice = { key: string; label: string; value: number; fill: string; swatch: string }

/** Clickable donut. Selected slices stay solid, the others fade, as in Power BI. */
export function Donut({
  slices,
  selected,
  onSelect,
  centerValue,
  centerLabel,
}: {
  slices: Slice[]
  selected: string[]
  onSelect: (key: string, add: boolean) => void
  centerValue: string
  centerLabel: string
}) {
  const tip = useTooltip()
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const radius = 70
  const stroke = 26
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 200 200" className="size-44 shrink-0" role="img" aria-label="RSVP split">
        <circle cx="100" cy="100" r={radius} fill="none" strokeWidth={stroke} className="stroke-hover" />
        {/* Start the first slice at 12 o'clock. */}
        <g transform="rotate(-90 100 100)">
        {total > 0
          ? slices.map((slice) => {
              if (slice.value === 0) return null
              const length = (slice.value / total) * circumference
              const dash = `${Math.max(0, length - 2)} ${circumference}`
              const node = (
                <circle
                  key={slice.key}
                  cx="100"
                  cy="100"
                  r={radius}
                  fill="none"
                  strokeWidth={stroke}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  className={cn(slice.fill, 'cursor-pointer transition-opacity', selected.length && !selected.includes(slice.key) && 'opacity-25')}
                  onClick={(event) => onSelect(slice.key, additive(event))}
                  onMouseMove={(event) => tip.show(event, slice.label, [{ label: 'Guests', value: `${slice.value} (${Math.round((slice.value / total) * 100)}%)` }])}
                  onMouseLeave={tip.hide}
                />
              )
              offset += length
              return node
            })
          : null}
        </g>
        <text x="100" y="104" textAnchor="middle" className="fill-foreground text-[28px] font-semibold tabular-nums">
          {centerValue}
        </text>
        <text x="100" y="124" textAnchor="middle" className="fill-muted text-[11px]">
          {centerLabel}
        </text>
      </svg>
      <ul className="grid w-full gap-1.5">
        {slices.map((slice) => (
          <li key={slice.key}>
            <button
              type="button"
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-sm hover:bg-hover',
                selected.length && !selected.includes(slice.key) && 'opacity-50',
                selected.includes(slice.key) && 'bg-hover',
              )}
              onClick={(event) => onSelect(slice.key, additive(event))}
            >
              <span className="flex items-center gap-2">
                <span className={cn('size-2.5 rounded-sm', slice.swatch)} aria-hidden="true" />
                {slice.label}
              </span>
              <span className="tabular-nums">
                {slice.value}
                <span className="ml-1.5 text-xs text-muted">{total > 0 ? `${Math.round((slice.value / total) * 100)}%` : ''}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {tip.node}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Funnel                                                              */
/* ------------------------------------------------------------------ */

export function Funnel({
  stages,
  total,
  selected,
  onSelect,
}: {
  stages: { key: string; label: string; value: number }[]
  total: number
  selected: string | null
  onSelect: (key: string) => void
}) {
  const tip = useTooltip()
  return (
    <div className="grid gap-2">
      {stages.map((stage, index) => {
        const previous = index === 0 ? total : stages[index - 1].value
        const width = total > 0 ? Math.max(2, (stage.value / total) * 100) : 0
        const step = previous > 0 ? Math.round((stage.value / previous) * 100) : 0
        const dim = selected !== null && selected !== stage.key
        return (
          <button
            key={stage.key}
            type="button"
            className={cn('group grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-left text-sm', dim && 'opacity-40')}
            onClick={() => onSelect(stage.key)}
            onMouseMove={(event) =>
              tip.show(event, stage.label, [
                { label: 'Guests', value: String(stage.value) },
                { label: 'Of all guests', value: `${total > 0 ? Math.round((stage.value / total) * 100) : 0}%` },
                { label: index === 0 ? 'Of all guests' : `From ${stages[index - 1].label.toLowerCase()}`, value: `${step}%` },
              ])
            }
            onMouseLeave={tip.hide}
          >
            <span className="truncate text-muted group-hover:text-foreground">{stage.label}</span>
            <span className="relative h-7 overflow-hidden rounded-sm bg-hover">
              <span
                className={cn('absolute inset-y-0 left-0 rounded-sm transition-[width] duration-300', selected === stage.key ? 'bg-accent' : 'bg-accent/70 group-hover:bg-accent')}
                style={{ width: `${width}%` }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center text-xs font-semibold text-foreground tabular-nums mix-blend-normal">{stage.value}</span>
            </span>
            <span className="text-right text-xs tabular-nums text-muted">{index === 0 ? `${total > 0 ? Math.round((stage.value / total) * 100) : 0}%` : `→ ${step}%`}</span>
          </button>
        )
      })}
      {tip.node}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Stacked horizontal bars                                             */
/* ------------------------------------------------------------------ */

export type StackRow = { key: string; label: string; segments: { key: string; label: string; value: number; swatch: string }[] }

export function StackedBars({
  rows,
  selected,
  onSelect,
  emptyText = 'No data for this selection.',
}: {
  rows: StackRow[]
  selected: string[]
  onSelect: (key: string, add: boolean) => void
  emptyText?: string
}) {
  const tip = useTooltip()
  const max = Math.max(1, ...rows.map((row) => row.segments.reduce((sum, segment) => sum + segment.value, 0)))
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted">{emptyText}</p>
  return (
    <div className="grid max-h-80 gap-1.5 overflow-y-auto pr-1">
      {rows.map((row) => {
        const total = row.segments.reduce((sum, segment) => sum + segment.value, 0)
        const dim = selected.length > 0 && !selected.includes(row.key)
        return (
          <button
            key={row.key}
            type="button"
            className={cn(
              'grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3 rounded-sm px-1 py-1 text-left text-sm hover:bg-hover',
              dim && 'opacity-40',
              selected.includes(row.key) && 'bg-hover',
            )}
            onClick={(event) => onSelect(row.key, additive(event))}
            onMouseMove={(event) =>
              tip.show(
                event,
                row.label,
                row.segments.map((segment) => ({
                  label: segment.label,
                  value: `${segment.value} (${total > 0 ? Math.round((segment.value / total) * 100) : 0}%)`,
                  swatch: segment.swatch,
                })),
              )
            }
            onMouseLeave={tip.hide}
          >
            <span className="truncate" title={row.label}>
              {row.label}
            </span>
            <span className="flex h-5 overflow-hidden rounded-sm bg-hover" style={{ width: `${(total / max) * 100}%`, minWidth: total ? '4px' : 0 }}>
              {row.segments.map((segment) =>
                segment.value > 0 ? <span key={segment.key} className={cn('h-full', segment.swatch)} style={{ width: `${(segment.value / (total || 1)) * 100}%` }} /> : null,
              )}
            </span>
            <span className="text-right text-xs tabular-nums text-muted">{total}</span>
          </button>
        )
      })}
      {tip.node}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Single bars (ranked list)                                           */
/* ------------------------------------------------------------------ */

export function BarList({
  rows,
  selected,
  onSelect,
  swatch = 'bg-accent',
  emptyText = 'No data for this selection.',
  format = (value: number) => String(value),
}: {
  /** `max` scales this row's bar (e.g. a table's chairs); `display` replaces the number on the right. */
  rows: { key: string; label: string; value: number; max?: number; detail?: string; display?: string }[]
  selected: string[]
  onSelect?: (key: string, add: boolean) => void
  swatch?: string
  emptyText?: string
  format?: (value: number) => string
}) {
  const tip = useTooltip()
  const max = Math.max(1, ...rows.map((row) => row.max ?? row.value))
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted">{emptyText}</p>
  return (
    <div className="grid max-h-80 gap-1.5 overflow-y-auto pr-1">
      {rows.map((row) => {
        const dim = selected.length > 0 && !selected.includes(row.key)
        const scale = row.max ?? max
        return (
          <button
            key={row.key}
            type="button"
            disabled={!onSelect}
            className={cn(
              'grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-3 rounded-sm px-1 py-1 text-left text-sm',
              onSelect ? 'hover:bg-hover' : 'cursor-default',
              dim && 'opacity-40',
              selected.includes(row.key) && 'bg-hover',
            )}
            onClick={(event) => onSelect?.(row.key, additive(event))}
            onMouseMove={(event) => tip.show(event, row.label, [{ label: row.detail ?? 'Guests', value: row.display ?? format(row.value) }])}
            onMouseLeave={tip.hide}
          >
            <span className="truncate" title={row.label}>
              {row.label}
            </span>
            <span className="relative h-5 overflow-hidden rounded-sm bg-hover">
              <span className={cn('absolute inset-y-0 left-0 rounded-sm', swatch)} style={{ width: `${Math.min(100, (row.value / (scale || 1)) * 100)}%` }} />
            </span>
            <span className="text-right text-xs tabular-nums text-muted">{row.display ?? format(row.value)}</span>
          </button>
        )
      })}
      {tip.node}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Time series (lines) with drag-to-select range                       */
/* ------------------------------------------------------------------ */

/** stroke / swatch / dot are full Tailwind class names (e.g. stroke-accent, bg-accent, fill-accent). */
export type Series = { key: string; label: string; values: number[]; stroke: string; swatch: string; dot: string }

const W = 720
const H = 240
const PAD = { left: 36, right: 12, top: 12, bottom: 28 }

export function TimeSeries({
  labels,
  series,
  range,
  onRange,
}: {
  /** One label per point (x axis). */
  labels: string[]
  series: Series[]
  /** Selected index range, inclusive. */
  range: [number, number] | null
  onRange: (range: [number, number] | null) => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null)
  const tip = useTooltip()
  const count = labels.length
  if (count === 0) return <p className="py-10 text-center text-sm text-muted">No activity yet. Invitations, emails and replies appear here day by day.</p>

  const max = Math.max(1, ...series.flatMap((item) => item.values))
  const niceMax = niceCeil(max)
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (index: number) => PAD.left + (count === 1 ? plotW / 2 : (index / (count - 1)) * plotW)
  const y = (value: number) => PAD.top + plotH - (value / niceMax) * plotH
  const indexAt = (event: ReactMouseEvent) => {
    const box = svg.current?.getBoundingClientRect()
    if (!box) return 0
    const px = ((event.clientX - box.left) / box.width) * W
    const ratio = (px - PAD.left) / plotW
    return Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))))
  }
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) => Math.round(niceMax * step))
  const labelEvery = Math.max(1, Math.ceil(count / 8))
  const band = drag ? [Math.min(drag.start, drag.end), Math.max(drag.start, drag.end)] : range

  return (
    <div className="relative">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="h-60 w-full cursor-crosshair select-none"
        preserveAspectRatio="none"
        onMouseDown={(event) => {
          const index = indexAt(event)
          setDrag({ start: index, end: index })
        }}
        onMouseMove={(event) => {
          const index = indexAt(event)
          setHover(index)
          if (drag) setDrag({ ...drag, end: index })
          tip.show(
            event,
            labels[index],
            series.map((item) => ({ label: item.label, value: String(item.values[index] ?? 0), swatch: item.swatch })),
          )
        }}
        onMouseLeave={() => {
          setHover(null)
          tip.hide()
          if (drag) {
            onRange([Math.min(drag.start, drag.end), Math.max(drag.start, drag.end)])
            setDrag(null)
          }
        }}
        onMouseUp={() => {
          if (!drag) return
          const from = Math.min(drag.start, drag.end)
          const to = Math.max(drag.start, drag.end)
          // A plain click on the selected single day clears it.
          if (from === to && range && range[0] === from && range[1] === to) onRange(null)
          else onRange([from, to])
          setDrag(null)
        }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" className="fill-muted text-[10px]">
              {tick}
            </text>
          </g>
        ))}
        {band ? (
          <rect
            x={x(band[0]) - (count > 1 ? plotW / (count - 1) / 2 : 8)}
            y={PAD.top}
            width={Math.max(4, x(band[1]) - x(band[0]) + (count > 1 ? plotW / (count - 1) : 16))}
            height={plotH}
            className="fill-accent/15"
          />
        ) : null}
        {series.map((item) => (
          <g key={item.key}>
            <polyline
              fill="none"
              className={item.stroke}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')}
            />
            {count <= 45
              ? item.values.map((value, index) => (
                  <circle key={index} cx={x(index)} cy={y(value)} r={hover === index ? 4 : 2.5} className={item.dot} />
                ))
              : null}
          </g>
        ))}
        {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-muted" strokeDasharray="0" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.5} /> : null}
        {labels.map((label, index) =>
          index % labelEvery === 0 || index === count - 1 ? (
            <text key={label} x={x(index)} y={H - 8} textAnchor="middle" className="fill-muted text-[10px]">
              {label}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted">
        {series.map((item) => (
          <span key={item.key} className="flex items-center gap-1.5">
            <span className={cn('h-0.5 w-4 rounded-full', item.swatch)} aria-hidden="true" />
            {item.label}
          </span>
        ))}
        <span className="ml-auto">Drag across the chart to filter by reply date.</span>
      </div>
      {tip.node}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Histogram (columns) with click / drag selection                     */
/* ------------------------------------------------------------------ */

export function Histogram({
  bins,
  range,
  onRange,
  emptyText,
}: {
  bins: { label: string; value: number; detail?: string }[]
  range: [number, number] | null
  onRange: (range: [number, number] | null) => void
  emptyText: string
}) {
  const tip = useTooltip()
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null)
  if (bins.length === 0) return <p className="py-10 text-center text-sm text-muted">{emptyText}</p>
  const max = Math.max(1, ...bins.map((bin) => bin.value))
  const peak = bins.reduce((best, bin, index) => (bin.value > bins[best].value ? index : best), 0)
  const band = drag ? [Math.min(drag.start, drag.end), Math.max(drag.start, drag.end)] : range
  const labelEvery = Math.max(1, Math.ceil(bins.length / 8))
  const finish = () => {
    if (!drag) return
    const from = Math.min(drag.start, drag.end)
    const to = Math.max(drag.start, drag.end)
    if (from === to && range && range[0] === from && range[1] === to) onRange(null)
    else onRange([from, to])
    setDrag(null)
  }
  return (
    <div onMouseLeave={() => { tip.hide(); finish() }} onMouseUp={finish}>
      <div className="flex h-52 select-none items-end gap-0.5">
        {bins.map((bin, index) => {
          const inBand = band ? index >= band[0] && index <= band[1] : true
          return (
            <div
              key={index}
              className="flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end"
              onMouseDown={() => setDrag({ start: index, end: index })}
              onMouseEnter={() => drag && setDrag({ ...drag, end: index })}
              onMouseMove={(event) => tip.show(event, bin.label, [{ label: bin.detail ?? 'Arrivals', value: String(bin.value) }])}
            >
              <div
                className={cn('w-full rounded-t-sm transition-opacity', index === peak ? 'bg-accent' : 'bg-accent/60', !inBand && 'opacity-25')}
                style={{ height: `${(bin.value / max) * 100}%`, minHeight: bin.value ? 2 : 0 }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex gap-0.5 text-[10px] text-muted">
        {bins.map((bin, index) => (
          <span key={index} className="min-w-0 flex-1 truncate text-center">
            {index % labelEvery === 0 ? bin.label : ''}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        Peak {bins[peak].label} · {bins[peak].value} arrivals. Click or drag to filter by arrival time.
      </p>
      {tip.node}
    </div>
  )
}

function niceCeil(value: number) {
  if (value <= 5) return 5
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= value) ?? 10
  return step * power
}
