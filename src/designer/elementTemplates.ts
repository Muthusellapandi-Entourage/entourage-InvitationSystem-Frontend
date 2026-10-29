import type { BrandKit } from '@/api/brandApi'
import type { PrintBadgeDesign, PrintBadgeElement, PrintElementKind } from '@/api/printBadgeApi'

/* Ready layouts for element badges (printed badge in mm, digital pass in px), filled from the brand kit. */

type Slot = {
  kind: PrintElementKind
  /** Fractions of the badge width / height. */
  x: number
  y: number
  w: number
  h: number
  /** Font size as a fraction of the badge width. */
  font?: number
  weight?: PrintBadgeElement['fontWeight']
  color?: 'primary' | 'secondary' | 'text' | 'muted' | 'white'
  fill?: 'primary' | 'secondary'
  align?: PrintBadgeElement['align']
  uppercase?: boolean
  text?: string
  /** Square, sized from the width (QR codes). */
  square?: boolean
  logo?: boolean
}

type Layout = { id: string; name: string; description: string; slots: Slot[] }

export const elementLayouts: Layout[] = [
  {
    id: 'centred',
    name: 'Centred',
    description: 'Logo on top, name in the middle, QR at the bottom.',
    slots: [
      { kind: 'image', x: 0.3, y: 0.05, w: 0.4, h: 0.16, logo: true },
      { kind: 'name', x: 0.06, y: 0.3, w: 0.88, h: 0.16, font: 0.075, weight: 'bold', color: 'text' },
      { kind: 'position', x: 0.06, y: 0.46, w: 0.88, h: 0.07, font: 0.035, color: 'muted' },
      { kind: 'company', x: 0.06, y: 0.53, w: 0.88, h: 0.07, font: 0.035, weight: 'bold', color: 'primary', uppercase: true },
      { kind: 'qr', x: 0.36, y: 0.64, w: 0.28, h: 0.28, square: true },
    ],
  },
  {
    id: 'band',
    name: 'Header band',
    description: 'Brand-colour band with the logo, details below.',
    slots: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.22, fill: 'primary' },
      { kind: 'image', x: 0.25, y: 0.03, w: 0.5, h: 0.16, logo: true },
      { kind: 'name', x: 0.06, y: 0.28, w: 0.88, h: 0.15, font: 0.075, weight: 'bold', color: 'text' },
      { kind: 'position', x: 0.06, y: 0.43, w: 0.88, h: 0.07, font: 0.035, color: 'muted' },
      { kind: 'company', x: 0.06, y: 0.5, w: 0.88, h: 0.07, font: 0.035, weight: 'bold', color: 'primary', uppercase: true },
      { kind: 'qr', x: 0.36, y: 0.62, w: 0.28, h: 0.28, square: true },
      { kind: 'guestType', x: 0, y: 0.93, w: 1, h: 0.07, font: 0.03, weight: 'bold', color: 'white', fill: 'primary', uppercase: true },
    ],
  },
  {
    id: 'side',
    name: 'Side QR',
    description: 'Name on the left, QR on the right. Good for landscape badges.',
    slots: [
      { kind: 'image', x: 0.05, y: 0.06, w: 0.3, h: 0.16, logo: true },
      { kind: 'name', x: 0.05, y: 0.3, w: 0.55, h: 0.22, font: 0.055, weight: 'bold', color: 'text', align: 'left' },
      { kind: 'position', x: 0.05, y: 0.52, w: 0.55, h: 0.1, font: 0.028, color: 'muted', align: 'left' },
      { kind: 'company', x: 0.05, y: 0.62, w: 0.55, h: 0.1, font: 0.028, weight: 'bold', color: 'primary', align: 'left', uppercase: true },
      { kind: 'qr', x: 0.66, y: 0.3, w: 0.28, h: 0.28, square: true },
      { kind: 'rect', x: 0, y: 0.94, w: 1, h: 0.06, fill: 'primary' },
    ],
  },
  {
    id: 'blank',
    name: 'Blank',
    description: 'An empty badge in the brand colours.',
    slots: [],
  },
]

const newId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 10)

/** Builds a design from a layout at the given size. `unit` decides how font sizes are expressed. */
export function buildFromLayout(
  layout: Layout,
  size: { width: number; height: number },
  unit: 'mm' | 'px',
  brand: Pick<BrandKit, 'colors' | 'groups' | 'fonts'>,
  logoAssetId: string | null,
): PrintBadgeDesign {
  const primary = brand.colors[0]?.hex ?? '#38B8A2'
  const secondary = brand.colors[1]?.hex ?? '#1D1F1B'
  const font = brand.fonts[0]?.name ?? null
  const colour = (key: Slot['color']) =>
    key === 'primary' ? primary : key === 'secondary' ? secondary : key === 'muted' ? '#555555' : key === 'white' ? '#FFFFFF' : '#111111'
  const round = (value: number) => (unit === 'mm' ? Math.round(value * 10) / 10 : Math.round(value))
  // mm badges use points for text; px badges use pixels.
  const fontUnit = unit === 'mm' ? 72 / 25.4 : 1
  const elements: PrintBadgeElement[] = layout.slots
    .filter((slot) => !slot.logo || logoAssetId)
    .map((slot) => {
      const width = slot.w * size.width
      const height = slot.square ? width : slot.h * size.height
      return {
        id: newId(),
        kind: slot.kind,
        x: round(slot.x * size.width),
        y: round(slot.y * size.height),
        width: round(width),
        height: round(height),
        fontSize: round((slot.font ?? 0.04) * size.width * fontUnit),
        fontWeight: slot.weight ?? 'regular',
        color: colour(slot.color),
        align: slot.align ?? 'center',
        valign: 'middle',
        uppercase: Boolean(slot.uppercase),
        text: slot.kind === 'text' ? (slot.text ?? 'Text') : null,
        font: slot.kind === 'qr' || slot.kind === 'image' || slot.kind === 'rect' ? null : font,
        assetId: slot.logo ? logoAssetId : null,
        fill: slot.fill ? (slot.fill === 'primary' ? primary : secondary) : null,
        radius: 0,
        hidden: false,
        locked: false,
        name: slot.logo ? 'Logo' : null,
      }
    })
  return { widthMm: size.width, heightMm: size.height, backgroundColor: '#FFFFFF', backgroundAssetId: null, elements }
}
