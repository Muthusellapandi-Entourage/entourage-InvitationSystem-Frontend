import { apiBaseUrl, apiBlob, apiClient } from '@/api/client'
import type { MicrositeDesign } from '@/microsite/design'

export type Microsite = {
  design: MicrositeDesign
  isPublished: boolean
  publicEnabled: boolean
  updatedOn: string | null
  /** The event domain's home page, when the domain is confirmed. */
  publicUrl: string | null
}

export const micrositeApi = {
  get(eventId: string) {
    return apiClient<Microsite>(`/api/events/${eventId}/microsite`)
  },

  save(eventId: string, design: MicrositeDesign, isPublished: boolean, publicEnabled: boolean) {
    return apiClient<Microsite>(`/api/events/${eventId}/microsite`, {
      method: 'PUT',
      body: JSON.stringify({ design, isPublished, publicEnabled }),
    })
  },

  /** The unsaved design as a full page; images and fonts are pointed at the API address. */
  async preview(eventId: string, design: MicrositeDesign, asGuest: boolean, page = 'home') {
    const blob = await apiBlob(`/api/events/${eventId}/microsite/preview?guest=${asGuest}&page=${encodeURIComponent(page)}`, {
      method: 'POST',
      body: JSON.stringify(design),
    })
    const origin = apiBaseUrl || window.location.origin
    return (await blob.text()).replaceAll("'/api/public/", `'${origin}/api/public/`).replaceAll('"/api/public/', `"${origin}/api/public/`)
  },
}
