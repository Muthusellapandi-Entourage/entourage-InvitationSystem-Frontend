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
}

const fonts: Record<string, string> = {
  Inter: 'Inter, "Segoe UI", Arial, sans-serif',
  Arial: 'Arial, Helvetica, sans-serif',
  Georgia: 'Georgia, serif',
  'Times New Roman': '"Times New Roman", Times, serif',
}
export const printFonts = Object.keys(fonts)

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
 * The printed badge for one guest. `scale` is pixels per millimetre: PX_PER_MM prints at true size;
 * a bigger or smaller number zooms the on-screen preview. Used by the designer, the kiosk and printing.
 */
export function PrintBadgeView({
  design,
  guest,
  qrDataUrl,
  assetOrigin,
  scale = PX_PER_MM,
}: {
  design: PrintBadgeDesign
  guest: PrintGuest
  /** The guest's check-in QR as a data URL; null draws a placeholder box. */
  qrDataUrl: string | null
  /** Address the uploaded images are served from. */
  assetOrigin: string
  scale?: number
}) {
  const px = (mm: number) => mm * scale
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
        const box: CSSProperties = {
          position: 'absolute',
          left: px(element.x),
          top: px(element.y),
          width: px(element.width),
          height: px(element.height),
        }
        if (element.kind === 'qr') {
          return (
            <div key={element.id} style={{ ...box, background: '#fff' }}>
              {qrDataUrl ? (
                <img alt="" src={qrDataUrl} style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated', objectFit: 'contain' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', border: '1px solid #999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: px(3), color: '#777' }}>QR</div>
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
        const fontPx = element.fontSize * (96 / 72) * (scale / PX_PER_MM)
        const size = fittedSize(text, fontPx, px(element.width), px(element.height))
        return (
          <div
            key={element.id}
            style={{
              ...box,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: element.valign === 'top' ? 'flex-start' : element.valign === 'bottom' ? 'flex-end' : 'center',
              textAlign: element.align,
              color: element.color,
              // Brand fonts are registered by name; built-in ones get their fallbacks.
              fontFamily: fonts[element.font ?? 'Inter'] ?? `"${element.font}", ${fonts.Inter}`,
              fontSize: size,
              fontWeight: element.fontWeight === 'bold' ? 700 : element.fontWeight === 'semibold' ? 600 : 400,
              lineHeight: 1.15,
              overflow: 'hidden',
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
