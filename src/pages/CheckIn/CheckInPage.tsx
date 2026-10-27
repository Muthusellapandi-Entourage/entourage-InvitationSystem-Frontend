import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, CircleAlert, Loader2, LogOut, Settings, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { checkInApi, type CheckInGuest, type CheckInStatus } from '@/api/checkInApi'
import { seatingApi } from '@/api/seatingApi'
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

const gold = '#CBA886'

/**
 * EventPass: the door check-in page. A USB / Bluetooth barcode reader types the E-Badge code into the
 * always-focused field (desk setups); the phone camera can read the QR code too. Each scan checks the
 * guest in, shows their details and seat, and staff can mark them as seated.
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
      className="min-h-dvh bg-[#06111d] text-white"
      style={{
        fontFamily: 'Manifa, "Segoe UI", system-ui, -apple-system, sans-serif',
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
      <div className="mx-auto flex max-w-[520px] flex-col gap-5">
        <header className="flex items-center justify-between gap-3 pt-1">
          <div className="min-w-0">
            <p className="text-[26px] font-extrabold leading-tight tracking-[-0.02em]">EventPass</p>
            <p className="truncate text-[13px] text-[#9aa7b5]">Barcode scanner{event ? ` · ${event.name}` : ''}</p>
          </div>
          <button
            type="button"
            aria-label={settingsOpen ? 'Close settings' : 'Open camera settings'}
            aria-expanded={settingsOpen}
            onClick={() => {
              setSettingsOpen((open) => !open)
              if (!settingsOpen && camera.cameras.length === 0) void camera.findCameras()
            }}
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-full border transition-colors',
              settingsOpen ? 'border-[#CBA886] bg-[#CBA886] text-[#002650]' : 'border-[#CBA886]/40 bg-[#0c1b2b] text-[#CBA886]',
            )}
          >
            <Settings className="size-[22px]" aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
          <label htmlFor="badge-input" className="text-xs font-bold tracking-[0.14em]" style={{ color: gold }}>
            BARCODE SCANNER
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
            className="h-16 rounded-2xl border-2 border-[#CBA886] bg-[#0c1b2b] px-[18px] text-[17px] font-semibold text-white outline-none placeholder:text-[#8e9bab] focus:shadow-[0_0_0_4px_rgba(203,168,134,0.18)]"
          />
          <p className="text-[13px] leading-relaxed text-[#9aa7b5]">
            Click this page so it is in front, then scan. If Notepad is the front window, the code goes there instead.
          </p>
        </form>

        {settingsOpen ? (
          <section aria-labelledby="settings-title" className="flex flex-col gap-3.5 rounded-[18px] border border-[#CBA886]/25 bg-[#0c1b2b] p-[18px]">
            <h2 id="settings-title" className="text-lg font-bold">
              Settings
            </h2>
            <p className="text-[13px] leading-relaxed text-[#9aa7b5]">
              Cameras are listed here. A barcode reader does not appear by name — scanning a badge checks in from the box above.
            </p>
            {camera.cameras.length > 0 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-xs font-bold tracking-[0.14em]" style={{ color: gold }}>
                  CAMERAS
                </legend>
                {camera.cameras.map((item) => (
                  <label
                    key={item.deviceId || item.label}
                    className={cn(
                      'flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[14px] border px-3.5 text-[15px]',
                      camera.cameraId === item.deviceId ? 'border-[#CBA886] bg-[#CBA886]/10 font-semibold' : 'border-white/10 text-[#dbe2ea]',
                    )}
                  >
                    <input
                      type="radio"
                      name="camera"
                      checked={camera.cameraId === item.deviceId}
                      onChange={() => camera.setCameraId(item.deviceId)}
                      className="size-5 accent-[#CBA886]"
                    />
                    {item.label}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <p role="status" className={cn('text-sm', camera.running ? 'text-[#7fe0a9]' : 'text-[#c3ccd6]')}>
              {camera.status}
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => void camera.findCameras()}
                className="h-[50px] flex-1 rounded-full border border-[#CBA886]/50 text-[15px] font-bold text-[#CBA886]"
              >
                Find cameras
              </button>
              <button
                type="button"
                onClick={() => (camera.running ? camera.stop() : void camera.start())}
                className="h-[50px] flex-1 rounded-full bg-[#CBA886] text-[15px] font-extrabold text-[#002650]"
              >
                {camera.running ? 'Stop camera' : 'Start camera'}
              </button>
            </div>
            <Link to={`/events/${eventId}`} className="inline-flex items-center gap-2 self-start text-sm text-[#9aa7b5] hover:text-white">
              <LogOut className="size-4" aria-hidden="true" />
              Leave check-in
            </Link>
          </section>
        ) : null}

        {camera.running ? (
          <section aria-label="Camera viewfinder" className="relative aspect-[3/4] w-full overflow-hidden rounded-[18px] border-2 border-[#CBA886]/55 bg-black">
            <video ref={camera.videoRef} muted playsInline className="absolute inset-0 size-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative aspect-square w-[72%] rounded-[18px] shadow-[0_0_0_999px_rgba(4,10,18,0.5)]">
                <span className="absolute left-0 top-0 size-10 rounded-tl-[18px] border-l-4 border-t-4 border-[#CBA886]" />
                <span className="absolute right-0 top-0 size-10 rounded-tr-[18px] border-r-4 border-t-4 border-[#CBA886]" />
                <span className="absolute bottom-0 left-0 size-10 rounded-bl-[18px] border-b-4 border-l-4 border-[#CBA886]" />
                <span className="absolute bottom-0 right-0 size-10 rounded-br-[18px] border-b-4 border-r-4 border-[#CBA886]" />
              </div>
            </div>
            <p className="absolute inset-x-0 bottom-4 text-center text-[13px] font-semibold">Hold the badge inside the frame</p>
          </section>
        ) : null}

        <ResultCard outcome={outcome} timezone={event?.timezone} />

        {guest && seat ? (
          <section aria-label="Seat" className="flex flex-col items-center gap-1 rounded-[18px] border border-[#CBA886]/30 bg-[#0c1b2b] p-5 text-center">
            <span className="text-[13px] font-bold tracking-[0.18em]" style={{ color: gold }}>
              SEAT
            </span>
            <span className="text-[34px] font-extrabold leading-tight tracking-[-0.01em] sm:text-[40px]">{seat}</span>
          </section>
        ) : null}

        {guest ? (
          <section className="flex flex-col gap-3 rounded-[18px] bg-[#0c1b2b] p-5">
            <span className="text-[17px] font-bold">{guest.name}</span>
            {!seat ? (
              <span className="text-[15px] text-[#c3ccd6]">No Seat Assigned</span>
            ) : guest.seatedOn ? (
              <span className="flex items-center gap-2.5 text-[15px] text-[#c3ccd6]">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#2fbf71]/15 text-[#7fe0a9]">
                  <Check className="size-4" aria-hidden="true" />
                </span>
                Seated at {seat} · {formatTime(guest.seatedOn, event?.timezone)}
              </span>
            ) : (
              <>
                <span className="text-[15px] text-[#c3ccd6]">Seat: {seat} · Not seated</span>
                <button
                  type="button"
                  disabled={seatedMutation.isPending}
                  onClick={() => seatedMutation.mutate(guest.id)}
                  className="flex h-14 items-center justify-center gap-2.5 rounded-full bg-[#CBA886] text-[17px] font-extrabold text-[#002650] disabled:opacity-60"
                >
                  {seatedMutation.isPending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Check className="size-5" aria-hidden="true" />}
                  Mark as Seated
                </button>
              </>
            )}
            {seatNote ? (
              <p role="status" className="text-[13px] text-[#9aa7b5]">
                {seatNote}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="flex flex-col gap-2.5">
          <h2 className="text-base font-bold">Scan history</h2>
          {guest && guest.history.length > 0 ? (
            <ol className="overflow-hidden rounded-2xl bg-[#0c1b2b]">
              {guest.history.map((item, index) => (
                <li
                  key={`${item.at}-${index}`}
                  className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3.5 last:border-b-0"
                >
                  <span className="flex items-center gap-2.5 text-[15px]">
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        item.kind === 'Seated' ? 'bg-[#CBA886]' : index === guest.history.length - 1 ? 'bg-[#2fbf71]' : 'bg-[#e0a526]',
                      )}
                    />
                    {item.kind === 'Seated' ? 'Marked as seated' : index === guest.history.length - 1 ? 'First check-in' : 'Scanned again'}
                  </span>
                  <span className="text-sm text-[#9aa7b5]">{formatTime(item.at, event?.timezone)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-2xl bg-[#0c1b2b] p-4 text-sm text-[#9aa7b5]">Scan a badge to see this guest&apos;s scans.</p>
          )}
        </section>
      </div>
    </div>
  )
}

function ResultCard({ outcome, timezone }: { outcome: Outcome; timezone?: string | null }) {
  if (outcome.kind === 'idle') {
    return (
      <section className="flex flex-col items-center gap-2 rounded-[18px] border border-dashed border-[#CBA886]/35 bg-[#0a1828] px-6 py-8 text-center">
        <span className="text-[22px] font-bold">Ready to scan</span>
        <span className="max-w-[280px] text-[15px] leading-relaxed text-[#9aa7b5]">
          Scan a guest&apos;s E-Badge with the barcode reader, or turn on the camera in settings.
        </span>
      </section>
    )
  }

  if (outcome.kind === 'pending') {
    return (
      <section role="status" className="flex items-center gap-3 rounded-[18px] border-[1.5px] border-[#e0a526] bg-[#2b2110] p-5">
        <Loader2 className="size-6 shrink-0 animate-spin text-[#f7c95a]" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xl font-extrabold text-[#f7c95a]">Checking in…</p>
          <p className="truncate font-mono text-xs text-[#e3d6bf]">{outcome.code}</p>
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
    success: { box: 'border-[#2fbf71] bg-[#0d2a1e]', badge: 'bg-[#2fbf71]', title: 'text-[#8ff0b9]', soft: 'text-[#c9d6cf]', label: 'text-[#8fb8a3]', line: 'border-[#8ff0b9]/20' },
    warning: { box: 'border-[#e0a526] bg-[#2b2110]', badge: 'bg-[#e0a526]', title: 'text-[#f7c95a]', soft: 'text-[#e3d6bf]', label: 'text-[#c9ab72]', line: 'border-[#f7c95a]/25' },
    error: { box: 'border-[#ef5b5b] bg-[#2e1215]', badge: 'bg-[#ef5b5b]', title: 'text-[#ff9b9b]', soft: 'text-[#f1d0d0]', label: 'text-[#d69a9a]', line: 'border-[#ff9b9b]/25' },
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
    <section role="status" aria-live="assertive" className={cn('flex flex-col gap-4 rounded-[18px] border-[1.5px] p-5', styles.box)}>
      <div className="flex items-center gap-3">
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-full text-[#06111d]', styles.badge)}>
          {tone === 'success' ? <Check className="size-6" strokeWidth={2.6} aria-hidden="true" /> : tone === 'warning' ? <CircleAlert className="size-6" aria-hidden="true" /> : <X className="size-6" strokeWidth={2.6} aria-hidden="true" />}
        </span>
        <span className={cn('text-2xl font-extrabold', styles.title)}>{title}</span>
      </div>

      {guest ? (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-[26px] font-extrabold leading-tight">{guest.name}</span>
            {guest.company ? <span className={cn('text-[15px]', styles.soft)}>{guest.company}</span> : null}
            {guest.position ? <span className={cn('text-[15px]', styles.soft)}>{guest.position}</span> : null}
          </div>
          <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3.5', styles.line)}>
            <Fact label="RSVP" value={guest.rsvpStatus} labelClass={styles.label} />
            <Fact label="CHECK-INS" value={String(guest.checkInCount)} labelClass={styles.label} />
            {tone === 'warning' ? (
              <>
                <Fact label="FIRST" value={formatTime(guest.firstCheckedInOn, timezone)} labelClass={styles.label} />
                <Fact label="THIS SCAN" value={formatTime(guest.lastCheckedInOn, timezone)} labelClass={styles.label} />
              </>
            ) : (
              <div className="col-span-2">
                <Fact label="CHECKED IN AT" value={formatDateTime(guest.lastCheckedInOn, timezone)} labelClass={styles.label} />
              </div>
            )}
          </dl>
          {tone === 'warning' ? <p className={cn('text-sm', styles.soft)}>Check the guest&apos;s ID before letting them in again.</p> : null}
        </>
      ) : (
        <p className={cn('text-[15px] leading-relaxed', styles.soft)}>{outcome.message}</p>
      )}
    </section>
  )
}

function Fact({ label, value, labelClass }: { label: string; value: string; labelClass: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className={cn('text-[11px] font-bold tracking-[0.12em]', labelClass)}>{label}</dt>
      <dd className="text-[15px] font-bold">{value}</dd>
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
