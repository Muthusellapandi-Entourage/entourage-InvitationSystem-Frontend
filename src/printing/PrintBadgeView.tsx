import type { CSSProperties } from 'react'
import type { PrintBadgeDesign, PrintBadgeElement, PrintGuest } from '@/api/printBadgeApi'

/** CSS pixels per millimetre at 96 dpi: a printed 1 mm is exactly this many CSS pixels. */
export const PX_PER_MM = 96 / 25.4

export const sampleGuest: PrintGuest = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Salman K Juma',
  position: 'Director of Operations',
  company: 'Entourage International',
  guestType: 'VIP',
  seat: 'Table 4 · Seat 7',
  checkInCode: 'SAMPLE-CHECK-IN-CODE',
}

export const elementLabels: Record<PrintBadgeElement['kind'], string> = {
  name: 'Guest name',
  position: 'Position',
  company: 'Company',
  guestType: 'Guest category',
  seat: 'Table / seat',
  text: 'Text',
  qr: 'QR code',
  image: 'Image',
  rect: 'Shape',
}

const fonts: Record<string, string> = {
  Inter: 'Inter, "Segoe UI", Arial, sans-serif',
  Arial: 'Arial, Helvetica, sans-serif',
  Georgia: 'Georgia, serif',
  'Times New Roman': '"Times New Roman", Times, serif',
}
export const printFonts = Object.keys(fonts)

/** CSS font stack for a font name (built-in, or a brand font registered by name). */
export function fontStack(name: string | null | undefined) {
  return fonts[name ?? 'Inter'] ?? `"${name}", ${fonts.Inter}`
}

export function elementText(element: PrintBadgeElement, guest: PrintGuest) {
  const value =
    element.kind === 'name'
      ? guest.name
      : element.kind === 'position'
        ? guest.position
        : element.kind === 'company'
          ? guest.company
          : element.kind === 'guestType'
            ? guest.guestType
            : element.kind === 'seat'
              ? guest.seat
              : element.kind === 'text'
                ? element.text
                : null
  const text = value?.trim() ?? ''
  return element.uppercase ? text.toUpperCase() : text
}

/** Shrinks long text so it fits its box (rough width estimate; keeps at least 55% of the size). */
function fittedSize(text: string, fontPx: number, widthPx: number, heightPx: number) {
  if (!text) return fontPx
  const lines = Math.max(1, Math.floor(heightPx / (fontPx * 1.15)))
  const needed = text.length * fontPx * 0.56
  const room = widthPx * lines
  return needed > room ? Math.max(fontPx * 0.55, fontPx * (room / needed)) : fontPx
}

/**
 * A badge for one guest. Printed badges are in millimetres (`unit="mm"`, `scale` = pixels per mm;
 * PX_PER_MM prints at true size, font sizes in points). Digital passes are in pixels (`unit="px"`,
 * `scale` = zoom, font sizes in pixels). Used by the designers, the kiosk and printing.
 */
export function PrintBadgeView({
  design,
  guest,
  qrDataUrl,
  assetOrigin,
  scale = PX_PER_MM,
  unit = 'mm',
}: {
  design: PrintBadgeDesign
  guest: PrintGuest
  /** The guest's check-in QR as a data URL; null draws a placeholder box. */
  qrDataUrl: string | null
  /** Address the uploaded images are served from. */
  assetOrigin: string
  scale?: number
  unit?: 'mm' | 'px'
}) {
  const px = (value: number) => value * scale
  const fontPxOf = (element: PrintBadgeElement) => (unit === 'mm' ? element.fontSize * (96 / 72) * (scale / PX_PER_MM) : element.fontSize * scale)
  return (
    <div
      data-print-badge
      style={{
        position: 'relative',
        width: px(design.widthMm),
        height: px(design.heightMm),
        overflow: 'hidden',
        background: design.backgroundColor,
        boxSizing: 'border-box',
      }}
    >
      {design.backgroundAssetId ? (
        <img
          alt=""
          src={`${assetOrigin}/api/public/assets/${design.backgroundAssetId}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : null}
      {design.elements.map((element) => {
        if (element.hidden) return null
        const box: CSSProperties = {
          position: 'absolute',
          left: px(element.x),
          top: px(element.y),
          width: px(element.width),
          height: px(element.height),
          borderRadius: element.radius ? px(element.radius) : undefined,
          overflow: 'hidden',
        }
        if (element.kind === 'rect') {
          return <div key={element.id} style={{ ...box, background: element.fill ?? element.color }} />
        }
        if (element.kind === 'qr') {
          return (
            <div key={element.id} style={{ ...box, background: '#fff', borderRadius: undefined }}>
              {qrDataUrl ? (
                <img alt="" src={qrDataUrl} style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated', objectFit: 'contain' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', border: '1px solid #999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: px(unit === 'mm' ? 3 : 12), color: '#777' }}>QR</div>
              )}
            </div>
          )
        }
        if (element.kind === 'image') {
          return element.assetId ? (
            <img key={element.id} alt="" src={`${assetOrigin}/api/public/assets/${element.assetId}`} style={{ ...box, objectFit: 'contain' }} />
          ) : null
        }
        const text = elementText(element, guest)
        const fontPx = fontPxOf(element)
        const size = fittedSize(text, fontPx, px(element.width), px(element.height))
        return (
          <div
            key={element.id}
            style={{
              ...box,
              background: element.fill ?? undefined,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: element.valign === 'top' ? 'flex-start' : element.valign === 'bottom' ? 'flex-end' : 'center',
              textAlign: element.align,
              color: element.color,
              fontFamily: fontStack(element.font),
              fontSize: size,
              fontWeight: element.fontWeight === 'bold' ? 700 : element.fontWeight === 'semibold' ? 600 : 400,
              lineHeight: 1.15,
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
            }}
          >
            {text}
          </div>
        )
      })}
    </div>
  )
}
