import { jsPDF } from 'jspdf'
import { guestQrDataUrl } from '@/badges/sampleQr'
import {
  sampleGuestName,
  type BadgeDesign,
  type BadgeText,
} from '@/badges/design'
import type { ImagePlacement } from '@/invitations/design'

/** CSS pixels are 96 per inch; PDF points are 72 per inch. */
const pxToPt = 72 / 96

const lineHeightRatio = 1.35

type FontFace = { family: string; weight: number; style: 'normal' | 'italic' }

const faces: Record<string, FontFace> = {
  'Manifa Bold': { family: "'Manifa Bold', Georgia, serif", weight: 700, style: 'normal' },
  'Manifa Italic': { family: "'Manifa Italic', Georgia, serif", weight: 400, style: 'italic' },
  Arial: { family: 'Arial, Helvetica, sans-serif', weight: 400, style: 'normal' },
  Georgia: { family: 'Georgia, serif', weight: 400, style: 'normal' },
  'Times New Roman': { family: "'Times New Roman', Times, serif", weight: 400, style: 'normal' },
}

export type BadgeBox = { x: number; y: number; width: number; height: number }

export type BadgeFrames = {
  width: number
  height: number
  background: BadgeBox | null
  name: BadgeBox | null
  qr: BadgeBox | null
}

type NaturalSize = { width: number; height: number }

function boxOf(placement: ImagePlacement, natural: NaturalSize | null, square: boolean): BadgeBox {
  const height =
    placement.height ??
    (square
      ? placement.width
      : natural && natural.width > 0
        ? Math.max(20, Math.round((placement.width * natural.height) / natural.width))
        : placement.width)
  return { x: placement.x, y: placement.y, width: placement.width, height }
}

/** Positions shared by the editor, the preview image, and the PDF. */
export function badgeFrames(design: BadgeDesign, backgroundNatural: NaturalSize | null = null): BadgeFrames {
  return {
    width: design.width,
    height: design.height,
    background: design.backgroundAssetId && design.background ? boxOf(design.background, backgroundNatural, false) : null,
    name: design.name ? { x: design.name.x, y: design.name.y, width: design.name.width, height: design.name.height } : null,
    qr: design.qr ? boxOf(design.qr, null, true) : null,
  }
}

function faceOf(text: BadgeText): FontFace {
  const face = faces[text.font] ?? faces.Arial
  return {
    family: face.family,
    style: face.style,
    weight: text.weight === 'bold' ? 700 : text.weight === 'regular' ? 400 : face.weight,
  }
}

function canvasFont(text: BadgeText) {
  const face = faceOf(text)
  return `${face.style} ${face.weight} ${text.fontSize}px ${face.family}`
}

function cssFont(text: BadgeText) {
  const face = faceOf(text)
  return `font-family:${face.family};font-size:${text.fontSize}px;font-weight:${face.weight};font-style:${face.style};color:${text.color};`
}

export function wrapLines(measure: (line: string) => number, value: string, maxWidth: number) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (!current || measure(next) <= maxWidth) {
      current = next
      continue
    }
    lines.push(current)
    current = word
  }
  if (current) lines.push(current)
  return lines
}

export function layoutName(text: BadgeText, value: string) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  const font = canvasFont(text)
  const lines = context
    ? wrapLines((line) => {
        context.font = font
        return context.measureText(line).width
      }, value, text.width)
    : [value]
  const lineHeight = text.fontSize * lineHeightRatio
  const visibleCount = Math.max(1, Math.floor(text.height / lineHeight) || 1)
  const visible = lines.slice(0, visibleCount)
  const block = visible.length * lineHeight
  const offset =
    text.valign === 'middle' ? Math.max(0, (text.height - block) / 2) : text.valign === 'bottom' ? Math.max(0, text.height - block) : 0
  return { lines: visible, lineHeight, offset, font }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function assetUrl(origin: string, assetId: string) {
  return `${origin}/api/public/assets/${assetId}`
}

export function buildBadgeHtml(
  design: BadgeDesign,
  options: { name: string; qrDataUrl: string | null; assetOrigin: string; editor: boolean },
) {
  const frames = badgeFrames(design)
  const parts: string[] = []
  if (design.backgroundAssetId && design.background && frames.background) {
    const box = frames.background
    const height = design.background.height == null ? 'auto' : `${box.height}px`
    parts.push(
      `<img data-canvas-box="background" alt="" src="${assetUrl(options.assetOrigin, design.backgroundAssetId)}" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${height};max-width:none;" />`,
    )
  }
  if (design.name && frames.name) {
    const laid = layoutName(design.name, options.name)
    const justify = design.name.valign === 'middle' ? 'center' : design.name.valign === 'bottom' ? 'flex-end' : 'flex-start'
    const lines = laid.lines
      .map(
        (line) =>
          `<div style="${cssFont(design.name!)};text-align:${design.name!.align};height:${laid.lineHeight}px;line-height:${laid.lineHeight}px;overflow:hidden;white-space:nowrap;">${escapeHtml(line)}</div>`,
      )
      .join('')
    const box = frames.name
    parts.push(
      `<div data-canvas-box="name" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;overflow:hidden;display:flex;flex-direction:column;justify-content:${justify};${options.editor ? 'outline:1px dashed rgba(15,92,76,0.55);' : ''}">${lines}</div>`,
    )
  }
  if (design.qr && frames.qr) {
    const box = frames.qr
    const image = options.qrDataUrl
      ? `<img alt="" src="${options.qrDataUrl}" style="display:block;width:100%;height:100%;" />`
      : ''
    parts.push(
      `<div data-canvas-box="qr" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;overflow:hidden;background:#fff;${options.editor ? 'outline:1px dashed #0f5c4c;' : ''}">${image}</div>`,
    )
    if (options.editor && box.y >= 18) {
      parts.push(
        `<span data-editor-only style="position:absolute;left:${box.x}px;top:${Math.max(0, box.y - 18)}px;background:#0f5c4c;color:#fff;font:600 11px Arial,sans-serif;line-height:16px;padding:0 4px;border-radius:2px;">QR Code</span>`,
      )
    }
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body style="margin:0;background:#fff;"><div data-invitation-canvas style="position:relative;width:${frames.width}px;height:${frames.height}px;overflow:hidden;background:#fff;">${parts.join('')}</div></body></html>`
}

async function loadBitmap(src: string) {
  let response: Response
  try {
    // no-store avoids a no-cors image cache that would fail this CORS read.
    response = await fetch(src, { mode: 'cors', cache: 'no-store' })
  } catch {
    throw new Error('The background image has not finished loading. Wait a moment and try again.')
  }
  if (!response.ok) throw new Error('The background image has not finished loading. Wait a moment and try again.')
  const blob = await response.blob()
  if (blob.size === 0) throw new Error('The background image has not finished loading. Wait a moment and try again.')
  return createImageBitmap(blob)
}

async function loadDataUrl(src: string) {
  const response = await fetch(src)
  if (!response.ok) throw new Error('The QR code could not be drawn.')
  const blob = await response.blob()
  if (blob.size === 0) throw new Error('The QR code could not be drawn.')
  return createImageBitmap(blob)
}

export type BadgeRenderInput = {
  name: string
  qrDataUrl: string
  assetOrigin: string
}

/**
 * Draws one badge at its design size. Editor labels, handles, rulers, and guides are not painted.
 * The on-screen preview, PNG, and PDF all use this function.
 */
export async function drawBadge(design: BadgeDesign, input: BadgeRenderInput) {
  let background: ImageBitmap | null = null
  if (design.backgroundAssetId) {
    background = await loadBitmap(assetUrl(input.assetOrigin, design.backgroundAssetId))
  }
  const frames = badgeFrames(
    design,
    background ? { width: background.width, height: background.height } : null,
  )
  const canvas = document.createElement('canvas')
  canvas.width = frames.width
  canvas.height = frames.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('The badge could not be rendered.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, frames.width, frames.height)
  if (background && frames.background) {
    context.drawImage(background, frames.background.x, frames.background.y, frames.background.width, frames.background.height)
    background.close()
  }
  if (design.name && frames.name) {
    const laid = layoutName(design.name, input.name)
    context.save()
    context.beginPath()
    context.rect(frames.name.x, frames.name.y, frames.name.width, frames.name.height)
    context.clip()
    context.font = laid.font
    context.fillStyle = design.name.color
    context.textBaseline = 'top'
    laid.lines.forEach((line, index) => {
      const width = context.measureText(line).width
      const x =
        design.name!.align === 'center'
          ? frames.name!.x + (frames.name!.width - width) / 2
          : design.name!.align === 'right'
            ? frames.name!.x + frames.name!.width - width
            : frames.name!.x
      context.fillText(line, x, frames.name!.y + laid.offset + index * laid.lineHeight)
    })
    context.restore()
  }
  if (frames.qr && input.qrDataUrl) {
    const qr = await loadDataUrl(input.qrDataUrl)
    context.drawImage(qr, frames.qr.x, frames.qr.y, frames.qr.width, frames.qr.height)
    qr.close()
  }
  return canvas
}

/** Production entry point. `qrPayload` must be that guest's own check-in value. */
export async function renderGuestBadge(
  design: BadgeDesign,
  guest: { name: string; qrPayload: string },
  assetOrigin: string,
) {
  const qrDataUrl = await guestQrDataUrl(guest.qrPayload)
  return drawBadge(design, {
    name: guest.name.trim() || 'Guest',
    qrDataUrl,
    assetOrigin,
  })
}

export async function renderSampleBadge(design: BadgeDesign, qrDataUrl: string, assetOrigin: string) {
  return drawBadge(design, { name: sampleGuestName, qrDataUrl, assetOrigin })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadBadgePng(canvas: HTMLCanvasElement, filename = 'badge-preview.png') {
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0) {
        reject(new Error('The badge could not be rendered.'))
        return
      }
      downloadBlob(blob, filename)
      resolve()
    }, 'image/png')
  })
}

export function downloadBadgePdf(canvas: HTMLCanvasElement, filename = 'badge-preview.pdf') {
  const width = canvas.width * pxToPt
  const height = canvas.height * pxToPt
  const pdf = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [width, height],
    compress: true,
  })
  const page = pdf.internal.pageSize
  const url = canvas.toDataURL('image/png')
  if (!url.startsWith('data:image/png')) throw new Error('The badge could not be rendered.')
  pdf.addImage(url, 'PNG', 0, 0, page.getWidth(), page.getHeight())
  const blob = pdf.output('blob')
  if (blob.size === 0) throw new Error('The badge could not be rendered.')
  downloadBlob(blob, filename)
}
