export const invitationFonts = ['Manifa Bold', 'Manifa Italic', 'Arial', 'Georgia', 'Times New Roman'] as const

export type InvitationFont = (typeof invitationFonts)[number]

export type TextAlign = 'left' | 'center' | 'right'

export type GroupVertical = 'top' | 'middle' | 'bottom'

export const defaultCanvasWidth = 560

export type TextContainer = {
  x: number
  y: number
  width: number
  height: number
}

export type FontWeight = 'regular' | 'bold'

export type GuestBand = {
  y: number
  height: number
  align: TextAlign
  valign: GroupVertical
  spacing: number
  inset: number
}

export type GuestFieldDesign = {
  enabled: boolean
  font: InvitationFont
  fontSize: number
  mobileFontSize: number
  color: string
  alignment: TextAlign
  leftPadding: number
  topSpacing: number
  box: TextContainer | null
  backgroundColor: string | null
  backgroundOpacity: number
  padX: number
  padY: number
  weight: FontWeight | null
}

export type InvitationDesign = {
  headerAssetId: string | null
  guestName: GuestFieldDesign
  guestPosition: GuestFieldDesign
  detailsAssetId: string | null
  acceptAssetId: string | null
  declineAssetId: string | null
  width: number
  height: number | null
  groupAlign: TextAlign
  groupVertical: GroupVertical
  guestBand: GuestBand | null
}

export type InvitationTemplate = {
  design: InvitationDesign
  html?: string | null
  updatedOn?: string | null
}

export type EventAssetItem = {
  id: string
  fileName: string
  url: string
}

export function defaultInvitationDesign(): InvitationDesign {
  return {
    headerAssetId: null,
    guestName: {
      enabled: true,
      font: 'Manifa Bold',
      fontSize: 30,
      mobileFontSize: 24,
      color: '#FFFFFF',
      alignment: 'left',
      leftPadding: 70,
      topSpacing: 20,
      box: null,
      backgroundColor: null,
      backgroundOpacity: 100,
      padX: 0,
      padY: 0,
      weight: null,
    },
    guestPosition: {
      enabled: true,
      font: 'Manifa Italic',
      fontSize: 15,
      mobileFontSize: 12,
      color: '#FFFFFF',
      alignment: 'left',
      leftPadding: 70,
      topSpacing: 5,
      box: null,
      backgroundColor: null,
      backgroundOpacity: 100,
      padX: 0,
      padY: 0,
      weight: null,
    },
    detailsAssetId: null,
    acceptAssetId: null,
    declineAssetId: null,
    width: defaultCanvasWidth,
    height: null,
    groupAlign: 'left',
    groupVertical: 'top',
    guestBand: null,
  }
}

export function normalizeInvitationDesign(value: Partial<InvitationDesign> | null | undefined): InvitationDesign {
  const base = defaultInvitationDesign()
  if (!value) return base
  return {
    headerAssetId: value.headerAssetId ?? null,
    guestName: normalizeGuestField(base.guestName, value.guestName),
    guestPosition: normalizeGuestField(base.guestPosition, value.guestPosition),
    detailsAssetId: value.detailsAssetId ?? null,
    acceptAssetId: value.acceptAssetId ?? null,
    declineAssetId: value.declineAssetId ?? null,
    width: inRange(value.width, 200, 2400) ?? defaultCanvasWidth,
    height: inRange(value.height, 200, 4000),
    groupAlign: value.groupAlign === 'center' || value.groupAlign === 'right' ? value.groupAlign : 'left',
    groupVertical: value.groupVertical === 'middle' || value.groupVertical === 'bottom' ? value.groupVertical : 'top',
    guestBand: normalizeGuestBand(value.guestBand),
  }
}

function normalizeGuestField(base: GuestFieldDesign, value: Partial<GuestFieldDesign> | undefined): GuestFieldDesign {
  const merged = { ...base, ...value }
  const font = (invitationFonts as readonly string[]).includes(merged.font) ? merged.font : base.font
  return {
    ...merged,
    font,
    alignment: merged.alignment === 'center' || merged.alignment === 'right' ? merged.alignment : 'left',
    leftPadding: clampInt(merged.leftPadding, 0, 160, base.leftPadding),
    topSpacing: clampInt(merged.topSpacing, 0, 120, base.topSpacing),
    box: normalizeBox(value?.box),
    backgroundColor: normalizeColor(value?.backgroundColor),
    backgroundOpacity: value?.backgroundOpacity == null ? 100 : clampInt(value.backgroundOpacity, 0, 100, 100),
    padX: value?.padX == null ? 0 : clampInt(value.padX, 0, 80, 0),
    padY: value?.padY == null ? 0 : clampInt(value.padY, 0, 80, 0),
    weight: value?.weight === 'bold' || value?.weight === 'regular' ? value.weight : null,
  }
}

export function effectiveGuestBand(design: InvitationDesign): GuestBand {
  if (design.guestBand) return design.guestBand
  const positionOn = design.guestPosition.enabled
  const spacing = positionOn ? clampInt(design.guestPosition.topSpacing, 0, 80, 0) : 0
  const nameLine = Math.round(design.guestName.fontSize * 1.35)
  const positionLine = positionOn ? Math.round(design.guestPosition.fontSize * 1.35) : 0
  return clampGuestBand({
    y: design.guestName.topSpacing,
    height: nameLine + positionLine + spacing + 16,
    align: design.groupAlign,
    valign: 'top',
    spacing,
    inset: design.guestName.leftPadding,
  })
}

export function clampGuestBand(band: GuestBand): GuestBand {
  return {
    y: clampInt(band.y, 0, 2000, 0),
    height: clampInt(band.height, 48, 800, 80),
    align: band.align === 'center' || band.align === 'right' ? band.align : 'left',
    valign: band.valign === 'middle' || band.valign === 'bottom' ? band.valign : 'top',
    spacing: clampInt(band.spacing, 0, 80, 0),
    inset: clampInt(band.inset, 0, 120, 0),
  }
}

function normalizeGuestBand(value: unknown): GuestBand | null {
  if (!value || typeof value !== 'object') return null
  const band = value as Partial<GuestBand>
  if (typeof band.y !== 'number' || typeof band.height !== 'number') return null
  return clampGuestBand({
    y: band.y,
    height: band.height,
    align: band.align === 'center' || band.align === 'right' ? band.align : 'left',
    valign: band.valign === 'middle' || band.valign === 'bottom' ? band.valign : 'top',
    spacing: typeof band.spacing === 'number' ? band.spacing : 0,
    inset: typeof band.inset === 'number' ? band.inset : 0,
  })
}

export function clampTextContainer(
  box: TextContainer,
  canvasWidth: number,
  mode: 'move' | 'size' = 'size',
): TextContainer {
  let width = Math.min(2400, Math.max(40, Math.round(box.width)))
  const height = Math.min(800, Math.max(20, Math.round(box.height)))
  let x = Math.max(0, Math.round(box.x))
  const y = Math.min(4000, Math.max(0, Math.round(box.y)))
  if (width > canvasWidth) width = Math.max(40, canvasWidth)
  if (x + width > canvasWidth) {
    if (mode === 'move') x = Math.max(0, canvasWidth - width)
    else width = Math.max(40, canvasWidth - x)
  }
  return { x, y, width, height }
}

function normalizeBox(value: unknown): TextContainer | null {
  if (!value || typeof value !== 'object') return null
  const box = value as Partial<TextContainer>
  if (![box.x, box.y, box.width, box.height].every((item) => typeof item === 'number' && Number.isFinite(item))) return null
  return {
    x: clampInt(box.x, 0, 4000, 0),
    y: clampInt(box.y, 0, 4000, 0),
    width: clampInt(box.width, 40, 2400, 40),
    height: clampInt(box.height, 20, 800, 20),
  }
}

function normalizeColor(value: unknown) {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : null
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function inRange(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < min || rounded > max) return null
  return rounded
}
