import type { CSSProperties } from 'react'
import { apiBaseUrl } from '@/api/client'
import { fillTokens, fontFamily, type Frame, type MicrositeElement } from '@/microsite/design'

export type Sample = { name: string; position: string; company: string; event: string }

/** Finder squares plus a fixed scatter: looks like a QR code on the canvas. */
const qrPattern: [number, number][] = (() => {
  const cells: [number, number][] = []
  const finder = (ox: number, oy: number) => {
    for (let x = 0; x < 7; x += 1) {
      for (let y = 0; y < 7; y += 1) {
        const ring = x === 0 || y === 0 || x === 6 || y === 6
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4
        if (ring || core) cells.push([ox + x, oy + y])
      }
    }
  }
  finder(0, 0)
  finder(14, 0)
  finder(0, 14)
  for (let x = 8; x < 21; x += 1) {
    for (let y = 0; y < 21; y += 1) {
      if ((x * 7 + y * 13) % 5 === 0 && !(x >= 14 && y < 7)) cells.push([x, y])
    }
  }
  for (let x = 0; x < 8; x += 1) {
    for (let y = 8; y < 14; y += 1) {
      if ((x * 3 + y * 11) % 4 === 0) cells.push([x, y])
    }
  }
  return cells
})()

/** Text and button styles, matching the server's MicrositeRenderer so the canvas looks like the live page. */
export function textStyle(element: MicrositeElement, frame: Frame): CSSProperties {
  const size = Math.min(400, Math.max(6, frame.fontSize ?? element.fontSize ?? 18))
  return {
    fontFamily: fontFamily(element.font),
    fontSize: size,
    fontWeight: Number(element.fontWeight ?? '400'),
    fontStyle: element.italic ? 'italic' : 'normal',
    color: element.color ?? '#111111',
    textAlign: element.align ?? 'left',
    lineHeight: element.lineHeight ?? 1.35,
    letterSpacing: element.letterSpacing ?? 0,
  }
}

/** One element's content as it will appear on the page (without position, which the canvas sets). */
export function MicrositeElementView({ element, frame, sample }: { element: MicrositeElement; frame: Frame; sample: Sample }) {
  const radius = element.radius && element.radius > 0 ? element.radius : undefined
  const opacity = element.opacity != null && element.opacity >= 0 && element.opacity < 1 ? element.opacity : undefined

  if (element.kind === 'text' || element.kind === 'guestName') {
    return (
      <div style={{ ...textStyle(element, frame), width: '100%', height: '100%', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', opacity }}>
        {fillTokens(element.text ?? '', sample)}
      </div>
    )
  }

  if (element.kind === 'qr') {
    // A stand-in pattern; each guest sees their own check-in QR.
    return (
      <div style={{ width: '100%', height: '100%', background: '#FFFFFF', borderRadius: radius, overflow: 'hidden', opacity, padding: '6%', boxSizing: 'border-box' }}>
        <svg viewBox="0 0 21 21" width="100%" height="100%" shapeRendering="crispEdges" aria-hidden="true">
          {qrPattern.map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#111111" />
          ))}
        </svg>
      </div>
    )
  }

  if (element.kind === 'reasonBox') {
    const border = element.borderColor && element.borderWidth ? `${element.borderWidth}px solid ${element.borderColor}` : '1px solid #D6D3CC'
    return (
      <div
        style={{
          ...textStyle(element, frame),
          width: '100%',
          height: '100%',
          padding: '10px 12px',
          boxSizing: 'border-box',
          background: '#FFFFFF',
          border,
          borderRadius: radius,
          color: '#8A8780',
          opacity,
        }}
      >
        {element.text || "Let us know why you can't attend (optional)"}
      </div>
    )
  }

  if (element.kind === 'image') {
    return element.assetId ? (
      <img
        src={`${apiBaseUrl}/api/public/assets/${element.assetId}`}
        alt=""
        draggable={false}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: element.fit ?? 'cover', borderRadius: radius, opacity }}
      />
    ) : (
      <div className="flex size-full items-center justify-center bg-hover text-xs text-muted">Image</div>
    )
  }

  if (element.kind === 'button') {
    const border = element.borderColor && element.borderWidth ? `${element.borderWidth}px solid ${element.borderColor}` : undefined
    return (
      <div
        style={{
          ...textStyle(element, frame),
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          background: element.background ?? undefined,
          border,
          borderRadius: radius,
          boxSizing: 'border-box',
          overflow: 'hidden',
          opacity,
        }}
      >
        {fillTokens(element.label ?? 'Button', sample)}
      </div>
    )
  }

  const border = element.borderColor && element.borderWidth ? `${element.borderWidth}px solid ${element.borderColor}` : undefined
  return (
    <div
      style={{ width: '100%', height: '100%', background: element.background ?? undefined, border, borderRadius: radius, boxSizing: 'border-box', opacity }}
    />
  )
}
