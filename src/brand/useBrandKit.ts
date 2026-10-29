import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { brandApi, emptyBrandKit, type BrandKit } from '@/api/brandApi'
import { apiBaseUrl } from '@/api/client'
import type { EventFont } from '@/api/fontApi'

/**
 * The brand kit of the page's event: /events/:eventId/… uses the event's kit, /accreditation/:accEventId/…
 * the kit of the event the accreditation belongs to. Empty elsewhere.
 */
export function useBrandKit(): { kit: BrandKit; scope: { kind: 'event'; id: string } | { kind: 'accreditation'; id: string } | null } {
  const { eventId, accEventId } = useParams()
  const scope = eventId ? ({ kind: 'event', id: eventId } as const) : accEventId ? ({ kind: 'accreditation', id: accEventId } as const) : null
  const query = useQuery({
    queryKey: ['brand-kit', scope?.kind, scope?.id],
    queryFn: () => (scope!.kind === 'event' ? brandApi.get(scope!.id) : brandApi.forAccreditation(scope!.id)),
    enabled: Boolean(scope),
    staleTime: 5 * 60_000,
    retry: false,
  })
  return { kit: query.data ?? emptyBrandKit, scope }
}

const registered = new Set<string>()

/** Makes the brand fonts usable by name in previews and printing. */
export function registerBrandFonts(fonts: EventFont[]) {
  for (const font of fonts) {
    if (registered.has(font.id) || typeof FontFace === 'undefined') continue
    registered.add(font.id)
    const face = new FontFace(font.name, `url(${apiBaseUrl}${font.url})`)
    void face
      .load()
      .then((loaded) => document.fonts.add(loaded))
      .catch(() => registered.delete(font.id))
  }
}

export function useBrandFonts(fonts: EventFont[]) {
  useEffect(() => registerBrandFonts(fonts), [fonts])
}
