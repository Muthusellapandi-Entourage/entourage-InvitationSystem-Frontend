import { apiClient } from '@/api/client'
import type { AccFile } from '@/api/accreditationApi'
import type { EventFont } from '@/api/fontApi'

export type BrandColor = { name: string; hex: string }
export type BrandGroupKind = 'logos' | 'backgrounds' | 'custom'
export type BrandItem = { assetId: string; name: string; url: string }
export type BrandGroup = { id: string; name: string; kind: BrandGroupKind; items: BrandItem[] }
export type BrandKit = { colors: BrandColor[]; groups: BrandGroup[]; fonts: EventFont[] }

export type BrandKitWrite = {
  colors: BrandColor[]
  groups: { id: string; name: string; kind: BrandGroupKind; items: { assetId: string; name: string }[] }[]
}

export const emptyBrandKit: BrandKit = { colors: [], groups: [], fonts: [] }

export function toBrandKitWrite(kit: Pick<BrandKit, 'colors' | 'groups'>): BrandKitWrite {
  return {
    colors: kit.colors,
    groups: kit.groups.map((group) => ({ id: group.id, name: group.name, kind: group.kind, items: group.items.map((item) => ({ assetId: item.assetId, name: item.name })) })),
  }
}

export const brandApi = {
  get: (eventId: string) => apiClient<BrandKit>(`/api/events/${eventId}/brand-kit`),
  save: (eventId: string, body: BrandKitWrite) => apiClient<BrandKit>(`/api/events/${eventId}/brand-kit`, { method: 'PUT', body: JSON.stringify(body) }),
  /** Accreditation: the linked event's brand kit (empty when not linked). */
  forAccreditation: (accEventId: string) => apiClient<BrandKit>(`/api/accreditation/events/${accEventId}/brand-kit`),
  /** Accreditation: copies a brand image into accreditation storage. */
  importToAccreditation: (accEventId: string, assetId: string) =>
    apiClient<AccFile>(`/api/accreditation/events/${accEventId}/brand-kit/import`, { method: 'POST', body: JSON.stringify({ assetId }) }),
}
