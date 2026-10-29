import type { CSSProperties } from 'react'
import { toDataURL } from 'qrcode'
import type { AccBadgeDesign, AccBadgeElement, AccBadgeKind, AccPrintRow } from '@/api/accreditationApi'

/* Accreditation badge renderer (separate from the invitation print badges). */

/** CSS pixels per millimetre at 96 dpi: 1 printed mm. */
export const PX_PER_MM = 96 / 25.4

export type BadgePerson = Pick<
  AccPrintRow,
  'firstName' | 'lastName' | 'organization' | 'jobTitle' | 'applicantType' | 'badgeNumber' | 'nationality' | 'accessProfile' | 'profileColor' | 'zones' | 'credentialCode' | 'photoFileId'
>

export const samplePerson: BadgePerson = {
  firstName: 'Sara',
  lastName: 'Al Mansouri',
  organization: 'Gulf News',
  jobTitle: 'Photographer',
  applicantType: 'Media',
  badgeNumber: 1042,
  nationality: 'UAE',
  accessProfile: 'Media pass',
  profileColor: '#1F6FEB',
  zones: [
    { code: '2', name: 'Media centre', color: '#1F6FEB' },
    { code: '4', name: 'Press pit', color: '#D97706' },
  ],
  credentialCode: 'SAMPLE',
  photoFileId: null,
}

export const badgeKindLabels: Record<AccBadgeKind, string> = {
  fullName: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  organization: 'Organisation',
  jobTitle: 'Role / job title',
  applicantType: 'Applicant category',
  badgeNumber: 'Badge number',
  nationality: 'Nationality',
  accessProfile: 'Access profile name',
  eventName: 'Event name',
  text: 'Fixed text',
  photo: 'Photo',
  qr: 'QR code',
  zones: 'Zone boxes',
  profileBand: 'Profile colour band',
  rect: 'Shape',
  image: 'Image / logo',
}

const fonts: Record<string, string> = {
  Inter: 'Inter, "Segoe UI", Arial, sans-serif',
  Arial: 'Arial, Helvetica, sans-serif',
  Georgia: 'Georgia, serif',
  'Times New Roman': '"Times New Roman", Times, serif',
}
export const badgeFonts = Object.keys(fonts)

/** Built-in fonts get fallbacks; brand fonts (registered by name from the event's brand kit) fall back to Inter. */
function fontFamily(name: string | null) {
  return fonts[name ?? 'Inter'] ?? `"${name}", ${fonts.Inter}`
}

export function badgeText(element: AccBadgeElement, person: BadgePerson, eventName: string) {
  const value: string | null =
    element.kind === 'fullName'
      ? `${person.firstName} ${person.lastName}`
      : element.kind === 'firstName'
        ? person.firstName
        : element.kind === 'lastName'
          ? person.lastName
          : element.kind === 'organization'
            ? person.organization
            : element.kind === 'jobTitle'
              ? person.jobTitle
              : element.kind === 'applicantType'
                ? person.applicantType
                : element.kind === 'badgeNumber'
                  ? person.badgeNumber
                    ? `${element.text ?? ''}${person.badgeNumber}`
                    : ''
                  : element.kind === 'nationality'
                    ? person.nationality
                    : element.kind === 'accessProfile' || element.kind === 'profileBand'
                      ? person.accessProfile ?? (element.kind === 'profileBand' ? element.text : null)
                      : element.kind === 'eventName'
                        ? eventName
                        : element.kind === 'text'
                          ? element.text
                          : null
  const text = value?.trim() ?? ''
  return element.uppercase ? text.toUpperCase() : text
}

/** Shrinks long text to fit its box (keeps at least 55% of the size). */
function fittedSize(text: string, fontPx: number, widthPx: number, heightPx: number) {
  if (!text) return fontPx
  const lines = Math.max(1, Math.floor(heightPx / (fontPx * 1.15)))
  const needed = text.length * fontPx * 0.56
  const room = widthPx * lines
  return needed > room ? Math.max(fontPx * 0.55, fontPx * (room / needed)) : fontPx
}

const qrCache = new Map<string, Promise<string>>()

/** Badge QR: the credential code (what the gate scanners read in phase 3). */
export function badgeQrDataUrl(code: string) {
  let cached = qrCache.get(code)
  if (!cached) {
    cached = toDataURL(code, { errorCorrectionLevel: 'M', margin: 1, width: 384, color: { dark: '#111111', light: '#ffffff' } })
    qrCache.set(code, cached)
  }
  return cached
}

/**
 * One person's badge. `scale` is pixels per mm (PX_PER_MM prints at true size). `images` maps private
 * file ids (photos, logos) to loaded object URLs.
 */
export function AccBadgeView({
  design,
  person,
  eventName,
  images,
  qrDataUrl,
  scale = PX_PER_MM,
}: {
  design: AccBadgeDesign
  person: BadgePerson
  eventName: string
  images: Record<string, string>
  qrDataUrl: string | null
  scale?: number
}) {
  const px = (mm: number) => mm * scale
  const fontPx = (element: AccBadgeElement) => element.fontSize * (96 / 72) * (scale / PX_PER_MM)
  return (
    <div
      data-acc-badge
      style={{
        position: 'relative',
        width: px(design.widthMm),
        height: px(design.heightMm),
        overflow: 'hidden',
        background: design.backgroundColor,
        boxSizing: 'border-box',
      }}
    >
      {design.backgroundFileId && images[design.backgroundFileId] ? (
        <img alt="" src={images[design.backgroundFileId]} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : null}
      {design.elements.map((element) => {
        if (element.hidden) return null
        const box: CSSProperties = {
          position: 'absolute',
          left: px(element.x),
          top: px(element.y),
          width: px(element.width),
          height: px(element.height),
          borderRadius: px(element.radius ?? 0),
          overflow: 'hidden',
        }

        if (element.kind === 'rect') {
          return <div key={element.id} style={{ ...box, background: element.fill ?? element.color }} />
        }

        if (element.kind === 'photo') {
          const url = person.photoFileId ? images[person.photoFileId] : undefined
          return (
            <div key={element.id} style={{ ...box, background: '#e5e7eb' }}>
              {url ? (
                <img alt="" src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <svg viewBox="0 0 24 30" style={{ width: '100%', height: '100%' }} aria-hidden="true">
                  <circle cx="12" cy="11" r="5" fill="#9ca3af" />
                  <path d="M2 30c0-6 4.5-10 10-10s10 4 10 10z" fill="#9ca3af" />
                </svg>
              )}
            </div>
          )
        }

        if (element.kind === 'image') {
          const url = element.fileId ? images[element.fileId] : undefined
          return url ? <img key={element.id} alt="" src={url} style={{ ...box, objectFit: 'contain' }} /> : null
        }

        if (element.kind === 'qr') {
          return (
            <div key={element.id} style={{ ...box, background: '#fff', borderRadius: 0 }}>
              {qrDataUrl ? (
                <img alt="" src={qrDataUrl} style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated', objectFit: 'contain' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', border: '1px solid #999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: px(3), color: '#777' }}>QR</div>
              )}
            </div>
          )
        }

        if (element.kind === 'zones') {
          // Big colour-coded boxes with the zone code, sized to fit in one row.
          const zones = person.zones
          const gap = px(1)
          const count = Math.max(1, zones.length)
          const size = Math.max(px(3), Math.min(px(element.height), (px(element.width) - gap * (count - 1)) / count))
          const justify = element.align === 'left' ? 'flex-start' : element.align === 'right' ? 'flex-end' : 'center'
          return (
            <div key={element.id} style={{ ...box, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: justify, gap }}>
              {zones.length === 0 ? (
                <span style={{ fontSize: fontPx(element) * 0.5, color: '#9ca3af' }}>No zones</span>
              ) : (
                zones.map((zone) => (
                  <span
                    key={zone.code}
                    style={{
                      width: size,
                      height: size,
                      flex: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: zone.color,
                      color: element.color,
                      borderRadius: px(element.radius ?? 0),
                      fontFamily: fontFamily(element.font),
                      fontWeight: 800,
                      fontSize: Math.min(fontPx(element), size * (zone.code.length > 2 ? 0.42 : 0.62)),
                      lineHeight: 1,
                    }}
                  >
                    {zone.code}
                  </span>
                ))
              )}
            </div>
          )
        }

        const text = badgeText(element, person, eventName)
        const size = fittedSize(text, fontPx(element), px(element.width), px(element.height))
        const background = element.kind === 'profileBand' ? person.profileColor ?? element.fill ?? '#38B8A2' : element.fill ?? undefined
        return (
          <div
            key={element.id}
            style={{
              ...box,
              background,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: element.valign === 'top' ? 'flex-start' : element.valign === 'bottom' ? 'flex-end' : 'center',
              textAlign: element.align,
              color: element.color,
              fontFamily: fontFamily(element.font),
              fontSize: size,
              fontWeight: element.fontWeight === 'bold' ? 700 : element.fontWeight === 'semibold' ? 600 : 400,
              lineHeight: 1.15,
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
              padding: background ? `0 ${px(1)}px` : undefined,
              boxSizing: 'border-box',
            }}
          >
            {text}
          </div>
        )
      })}
    </div>
  )
}

/** File ids a set of badges needs (photos, logos, backgrounds). */
export function neededFileIds(design: AccBadgeDesign, people: BadgePerson[]) {
  const ids = new Set<string>()
  if (design.backgroundFileId) ids.add(design.backgroundFileId)
  for (const element of design.elements) if (element.kind === 'image' && element.fileId) ids.add(element.fileId)
  if (design.elements.some((element) => element.kind === 'photo')) for (const person of people) if (person.photoFileId) ids.add(person.photoFileId)
  return ids
}

/** Loads private images as object URLs, a few at a time. Missing files are skipped. */
export async function loadImages(ids: Iterable<string>, load: (fileId: string) => Promise<Blob>, known: Record<string, string> = {}) {
  const result: Record<string, string> = { ...known }
  const queue = [...ids].filter((id) => !result[id])
  async function worker() {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        result[id] = URL.createObjectURL(await load(id))
      } catch {
        // A missing photo prints the placeholder.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker))
  return result
}
