import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError, apiBaseUrl } from '@/api/client'
import type { PrintBadgeDesign } from '@/api/printBadgeApi'
import { guestTypeApi } from '@/api/guestTypeApi'
import { badgeLimits, elementsToPass, normalizeBadgeDesign, passToElements } from '@/badges/design'
import { EventDesignerSwitcher } from '@/designer/DesignerSwitcher'
import { ElementBadgeDesigner } from '@/designer/ElementBadgeDesigner'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const passSizes = [
  { label: 'Portrait (600 × 900 px)', width: 600, height: 900 },
  { label: 'Landscape (900 × 600 px)', width: 900, height: 600 },
  { label: 'Phone screen (1080 × 1920 px)', width: 1080, height: 1920 },
  { label: 'Tall card (1080 × 1350 px)', width: 1080, height: 1350 },
  { label: 'Square (1080 × 1080 px)', width: 1080, height: 1080 },
]

/** Digital pass designer (pixels) for one guest category, on the shared element designer. */
export function BadgePage() {
  const { eventId = '', guestTypeId } = useParams()
  const queryClient = useQueryClient()
  const typeQuery = useQuery({ queryKey: ['guest-types', eventId], queryFn: () => guestTypeApi.list(eventId), enabled: Boolean(eventId) })
  const guestType = typeQuery.data?.find((type) => type.id === guestTypeId)
  const badgeQuery = useQuery({
    queryKey: ['guest-type-badge', eventId, guestTypeId],
    queryFn: () => guestTypeApi.getBadge(eventId, guestTypeId!),
    enabled: Boolean(eventId && guestTypeId),
  })
  const [initial, setInitial] = useState<PrintBadgeDesign | null>(null)
  const [saving, setSaving] = useState(false)
  useDocumentTitle(guestType ? `Digital pass · ${guestType.name}` : 'Digital pass')

  // Older designs are converted to elements; their background image needs its real size first.
  useEffect(() => {
    setInitial(null)
    const data = badgeQuery.data
    if (!data) return
    const design = normalizeBadgeDesign(data.design)
    let cancelled = false
    const finish = (natural: { width: number; height: number } | null) => {
      if (!cancelled) setInitial(passToElements(design, natural))
    }
    if (!design.elements && design.backgroundAssetId && design.background && design.background.height == null) {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => finish(null)
      image.src = `${apiBaseUrl}/api/public/assets/${design.backgroundAssetId}`
    } else {
      finish(null)
    }
    return () => {
      cancelled = true
    }
  }, [badgeQuery.data])

  if (!guestTypeId) return <Navigate to={`/events/${eventId}/designs`} replace />

  if (typeQuery.isLoading || badgeQuery.isLoading || (badgeQuery.data && !initial)) {
    return <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted">Loading the digital pass…</div>
  }
  if (!guestType || badgeQuery.isError || !initial || !badgeQuery.data) {
    return <div className="flex h-dvh items-center justify-center bg-background text-sm text-danger">The digital pass could not be loaded.</div>
  }

  return (
    <ElementBadgeDesigner
      key={guestTypeId}
      unit="px"
      title={`Digital pass · ${guestType.name}`}
      backLabel="Designs"
      backTo={`/events/${eventId}/designs`}
      switcher={<EventDesignerSwitcher eventId={eventId} kind="pass" guestTypeId={guestTypeId} guestTypeName={guestType.name} />}
      eventId={eventId}
      initial={initial}
      configured={badgeQuery.data.configured}
      sizePresets={passSizes}
      limits={{ minWidth: badgeLimits.minWidth, maxWidth: badgeLimits.maxWidth, minHeight: badgeLimits.minHeight, maxHeight: badgeLimits.maxHeight }}
      saving={saving}
      hint="The pass guests open on their phone and download after accepting. Each guest sees their own name and check-in QR code."
      onSave={async (design) => {
        setSaving(true)
        try {
          const saved = await guestTypeApi.saveBadge(eventId, guestTypeId, elementsToPass(design))
          queryClient.setQueryData(['guest-type-badge', eventId, guestTypeId], saved)
          void queryClient.invalidateQueries({ queryKey: ['guest-types', eventId] })
          toast.success('Digital pass saved.')
          return passToElements(normalizeBadgeDesign(saved.design), null)
        } catch (error) {
          const field = error instanceof ApiError && error.errors ? Object.values(error.errors)[0]?.[0] : undefined
          toast.error(field ?? (error instanceof ApiError ? error.message : 'The digital pass could not be saved.'))
          return null
        } finally {
          setSaving(false)
        }
      }}
    />
  )
}
