import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Armchair, Check, Loader2, Search, UserCheck } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { guestQrDataUrl } from '@/badges/sampleQr'
import { Modal } from '@/components/ui/Modal'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
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
          <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent" aria-live="polite">
            <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            Live
            {query.dataUpdatedAt ? <span className="text-xs tabular-nums text-muted">· {new Date(query.dataUpdatedAt).toLocaleTimeString()}</span> : null}
          </span>
        </header>

        {!live ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            The event is not live yet. You can look up guests, but checking in opens once the organiser sets the event to Active.
          </p>
        ) : null}
        {query.isError ? <p className="text-sm text-danger">Connection lost — retrying…</p> : null}

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
                  'h-9 rounded-full border px-3 text-xs font-medium tabular-nums',
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
              <table className="w-full min-w-[1060px] text-left text-sm">
                <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Guest</th>
                    <th scope="col" className="px-4 py-3 font-medium">E-Badge QR</th>
                    <th scope="col" className="px-4 py-3 font-medium">Company · type</th>
                    <th scope="col" className="px-4 py-3 font-medium">Seat</th>
                    <th scope="col" className="px-4 py-3 font-medium">RSVP</th>
                    <th scope="col" className="px-4 py-3 font-medium">Check-in</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {guests.map((guest) => (
                    <tr key={guest.id} className="border-t border-border align-top">
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
                        <Actions guest={guest} live={live} busy={busyId === guest.id} onAction={(kind) => run(guest, kind)} />
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
                    <Actions guest={guest} live={live} busy={busyId === guest.id} onAction={(kind) => run(guest, kind)} wide />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-xs text-muted">Showing {guests.length} of {totals.guests} guests. Updates every {POLL_MS / 1000} seconds.</p>
      </div>
      <QrDialog guest={qrGuest} onClose={() => setQrGuest(null)} />
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
  wide,
  onAction,
}: {
  guest: FrontDeskGuest
  live: boolean
  busy: boolean
  wide?: boolean
  onAction: (kind: 'check-in' | 'seated') => void
}) {
  const checkedIn = Boolean(guest.firstCheckedInOn)
  return (
    <div className={cn('flex gap-2', wide ? 'w-full' : 'justify-end')}>
      {!checkedIn ? (
        <button
          type="button"
          disabled={!live || busy}
          onClick={() => onAction('check-in')}
          className={cn(
            'inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50',
            wide && 'flex-1',
          )}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UserCheck className="size-4" aria-hidden="true" />}
          Check in
        </button>
      ) : !guest.seatedOn ? (
        <button
          type="button"
          disabled={!live || busy}
          onClick={() => onAction('seated')}
          className={cn(
            'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-hover disabled:opacity-50',
            wide && 'flex-1',
          )}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Armchair className="size-4" aria-hidden="true" />}
          Mark seated
        </button>
      ) : (
        <span className="inline-flex h-9 items-center gap-1.5 text-sm text-accent">
          <Check className="size-4" aria-hidden="true" />
          Seated
        </span>
      )}
    </div>
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
        'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'Accepted' ? 'bg-accent-soft text-accent' : status === 'Declined' ? 'bg-danger-soft text-danger' : 'bg-hover text-muted',
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
