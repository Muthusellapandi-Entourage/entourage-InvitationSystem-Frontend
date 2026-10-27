/** Microsite designs: a free canvas with a desktop (1200 px) and a phone (390 px) layout. Mirrors the server's MicrositeDesignDto. */

export const DESKTOP_WIDTH = 1200
export const MOBILE_WIDTH = 390

export type Layout = 'desktop' | 'mobile'

export type Frame = { x: number; y: number; w: number; h: number; hidden?: boolean; fontSize?: number | null }

export type ElementKind = 'text' | 'guestName' | 'image' | 'button' | 'shape' | 'qr' | 'reasonBox'

export type ButtonAction = 'accept' | 'decline' | 'badge' | 'invitation' | 'link' | 'confirm' | 'download' | 'wallet' | 'home'

/** "home" is the guest's microsite; the others are the steps of the reply. */
export type PageKey = 'home' | 'accept' | 'decline' | 'thanks' | 'declined'

export const pageInfo: Record<PageKey, { label: string; hint: string }> = {
  home: { label: 'Home', hint: "The guest's microsite (and the public page)." },
  accept: { label: 'Accept · confirm', hint: 'Shown after tapping Accept. Add a Confirm button; it saves the reply.' },
  decline: { label: 'Decline · confirm', hint: 'Shown after tapping Decline. Add a Confirm button and, if you ask for reasons, a Reason box.' },
  thanks: { label: 'Thank you', hint: 'Shown after confirming Accept. Add the check-in QR, Download E-Badge and Apple Wallet.' },
  declined: { label: 'Declined', hint: 'Shown after confirming Decline.' },
}

export type MicrositePage = {
  key: Exclude<PageKey, 'home'>
  /** Null uses the home page's background colour. */
  background: string | null
  backgroundAssetId: string | null
  desktopHeight: number
  mobileHeight: number
  elements: MicrositeElement[]
}

export type ShowRule = 'always' | 'pending' | 'accepted' | 'declined' | 'public'

export type MicrositeElement = {
  id: string
  kind: ElementKind
  desktop: Frame
  mobile: Frame
  text?: string | null
  font?: string | null
  fontSize?: number | null
  fontWeight?: '300' | '400' | '600' | '700' | null
  italic?: boolean | null
  color?: string | null
  align?: 'left' | 'center' | 'right' | 'justify' | null
  lineHeight?: number | null
  letterSpacing?: number | null
  assetId?: string | null
  fit?: 'cover' | 'contain' | 'fill' | null
  radius?: number | null
  label?: string | null
  action?: ButtonAction | null
  url?: string | null
  background?: string | null
  borderColor?: string | null
  borderWidth?: number | null
  opacity?: number | null
  show?: ShowRule | null
}

export type MicrositeDesign = {
  title: string | null
  background: string
  backgroundAssetId: string | null
  desktopHeight: number
  mobileHeight: number
  elements: MicrositeElement[]
  /** The reply pages. A missing or empty page falls back to the built-in page. */
  pages?: MicrositePage[] | null
}

/** One page of the site in the same shape as the home page, so the designer edits every page the same way. */
export function pageView(design: MicrositeDesign, key: PageKey): MicrositeDesign {
  if (key === 'home') return design
  const page = design.pages?.find((item) => item.key === key)
  return {
    title: design.title,
    background: page?.background ?? design.background,
    backgroundAssetId: page?.backgroundAssetId ?? null,
    desktopHeight: page?.desktopHeight ?? 900,
    mobileHeight: page?.mobileHeight ?? 1000,
    elements: page?.elements ?? [],
    pages: design.pages,
  }
}

/** Puts an edited page back into the site. */
export function mergePage(site: MicrositeDesign, key: PageKey, view: MicrositeDesign): MicrositeDesign {
  if (key === 'home') return { ...view, pages: site.pages }
  const page: MicrositePage = {
    key,
    background: view.background === site.background ? null : view.background,
    backgroundAssetId: view.backgroundAssetId,
    desktopHeight: view.desktopHeight,
    mobileHeight: view.mobileHeight,
    elements: view.elements,
  }
  const others = (site.pages ?? []).filter((item) => item.key !== key)
  return { ...site, title: view.title, pages: [...others, page] }
}

/** Starts a reply page from the home page's look: background and every element except the reply buttons. */
export function copyHomeLook(site: MicrositeDesign, key: Exclude<PageKey, 'home'>): MicrositeDesign {
  const keep = site.elements.filter((element) => !(element.kind === 'button' && ['accept', 'decline', 'badge', 'confirm'].includes(element.action ?? '')))
  return mergePage(site, key, {
    ...site,
    elements: keep.map((element) => ({ ...element, id: crypto.randomUUID().replaceAll('-', '') })),
  })
}

export const builtInFonts = ['Arial', 'Georgia', 'Times New Roman', 'Helvetica', 'Verdana', 'Trebuchet MS'] as const

export const actionLabels: Record<ButtonAction, string> = {
  accept: 'Accept invitation',
  decline: 'Decline invitation',
  confirm: 'Confirm the reply (confirm pages)',
  badge: 'Open E-Badge page',
  download: 'Download E-Badge image',
  wallet: 'Add to Apple Wallet',
  invitation: 'View invitation card',
  home: 'Back to the microsite',
  link: 'Open a link',
}

export const showLabels: Record<ShowRule, string> = {
  always: 'Always',
  pending: 'Before the guest replies',
  accepted: 'After the guest accepts',
  declined: 'After the guest declines',
  public: 'Public page only',
}

export function emptyDesign(): MicrositeDesign {
  return { title: null, background: '#FFFFFF', backgroundAssetId: null, desktopHeight: 1600, mobileHeight: 1800, elements: [] }
}

export function widthOf(layout: Layout) {
  return layout === 'desktop' ? DESKTOP_WIDTH : MOBILE_WIDTH
}

export function frameOf(element: MicrositeElement, layout: Layout) {
  return layout === 'desktop' ? element.desktop : element.mobile
}

export function withFrame(element: MicrositeElement, layout: Layout, frame: Frame): MicrositeElement {
  return layout === 'desktop' ? { ...element, desktop: frame } : { ...element, mobile: frame }
}

/** Font family the canvas and the server both use for a font value ("Arial" or "font:<id>"). */
export function fontFamily(font: string | null | undefined) {
  if (font?.startsWith('font:')) return `'ms-${font.slice(5).replaceAll('-', '')}', Arial, sans-serif`
  const name = builtInFonts.find((item) => item.toLowerCase() === font?.toLowerCase()) ?? 'Arial'
  return `'${name}', Arial, sans-serif`
}

export const uploadedFontFamily = (fontId: string) => `ms-${fontId.replaceAll('-', '')}`

function newId() {
  return crypto.randomUUID().replaceAll('-', '')
}

/** Lowest point used by the phone layout, so new elements land below the others. */
function mobileBottom(design: MicrositeDesign) {
  return design.elements.reduce((bottom, element) => (element.mobile.hidden ? bottom : Math.max(bottom, element.mobile.y + element.mobile.h)), 40)
}

export function mobileFrameFor(desktop: Frame, kind: ElementKind, design: MicrositeDesign, fontSize: number | null | undefined): Frame {
  const width =
    kind === 'button'
      ? Math.min(320, Math.max(160, desktop.w))
      : kind === 'qr'
        ? Math.min(240, desktop.w)
        : kind === 'shape' && desktop.w < 200
          ? desktop.w
          : MOBILE_WIDTH - 40
  const ratio = width / Math.max(1, desktop.w)
  const mobileFont = fontSize ? Math.max(14, Math.round(fontSize * 0.65)) : null
  const height =
    kind === 'image' || kind === 'shape' || kind === 'qr'
      ? Math.max(4, Math.round(desktop.h * ratio))
      : kind === 'button'
        ? Math.max(44, Math.min(64, desktop.h))
        : kind === 'reasonBox'
          ? Math.max(90, desktop.h)
          : Math.max(Math.round((mobileFont ?? 16) * 1.5), Math.round(desktop.h * (mobileFont && fontSize ? mobileFont / fontSize : 0.65) * Math.max(1, desktop.w / width)))
  return {
    x: Math.round((MOBILE_WIDTH - width) / 2),
    y: mobileBottom(design) + 24,
    w: Math.round(width),
    h: height,
    fontSize: kind === 'text' || kind === 'guestName' || kind === 'button' || kind === 'reasonBox' ? mobileFont : null,
  }
}

const presets: Record<string, (design: MicrositeDesign) => Omit<MicrositeElement, 'id' | 'mobile'>> = {
  heading: () => ({
    kind: 'text',
    desktop: { x: 200, y: 120, w: 800, h: 90 },
    text: 'Event title',
    font: 'Georgia',
    fontSize: 56,
    fontWeight: '700',
    color: '#111111',
    align: 'center',
  }),
  text: () => ({
    kind: 'text',
    desktop: { x: 300, y: 240, w: 600, h: 120 },
    text: 'Write something about the event: date, time, venue and dress code.',
    font: 'Arial',
    fontSize: 20,
    fontWeight: '400',
    color: '#333333',
    align: 'center',
    lineHeight: 1.5,
  }),
  guestName: () => ({
    kind: 'guestName',
    desktop: { x: 300, y: 60, w: 600, h: 50 },
    text: 'Dear {name},',
    font: 'Georgia',
    fontSize: 32,
    fontWeight: '400',
    color: '#111111',
    align: 'center',
  }),
  accept: () => button('accept', 'Accept', '#0F8F6E', 380),
  decline: () => button('decline', 'Decline', '#B23B3B', 620),
  badge: () => ({ ...button('badge', 'My E-Badge', '#002650', 500), show: 'accepted' as ShowRule }),
  link: () => button('link', 'Venue location', '#111111', 500),
  confirmAccept: () => ({ ...button('confirm', 'Yes, I will attend', '#0F8F6E', 450), desktop: { x: 450, y: 520, w: 300, h: 60 }, show: 'always' as ShowRule }),
  confirmDecline: () => ({ ...button('confirm', 'I cannot attend', '#B23B3B', 450), desktop: { x: 450, y: 520, w: 300, h: 60 }, show: 'always' as ShowRule }),
  reasonBox: () => ({
    kind: 'reasonBox',
    desktop: { x: 350, y: 380, w: 500, h: 110 },
    text: "Let us know why you can't attend (optional)",
    font: 'Arial',
    fontSize: 16,
    color: '#333333',
    radius: 10,
    borderColor: '#D6D3CC',
    borderWidth: 1,
  }),
  qr: () => ({ kind: 'qr', desktop: { x: 500, y: 360, w: 200, h: 200 }, radius: 8 }),
  download: () => ({ ...button('download', 'Download E-Badge', '#0F8F6E', 380), desktop: { x: 380, y: 600, w: 220, h: 56 }, show: 'always' as ShowRule }),
  wallet: () => ({ ...button('wallet', 'Add to Apple Wallet', '#000000', 620), desktop: { x: 620, y: 600, w: 220, h: 56 }, show: 'always' as ShowRule }),
  home: () => ({ ...button('home', 'Back to the invitation', '#FFFFFF', 500), color: '#111111', borderColor: '#D6D3CC', borderWidth: 1, show: 'always' as ShowRule }),
  shape: () => ({ kind: 'shape', desktop: { x: 100, y: 400, w: 1000, h: 300 }, background: '#F3EFE8', radius: 16 }),
  divider: () => ({ kind: 'shape', desktop: { x: 450, y: 380, w: 300, h: 2 }, background: '#CBA886' }),
}

function button(action: ButtonAction, label: string, background: string, x: number): Omit<MicrositeElement, 'id' | 'mobile'> {
  return {
    kind: 'button',
    desktop: { x, y: 520, w: 200, h: 56 },
    label,
    action,
    url: action === 'link' ? 'https://' : null,
    background,
    color: '#FFFFFF',
    font: 'Arial',
    fontSize: 18,
    fontWeight: '600',
    radius: 999,
    align: 'center',
    show: action === 'accept' || action === 'decline' ? 'pending' : 'always',
  }
}

export type Preset = keyof typeof presets

/** A new element from a preset, placed near the top of the visible desktop area, with a phone frame below the rest. */
export function createElement(preset: Preset, design: MicrositeDesign, desktopTop: number): MicrositeElement {
  const base = presets[preset](design)
  const desktop = { ...base.desktop, y: Math.max(0, Math.round(desktopTop + 80)) }
  return { ...base, id: newId(), desktop, mobile: mobileFrameFor(desktop, base.kind, design, base.fontSize) }
}

export function createImage(assetId: string, natural: { width: number; height: number }, design: MicrositeDesign, desktopTop: number): MicrositeElement {
  const width = Math.min(800, natural.width)
  const height = Math.round((width * natural.height) / Math.max(1, natural.width))
  const desktop = { x: Math.round((DESKTOP_WIDTH - width) / 2), y: Math.max(0, Math.round(desktopTop + 80)), w: width, h: height }
  return { id: newId(), kind: 'image', assetId, fit: 'cover', radius: 0, desktop, mobile: mobileFrameFor(desktop, 'image', design, null) }
}

export function duplicate(element: MicrositeElement): MicrositeElement {
  return {
    ...element,
    id: newId(),
    desktop: { ...element.desktop, x: element.desktop.x + 20, y: element.desktop.y + 20 },
    mobile: { ...element.mobile, x: element.mobile.x + 12, y: element.mobile.y + 12 },
  }
}

/** Rebuilds the phone layout: elements stacked in desktop reading order, full width, sizes scaled down. */
export function autoArrangeMobile(design: MicrositeDesign): MicrositeDesign {
  const ordered = [...design.elements].sort((a, b) => a.desktop.y - b.desktop.y || a.desktop.x - b.desktop.x)
  let y = 32
  const frames = new Map<string, Frame>()
  for (const element of ordered) {
    if (element.desktop.hidden) {
      frames.set(element.id, { ...element.mobile, hidden: true })
      continue
    }
    const frame = mobileFrameFor(element.desktop, element.kind, { ...design, elements: [] }, element.fontSize)
    const placed = { ...frame, y }
    frames.set(element.id, placed)
    y += placed.h + (element.kind === 'shape' && element.desktop.h <= 4 ? 16 : 24)
  }
  return {
    ...design,
    mobileHeight: Math.max(600, Math.round(y + 40)),
    elements: design.elements.map((element) => ({ ...element, mobile: frames.get(element.id) ?? element.mobile })),
  }
}

/** Fills {name}, {position}, {company}, {event} for the canvas preview. */
export function fillTokens(template: string, sample: { name: string; position: string; company: string; event: string }) {
  return template
    .replaceAll('{name}', sample.name)
    .replaceAll('{position}', sample.position)
    .replaceAll('{company}', sample.company)
    .replaceAll('{event}', sample.event)
}

export function normalizeDesign(value: unknown): MicrositeDesign {
  const empty = emptyDesign()
  if (!value || typeof value !== 'object') return empty
  const raw = value as Partial<MicrositeDesign>
  return {
    title: typeof raw.title === 'string' ? raw.title : null,
    background: typeof raw.background === 'string' ? raw.background : empty.background,
    backgroundAssetId: typeof raw.backgroundAssetId === 'string' ? raw.backgroundAssetId : null,
    desktopHeight: typeof raw.desktopHeight === 'number' ? raw.desktopHeight : empty.desktopHeight,
    mobileHeight: typeof raw.mobileHeight === 'number' ? raw.mobileHeight : empty.mobileHeight,
    elements: Array.isArray(raw.elements) ? raw.elements.filter((element) => element && element.desktop && element.mobile) : [],
    pages: Array.isArray(raw.pages)
      ? raw.pages
          .filter((page) => page && ['accept', 'decline', 'thanks', 'declined'].includes(page.key))
          .map((page) => ({
            key: page.key,
            background: typeof page.background === 'string' ? page.background : null,
            backgroundAssetId: typeof page.backgroundAssetId === 'string' ? page.backgroundAssetId : null,
            desktopHeight: typeof page.desktopHeight === 'number' ? page.desktopHeight : 900,
            mobileHeight: typeof page.mobileHeight === 'number' ? page.mobileHeight : 1000,
            elements: Array.isArray(page.elements) ? page.elements.filter((element) => element && element.desktop && element.mobile) : [],
          }))
      : [],
  }
}
