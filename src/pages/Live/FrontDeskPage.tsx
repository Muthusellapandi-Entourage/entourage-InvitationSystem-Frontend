import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Armchair, Check, CircleAlert, Loader2, Printer, ScanLine, Search, UserCheck, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { printBadge } from '@/printing/printBadge'
import { PrintBadgeView } from '@/printing/PrintBadgeView'
import type { PrintPayload } from '@/api/printBadgeApi'
import { guestQrDataUrl } from '@/badges/sampleQr'
import { Modal } from '@/components/ui/Modal'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError, apiBaseUrl } from '@/api/client'
import { frontDeskApi, type FrontDesk, type FrontDeskGuest } from '@/api/frontDeskApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'

type Filter = 'all' | 'expected' | 'checkedIn' | 'seated' | 'Accepted' | 'Pending' | 'Declined'

const POLL_MS = 10_000

/**
 * Front-desk dashboard behind a secret link (/live-dashboard/{token}), no sign-in: the guest list with
 * RSVP, seat and check-in details; ushers can check guests in by hand and mark them seated.
 */
export function FrontDeskPage() {
  const { token = '' } = useParams()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [qrGuest, setQrGuest] = useState<FrontDeskGuest | null>(null)
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [preview, setPreview] = useState<PrintPayload | null>(null)

  /** Prints a guest's badge (their guest type's print design) and notes it in their history. */
  /**
   * Loads the guest's badge and shows a preview to confirm (or prints straight away when `direct`,
   * e.g. "Print automatically after a first check-in").
   */
  async function printFor(guest: { id: string; name: string }, direct = false) {
    setPrintingId(guest.id)
    try {
      const payload = await frontDeskApi.print(token, guest.id)
      if (!payload.design) {
        toast.error(`No print badge design for ${payload.guest.guestType ?? 'this guest'}. Ask the organiser to design it (Guest types → Print badge).`)
        return
      }
      if (direct) await sendToPrinter(payload)
      else setPreview(payload)
    } catch (error) {
      toast.error(error instanceof ApiError || error instanceof Error ? error.message : 'The badge could not be printed.')
    } finally {
      setPrintingId(null)
    }
  }

  async function sendToPrinter(payload: PrintPayload) {
    if (!payload.design) return
    await printBadge(payload.design, payload.guest)
    void frontDeskApi.printed(token, payload.guest.id).catch(() => undefined)
  }

  const query = useQuery({
    queryKey: ['front-desk', token],
    queryFn: () => frontDeskApi.get(token),
    enabled: Boolean(token),
    refetchInterval: (state) => {
      const status = state.state.error instanceof ApiError ? state.state.error.status : 0
      return status === 404 || status === 410 ? false : POLL_MS
    },
    refetchIntervalInBackground: true,
    retry: (count, error) => !(error instanceof ApiError && (error.status === 404 || error.status === 410)) && count < 3,
  })
  const data = query.data
  useDocumentTitle(data ? `Front desk · ${data.eventName}` : 'Front desk')

  /** Puts the updated guest straight into the list, so the row changes without waiting for the next refresh. */
  function applyGuest(guest: FrontDeskGuest | null) {
    if (!guest) return
    queryClient.setQueryData<FrontDesk>(['front-desk', token], (current) =>
      current ? { ...current, guests: current.guests.map((item) => (item.id === guest.id ? guest : item)) } : current,
    )
    void queryClient.invalidateQueries({ queryKey: ['front-desk', token] })
  }

  const action = useMutation({
    mutationFn: ({ guest, kind }: { guest: FrontDeskGuest; kind: 'check-in' | 'seated' }) =>
      kind === 'check-in' ? frontDeskApi.checkIn(token, guest.id) : frontDeskApi.seated(token, guest.id),
    onMutate: ({ guest }) => setBusyId(guest.id),
    onSuccess: (result, { guest, kind }) => {
      applyGuest(result.guest)
      if (result.status === 'Closed') toast.error(result.message)
      else if (kind === 'seated') toast.success(`${guest.name} marked as seated.`)
      else if (result.status === 'AlreadyCheckedIn') toast.message(`${guest.name} was already checked in.`)
      else toast.success(`${guest.name} checked in.`)
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'That did not work. Check the connection and try again.'),
    onSettled: () => setBusyId(null),
  })

  const guests = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data?.guests ?? []).filter((guest) => {
      if (filter === 'expected' && (guest.firstCheckedInOn || guest.rsvpStatus === 'Declined')) return false
      if (filter === 'checkedIn' && !guest.firstCheckedInOn) return false
      if (filter === 'seated' && !guest.seatedOn) return false
      if ((filter === 'Accepted' || filter === 'Pending' || filter === 'Declined') && guest.rsvpStatus !== filter) return false
      if (!term) return true
      return [guest.name, guest.position, guest.company, guest.email, guest.seat, guest.guestTypeName].some((value) => value?.toLowerCase().includes(term))
    })
  }, [data?.guests, filter, search])

  const gone = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 410)
  if (gone) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-center text-foreground">
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold">Front desk unavailable</h1>
          <p className="mt-2 text-sm text-muted">{(query.error as ApiError).message} Ask the organiser for a new link.</p>
        </div>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted" aria-live="polite">
        {query.isError ? 'Could not load the guest list. Retrying…' : 'Loading the guest list…'}
      </main>
    )
  }

  const { totals } = data
  const live = data.status === 'Active'
  const expected = data.guests.filter((guest) => !guest.firstCheckedInOn && guest.rsvpStatus !== 'Declined').length
  const percent = totals.accepted > 0 ? Math.round((totals.checkedIn / totals.accepted) * 100) : 0
  const filters: [Filter, string, number][] = [
    ['all', 'All', totals.guests],
    ['expected', 'Not arrived', expected],
    ['checkedIn', 'Checked in', totals.checkedIn],
    ['seated', 'Seated', totals.seated],
    ['Accepted', 'Accepted', totals.accepted],
    ['Pending', 'Pending', totals.pending],
    ['Declined', 'Declined', totals.declined],
  ]

  return (
    <main className="min-h-dvh bg-background px-4 py-6 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Front desk</p>
            <h1 className="mt-1 truncate text-[1.75rem] font-semibold tracking-[-0.02em]">{data.eventName}</h1>
          </div>
          <span className="inline-flex items-center gap-2 rounded-sm bg-accent-soft px-3 py-1 text-sm font-medium text-accent" aria-live="polite">
            <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            Live
            {query.dataUpdatedAt ? <span className="text-xs tabular-nums text-muted">· {new Date(query.dataUpdatedAt).toLocaleTimeString()}</span> : null}
          </span>
        </header>

        {!live ? (
          <p className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm">
            The event is not live yet. You can look up guests, but checking in opens once the organiser sets the event to Active.
          </p>
        ) : null}
        {query.isError ? <p className="text-sm text-danger">Connection lost — retrying…</p> : null}

        {live ? (
          <DeskScanner
            token={token}
            timezone={data.timezone}
            printingId={printingId}
            onGuest={applyGuest}
            onPrint={(guest, direct) => void printFor(guest, direct)}
          />
        ) : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Checked in" value={`${totals.checkedIn} / ${totals.accepted}`} detail={`${percent}% of accepted guests`}>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-hover" aria-hidden="true">
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${percent}%` }} />
            </div>
          </Stat>
          <Stat label="Not arrived" value={String(expected)} detail="Expected, not checked in" />
          <Stat label="Seated" value={String(totals.seated)} detail="Marked at their table" />
          <Stat label="Guest list" value={String(totals.guests)} detail={`${totals.accepted} accepted · ${totals.pending} pending · ${totals.declined} declined`} />
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative w-full lg:w-80">
            <span className="sr-only">Search guests</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, company, email or seat"
              className="h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter guests">
            {filters.map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  'h-9 rounded-md border px-3 text-xs font-medium tabular-nums',
                  filter === value ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-foreground',
                )}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </div>

        {guests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">No guests match.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full min-w-[1160px] text-left text-sm">
                <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Guest</th>
                    <th scope="col" className="px-4 py-3 font-medium">E-Badge QR</th>
                    <th scope="col" className="px-4 py-3 font-medium">Company · type</th>
                    <th scope="col" className="px-4 py-3 font-medium">Seat</th>
                    <th scope="col" className="px-4 py-3 font-medium">RSVP</th>
                    <th scope="col" className="px-4 py-3 font-medium">Check-in</th>
                    <th scope="col" className="w-[19.5rem] px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {guests.map((guest) => (
                    <tr key={guest.id} className="border-t border-border align-middle">
                      <td className="px-4 py-3">
                        <span className="block font-medium">{guest.name}</span>
                        {guest.position ? <span className="block text-xs text-muted">{guest.position}</span> : null}
                        {guest.email ? <span className="block break-all text-xs text-muted">{guest.email}</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        <BadgeQr guest={guest} onOpen={setQrGuest} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="block">{guest.company ?? '—'}</span>
                        {guest.guestTypeName ? <span className="block text-xs text-muted">{guest.guestTypeName}</span> : null}
                      </td>
                      <td className="px-4 py-3">{guest.seat ?? <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3">
                        <RsvpBadge status={guest.rsvpStatus} />
                        {guest.declineReason ? <span className="mt-1 block max-w-56 text-xs italic text-muted">“{guest.declineReason}”</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        <CheckInInfo guest={guest} timezone={data.timezone} />
                      </td>
                      <td className="px-4 py-3">
                        <Actions
                          guest={guest}
                          live={live}
                          busy={busyId === guest.id}
                          printing={printingId === guest.id}
                          onAction={(kind) => run(guest, kind)}
                          onPrint={() => void printFor(guest)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone cards */}
            <ul className="grid gap-3 md:hidden">
              {guests.map((guest) => (
                <li key={guest.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <BadgeQr guest={guest} size={64} onOpen={setQrGuest} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{guest.name}</p>
                      <p className="text-xs text-muted">{[guest.position, guest.company].filter(Boolean).join(' · ') || '—'}</p>
                      {guest.email ? <p className="break-all text-xs text-muted">{guest.email}</p> : null}
                    </div>
                    <RsvpBadge status={guest.rsvpStatus} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-muted">Seat</dt>
                      <dd className="font-medium">{guest.seat ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Type</dt>
                      <dd className="font-medium">{guest.guestTypeName ?? '—'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted">Check-in</dt>
                      <dd>
                        <CheckInInfo guest={guest} timezone={data.timezone} />
                      </dd>
                    </div>
                  </dl>
                  {guest.declineReason ? <p className="mt-2 text-xs italic text-muted">“{guest.declineReason}”</p> : null}
                  <div className="mt-3">
                    <Actions
                      guest={guest}
                      live={live}
                      busy={busyId === guest.id}
                      printing={printingId === guest.id}
                      onAction={(kind) => run(guest, kind)}
                      onPrint={() => void printFor(guest)}
                      wide
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-xs text-muted">Showing {guests.length} of {totals.guests} guests. Updates every {POLL_MS / 1000} seconds.</p>
      </div>
      <QrDialog guest={qrGuest} onClose={() => setQrGuest(null)} />
      <PrintPreviewDialog payload={preview} onClose={() => setPreview(null)} onPrint={sendToPrinter} />
    </main>
  )

  function run(guest: FrontDeskGuest, kind: 'check-in' | 'seated') {
    if (kind === 'check-in' && guest.rsvpStatus !== 'Accepted' && !guest.firstCheckedInOn) {
      const label = guest.rsvpStatus === 'Declined' ? 'declined the invitation' : 'not replied yet'
      if (!window.confirm(`${guest.name} has ${label}. Check them in anyway?`)) return
    }
    action.mutate({ guest, kind })
  }
}

function Actions({
  guest,
  live,
  busy,
  printing,
  wide,
  onAction,
  onPrint,
}: {
  guest: FrontDeskGuest
  live: boolean
  busy: boolean
  printing: boolean
  wide?: boolean
  onAction: (kind: 'check-in' | 'seated') => void
  onPrint: () => void
}) {
  const checkedIn = Boolean(guest.firstCheckedInOn)
  // Two fixed-width slots (status action · print) so every row lines up, whatever the state.
  const slot = cn('inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium', wide ? 'flex-1' : 'w-[8.5rem]')
  return (
    <div className={cn('flex items-center gap-2', wide ? 'w-full' : 'justify-end')}>
      {!checkedIn ? (
        <button
          type="button"
          disabled={!live || busy}
          onClick={() => onAction('check-in')}
          className={cn(slot, 'bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-50')}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UserCheck className="size-4" aria-hidden="true" />}
          Check in
        </button>
      ) : !guest.seatedOn ? (
        <button
          type="button"
          disabled={!live || busy}
          onClick={() => onAction('seated')}
          className={cn(slot, 'border border-border hover:bg-hover disabled:opacity-50')}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Armchair className="size-4" aria-hidden="true" />}
          Mark seated
        </button>
      ) : (
        <span className={cn(slot, 'bg-accent-soft text-accent')}>
          <Check className="size-4" aria-hidden="true" />
          Seated
        </span>
      )}
      <button
        type="button"
        disabled={printing}
        onClick={onPrint}
        title="Print this guest's badge"
        className={cn(slot, 'border border-border hover:bg-hover disabled:opacity-50')}
      >
        {printing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Printer className="size-4" aria-hidden="true" />}
        Print badge
      </button>
    </div>
  )
}

const AUTO_PRINT_KEY = 'entourage.frontDesk.autoPrint'

function readAutoPrint() {
  try {
    return localStorage.getItem(AUTO_PRINT_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Desk scanner for a USB / Bluetooth barcode reader on the laptop: the reader types the E-Badge code
 * into this field and presses Enter. The guest is checked in and their badge can be printed
 * (automatically on a first check-in when "Print automatically" is on).
 */
function DeskScanner({
  token,
  timezone,
  printingId,
  onGuest,
  onPrint,
}: {
  token: string
  timezone: string
  printingId: string | null
  onGuest: (guest: FrontDeskGuest | null) => void
  /** `direct` skips the preview (automatic printing after a scan). */
  onPrint: (guest: FrontDeskGuest, direct?: boolean) => void
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [autoPrint, setAutoPrint] = useState(readAutoPrint)
  const [result, setResult] = useState<{ status: string; message: string; guest: FrontDeskGuest | null } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const last = useRef<{ code: string; at: number } | null>(null)

  useEffect(() => {
    input.current?.focus({ preventScroll: true })
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const code = value.trim()
    setValue('')
    if (!code) return
    // Readers often send the same code twice; ignore repeats within 3 seconds.
    const now = Date.now()
    if (last.current && last.current.code === code && now - last.current.at < 3000) return
    last.current = { code, at: now }
    setBusy(true)
    try {
      const outcome = await frontDeskApi.scan(token, code)
      setResult(outcome)
      onGuest(outcome.guest)
      if (outcome.guest && outcome.status === 'CheckedIn' && autoPrint) onPrint(outcome.guest, true)
    } catch (error) {
      setResult({ status: 'Error', message: error instanceof ApiError ? error.message : 'Could not reach the server. Scan again.', guest: null })
    } finally {
      setBusy(false)
      input.current?.focus({ preventScroll: true })
    }
  }

  const tone = !result ? null : result.status === 'CheckedIn' ? 'success' : result.status === 'AlreadyCheckedIn' ? 'warning' : 'error'

  return (
    <section className="grid gap-4 rounded-md border border-border bg-surface p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="desk-scan" className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
          <ScanLine className="size-4 text-accent" aria-hidden="true" />
          Scan E-Badge
        </label>
        <div className="mt-2 flex gap-2">
          <input
            ref={input}
            id="desk-scan"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Scan with the USB scanner, or type the code and press Enter"
            className="h-12 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-12 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UserCheck className="size-4" aria-hidden="true" />}
            Check in
          </button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent)]"
            checked={autoPrint}
            onChange={(event) => {
              setAutoPrint(event.target.checked)
              try {
                localStorage.setItem(AUTO_PRINT_KEY, event.target.checked ? '1' : '0')
              } catch {
                // Not remembered on this device.
              }
            }}
          />
          Print the badge automatically after a first check-in
        </label>
      </form>

      <div
        role="status"
        aria-live="polite"
        className={cn(
          'flex min-h-28 items-center gap-4 rounded-md border p-4',
          tone === 'success' ? 'border-accent bg-accent-soft' : tone === 'warning' ? 'border-warning bg-warning-soft' : tone === 'error' ? 'border-danger bg-danger-soft' : 'border-border bg-background',
        )}
      >
        {!result ? (
          <p className="text-sm text-muted">Scan a guest’s E-Badge. The result and a Print button appear here.</p>
        ) : (
          <>
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-md',
                tone === 'success' ? 'bg-accent text-accent-foreground' : tone === 'warning' ? 'bg-warning text-background' : 'bg-danger text-background',
              )}
            >
              {tone === 'success' ? <Check className="size-5" aria-hidden="true" /> : tone === 'warning' ? <CircleAlert className="size-5" aria-hidden="true" /> : <X className="size-5" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{result.guest?.name ?? (tone === 'error' ? 'Not checked in' : result.message)}</p>
              <p className="truncate text-sm text-muted">
                {result.guest
                  ? [
                      result.status === 'AlreadyCheckedIn' ? `Already checked in · first ${result.guest.firstCheckedInOn ? time(result.guest.firstCheckedInOn, timezone) : ''}` : 'Checked in',
                      result.guest.seat,
                      result.guest.company,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : result.message}
              </p>
            </div>
            {result.guest ? (
              <button
                type="button"
                disabled={printingId === result.guest.id}
                onClick={() => result.guest && onPrint(result.guest)}
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
              >
                {printingId === result.guest.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Printer className="size-4" aria-hidden="true" />}
                {result.status === 'AlreadyCheckedIn' ? 'Print again' : 'Print badge'}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

/** Shows the guest's printed badge at true proportions before it goes to the printer. */
function PrintPreviewDialog({ payload, onClose, onPrint }: { payload: PrintPayload | null; onClose: () => void; onPrint: (payload: PrintPayload) => Promise<void> }) {
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    setQr(null)
    if (payload?.guest.checkInCode) void qrFor(payload.guest.checkInCode).then((url) => active && setQr(url))
    return () => {
      active = false
    }
  }, [payload?.guest.checkInCode])

  const design = payload?.design ?? null
  // Fit the badge into about 440 × 360 px on screen.
  const scale = design ? Math.min(440 / design.widthMm, 360 / design.heightMm) : 1

  return (
    <Modal
      open={payload !== null && design !== null}
      title={payload ? `Print badge · ${payload.guest.name}` : 'Print badge'}
      description={design ? `${Math.round(design.widthMm * 10) / 10} × ${Math.round(design.heightMm * 10) / 10} mm · check the details, then print.` : undefined}
      onClose={() => !busy && onClose()}
    >
      {payload && design ? (
        <div className="flex flex-col items-center gap-5">
          <div className="rounded-md border border-border bg-[repeating-conic-gradient(var(--hover)_0%_25%,var(--background)_0%_50%)] bg-[length:16px_16px] p-4">
            <div className="outline outline-1 outline-border">
              <PrintBadgeView design={design} guest={payload.guest} qrDataUrl={qr} assetOrigin={apiBaseUrl || window.location.origin} scale={scale} />
            </div>
          </div>
          <div className="flex w-full justify-end gap-2 border-t border-border pt-4">
            <button type="button" disabled={busy} onClick={onClose} className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-hover disabled:opacity-50">
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              autoFocus
              onClick={async () => {
                setBusy(true)
                try {
                  await onPrint(payload)
                  onClose()
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'The badge could not be printed.')
                } finally {
                  setBusy(false)
                }
              }}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Printer className="size-4" aria-hidden="true" />}
              Print
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

const qrCache = new Map<string, Promise<string>>()

function qrFor(code: string) {
  let url = qrCache.get(code)
  if (!url) {
    url = guestQrDataUrl(code)
    qrCache.set(code, url)
  }
  return url
}

/** The guest's E-Badge QR (the code the door scanner reads). Tap to show it large for scanning. */
function BadgeQr({ guest, size = 56, onOpen }: { guest: FrontDeskGuest; size?: number; onOpen: (guest: FrontDeskGuest) => void }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    if (guest.checkInCode) void qrFor(guest.checkInCode).then((url) => active && setSrc(url))
    return () => {
      active = false
    }
  }, [guest.checkInCode])
  if (!guest.checkInCode) return <span className="text-muted">—</span>
  return (
    <button
      type="button"
      onClick={() => onOpen(guest)}
      aria-label={`Show ${guest.name}'s E-Badge QR code large`}
      className="block shrink-0 rounded-md border border-border bg-white p-1 hover:ring-2 hover:ring-accent"
      style={{ width: size + 10, height: size + 10 }}
    >
      {src ? <img src={src} alt="" width={size} height={size} className="block size-full" /> : null}
    </button>
  )
}

function QrDialog({ guest, onClose }: { guest: FrontDeskGuest | null; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setSrc(null)
    if (guest?.checkInCode) void qrFor(guest.checkInCode).then((url) => active && setSrc(url))
    return () => {
      active = false
    }
  }, [guest?.checkInCode])
  return (
    <Modal open={guest !== null} width="sm" title={guest?.name ?? 'E-Badge QR'} description="Scan this with the door scanner to check the guest in." onClose={onClose}>
      {guest ? (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-xl bg-white p-3">
            {src ? <img src={src} alt={`E-Badge QR code for ${guest.name}`} width={280} height={280} className="block size-[min(280px,70vw)]" /> : <div className="size-[min(280px,70vw)]" />}
          </div>
          <p className="break-all text-center font-mono text-xs text-muted">{guest.checkInCode}</p>
          {guest.seat ? <p className="text-sm">Seat: <span className="font-semibold">{guest.seat}</span></p> : null}
        </div>
      ) : null}
    </Modal>
  )
}

function CheckInInfo({ guest, timezone }: { guest: FrontDeskGuest; timezone: string }) {
  if (!guest.firstCheckedInOn) return <span className="text-muted">Not arrived</span>
  return (
    <span className="block">
      <span className="font-medium text-accent">Checked in</span>
      <span className="text-muted"> · {guest.checkInCount} {guest.checkInCount === 1 ? 'scan' : 'scans'}</span>
      <span className="block text-xs text-muted">
        First {time(guest.firstCheckedInOn, timezone)}
        {guest.checkInCount > 1 && guest.lastCheckedInOn ? ` · last ${time(guest.lastCheckedInOn, timezone)}` : ''}
        {guest.seatedOn ? ` · seated ${time(guest.seatedOn, timezone)}` : ''}
      </span>
    </span>
  )
}

function RsvpBadge({ status }: { status: FrontDeskGuest['rsvpStatus'] }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center whitespace-nowrap rounded-sm px-2 text-xs font-medium',
        status === 'Accepted' ? 'bg-accent-soft text-accent' : status === 'Declined' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning',
      )}
    >
      {status}
    </span>
  )
}

function Stat({ label, value, detail, children }: { label: string; value: string; detail: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
      {children}
    </div>
  )
}

function time(value: string, timezone: string) {
  try {
    return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone })
  } catch {
    return new Date(value).toLocaleTimeString()
  }
}
