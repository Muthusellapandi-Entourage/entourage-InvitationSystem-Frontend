import { Maximize2, Minimize2, Pause, Play, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LiveAttendance, LiveScan } from '@/api/checkInApi'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

export const LIVE_POLL_MS = 3000

/**
 * The live attendance board, shared by the admin tab and the read-only viewer link: totals, the latest
 * arrival and the recent scans with name, position, company, seat and the scanned QR code.
 */
export function LiveBoard({
  data,
  updatedAt,
  failed,
  paused,
  onPause,
  timezone,
  heading,
}: {
  data: LiveAttendance | undefined
  updatedAt: number
  failed: boolean
  paused: boolean
  onPause: (paused: boolean) => void
  timezone: string
  /** Shown above the board, e.g. the event name on the viewer link. */
  heading?: ReactNode
}) {
  const [search, setSearch] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const boardRef = useRef<HTMLDivElement>(null)
  const seen = useRef<Set<string> | null>(null)
  const freshTimer = useRef<number | undefined>(undefined)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const scans = useMemo(() => data?.scans ?? [], [data?.scans])

  // Scans that arrived since the last refresh glow for a few seconds (not on first load).
  useEffect(() => {
    if (!data) return
    const ids = scans.map((scan) => scan.id)
    if (seen.current === null) {
      seen.current = new Set(ids)
      return
    }
    const known = seen.current
    const added = ids.filter((id) => !known.has(id))
    ids.forEach((id) => known.add(id))
    if (added.length === 0) return
    setFresh(new Set(added))
    window.clearTimeout(freshTimer.current)
    freshTimer.current = window.setTimeout(() => setFresh(new Set()), 6000)
  }, [scans, data])

  useEffect(() => () => window.clearTimeout(freshTimer.current), [])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === boardRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const term = search.trim().toLowerCase()
  const filtered = term
    ? scans.filter((scan) => [scan.name, scan.position, scan.company, scan.code, scan.seat].some((value) => value?.toLowerCase().includes(term)))
    : scans
  const latest = scans[0] ?? null
  const percent = data && data.totalGuests > 0 ? Math.round((data.checkedIn / data.totalGuests) * 100) : 0

  return (
    <div ref={boardRef} className={cn('flex flex-col gap-6', fullscreen && 'overflow-y-auto bg-background p-6 sm:p-10')}>
      {heading}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent" aria-live="polite">
          <span className={cn('size-2 rounded-full bg-accent', !paused && 'animate-pulse')} aria-hidden="true" />
          {paused ? 'Paused' : 'Live'}
          {updatedAt ? <span className="text-xs text-muted tabular-nums">· {new Date(updatedAt).toLocaleTimeString()}</span> : null}
        </span>
        {failed ? <span className="text-sm text-danger">Connection lost — retrying…</span> : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onPause(!paused)}>
            {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="secondary" onClick={() => (fullscreen ? void document.exitFullscreen() : void boardRef.current?.requestFullscreen())}>
            {fullscreen ? <Minimize2 className="size-4" aria-hidden="true" /> : <Maximize2 className="size-4" aria-hidden="true" />}
            {fullscreen ? 'Exit full screen' : 'Full screen'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Checked in" value={data ? `${data.checkedIn} / ${data.totalGuests}` : '—'} detail={`${percent}% of guests`}>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-hover" aria-hidden="true">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
          </div>
        </Stat>
        <Stat label="Seated" value={data ? String(data.seated) : '—'} detail="Marked seated by door staff" />
        <Stat label="Not arrived" value={data ? String(Math.max(0, data.totalGuests - data.checkedIn)) : '—'} detail="Still expected" />
      </div>

      {latest ? (
        <section
          aria-label="Latest arrival"
          className={cn('rounded-2xl border p-5 transition-colors duration-700 sm:p-6', fresh.has(latest.id) ? 'border-accent bg-accent-soft' : 'border-border bg-surface')}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Latest arrival · {formatTime(latest.at, timezone)}</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">{latest.name}</p>
              <p className="mt-1 text-base text-muted">{[latest.position, latest.company].filter(Boolean).join(' · ') || '—'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Seat</p>
              <p className="text-2xl font-semibold">{latest.seat ?? 'No seat assigned'}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <ScanBadge scan={latest} />
            <span className="font-mono text-xs text-muted">QR {latest.code}</span>
          </div>
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No one has been scanned yet. Arrivals appear here as soon as the door scanner checks them in.
        </p>
      )}

      {scans.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Recent scans</h2>
            <label className="relative w-full sm:w-72">
              <span className="sr-only">Search scans</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, company, seat or code"
                className="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm"
              />
            </label>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Time</th>
                  <th scope="col" className="px-4 py-3 font-medium">Guest</th>
                  <th scope="col" className="px-4 py-3 font-medium">Company</th>
                  <th scope="col" className="px-4 py-3 font-medium">Seat</th>
                  <th scope="col" className="px-4 py-3 font-medium">Scanned QR</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((scan) => (
                  <tr key={scan.id} className={cn('border-t border-border transition-colors duration-700', fresh.has(scan.id) && 'bg-accent-soft')}>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">{formatTime(scan.at, timezone)}</td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{scan.name}</span>
                      {scan.position ? <span className="block text-xs text-muted">{scan.position}</span> : null}
                    </td>
                    <td className="px-4 py-3">{scan.company ?? '—'}</td>
                    <td className="px-4 py-3">{scan.seat ?? <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted" title={scan.code}>
                      {scan.code.length > 14 ? `${scan.code.slice(0, 8)}…${scan.code.slice(-4)}` : scan.code}
                    </td>
                    <td className="px-4 py-3">
                      <ScanBadge scan={scan} />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted">
                      No scans match “{search}”.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            Showing the latest {scans.length} scans. Refreshes every {LIVE_POLL_MS / 1000} seconds.
          </p>
        </section>
      ) : null}
    </div>
  )
}

function Stat({ label, value, detail, children }: { label: string; value: string; detail: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
      {children}
    </div>
  )
}

function ScanBadge({ scan }: { scan: LiveScan }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-xs font-medium',
          scan.firstScan ? 'bg-accent-soft text-accent' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
        )}
      >
        {scan.firstScan ? 'Checked in' : 'Scanned again'}
      </span>
      {scan.isSeated ? <span className="rounded-full bg-hover px-2 py-0.5 text-xs font-medium">Seated</span> : null}
    </span>
  )
}

function formatTime(value: string, timezone: string) {
  try {
    return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: timezone })
  } catch {
    return new Date(value).toLocaleTimeString()
  }
}
