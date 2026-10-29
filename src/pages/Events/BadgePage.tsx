import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { badgeApi } from '@/api/badgeApi'
import { guestTypeApi } from '@/api/guestTypeApi'
import { invitationApi } from '@/api/invitationApi'
import { defaultBackground, normalizeBadgeDesign, type BadgeDesign } from '@/badges/design'
import { buttonClassName } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { BadgeDesigner } from '@/components/badges/BadgeDesigner'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'

export function BadgePage() {
  const { eventId = '', guestTypeId } = useParams()
  const navigate = useNavigate()
  const eventQuery = useEvent(eventId)
  const event = eventQuery.data
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<BadgeDesign | null>(null)
  const [uploading, setUploading] = useState(false)
  const typeQuery = useQuery({
    queryKey: ['guest-types', eventId],
    queryFn: () => guestTypeApi.list(eventId),
    enabled: Boolean(eventId),
  })
  const guestType = typeQuery.data?.find((type) => type.id === guestTypeId)
  useDocumentTitle(event ? `${event.name} digital pass` : 'Digital pass designer')

  const templateQuery = useQuery({
    queryKey: guestTypeId ? ['guest-type-badge', eventId, guestTypeId] : ['badge-template', eventId],
    queryFn: () => (guestTypeId ? guestTypeApi.getBadge(eventId, guestTypeId) : badgeApi.getTemplate(eventId)),
    enabled: Boolean(eventId) && (!guestTypeId || Boolean(guestType)),
  })

  useEffect(() => {
    setDraft(null)
  }, [eventId, guestTypeId])

  const serverDesign = templateQuery.data ? normalizeBadgeDesign(templateQuery.data.design) : null
  const dirty = draft !== null && serverDesign !== null && JSON.stringify(normalizeBadgeDesign(draft)) !== JSON.stringify(serverDesign)
  useEffect(() => {
    if (!dirty) return
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty])

  const saveMutation = useMutation({
    mutationFn: (design: BadgeDesign) =>
      guestTypeId
        ? guestTypeApi.saveBadge(eventId, guestTypeId, normalizeBadgeDesign(design))
        : badgeApi.saveTemplate(eventId, normalizeBadgeDesign(design)),
    onSuccess: async (saved) => {
      setDraft(normalizeBadgeDesign(saved.design))
      toast.success(guestTypeId ? 'Digital pass design saved for this guest category.' : 'Digital pass design saved.')
      await queryClient.invalidateQueries({ queryKey: guestTypeId ? ['guest-type-badge', eventId, guestTypeId] : ['badge-template', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['guest-types', eventId] })
    },
    onError: (error) => {
      toast.error(messageFrom(error, 'The digital pass design could not be saved.'))
    },
  })

  if (eventQuery.isLoading || templateQuery.isLoading || (guestTypeId && typeQuery.isLoading)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted" aria-live="polite">
        Loading digital pass
      </div>
    )
  }

  if (eventQuery.isError || !event || templateQuery.isError || !templateQuery.data || (guestTypeId && !guestType)) {
    const missing = eventQuery.error instanceof ApiError && eventQuery.error.status === 404
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6">
        <EmptyState
          title={missing ? 'Event not found' : 'Digital pass could not be loaded'}
          description={missing ? 'It may have been deleted.' : 'Try again in a moment.'}
          action={
            <Link to="/events" className={buttonClassName('secondary')}>
              Back to events
            </Link>
          }
        />
      </div>
    )
  }

  const design = draft ?? normalizeBadgeDesign(templateQuery.data.design)

  async function upload(file: File) {
    setUploading(true)
    try {
      const asset = await invitationApi.uploadAsset(eventId, file)
      setDraft({
        ...design,
        backgroundAssetId: asset.id,
        background: design.background ?? defaultBackground(design),
      })
    } catch (error) {
      toast.error(messageFrom(error, 'The image could not be uploaded.'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <BadgeDesigner
      eventId={event.id}
      design={design}
      onChange={setDraft}
      uploading={uploading}
      onUpload={(file) => void upload(file)}
      saving={saveMutation.isPending}
      onSave={() => saveMutation.mutate(design)}
      backTo={guestTypeId ? `/events/${event.id}/guest-types` : undefined}
      backLabel={guestTypeId ? 'Guest categories' : undefined}
      context="Design: Digital pass"
      guestTypes={typeQuery.data?.map((type) => ({ id: type.id, name: type.name }))}
      guestTypeId={guestTypeId}
      onGuestTypeChange={(nextId) => {
        if (nextId === (guestTypeId ?? '')) return
        if (dirty && !window.confirm('This design has unsaved changes. Load another guest category without saving?')) return
        navigate(nextId ? `/events/${event.id}/guest-types/${nextId}/badge` : `/events/${event.id}/badges`)
      }}
    />
  )
}

function messageFrom(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback
  const field = error.errors ? Object.values(error.errors)[0]?.[0] : undefined
  return field || error.message || fallback
}
