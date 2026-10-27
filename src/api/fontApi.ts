import { apiBaseUrl, apiBlob, apiClient } from '@/api/client'
import type { InvitationDesign } from '@/invitations/design'

export type EventFont = {
  id: string
  name: string
  fileName: string
  sizeBytes: number
  /** Public path of the font file, e.g. /api/public/fonts/{id}. */
  url: string
  createdOn: string
}

export const fontApi = {
  list(eventId: string) {
    return apiClient<EventFont[]>(`/api/events/${eventId}/fonts`)
  },

  upload(eventId: string, file: File, name?: string) {
    const body = new FormData()
    body.append('file', file)
    if (name?.trim()) body.append('name', name.trim())
    return apiClient<EventFont>(`/api/events/${eventId}/fonts`, { method: 'POST', body })
  },

  remove(eventId: string, fontId: string) {
    return apiClient<null>(`/api/events/${eventId}/fonts/${fontId}`, { method: 'DELETE' })
  },

  fileUrl(font: Pick<EventFont, 'url'>) {
    return `${apiBaseUrl}${font.url}`
  },
}

export const nameImageApi = {
  /** Exact server-drawn name strip for an unsaved design (the same drawing used in emails). */
  preview(eventId: string, design: InvitationDesign, name: string, position: string) {
    return apiBlob(`/api/events/${eventId}/invitation-name-preview`, {
      method: 'POST',
      body: JSON.stringify({ design, name, position }),
    })
  },

  /** A guest's own name strip, from their guest type's saved design. */
  forGuest(eventId: string, guestId: string) {
    return apiBlob(`/api/events/${eventId}/guests/${guestId}/name-image`)
  },
}

/** Reads a blob as a data: URL so it can be inlined in HTML or drawn on a canvas. */
export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('The image could not be read.'))
    reader.readAsDataURL(blob)
  })
}
