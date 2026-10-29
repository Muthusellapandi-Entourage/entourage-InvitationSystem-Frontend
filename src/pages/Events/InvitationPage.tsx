import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { guestTypeApi } from '@/api/guestTypeApi'
import { SliceDesigner } from '@/components/invitations/SliceDesigner'
import { buttonClassName } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { EventDesignerSwitcher } from '@/designer/DesignerSwitcher'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import type { InvitationDesign } from '@/invitations/design'
import { normalizeInvitationDesign } from '@/invitations/design'

/** The invitation of one guest category, designed as one image (the classic designer is retired). */
export function InvitationPage() {
  const { eventId = '', guestTypeId } = useParams()
  const eventQuery = useEvent(eventId)
  const event = eventQuery.data
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const typeQuery = useQuery({
    queryKey: ['guest-types', eventId],
    queryFn: () => guestTypeApi.list(eventId),
    enabled: Boolean(eventId),
  })
  const guestType = typeQuery.data?.find((type) => type.id === guestTypeId)
  useDocumentTitle(guestType ? `Invitation · ${guestType.name}` : 'Invitation')

  const templateQuery = useQuery({
    queryKey: ['guest-type-invitation', eventId, guestTypeId],
    queryFn: () => guestTypeApi.getInvitation(eventId, guestTypeId!),
    enabled: Boolean(eventId && guestTypeId && guestType),
  })

  // Event-level invitations are gone: every guest category has its own.
  if (!guestTypeId) return <Navigate to={`/events/${eventId}/designs`} replace />

  if (eventQuery.isLoading || typeQuery.isLoading || templateQuery.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted" aria-live="polite">
        Loading invitation
      </div>
    )
  }

  if (eventQuery.isError || !event || !guestType || templateQuery.isError || !templateQuery.data) {
    const missing = eventQuery.error instanceof ApiError && eventQuery.error.status === 404
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6">
        <EmptyState
          title={missing ? 'Event not found' : 'Invitation could not be loaded'}
          description={missing ? 'It may have been deleted.' : 'Try again in a moment.'}
          action={
            <Link to={eventId ? `/events/${eventId}/designs` : '/events'} className={buttonClassName('secondary')}>
              Back
            </Link>
          }
        />
      </div>
    )
  }

  const design = normalizeInvitationDesign(templateQuery.data.design)

  async function save(next: InvitationDesign) {
    setSaving(true)
    try {
      await guestTypeApi.saveInvitation(eventId, guestTypeId!, next)
      toast.success('Invitation saved for this guest category.')
      await queryClient.invalidateQueries({ queryKey: ['guest-type-invitation', eventId, guestTypeId] })
      await queryClient.invalidateQueries({ queryKey: ['guest-types', eventId] })
      return true
    } catch (error) {
      toast.error(messageFrom(error, 'The invitation could not be saved.'))
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <SliceDesigner
      key={guestTypeId}
      eventId={event.id}
      title={`Invitation · ${guestType.name}`}
      design={design}
      saving={saving}
      onSave={save}
      backTo={`/events/${event.id}/designs`}
      backLabel="Designs"
      switcher={<EventDesignerSwitcher eventId={event.id} kind="invitation" guestTypeId={guestType.id} guestTypeName={guestType.name} />}
    />
  )
}

function messageFrom(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback
  const field = error.errors ? Object.values(error.errors)[0]?.[0] : undefined
  return field || error.message || fallback
}
