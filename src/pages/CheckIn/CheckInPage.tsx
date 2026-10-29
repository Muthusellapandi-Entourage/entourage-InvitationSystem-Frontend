import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Camera, CameraOff, Check, CircleAlert, Info, Loader2, ScanLine, Settings, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { checkInApi, type CheckInGuest, type CheckInStatus } from '@/api/checkInApi'
import { seatingApi } from '@/api/seatingApi'
import { LogoMark } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/StatusBadge'
import { useQrCamera } from '@/checkin/useQrCamera'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { cn } from '@/lib/cn'
import { seatPlace } from '@/seating/geometry'
import { findSeat, parseDesign } from '@/seating/model'

/** The same badge scanned again within this window is ignored (scanners and cameras repeat). */
const REPEAT_WINDOW_MS = 4000

type Outcome =
  | { kind: 'idle' }
  | { kind: 'pending'; code: string }
  | { kind: 'result'; status: CheckInStatus; message: string; guest: CheckInGuest | null }
  | { kind: 'error'; title: string; message: string }

/**
 * EventPass: the door check-in page. A USB / Bluetooth barcode reader types the E-Badge code into the
 * always-focused field (desk setups); the phone camera can read the QR code too. Each scan checks the
 * guest in, shows their details and seat, and staff can mark them as seated.
 * Same Charcoal & Mint Teal look as the rest of the app: flat surfaces, hairlines, teal accents.
 */
export function CheckInPage() {
  const { eventId = '' } = useParams()
  const event = useEvent(eventId).data
  useDocumentTitle(event ? `EventPass · ${event.name}` : 'EventPass')
  const [value, setValue] = useState('')
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [seatNote, setSeatNote] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastScan = useRef<{ code: string; at: number } | null>(null)
  const finePointer = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches, [])

  // Seats come from the seating plan; refreshed every minute while the door is open.
  const seatingQuery = useQuery({
    queryKey: ['seating', eventId],
    queryFn: () => seatingApi.get(eventId),
    enabled: Boolean(eventId),
    refetchInterval: 60_000,
  })
  const design = useMemo(() => parseDesign(seatingQuery.data?.designJson), [seatingQuery.data?.designJson])

  const guest = outcome.kind === 'result' ? outcome.guest : null
  const seat = useMemo(() => {
    if (!guest) return null
    const placed = findSeat(design, guest.id)
    return placed ? `${placed.arrangement.name} · ${seatPlace(placed.seat)}` : null
  }, [design, guest])

  const focusInput = useCallback(() => {
    // Touch devices would pop the on-screen keyboard; only desks with a reader keep the field focused.
    if (finePointer) inputRef.current?.focus({ preventScroll: true })
  }, [finePointer])

  useEffect(() => {
    focusInput()
  }, [focusInput])

  const scanMutation = useMutation({
    mutationFn: (code: string) => checkInApi.scan(eventId, code),
    onSuccess: (result) => {
      setSeatNote(null)
      setOutcome({ kind: 'result', status: result.status, message: result.message, guest: result.guest })
      beep(result.status === 'CheckedIn' ? 'success' : result.status === 'AlreadyCheckedIn' ? 'warning' : 'error')
    },
    onError: (error) => {
      setOutcome(
        error instanceof ApiError && error.status !== 0
          ? { kind: 'error', title: 'Check-in failed', message: error.message }
          : { kind: 'error', title: 'Network error', message: 'Could not reach the server. Check the connection and scan again.' },
      )
      beep('error')
    },
    onSettled: () => focusInput(),
  })

  const seatedMutation = useMutation({
    mutationFn: (guestId: string) => checkInApi.markSeated(eventId, guestId),
    onSuccess: (updated) => {
      setOutcome((current) => (current.kind === 'result' ? { ...current, guest: updated } : current))
      setSeatNote(`Marked as seated at ${formatTime(updated.seatedOn, event?.timezone)}.`)
    },
    onError: (error) => setSeatNote(error instanceof ApiError ? error.message : 'Could not mark as seated. Try again.'),
    onSettled: () => focusInput(),
  })

  const submit = useCallback(
    (raw: string) => {
      const code = raw.trim()
      setValue('')
      if (!code) {
        setOutcome({ kind: 'error', title: 'No E-Badge value', message: 'Nothing was scanned. Scan the QR code on the E-Badge.' })
        beep('error')
        return
      }
      const now = Date.now()
      if (lastScan.current && lastScan.current.code === code && now - lastScan.current.at < REPEAT_WINDOW_MS) {
        // Still in front of the camera: keep ignoring it until it has been away for the whole window.
        lastScan.current.at = now
        return
      }
      lastScan.current = { code, at: now }
      setOutcome({ kind: 'pending', code })
      scanMutation.mutate(code)
    },
    [scanMutation],
  )

  const camera = useQrCamera(submit)

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit(value)
  }

  return (
    <div
      className="min-h-dvh bg-background text-foreground"
      style={{
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))',
      }}
      onClick={(event) => {
        // A click on empty space puts the cursor back in the scanner field.
        if (!(event.target as HTMLElement).closest('button, a, input, select, label, video')) focusInput()
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to={`/events/${eventId}/check-in`}
              aria-label="Leave check-in"
              title="Leave check-in"
              className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:bg-hover hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
              <LogoMark className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">EventPass</h1>
              <p className="truncate text-sm text-muted">Door check-in{event ? ` · ${event.name}` : ''}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {camera.running ? <Badge tone="teal">Camera on</Badge> : null}
            <Button
              variant={settingsOpen ? 'primary' : 'secondary'}
              aria-expanded={settingsOpen}
              aria-label={settingsOpen ? 'Close camera settings' : 'Open camera settings'}
              onClick={() => {
                setSettingsOpen((open) => !open)
                if (!settingsOpen && camera.cameras.length === 0) void camera.findCameras()
              }}
            >
              <Settings className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Camera</span>
            </Button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left: scanner input, camera settings and viewfinder */}
          <div className="flex flex-col gap-5 lg:col-span-5">
            <form onSubmit={onSubmit} className="rounded-md border border-border bg-surface p-5">
              <label htmlFor="badge-input" className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
                <ScanLine className="size-4 text-accent" aria-hidden="true" />
                Barcode scanner
              </label>
              <input
                ref={inputRef}
                id="badge-input"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onBlur={() => window.setTimeout(() => document.activeElement === document.body && focusInput(), 150)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="Scan the E-Badge — the code appears here"
                className="mt-3 h-14 w-full rounded-md border border-border bg-background px-4 text-base font-medium text-foreground placeholder:text-placeholder focus:border-accent"
              />
              <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
                <Info className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
                Click this page so it is in front, then scan. If Notepad is the front window, the code goes there instead.
              </p>
            </form>

            {settingsOpen ? (
              <section aria-labelledby="settings-title" className="rounded-md border border-border bg-surface p-5">
                <div className="flex items-start gap-3">
                  <Camera className="mt-0.5 size-5 text-accent" aria-hidden="true" />
                  <div>
                    <h2 id="settings-title" className="text-base font-semibold">
                      Camera settings
                    </h2>
                    <p className="text-xs leading-relaxed text-muted">
                      Cameras are listed here. A barcode reader does not appear by name — scanning a badge checks in from the box above.
                    </p>
                  </div>
                </div>
                {camera.cameras.length > 0 ? (
                  <fieldset className="mt-4 grid gap-2">
                    <legend className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Cameras</legend>
                    {camera.cameras.map((item) => (
                      <label
                        key={item.deviceId || item.label}
                        className={cn(
                          'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm',
                          camera.cameraId === item.deviceId ? 'border-accent bg-accent-soft font-medium text-foreground' : 'border-border text-muted hover:bg-hover',
                        )}
                      >
                        <input
                          type="radio"
                          name="camera"
                          checked={camera.cameraId === item.deviceId}
                          onChange={() => camera.setCameraId(item.deviceId)}
                          className="size-4 accent-[var(--accent)]"
                        />
                        {item.label}
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                <p role="status" className={cn('mt-4 text-sm', camera.running ? 'text-accent' : 'text-muted')}>
                  {camera.status}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => void camera.findCameras()}>
                    Find cameras
                  </Button>
                  <Button onClick={() => (camera.running ? camera.stop() : void camera.start())}>
                    {camera.running ? <CameraOff className="size-4" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
                    {camera.running ? 'Stop camera' : 'Start camera'}
                  </Button>
                </div>
              </section>
            ) : null}

            {camera.running ? (
              <section aria-label="Camera viewfinder" className="relative aspect-[3/4] w-full overflow-hidden rounded-md border border-border bg-black lg:aspect-square">
                <video ref={camera.videoRef} muted playsInline className="absolute inset-0 size-full object-cover" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
                  <div className="relative aspect-square w-[70%]">
                    <span className="absolute left-0 top-0 size-10 rounded-tl-md border-l-[3px] border-t-[3px] border-accent" />
                    <span className="absolute right-0 top-0 size-10 rounded-tr-md border-r-[3px] border-t-[3px] border-accent" />
                    <span className="absolute bottom-0 left-0 size-10 rounded-bl-md border-b-[3px] border-l-[3px] border-accent" />
                    <span className="absolute bottom-0 right-0 size-10 rounded-br-md border-b-[3px] border-r-[3px] border-accent" />
                  </div>
                </div>
                <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-white">Hold the badge inside the frame</p>
              </section>
            ) : null}
          </div>

          {/* Right: result, seat and scan history */}
          <div className="flex flex-col gap-5 lg:col-span-7">
            <ResultCard outcome={outcome} timezone={event?.timezone} />

            {guest ? (
              <section className="rounded-md border border-border bg-surface p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">Seat</p>
                {seat ? (
                  <p className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{seat}</p>
                ) : (
                  <p className="mt-1 text-lg font-medium text-muted">No seat assigned</p>
                )}
                {seat ? (
                  guest.seatedOn ? (
                    <p className="mt-4 flex items-center gap-2.5 border-t border-border pt-4 text-sm text-muted">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                        <Check className="size-3.5" aria-hidden="true" />
                      </span>
                      Seated · {formatTime(guest.seatedOn, event?.timezone)}
                    </p>
                  ) : (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                      <span className="text-sm text-muted">{guest.name} · Not seated yet</span>
                      <Button className="h-11 px-5" disabled={seatedMutation.isPending} onClick={() => seatedMutation.mutate(guest.id)}>
                        {seatedMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                        Mark as seated
                      </Button>
                    </div>
                  )
                ) : null}
                {seatNote ? (
                  <p role="status" className="mt-3 text-xs text-muted">
                    {seatNote}
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="rounded-md border border-border bg-surface p-5">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Scan history</h2>
              {guest && guest.history.length > 0 ? (
                <ol className="mt-3 divide-y divide-border">
                  {guest.history.map((item, index) => (
                    <li key={`${item.at}-${index}`} className="flex items-center justify-between gap-3 py-3">
                      <span className="flex items-center gap-2.5 text-sm">
                        <span
                          className={cn(
                            'size-2 rounded-full',
                            item.kind === 'Seated' ? 'bg-accent' : index === guest.history.length - 1 ? 'bg-accent' : 'bg-warning',
                          )}
                        />
                        {item.kind === 'Seated' ? 'Marked as seated' : index === guest.history.length - 1 ? 'First check-in' : 'Scanned again'}
                      </span>
                      <span className="text-sm text-muted tabular-nums">{formatTime(item.at, event?.timezone)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-muted">Scan a badge to see this guest&apos;s scans.</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResultCard({ outcome, timezone }: { outcome: Outcome; timezone?: string | null }) {
  if (outcome.kind === 'idle') {
    return (
      <section className="flex flex-col items-center gap-3 rounded-md border border-border bg-surface px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-md bg-accent-soft text-accent">
          <ScanLine className="size-6" aria-hidden="true" />
        </span>
        <span className="text-xl font-semibold">Ready to scan</span>
        <span className="max-w-sm text-sm leading-relaxed text-muted">
          Scan a guest&apos;s E-Badge with the barcode reader, or turn on the camera in settings.
        </span>
      </section>
    )
  }

  if (outcome.kind === 'pending') {
    return (
      <section role="status" className="flex items-center gap-4 rounded-md border border-warning/60 bg-warning-soft p-5">
        <Loader2 className="size-6 shrink-0 animate-spin text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-lg font-semibold text-warning">Checking in…</p>
          <p className="truncate font-mono text-xs text-muted">{outcome.code}</p>
        </div>
      </section>
    )
  }

  const tone =
    outcome.kind === 'error' || outcome.status === 'NotFound' || outcome.status === 'Invalid' || outcome.status === 'Closed'
      ? 'error'
      : outcome.status === 'CheckedIn'
        ? 'success'
        : 'warning'
  const styles = {
    success: { box: 'border-accent bg-accent-soft', icon: 'bg-accent text-accent-foreground', title: 'text-accent' },
    warning: { box: 'border-warning bg-warning-soft', icon: 'bg-warning text-background', title: 'text-warning' },
    error: { box: 'border-danger bg-danger-soft', icon: 'bg-danger text-background', title: 'text-danger' },
  }[tone]

  const title =
    outcome.kind === 'error'
      ? outcome.title
      : outcome.status === 'CheckedIn'
        ? 'Checked in'
        : outcome.status === 'AlreadyCheckedIn'
          ? 'Already checked in'
          : outcome.status === 'NotFound'
            ? 'Guest not found'
            : outcome.status === 'Closed'
              ? 'Check-in closed'
              : 'No E-Badge value'
  const guest = outcome.kind === 'result' ? outcome.guest : null

  return (
    <section role="status" aria-live="assertive" className={cn('rounded-md border p-5', styles.box)}>
      <div className="flex items-center gap-3">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-md', styles.icon)}>
          {tone === 'success' ? (
            <Check className="size-5" strokeWidth={2.6} aria-hidden="true" />
          ) : tone === 'warning' ? (
            <CircleAlert className="size-5" aria-hidden="true" />
          ) : (
            <X className="size-5" strokeWidth={2.6} aria-hidden="true" />
          )}
        </span>
        <span className={cn('text-xl font-semibold', styles.title)}>{title}</span>
      </div>

      {guest ? (
        <>
          <div className="mt-4">
            <p className="text-2xl font-semibold leading-tight tracking-tight">{guest.name}</p>
            {guest.company || guest.position ? (
              <p className="mt-1 text-sm text-muted">{[guest.position, guest.company].filter(Boolean).join(' · ')}</p>
            ) : null}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
            <Fact label="RSVP" value={guest.rsvpStatus} />
            <Fact label="Check-ins" value={String(guest.checkInCount)} />
            {tone === 'warning' ? (
              <>
                <Fact label="First" value={formatTime(guest.firstCheckedInOn, timezone)} />
                <Fact label="This scan" value={formatTime(guest.lastCheckedInOn, timezone)} />
              </>
            ) : (
              <div className="col-span-2">
                <Fact label="Checked in at" value={formatDateTime(guest.lastCheckedInOn, timezone)} />
              </div>
            )}
          </dl>
          {tone === 'warning' ? <p className="mt-3 text-sm text-warning">Check the guest&apos;s ID before letting them in again.</p> : null}
        </>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted">{outcome.message}</p>
      )}
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function zoned(timezone?: string | null) {
  if (!timezone) return undefined
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone })
    return timezone
  } catch {
    return undefined
  }
}

function formatTime(value: string | null | undefined, timezone?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: zoned(timezone) })
}

function formatDateTime(value: string | null | undefined, timezone?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: zoned(timezone),
  })
}

let audio: AudioContext | null = null

/** Short tones: a rising double beep for a check-in, one mid tone for a repeat, a low buzz for an error. */
function beep(kind: 'success' | 'warning' | 'error') {
  try {
    audio ??= new AudioContext()
    const context = audio
    if (context.state === 'suspended') void context.resume()
    const notes = kind === 'success' ? [880, 1320] : kind === 'warning' ? [660] : [220, 196]
    notes.forEach((frequency, index) => {
      const start = context.currentTime + index * 0.14
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = kind === 'error' ? 'square' : 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(kind === 'error' ? 0.08 : 0.18, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.13)
    })
  } catch {
    // No sound on this device; the card still shows the result.
  }
}
