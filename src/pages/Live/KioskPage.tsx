import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError, apiBaseUrl } from '@/api/client'
import { kioskApi } from '@/api/printBadgeApi'
import { useQrCamera } from '@/checkin/useQrCamera'
import { KioskScreen, type KioskStep } from '@/components/kiosk/KioskScreen'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { printBadge } from '@/printing/printBadge'

const assetOrigin = apiBaseUrl || window.location.origin
/** Back to the start when nobody answers "Is this you?". */
const CONFIRM_TIMEOUT_S = 30

/**
 * Self check-in kiosk behind a secret link (/kiosk/{token}), no sign-in. A guest scans the QR on their
 * E-Badge, confirms it is them, and their badge prints. The screen then resets for the next guest.
 */
export function KioskPage() {
  const { token = '' } = useParams()
  const query = useQuery({
    queryKey: ['kiosk', token],
    queryFn: () => kioskApi.info(token),
    enabled: Boolean(token),
    refetchInterval: 60_000,
    retry: (count, error) => !(error instanceof ApiError && (error.status === 404 || error.status === 410)) && count < 3,
  })
  const info = query.data
  useDocumentTitle(info ? `Check-in · ${info.eventName}` : 'Check-in')

  const [step, setStep] = useState<KioskStep>({ kind: 'welcome' })
  const [countdown, setCountdown] = useState<number | null>(null)
  const codeRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const reset = useCallback(() => {
    codeRef.current = null
    setCountdown(null)
    setStep({ kind: 'welcome' })
  }, [])

  const lookup = useCallback(
    async (code: string) => {
      codeRef.current = code
      setStep({ kind: 'looking' })
      try {
        const result = await kioskApi.lookup(token, code)
        if (!result.guest) {
          setStep({ kind: 'error', message: result.message })
          return
        }
        if (result.alreadyCheckedIn && info && !info.settings.allowReprint) {
          setStep({ kind: 'error', message: `${info.settings.alreadyText} Please see the front desk.` })
          return
        }
        setStep({ kind: 'confirm', guest: result.guest, already: result.alreadyCheckedIn })
      } catch (error) {
        setStep({ kind: 'error', message: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.' })
      }
    },
    [token, info],
  )

  const camera = useQrCamera((code) => {
    if (step.kind === 'welcome') void lookup(code)
  })
  const useCamera = Boolean(info?.settings.useCamera)
  useEffect(() => {
    if (!useCamera) return
    if (step.kind === 'welcome' && !camera.running) void camera.start()
    if (step.kind !== 'welcome' && step.kind !== 'looking' && camera.running) camera.stop()
  }, [useCamera, step.kind]) // eslint-disable-line react-hooks/exhaustive-deps

  async function confirm() {
    if (step.kind !== 'confirm' || !codeRef.current) return
    const guest = step.guest
    setStep({ kind: 'printing', guest })
    try {
      const result = await kioskApi.confirm(token, codeRef.current)
      if (!result.print) {
        setStep({ kind: 'error', message: result.message })
        return
      }
      if (!result.print.design) {
        setStep({ kind: 'done', guest: result.print.guest, note: 'You are checked in. Your badge will be ready at the front desk.' })
        return
      }
      await printBadge(result.print.design, result.print.guest, assetOrigin)
      void kioskApi.printed(token, result.print.guest.id).catch(() => undefined)
      setStep({ kind: 'done', guest: result.print.guest })
    } catch (error) {
      setStep({ kind: 'error', message: error instanceof ApiError || error instanceof Error ? error.message : 'Printing failed. Please see the front desk.' })
    }
  }

  // Keep the scanner field focused on the welcome screen (a barcode reader types into it).
  useEffect(() => {
    if (step.kind !== 'welcome') return
    const focus = () => inputRef.current?.focus({ preventScroll: true })
    focus()
    const timer = window.setInterval(focus, 1500)
    return () => window.clearInterval(timer)
  }, [step.kind])

  // Count down back to the welcome screen.
  useEffect(() => {
    if (!info) return
    const seconds = step.kind === 'done' || step.kind === 'error' ? info.settings.resetSeconds : step.kind === 'confirm' ? CONFIRM_TIMEOUT_S : null
    if (seconds == null) {
      setCountdown(null)
      return
    }
    setCountdown(seconds)
    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current == null) return current
        if (current <= 1) {
          window.clearInterval(timer)
          reset()
          return null
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [step, info, reset])

  const gone = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 410)
  if (gone || !info) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#111210] px-6 text-center text-[#f4f4f5]">
        <p className="text-lg">{gone ? (query.error as ApiError).message : query.isError ? 'Connecting…' : 'Loading…'}</p>
      </main>
    )
  }

  if (info.status !== 'Active') {
    return (
      <main className="h-dvh">
        <KioskScreen settings={info.settings} eventName={info.eventName} assetOrigin={assetOrigin} step={{ kind: 'error', message: 'Check-in has not opened yet.' }} onCancel={() => void query.refetch()} preview />
      </main>
    )
  }

  return (
    <main
      className="h-dvh select-none"
      onClick={() => {
        if (step.kind === 'welcome') inputRef.current?.focus({ preventScroll: true })
      }}
    >
      <KioskScreen
        settings={info.settings}
        eventName={info.eventName}
        assetOrigin={assetOrigin}
        step={step}
        inputRef={inputRef}
        onCode={(code) => void lookup(code)}
        onConfirm={() => void confirm()}
        onCancel={reset}
        countdown={step.kind === 'done' || step.kind === 'error' ? countdown : null}
        camera={
          useCamera ? (
            <div className="relative aspect-square w-full overflow-hidden rounded-md bg-black">
              <video ref={camera.videoRef} muted playsInline className="absolute inset-0 size-full object-cover" />
              <div className="pointer-events-none absolute inset-[14%] rounded-md border-2" style={{ borderColor: info.settings.accentColor }} />
            </div>
          ) : undefined
        }
      />
    </main>
  )
}
