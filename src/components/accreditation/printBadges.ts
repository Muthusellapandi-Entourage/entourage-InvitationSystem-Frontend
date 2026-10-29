import { createElement, Fragment } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { AccBadgeDesign } from '@/api/accreditationApi'
import { AccBadgeView, badgeQrDataUrl, PX_PER_MM, type BadgePerson } from '@/components/accreditation/AccBadgeView'

const ROOT_ID = 'acc-badge-print-root'
const STYLE_ID = 'acc-badge-print-style'

export type PrintItem = { key: string; design: AccBadgeDesign; person: BadgePerson }

export const badgePaperPresets = [
  { label: 'CR80 card, portrait (54 × 85.6 mm)', widthMm: 54, heightMm: 85.6 },
  { label: 'CR80 card, landscape (85.6 × 54 mm)', widthMm: 85.6, heightMm: 54 },
  { label: 'A6 lanyard badge (105 × 148 mm)', widthMm: 105, heightMm: 148 },
  { label: 'Large lanyard (100 × 140 mm)', widthMm: 100, heightMm: 140 },
  { label: '4 × 6 in (101.6 × 152.4 mm)', widthMm: 101.6, heightMm: 152.4 },
  { label: '4 × 3 in label (101.6 × 76.2 mm)', widthMm: 101.6, heightMm: 76.2 },
] as const

async function imagesReady(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll('img'))
  await Promise.all(
    images.map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true })
            image.addEventListener('error', () => resolve(), { once: true })
            window.setTimeout(resolve, 6000)
          }),
    ),
  )
}

/**
 * Prints many badges in one job: one badge per page, each page sized to its template
 * (named @page rules, so mixed card sizes work in Chrome / Edge). Resolves when the print dialog closes.
 */
export async function printBadgeBatch(items: PrintItem[], eventName: string, images: Record<string, string>) {
  if (items.length === 0) return
  const qrs = await Promise.all(
    items.map((item) => (item.design.elements.some((element) => element.kind === 'qr') ? badgeQrDataUrl(item.person.credentialCode) : Promise.resolve(null))),
  )

  document.getElementById(ROOT_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()

  const sizes = [...new Set(items.map((item) => `${item.design.widthMm}x${item.design.heightMm}`))]
  const pageName = (item: PrintItem) => `accbadge${sizes.indexOf(`${item.design.widthMm}x${item.design.heightMm}`)}`
  const first = items[0].design
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${ROOT_ID} { display: none; }
    @page { size: ${first.widthMm}mm ${first.heightMm}mm; margin: 0; }
    ${sizes
      .map((size, index) => {
        const [w, h] = size.split('x')
        return `@page accbadge${index} { size: ${w}mm ${h}mm; margin: 0; }`
      })
      .join('\n')}
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body > *:not(#${ROOT_ID}) { display: none !important; }
      #${ROOT_ID} { display: block !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      #${ROOT_ID} .acc-page { break-after: page; page-break-after: always; overflow: hidden; }
      #${ROOT_ID} .acc-page:last-child { break-after: auto; page-break-after: auto; }
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
      root.render(
        createElement(
          Fragment,
          null,
          items.map((item, index) =>
            createElement(
              'div',
              {
                key: item.key,
                className: 'acc-page',
                style: { page: pageName(item), width: `${item.design.widthMm}mm`, height: `${item.design.heightMm}mm` },
              },
              createElement(AccBadgeView, { design: item.design, person: item.person, eventName, images, qrDataUrl: qrs[index], scale: PX_PER_MM }),
            ),
          ),
        ),
      )
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
      window.setTimeout(finish, 1000)
    })
  } finally {
    window.setTimeout(cleanup, 2000)
  }
}
