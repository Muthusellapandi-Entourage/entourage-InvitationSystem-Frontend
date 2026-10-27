import { zipSync } from 'fflate'
import { jsPDF } from 'jspdf'
import { apiBaseUrl } from '@/api/client'
import { guestApi, type Guest, type GuestBlock } from '@/api/guestApi'
import { guestTypeApi } from '@/api/guestTypeApi'
import { renderGuestBadge } from '@/badges/renderBadge'
import { blobToDataUrl, nameImageApi } from '@/api/fontApi'
import { renderInvitationHtml, usesGuestNameImage } from '@/invitations/emailHtml'

/** CSS pixels are 96 per inch; PDF points are 72 per inch. */
const pxToPt = 72 / 96

export type ExportProgress = (done: number, total: number) => void

export type ExportOutcome = {
  /** Files produced (badges or invitation pages). */
  count: number
  skipped: GuestBlock[]
}

export class ExportCancelled extends Error {
  constructor() {
    super('Download cancelled.')
  }
}

function safeFileName(value: string) {
  return value.trim().replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'guest'
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  // While a modal is open the rest of the page is inert, so the link goes inside the open dialog.
  const host = document.querySelector('dialog[open]') ?? document.body
  host.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function canvasBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob && blob.size > 0 ? resolve(blob) : reject(new Error('An image could not be rendered.'))),
      type,
      quality,
    )
  })
}

/** Unique names inside one ZIP: "farewell-lina-haddad.png", "farewell-lina-haddad-2.png", … */
function uniqueName(used: Set<string>, base: string, extension: string) {
  let name = `${base}.${extension}`
  for (let index = 2; used.has(name); index += 1) name = `${base}-${index}.${extension}`
  used.add(name)
  return name
}

/** Every downloaded guest file is named "<event>-<guest>", e.g. "farewell-lina-haddad.pdf". */
export function guestFileBase(eventName: string, guestName: string) {
  return `${safeFileName(eventName)}-${safeFileName(guestName)}`
}

/**
 * Collects one file per guest. A single file downloads as-is; several are packed into one ZIP
 * (browsers block many downloads at once), each still a separate "<event>-<guest>" file inside.
 */
class GuestFiles {
  private readonly files: { name: string; blob: Blob }[] = []
  private readonly used = new Set<string>()

  constructor(private readonly eventName: string) {}

  add(guestName: string, extension: 'pdf' | 'png', blob: Blob) {
    this.files.push({ name: uniqueName(this.used, guestFileBase(this.eventName, guestName), extension), blob })
  }

  get count() {
    return this.files.length
  }

  async save(zipName: string) {
    if (this.files.length === 0) return
    if (this.files.length === 1) {
      downloadBlob(this.files[0].blob, this.files[0].name)
      return
    }
    const entries: Record<string, Uint8Array> = {}
    for (const file of this.files) entries[file.name] = new Uint8Array(await file.blob.arrayBuffer())
    // PDFs and PNGs are already compressed, so store them as-is.
    const zipped = new Uint8Array(zipSync(entries, { level: 0 }))
    downloadBlob(new Blob([zipped], { type: 'application/zip' }), zipName)
  }
}

/** A one-page PDF sized exactly to the canvas. */
function singlePagePdf(canvas: HTMLCanvasElement, scale: number, image: 'PNG' | 'JPEG') {
  return addCanvasPage(null, canvas, scale, image).output('blob')
}

/** Adds one page sized exactly to the canvas, so each badge or invitation fills its own page. */
function addCanvasPage(pdf: jsPDF | null, canvas: HTMLCanvasElement, scale: number, image: 'PNG' | 'JPEG') {
  const width = (canvas.width / scale) * pxToPt
  const height = (canvas.height / scale) * pxToPt
  const orientation = width > height ? 'landscape' : 'portrait'
  const doc = pdf ?? new jsPDF({ orientation, unit: 'pt', format: [width, height], compress: true })
  if (pdf) doc.addPage([width, height], orientation)
  const data = image === 'PNG' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92)
  doc.addImage(data, image, 0, 0, width, height, undefined, 'FAST')
  return doc
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

/**
 * Draws every guest's e-badge with their own check-in QR code: one PNG or one single-page PDF
 * per guest, each named "<event>-<guest>". One guest downloads as that file; several come as a
 * ZIP of separate files. Guests whose type has no badge design are skipped and reported.
 * Generated badges are recorded on each guest.
 */
export async function exportBadges(
  eventId: string,
  eventName: string,
  guests: Guest[],
  format: 'png' | 'pdf',
  zipBase: string,
  onProgress: ExportProgress,
  signal: AbortSignal,
): Promise<ExportOutcome> {
  if (guests.length === 0) return { count: 0, skipped: [] }
  const prepared = await guestApi.prepareBadges(eventId, guests.map((guest) => guest.id))
  const skipped = [...prepared.blocked]
  const ready = prepared.ready
  if (ready.length === 0) return { count: 0, skipped }

  const files = new GuestFiles(eventName)
  let done = 0
  onProgress(0, ready.length)
  for (const item of ready) {
    if (signal.aborted) throw new ExportCancelled()
    try {
      const canvas = await renderGuestBadge(item.design, { name: item.name, qrPayload: item.qrPayload }, apiBaseUrl)
      if (format === 'png') files.add(item.name, 'png', await canvasBlob(canvas, 'image/png'))
      else files.add(item.name, 'pdf', singlePagePdf(canvas, 1, 'PNG'))
    } catch (error) {
      skipped.push({ guestId: item.guestId, name: item.name, reason: error instanceof Error ? error.message : 'The badge could not be drawn.' })
    }
    done += 1
    onProgress(done, ready.length)
    // Let the page repaint the progress bar between badges.
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  }

  const produced = files.count
  if (produced === 0) return { count: 0, skipped }
  await files.save(`${zipBase}-e-badges-${format === 'png' ? 'images' : 'pdf'}.zip`)
  const failedIds = new Set(skipped.map((item) => item.guestId))
  const recorded = ready.filter((item) => !failedIds.has(item.guestId)).map((item) => item.guestId)
  if (recorded.length > 0) await guestApi.commitBadges(eventId, recorded)
  return { count: produced, skipped }
}

/**
 * One guest's E-Badge (from the guest panel), drawn on the server so it does not depend on the
 * browser loading the background image. PNG as-is; PDF is one page sized to the badge.
 * Throws with a readable message (no guest type, no badge design, …).
 */
export async function exportGuestBadge(eventId: string, eventName: string, guest: Guest, format: 'png' | 'pdf') {
  const png = await guestApi.badgeImage(eventId, guest.id)
  if (png.size === 0) throw new Error('The e-badge could not be drawn.')
  const base = guestFileBase(eventName, guest.name)
  if (format === 'png') {
    downloadBlob(png, `${base}.png`)
  } else {
    const bitmap = await createImageBitmap(png)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('The e-badge could not be drawn.')
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    downloadBlob(singlePagePdf(canvas, 1, 'PNG'), `${base}.pdf`)
  }
  // Recording is best effort (e.g. archived events are read-only); the file is already saved.
  await guestApi.commitBadges(eventId, [guest.id]).catch(() => undefined)
}

/* ------------------------------------------------------------------ */
/* Invitations                                                         */
/* ------------------------------------------------------------------ */

const imageCache = new Map<string, Promise<string>>()

/** Images inside an SVG drawn to a canvas must be inline, or the browser leaves them blank. */
function inlineImage(src: string) {
  let pending = imageCache.get(src)
  if (!pending) {
    pending = (async () => {
      const response = await fetch(src, { mode: 'cors', cache: 'no-store' })
      if (!response.ok) throw new Error('An invitation image could not be loaded.')
      const blob = await response.blob()
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('An invitation image could not be read.'))
        reader.readAsDataURL(blob)
      })
    })()
    imageCache.set(src, pending)
    pending.catch(() => imageCache.delete(src))
  }
  return pending
}

/**
 * Renders one personalised invitation (the same HTML guests receive) into a canvas:
 * images are inlined, the page is measured at its design width, then drawn through an SVG.
 * Links are not clickable in the result; this is a printable copy.
 */
export async function renderInvitationCanvas(html: string, width: number, scale = 2) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const canvasNode = parsed.querySelector('[data-invitation-canvas]') ?? parsed.body
  for (const image of Array.from(canvasNode.querySelectorAll('img'))) {
    const src = image.getAttribute('src')
    if (!src || src.startsWith('data:')) continue
    image.setAttribute('src', await inlineImage(new URL(src, window.location.href).href))
  }

  // Measure the real height in the page (same fonts and layout as the on-screen preview).
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;background:#fff;`
  host.appendChild(document.importNode(canvasNode, true))
  document.body.appendChild(host)
  try {
    await Promise.all(Array.from(host.querySelectorAll('img')).map((image) => image.decode().catch(() => undefined)))
    const height = Math.max(1, Math.ceil(host.scrollHeight))
    const markup = new XMLSerializer().serializeToString(host.firstElementChild ?? host)
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<foreignObject x="0" y="0" width="100%" height="100%">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;margin:0;">${markup}</div>` +
      `</foreignObject></svg>`
    const image = new Image()
    image.decoding = 'sync'
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('The invitation could not be rendered.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.scale(scale, scale)
    context.drawImage(image, 0, 0, width, height)
    return canvas
  } finally {
    host.remove()
  }
}

/**
 * One PDF per guest, each showing that guest's personalised invitation (their type's design with
 * their name and position), named "<event>-<guest>.pdf". One guest downloads as that file; several
 * come as a ZIP of separate PDFs. Downloading does not send or record anything.
 */
export async function exportInvitations(
  eventId: string,
  eventName: string,
  eventSlug: string,
  guests: Guest[],
  zipBase: string,
  onProgress: ExportProgress,
  signal: AbortSignal,
): Promise<ExportOutcome> {
  const skipped: GuestBlock[] = []
  const designs = new Map<string, { html: string; width: number } | null>()
  const typeIds = [...new Set(guests.map((guest) => guest.guestTypeId).filter((id): id is string => Boolean(id)))]
  for (const typeId of typeIds) {
    try {
      const invitation = await guestTypeApi.getInvitation(eventId, typeId)
      designs.set(typeId, invitation.configured && invitation.html ? { html: invitation.html, width: invitation.design.width } : null)
    } catch {
      designs.set(typeId, null)
    }
  }

  const ready = guests.filter((guest) => {
    const design = guest.guestTypeId ? designs.get(guest.guestTypeId) : undefined
    if (!guest.guestTypeId) {
      skipped.push({ guestId: guest.id, name: guest.name, reason: 'No guest type, so there is no invitation design.' })
      return false
    }
    if (!design) {
      skipped.push({ guestId: guest.id, name: guest.name, reason: `The ${guest.guestTypeName ?? 'guest type'} invitation design has not been configured.` })
      return false
    }
    return true
  })
  if (ready.length === 0) return { count: 0, skipped }

  const rsvp = `${window.location.origin}/invite/${encodeURIComponent(eventSlug)}/rsvp`
  const files = new GuestFiles(eventName)
  let done = 0
  onProgress(0, ready.length)
  for (const guest of ready) {
    if (signal.aborted) throw new ExportCancelled()
    const design = designs.get(guest.guestTypeId!)!
    try {
      const nameImage = usesGuestNameImage(design.html) ? await blobToDataUrl(await nameImageApi.forGuest(eventId, guest.id)) : undefined
      const html = renderInvitationHtml(design.html, {
        guestName: guest.name,
        guestPosition: guest.position ?? '',
        acceptUrl: `${rsvp}?status=accept`,
        declineUrl: `${rsvp}?status=decline`,
        assetOrigin: apiBaseUrl,
        nameImage,
      })
      const canvas = await renderInvitationCanvas(html, design.width || 560)
      // JPEG keeps invitation PDFs small; badges stay PNG for crisp QR codes.
      files.add(guest.name, 'pdf', singlePagePdf(canvas, 2, 'JPEG'))
    } catch (error) {
      skipped.push({ guestId: guest.id, name: guest.name, reason: error instanceof Error ? error.message : 'The invitation could not be drawn.' })
    }
    done += 1
    onProgress(done, ready.length)
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  }

  await files.save(`${zipBase}-invitations.zip`)
  return { count: files.count, skipped }
}

/* ------------------------------------------------------------------ */
/* RSVP report                                                         */
/* ------------------------------------------------------------------ */

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value)
  // Quote everything; double any quotes. Leading = + - @ would run as formulas in Excel, so prefix them.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

function formatDate(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

/**
 * Spreadsheet (CSV, opens in Excel) of guests with their invitation, RSVP and badge status.
 * RSVP replies are stored by the name the guest typed, so they are matched to guests by name.
 */
export function downloadGuestReport(
  guests: Guest[],
  responses: { guestName: string; status: string; createdOn: string }[],
  filename: string,
) {
  const latestByName = new Map<string, { status: string; createdOn: string }>()
  for (const response of responses) {
    const key = response.guestName.trim().toLowerCase()
    const current = latestByName.get(key)
    if (!current || response.createdOn > current.createdOn) latestByName.set(key, response)
  }
  const header = ['Name', 'Email', 'Position', 'Group', 'Guest type', 'Invitation', 'Invitation date', 'RSVP', 'RSVP date', 'Badge', 'Check-in code']
  const rows = guests.map((guest) => {
    const reply = latestByName.get(guest.name.trim().toLowerCase())
    return [
      guest.name,
      guest.email,
      guest.position,
      guest.guestGroupName ?? 'No group',
      guest.guestTypeName ?? 'No guest type',
      guest.invitationCount > 0 ? 'Sent' : 'Not sent',
      formatDate(guest.lastInvitationOn),
      reply ? reply.status : guest.invitationCount > 0 ? 'No reply' : '',
      formatDate(reply?.createdOn),
      guest.badgeCount > 0 ? 'Generated' : 'Not generated',
      guest.checkInCode,
    ]
  })
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  // The byte-order mark makes Excel read Arabic and other non-English names correctly.
  downloadBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), filename)
}

export function fileBaseFor(eventName: string, groupName: string | null) {
  return safeFileName(groupName ? `${eventName}-${groupName}` : eventName)
}
