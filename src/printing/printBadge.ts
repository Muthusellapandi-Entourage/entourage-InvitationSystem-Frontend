import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { apiBaseUrl } from '@/api/client'
import type { PrintBadgeDesign, PrintGuest } from '@/api/printBadgeApi'
import { guestQrDataUrl } from '@/badges/sampleQr'
import { PrintBadgeView, PX_PER_MM } from '@/printing/PrintBadgeView'

/** Paper sizes offered in the designer (millimetres, width × height). */
export const paperPresets = [
  { label: '4 × 3 in (badge printer)', widthMm: 101.6, heightMm: 76.2 },
  { label: '3 × 4 in (portrait)', widthMm: 76.2, heightMm: 101.6 },
  { label: '4 × 6 in', widthMm: 101.6, heightMm: 152.4 },
  { label: 'CR80 card (landscape)', widthMm: 85.6, heightMm: 54 },
  { label: 'CR80 card (portrait)', widthMm: 54, heightMm: 85.6 },
  { label: 'A6 (portrait)', widthMm: 105, heightMm: 148 },
  { label: '62 × 100 mm label', widthMm: 62, heightMm: 100 },
] as const

const ROOT_ID = 'entourage-print-root'
const STYLE_ID = 'entourage-print-style'

/** Waits until every image inside `node` has loaded (or failed), so nothing prints blank. */
async function imagesReady(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll('img'))
  await Promise.all(
    images.map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true })
            image.addEventListener('error', () => resolve(), { once: true })
            // Never hang the desk on a slow image.
            window.setTimeout(resolve, 4000)
          }),
    ),
  )
}

/**
 * Prints one badge from the current page: the badge is drawn into a print-only area, the page's own
 * content is hidden for printing, and the paper size is set to the badge size. Works in every browser
 * (no pop-ups or hidden frames). With Chrome started with --kiosk-printing it goes straight to the
 * default printer without a dialog.
 */
export async function printBadge(design: PrintBadgeDesign, guest: PrintGuest, assetOrigin = apiBaseUrl || window.location.origin) {
  const hasQr = design.elements.some((element) => element.kind === 'qr')
  const qrDataUrl = hasQr ? await guestQrDataUrl(guest.checkInCode) : null

  // Clean up anything left over from an earlier print.
  document.getElementById(ROOT_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${ROOT_ID} { display: none; }
    @page { size: ${design.widthMm}mm ${design.heightMm}mm; margin: 0; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; width: ${design.widthMm}mm; height: ${design.heightMm}mm; overflow: hidden !important; }
      body > *:not(#${ROOT_ID}) { display: none !important; }
      #${ROOT_ID} { display: block !important; position: fixed; left: 0; top: 0; width: ${design.widthMm}mm; height: ${design.heightMm}mm;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }`
  document.head.appendChild(style)

  const host = document.createElement('div')
  host.id = ROOT_ID
  host.setAttribute('aria-hidden', 'true')
  document.body.appendChild(host)

  const root = createRoot(host)
  const cleanup = () => {
    root.unmount()
    host.remove()
    style.remove()
  }

  try {
    flushSync(() => {
      root.render(createElement(PrintBadgeView, { design, guest, qrDataUrl, assetOrigin, scale: PX_PER_MM }))
    })
    await imagesReady(host)
    try {
      await document.fonts?.ready
    } catch {
      // Fonts are optional.
    }

    await new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        window.removeEventListener('afterprint', finish)
        resolve()
      }
      window.addEventListener('afterprint', finish)
      window.print()
      // Most browsers block in print() until the dialog closes; this covers the ones that don't fire afterprint.
      window.setTimeout(finish, 1000)
    })
  } catch (error) {
    console.error('Badge printing failed', error)
    throw error instanceof Error ? error : new Error('The badge could not be printed.')
  } finally {
    // Give the print spooler a moment before removing the badge from the page.
    window.setTimeout(cleanup, 1500)
  }
}
