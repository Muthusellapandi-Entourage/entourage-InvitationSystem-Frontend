import { Check, Loader2, Printer, QrCode, X } from 'lucide-react'
import type { FormEvent, ReactNode, RefObject } from 'react'
import type { KioskSettings, PrintGuest } from '@/api/printBadgeApi'

export type KioskStep =
  | { kind: 'welcome' }
  | { kind: 'looking' }
  | { kind: 'confirm'; guest: PrintGuest; already: boolean }
  | { kind: 'printing'; guest: PrintGuest }
  | { kind: 'done'; guest: PrintGuest; note?: string }
  | { kind: 'error'; message: string }

/**
 * The self check-in kiosk screen: one big card, one thing to do at a time.
 * Welcome (scan) → "Is this you?" → printing → done. Used by the kiosk itself and by the admin preview.
 */
export function KioskScreen({
  settings,
  eventName,
  assetOrigin,
  step,
  inputRef,
  onCode,
  onConfirm,
  onCancel,
  camera,
  countdown,
  preview = false,
}: {
  settings: KioskSettings
  eventName: string
  assetOrigin: string
  step: KioskStep
  inputRef?: RefObject<HTMLInputElement | null>
  onCode?: (code: string) => void
  onConfirm?: () => void
  onCancel?: () => void
  /** Camera viewfinder, shown on the welcome step when the kiosk uses a camera. */
  camera?: ReactNode
  /** Seconds until the kiosk returns to the welcome screen. */
  countdown?: number | null
  preview?: boolean
}) {
  const accent = { background: settings.accentColor, color: settings.accentTextColor }
  const outline = { borderColor: `${settings.textColor}40`, color: settings.textColor }
  const muted = { color: settings.textColor, opacity: 0.75 }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const code = String(data.get('code') ?? '').trim()
    event.currentTarget.reset()
    if (code) onCode?.(code)
  }

  return (
    <div
      className="flex size-full items-center justify-center overflow-hidden p-[4%]"
      style={{
        background: settings.backgroundAssetId
          ? `${settings.backgroundColor} url('${assetOrigin}/api/public/assets/${settings.backgroundAssetId}') center / cover no-repeat`
          : settings.backgroundColor,
        color: settings.textColor,
        fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <div className="flex w-full max-w-[680px] flex-col items-center rounded-md px-[6%] py-[7%] text-center" style={{ background: settings.cardColor }}>
        {settings.logoAssetId ? (
          <img src={`${assetOrigin}/api/public/assets/${settings.logoAssetId}`} alt={eventName} className="mb-[6%] max-h-20 max-w-[60%] object-contain" />
        ) : (
          <p className="mb-[5%] text-sm font-medium uppercase tracking-[0.18em]" style={muted}>
            {eventName}
          </p>
        )}

        {step.kind === 'welcome' || step.kind === 'looking' ? (
          <>
            <h1 className="text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-tight tracking-tight">{settings.welcomeTitle}</h1>
            <p className="mt-3 max-w-md text-[clamp(1rem,1.8vw,1.25rem)] leading-relaxed" style={muted}>
              {settings.welcomeText}
            </p>
            {camera ? (
              <div className="mt-8 w-full max-w-sm">{camera}</div>
            ) : (
              <div className="mt-10 flex size-36 items-center justify-center rounded-md border-2" style={{ borderColor: settings.accentColor }}>
                {step.kind === 'looking' ? (
                  <Loader2 className="size-14 animate-spin" style={{ color: settings.accentColor }} aria-hidden="true" />
                ) : (
                  <QrCode className="size-16" style={{ color: settings.accentColor }} aria-hidden="true" />
                )}
              </div>
            )}
            {/* The barcode reader types the code here and presses Enter; it stays focused. */}
            <form onSubmit={submit} className="mt-6 w-full max-w-sm">
              <input
                ref={inputRef}
                name="code"
                autoComplete="off"
                spellCheck={false}
                disabled={preview || step.kind === 'looking'}
                aria-label="Badge code"
                placeholder={step.kind === 'looking' ? 'Looking you up…' : 'Waiting for scan…'}
                className="h-11 w-full rounded-md border bg-transparent px-3 text-center text-sm focus:outline-none"
                style={outline}
              />
            </form>
          </>
        ) : null}

        {step.kind === 'confirm' ? (
          <>
            <p className="text-sm font-medium uppercase tracking-[0.18em]" style={muted}>
              {settings.confirmTitle}
            </p>
            <h1 className="mt-3 text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-tight tracking-tight">{step.guest.name}</h1>
            {step.guest.position || step.guest.company ? (
              <p className="mt-2 text-[clamp(1rem,1.8vw,1.3rem)]" style={muted}>
                {[step.guest.position, step.guest.company].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            {settings.showSeat && step.guest.seat ? (
              <p className="mt-5 rounded-md px-4 py-2 text-lg font-semibold" style={{ border: `1px solid ${settings.accentColor}`, color: settings.accentColor }}>
                {step.guest.seat}
              </p>
            ) : null}
            {step.already ? (
              <p className="mt-5 text-sm" style={muted}>
                {settings.alreadyText}
              </p>
            ) : null}
            <div className="mt-10 grid w-full max-w-md gap-3">
              <button type="button" className="flex h-16 items-center justify-center gap-3 rounded-md text-xl font-semibold" style={accent} onClick={onConfirm}>
                <Printer className="size-6" aria-hidden="true" />
                {step.already ? (settings.allowReprint ? 'Print my badge again' : settings.confirmButton) : settings.confirmButton}
              </button>
              <button type="button" className="flex h-12 items-center justify-center rounded-md border text-base font-medium" style={outline} onClick={onCancel}>
                {settings.cancelButton}
              </button>
            </div>
          </>
        ) : null}

        {step.kind === 'printing' ? (
          <>
            <Loader2 className="size-16 animate-spin" style={{ color: settings.accentColor }} aria-hidden="true" />
            <h1 className="mt-6 text-[clamp(1.6rem,3.5vw,2.5rem)] font-semibold">{settings.printingText}</h1>
            <p className="mt-2 text-lg" style={muted}>
              {step.guest.name}
            </p>
          </>
        ) : null}

        {step.kind === 'done' ? (
          <>
            <span className="flex size-20 items-center justify-center rounded-full" style={accent}>
              <Check className="size-10" strokeWidth={2.6} aria-hidden="true" />
            </span>
            <h1 className="mt-6 text-[clamp(1.8rem,4vw,3rem)] font-semibold leading-tight">{settings.doneTitle}</h1>
            <p className="mt-2 text-xl font-medium">{step.guest.name}</p>
            <p className="mt-3 max-w-md text-[clamp(1rem,1.8vw,1.2rem)] leading-relaxed" style={muted}>
              {step.note ?? settings.doneText}
            </p>
            {settings.showSeat && step.guest.seat ? (
              <p className="mt-5 rounded-md px-4 py-2 text-lg font-semibold" style={{ border: `1px solid ${settings.accentColor}`, color: settings.accentColor }}>
                {step.guest.seat}
              </p>
            ) : null}
          </>
        ) : null}

        {step.kind === 'error' ? (
          <>
            <span className="flex size-20 items-center justify-center rounded-full bg-[#e06c75] text-[#111210]">
              <X className="size-10" strokeWidth={2.6} aria-hidden="true" />
            </span>
            <p className="mt-6 max-w-md text-[clamp(1.1rem,2.2vw,1.5rem)] font-medium leading-relaxed">{step.message}</p>
            <button type="button" className="mt-8 flex h-12 w-full max-w-xs items-center justify-center rounded-md border text-base font-medium" style={outline} onClick={onCancel}>
              Try again
            </button>
          </>
        ) : null}

        {countdown != null && (step.kind === 'done' || step.kind === 'error') ? (
          <p className="mt-8 text-xs" style={muted}>
            Back to the start in {countdown}s
          </p>
        ) : null}
      </div>
    </div>
  )
}
