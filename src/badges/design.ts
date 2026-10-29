import type { PrintBadgeDesign, PrintBadgeElement } from '@/api/printBadgeApi'
import {
  clampImagePlacement,
  invitationFonts,
  type DesignGuides,
  type FontWeight,
  type GroupVertical,
  type ImagePlacement,
  type InvitationFont,
  type TextAlign,
} from '@/invitations/design'

/** Shown in the designer and in preview downloads. Never written onto a guest badge. */
export const sampleGuestName = 'Guest Name'

/**
 * Payload encoded by the design-preview QR code.
 * It is not a guest id and not a check-in credential.
 */
export const sampleQrPayload = 'entourage-badge-preview'

export const badgeLimits = {
  minWidth: 200,
  maxWidth: 2400,
  minHeight: 200,
  maxHeight: 4000,
}

export type BadgeText = {
  x: number
  y: number
  width: number
  height: number
  font: InvitationFont
  fontSize: number
  weight: FontWeight
  color: string
  align: TextAlign
  valign: GroupVertical
}

export type BadgeDesign = {
  width: number
  height: number
  backgroundAssetId: string | null
  background: ImagePlacement | null
  qr: ImagePlacement | null
  name: BadgeText | null
  guides: DesignGuides | null
  /** Free-canvas designs (current designer): background colour and elements in pixels. Null on older designs. */
  backgroundColor?: string | null
  elements?: PrintBadgeElement[] | null
}

/** A digital pass in the shared element editor's shape (pixels in place of millimetres). */
export function passToElements(design: BadgeDesign, naturalBackground: { width: number; height: number } | null): PrintBadgeDesign {
  if (design.elements) {
    return {
      widthMm: design.width,
      heightMm: design.height,
      backgroundColor: design.backgroundColor ?? '#FFFFFF',
      backgroundAssetId: design.backgroundAssetId,
      elements: design.elements,
    }
  }
  // An older design: turn its background, name and QR into elements.
  const elements: PrintBadgeElement[] = []
  const id = () => crypto.randomUUID().replaceAll('-', '').slice(0, 10)
  if (design.backgroundAssetId && design.background) {
    const placement = design.background
    const height =
      placement.height ??
      (naturalBackground && naturalBackground.width > 0 ? Math.round((placement.width * naturalBackground.height) / naturalBackground.width) : design.height)
    elements.push(element(id(), 'image', placement.x, placement.y, placement.width, height, { assetId: design.backgroundAssetId, name: 'Background' }))
  }
  if (design.name) {
    const text = design.name
    elements.push(
      element(id(), 'name', text.x, text.y, text.width, text.height, {
        fontSize: text.fontSize,
        fontWeight: text.weight === 'bold' || text.font === 'Manifa Bold' ? 'bold' : 'regular',
        color: text.color,
        align: text.align,
        valign: text.valign,
        font: text.font === 'Manifa Bold' || text.font === 'Manifa Italic' ? 'Georgia' : text.font,
      }),
    )
  }
  if (design.qr) {
    const size = design.qr.height ?? design.qr.width
    elements.push(element(id(), 'qr', design.qr.x, design.qr.y, design.qr.width, size))
  }
  return { widthMm: design.width, heightMm: design.height, backgroundColor: '#FFFFFF', backgroundAssetId: null, elements }
}

/** Back to the saved digital pass shape (elements only; the old fields are cleared). */
export function elementsToPass(design: PrintBadgeDesign): BadgeDesign {
  return {
    width: Math.round(design.widthMm),
    height: Math.round(design.heightMm),
    backgroundAssetId: design.backgroundAssetId,
    background: null,
    qr: null,
    name: null,
    guides: null,
    backgroundColor: design.backgroundColor,
    elements: design.elements,
  }
}

function element(id: string, kind: PrintBadgeElement['kind'], x: number, y: number, width: number, height: number, extra: Partial<PrintBadgeElement> = {}): PrintBadgeElement {
  return {
    id,
    kind,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    fontSize: 32,
    fontWeight: 'regular',
    color: '#111111',
    align: 'center',
    valign: 'middle',
    uppercase: false,
    text: null,
    font: null,
    assetId: null,
    fill: null,
    radius: 0,
    hidden: false,
    locked: false,
    name: null,
    ...extra,
  }
}

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** #RRGGBB or #RRGGBBAA (with alpha). */
const hex = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

export function defaultBadgeDesign(): BadgeDesign {
  return {
    width: 600,
    height: 900,
    backgroundAssetId: null,
    background: null,
    qr: null,
    name: null,
    guides: null,
  }
}

export function defaultBackground(design: Pick<BadgeDesign, 'width'>): ImagePlacement {
  return { x: 0, y: 0, width: design.width, height: null, lockRatio: true }
}

export function defaultQr(design: Pick<BadgeDesign, 'width' | 'height'>): ImagePlacement {
  const size = Math.max(20, Math.min(180, design.width, design.height))
  return {
    x: Math.max(0, Math.round((design.width - size) / 2)),
    y: Math.max(0, design.height - size - Math.round(design.height * 0.08)),
    width: size,
    height: size,
    lockRatio: true,
  }
}

export function defaultName(design: Pick<BadgeDesign, 'width'>): BadgeText {
  const width = Math.max(40, design.width - 80)
  return {
    x: Math.max(0, Math.round((design.width - width) / 2)),
    y: 48,
    width,
    height: 96,
    font: 'Arial',
    fontSize: 32,
    weight: 'bold',
    color: '#111111',
    align: 'center',
    valign: 'middle',
  }
}

function placementOf(value: unknown, canvasWidth: number, canvasHeight: number): ImagePlacement | null {
  if (!value || typeof value !== 'object') return null
  return clampImagePlacement(value as ImagePlacement, canvasWidth, canvasHeight)
}

function guidesOf(value: unknown, canvasWidth: number, canvasHeight: number): DesignGuides | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as { vertical?: unknown; horizontal?: unknown }
  const vertical = numberList(raw.vertical).filter((item) => item >= 0 && item <= canvasWidth).slice(0, 40)
  const horizontal = numberList(raw.horizontal).filter((item) => item >= 0 && item <= canvasHeight).slice(0, 40)
  if (vertical.length === 0 && horizontal.length === 0) return null
  return { vertical, horizontal }
}

function numberList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'number' ? item : Number(item)))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.round(item))
}

function textOf(value: unknown, canvasWidth: number, canvasHeight: number): BadgeText | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<BadgeText>
  const fallback = defaultName({ width: canvasWidth })
  const font = invitationFonts.includes(raw.font as InvitationFont) ? (raw.font as InvitationFont) : fallback.font
  const align = raw.align === 'left' || raw.align === 'center' || raw.align === 'right' ? raw.align : fallback.align
  const valign = raw.valign === 'top' || raw.valign === 'middle' || raw.valign === 'bottom' ? raw.valign : fallback.valign
  const weight = raw.weight === 'bold' || raw.weight === 'regular' ? raw.weight : fallback.weight
  return {
    x: clampInt(raw.x, 0, canvasWidth, fallback.x),
    y: clampInt(raw.y, 0, canvasHeight, fallback.y),
    width: clampInt(raw.width, 20, 2400, fallback.width),
    height: clampInt(raw.height, 20, 4000, fallback.height),
    font,
    fontSize: clampInt(raw.fontSize, 8, 160, fallback.fontSize),
    weight,
    color: typeof raw.color === 'string' && hex.test(raw.color) ? raw.color : fallback.color,
    align,
    valign,
  }
}

/** Keeps a saved or in-progress badge inside the canvas limits without dropping elements. */
export function normalizeBadgeDesign(input: Partial<BadgeDesign> | null | undefined): BadgeDesign {
  const width = clampInt(input?.width, badgeLimits.minWidth, badgeLimits.maxWidth, 600)
  const height = clampInt(input?.height, badgeLimits.minHeight, badgeLimits.maxHeight, 900)
  const backgroundAssetId = typeof input?.backgroundAssetId === 'string' && guid.test(input.backgroundAssetId) ? input.backgroundAssetId : null
  let background = backgroundAssetId ? placementOf(input?.background, width, height) ?? defaultBackground({ width }) : null
  if (background && backgroundAssetId) background = clampImagePlacement(background, width, height)

  let qr = input?.qr ? placementOf(input.qr, width, height) : null
  if (qr) {
    const locked = qr.lockRatio !== false
    qr = clampImagePlacement(
      { ...qr, height: locked ? qr.width : (qr.height ?? qr.width), lockRatio: locked },
      width,
      height,
    )
    if (qr.lockRatio) qr = { ...qr, height: qr.width }
  }

  return {
    width,
    height,
    backgroundAssetId,
    background,
    qr,
    name: input?.name ? textOf(input.name, width, height) : null,
    guides: guidesOf(input?.guides, width, height),
    // Free-canvas designs keep their elements as they are.
    backgroundColor: typeof input?.backgroundColor === 'string' && hex.test(input.backgroundColor) ? input.backgroundColor : null,
    elements: Array.isArray(input?.elements) ? input.elements : null,
  }
}
