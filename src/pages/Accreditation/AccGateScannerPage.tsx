import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Camera, CameraOff, Check, DoorOpen, Loader2, LogIn, LogOut, ScanLine, ShieldAlert, TriangleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { accApi, type AccScanResult } from '@/api/accreditationApi'
import { ApiError } from '@/api/client'
import { errorMessage, PrivateImage, useAccRole } from '@/components/accreditation/shared'
import { Button } from '@/components/ui/Button'
import { useQrCamera } from '@/checkin/useQrCamera'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'

type Gate = { mode: 'gate' | 'mixed'; zoneId: string; gateName: string; direction: 'in' | 'out' }
type Shown = { result: AccScanResult; at: number }

/** The same code again within this window is ignored (readers and cameras repeat). */
const REPEAT_MS = 3000

const storageKey = (eventId: string) => `acc.gate.${eventId}`

function loadGate(eventId: string): Gate | null {
  try {
    const raw = localStorage.getItem(storageKey(eventId))
    return raw ? (JSON.parse(raw) as Gate) : null
  } catch {
    return null
  }
}

function saveGate(eventId: string, gate: Gate) {
  try {
    localStorage.setItem(storageKey(eventId), JSON.stringify(gate))
  } catch {
    // Not remembered on this device; fine.
  }
}

let audio: AudioContext | null = null
/** Distinct sounds: one high beep (green), two mid beeps (yellow), a low buzz (red). */
function tone(color: 'green' | 'yellow' | 'red') {
  try {
    audio ??= new AudioContext()
    const plan = color === 'green' ? [[880, 0, 0.12]] : color === 'yellow' ? [[620, 0, 0.12], [620, 0.18, 0.12]] : [[180, 0, 0.45]]
    for (const [frequency, start, length] of plan) {
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.type = color === 'red' ? 'square' : 'sine'
      oscillator.frequency.value = frequency
      gain.gain.value = 0.15
      oscillator.connect(gain).connect(audio.destination)
      oscillator.start(audio.currentTime + start)
      oscillator.stop(audio.currentTime + start + length)
    }
  } catch {
    // No sound on this device.
  }
}

const palette = {
  green: { bg: '#0f7b4b', icon: Check },
  yellow: { bg: '#b7791f', icon: TriangleAlert },
  red: { bg: '#b42318', icon: ShieldAlert },
} as const

/**
 * Accreditation gate scanner (online). Choose the gate once (zone or venue entrance, mixed with guests or
 * not, in or out); every scan then shows a full-screen green / yellow / red answer.
 */
export function AccGateScannerPage() {
  const { accEventId = '' } = useParams()
  const { canScan } = useAccRole()
  const setupQuery = useQuery({ queryKey: ['acc', 'setup', accEventId], queryFn: () => accApi.setup(accEventId) })
  const setup = setupQuery.data
  const [gate, setGate] = useState<Gate | null>(() => loadGate(accEventId))
  const [editingGate, setEditingGate] = useState(false)
  const [value, setValue] = useState('')
  const [shown, setShown] = useState<Shown | null>(null)
  const [history, setHistory] = useState<AccScanResult[]>([])
  const [networkError, setNetworkError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastScan = useRef<{ code: string; at: number } | null>(null)
  const finePointer = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches, [])
  useDocumentTitle(setup ? `Gate · ${setup.event.name}` : 'Gate scanner')

  const zone = setup?.zones.find((item) => item.id === gate?.zoneId)
  const linked = Boolean(setup?.event.eventId)
  const gateLabel = gate ? (zone ? `Zone ${zone.code} · ${zone.name}` : 'Venue entrance') : ''

  const focusInput = useCallback(() => {
    if (finePointer) inputRef.current?.focus({ preventScroll: true })
  }, [finePointer])

  useEffect(() => {
    focusInput()
  }, [focusInput, gate, editingGate])

  // The answer clears itself: green quickly, warnings stay a little longer.
  useEffect(() => {
    if (!shown) return
    const timer = window.setTimeout(() => setShown(null), shown.result.result === 'green' ? 2500 : 5000)
    return () => window.clearTimeout(timer)
  }, [shown])

  const scan = useMutation({
    mutationFn: (code: string) =>
      accApi.scan(accEventId, {
        code,
        zoneId: gate?.zoneId || null,
        gateName: gate?.gateName ?? '',
        direction: gate?.direction ?? 'in',
        allowGuests: gate?.mode === 'mixed',
      }),
    onSuccess: (result) => {
      setNetworkError(null)
      setShown({ result, at: Date.now() })
      setHistory((current) => [result, ...current].slice(0, 30))
      tone(result.result)
    },
    onError: (error) => {
      setNetworkError(error instanceof ApiError && error.status !== 0 ? error.message : 'No connection to the server. Check Wi-Fi / data and scan again.')
      tone('red')
    },
    onSettled: () => focusInput(),
  })

  const submit = useCallback(
    (raw: string) => {
      const code = raw.trim()
      setValue('')
      if (!code) return
      const now = Date.now()
      if (lastScan.current && lastScan.current.code === code && now - lastScan.current.at < REPEAT_MS) {
        lastScan.current.at = now
        return
      }
      lastScan.current = { code, at: now }
      scan.mutate(code)
    },
    [scan],
  )

  const camera = useQrCamera(submit)

  if (!canScan) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6 text-center text-sm text-foreground">
        Your role cannot scan at the gates. Ask an accreditation admin for the Gate guard role.
      </div>
    )
  }

  if (setupQuery.isLoading || !setup) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted">
        {setupQuery.isError ? errorMessage(setupQuery.error, 'The event could not be loaded.') : 'Loading…'}
      </div>
    )
  }

  if (!gate || editingGate) {
    return (
      <GateSetup
        eventName={setup.event.name}
        backTo={`/accreditation/${accEventId}`}
        zones={setup.zones.filter((item) => item.id).map((item) => ({ id: item.id!, code: item.code, name: item.name, color: item.color }))}
        linked={linked}
        initial={gate}
        onCancel={gate ? () => setEditingGate(false) : undefined}
        onSave={(next) => {
          saveGate(accEventId, next)
          setGate(next)
          setEditingGate(false)
        }}
      />
    )
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit(value)
  }

  const current = shown?.result
  return (
    <div
      className="min-h-dvh bg-background text-foreground"
      style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest('button, a, input, select, label, video')) focusInput()
      }}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4">
        <header className="flex items-center gap-3 border-b border-border pb-3">
          <Link to={`/accreditation/${accEventId}`} aria-label="Leave the gate" className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border text-muted hover:bg-hover">
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{gate.gateName || gateLabel}</h1>
            <p className="truncate text-xs text-muted">
              {setup.event.name} · {gateLabel}
              {gate.mode === 'mixed' ? ' · staff + guests' : ''}
            </p>
          </div>
          <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Direction">
            {(['in', 'out'] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                aria-pressed={gate.direction === direction}
                className={cn('inline-flex h-8 items-center gap-1 rounded-[4px] px-2.5 text-sm', gate.direction === direction ? 'bg-selected font-medium' : 'text-muted')}
                onClick={() => {
                  const next = { ...gate, direction }
                  saveGate(accEventId, next)
                  setGate(next)
                }}
              >
                {direction === 'in' ? <LogIn className="size-4" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}
                {direction === 'in' ? 'In' : 'Out'}
              </button>
            ))}
          </div>
          <Button variant="secondary" className="h-10" onClick={() => setEditingGate(true)}>
            <DoorOpen className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Gate</span>
          </Button>
        </header>

        <form onSubmit={onSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-accent" aria-hidden="true" />
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-label="Badge code"
              placeholder="Scan a badge…"
              autoComplete="off"
              autoCapitalize="characters"
              className="h-14 w-full rounded-md border border-border bg-surface pl-11 pr-3 text-lg tracking-wider focus:border-accent"
            />
          </div>
          <Button type="button" variant="secondary" className="h-14 px-4" onClick={() => (camera.running ? camera.stop() : void camera.start())} aria-label={camera.running ? 'Stop camera' : 'Start camera'}>
            {camera.running ? <CameraOff className="size-5" aria-hidden="true" /> : <Camera className="size-5" aria-hidden="true" />}
          </Button>
        </form>

        {camera.running ? (
          <section aria-label="Camera" className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-md border border-border bg-black">
            <video ref={camera.videoRef} muted playsInline className="absolute inset-0 size-full object-cover" />
            <div className="pointer-events-none absolute inset-[14%] rounded-md border-2 border-white/80" aria-hidden="true" />
          </section>
        ) : (
          <p className="text-xs text-muted">{camera.status === 'Camera is off.' ? 'Use the barcode reader, or tap the camera button to scan with this device.' : camera.status}</p>
        )}

        {scan.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Checking…
          </p>
        ) : null}
        {networkError ? (
          <p role="alert" className="rounded-md border border-danger/50 bg-danger-soft px-3 py-2 text-sm">
            {networkError}
          </p>
        ) : null}

        <section aria-label="Recent scans">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">This gate · recent</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No scans yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-md border border-border">
              {history.map((item, index) => (
                <li key={`${item.scannedOn}-${index}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: palette[item.result].bg }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{item.person?.name ?? item.guest?.name ?? item.title}</span>
                    <span className="text-muted"> · {item.title}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{new Date(item.scannedOn).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {current ? <ResultOverlay key={shown!.at} result={current} eventId={accEventId} onClose={() => setShown(null)} /> : null}
    </div>
  )
}

function ResultOverlay({ result, eventId, onClose }: { result: AccScanResult; eventId: string; onClose: () => void }) {
  const { bg, icon: Icon } = palette[result.result]
  const person = result.person
  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={result.title}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 p-6 text-center text-white"
      style={{ backgroundColor: bg }}
      onClick={onClose}
    >
      <Icon className="size-16" strokeWidth={2.5} aria-hidden="true" />
      <p className="text-3xl font-bold tracking-tight sm:text-4xl">{result.title}</p>
      {person ? (
        <div className="flex flex-col items-center gap-3">
          <PrivateImage fileId={person.photoFileId} load={(fileId) => accApi.fileBlob(eventId, fileId)} alt={person.name} className="h-48 w-36 border-4 border-white/80 bg-white/20 text-white" />
          <div>
            <p className="text-2xl font-semibold">{person.name}</p>
            <p className="text-base opacity-90">{[person.organization, person.jobTitle].filter(Boolean).join(' · ')}</p>
            {person.badgeNumber ? <p className="mt-1 text-sm opacity-80">Badge #{person.badgeNumber}</p> : null}
          </div>
          {person.zones.length ? (
            <div className="flex flex-wrap justify-center gap-2">
              {person.zones.map((zone) => (
                <span key={zone.code} className="inline-flex h-12 min-w-12 items-center justify-center rounded-md border-2 border-white/80 px-2 text-xl font-extrabold" style={{ backgroundColor: zone.color }} title={zone.name}>
                  {zone.code}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : result.guest ? (
        <div>
          <p className="text-2xl font-semibold">{result.guest.name}</p>
          <p className="text-base opacity-90">{[result.guest.guestTypeName, result.guest.company].filter(Boolean).join(' · ')}</p>
        </div>
      ) : null}
      <p className="max-w-md text-base opacity-95">{result.message}</p>
      <p className="text-xs opacity-75">{result.gateLabel} · tap to continue</p>
      <button type="button" className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full bg-black/20" aria-label="Close" onClick={onClose}>
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}

function GateSetup({
  eventName,
  backTo,
  zones,
  linked,
  initial,
  onSave,
  onCancel,
}: {
  eventName: string
  backTo: string
  zones: { id: string; code: string; name: string; color: string }[]
  linked: boolean
  initial: Gate | null
  onSave: (gate: Gate) => void
  onCancel?: () => void
}) {
  const [mode, setMode] = useState<Gate['mode']>(initial?.mode ?? 'gate')
  const [zoneId, setZoneId] = useState(initial?.zoneId ?? '')
  const [gateName, setGateName] = useState(initial?.gateName ?? '')
  const [direction, setDirection] = useState<Gate['direction']>(initial?.direction ?? 'in')
  const effectiveMode = zoneId ? 'gate' : mode

  return (
    <div className="min-h-dvh bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-lg">
        <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {eventName}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Set up this gate</h1>
        <p className="mt-1 text-sm text-muted">Saved on this device. Needs an internet connection while scanning.</p>

        <div className="mt-6 grid gap-5 rounded-lg border border-border bg-surface p-5">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">What does this gate control?</span>
            <select value={zoneId} onChange={(event) => setZoneId(event.target.value)} className="h-11 rounded-md border border-border bg-background px-3 text-sm">
              <option value="">Venue entrance — any approved badge</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  Zone {zone.code} · {zone.name}
                </option>
              ))}
            </select>
          </label>

          {!zoneId && linked ? (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Who comes through?</legend>
              {(
                [
                  ['gate', 'Accreditation badges only', 'Staff, media, vendors. Guest invitations are turned away.'],
                  ['mixed', 'Badges and invited guests', 'Guest QR codes check the guest in, like the guest scanner.'],
                ] as const
              ).map(([value, title, hint]) => (
                <label key={value} className={cn('flex cursor-pointer items-start gap-3 rounded-md border p-3', mode === value ? 'border-accent bg-accent-soft' : 'border-border')}>
                  <input type="radio" name="mode" className="mt-1" checked={mode === value} onChange={() => setMode(value)} />
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="block text-xs text-muted">{hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Gate name</span>
            <input
              value={gateName}
              onChange={(event) => setGateName(event.target.value)}
              placeholder="e.g. North gate, Backstage door 2"
              className="h-11 rounded-md border border-border bg-background px-3 text-sm"
            />
            <span className="text-xs text-muted">Shown in the scan log so you know which door it was.</span>
          </label>

          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Direction</span>
            <div className="inline-flex w-fit rounded-md border border-border p-0.5">
              {(['in', 'out'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={direction === value}
                  className={cn('h-9 rounded-[4px] px-4 text-sm', direction === value ? 'bg-selected font-medium' : 'text-muted')}
                  onClick={() => setDirection(value)}
                >
                  {value === 'in' ? 'Entry' : 'Exit'}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted">Used for the live count of who is inside. You can switch it from the scanner.</span>
          </div>

          <div className="flex justify-end gap-2">
            {onCancel ? (
              <Button variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
            <Button onClick={() => onSave({ mode: effectiveMode, zoneId, gateName: gateName.trim(), direction })}>Start scanning</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
