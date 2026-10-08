import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { invitationApi } from '@/api/invitationApi'
import { InvitationDesigner, type AssetSlot } from '@/components/invitations/InvitationDesigner'
import { buttonClassName } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import type { InvitationDesign } from '@/invitations/design'
import { normalizeInvitationDesign } from '@/invitations/design'

const assetKey = {
  header: 'headerAssetId',
  details: 'detailsAssetId',
  accept: 'acceptAssetId',
  decline: 'declineAssetId',
} as const

export function InvitationPage() {
  const { eventId = '' } = useParams()
  const eventQuery = useEvent(eventId)
  const event = eventQuery.data
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<InvitationDesign | null>(null)
  const [uploading, setUploading] = useState<AssetSlot | null>(null)
  useDocumentTitle(event ? `${event.name} invitation` : 'Create invitation')

  const templateQuery = useQuery({
    queryKey: ['invitation-template', eventId],
    queryFn: () => invitationApi.getTemplate(eventId),
    enabled: Boolean(eventId),
  })

  const responsesQuery = useQuery({
    queryKey: ['invitation-responses', eventId],
    queryFn: () => invitationApi.responses(eventId),
    enabled: Boolean(eventId),
  })

  const saveMutation = useMutation({
    mutationFn: (design: InvitationDesign) => invitationApi.saveTemplate(eventId, design),
    onSuccess: async (saved) => {
      setDraft(normalizeInvitationDesign(saved.design))
      toast.success('Invitation template saved.')
      await queryClient.invalidateQueries({ queryKey: ['invitation-template', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['public-invitation'] })
    },
    onError: (error) => {
      toast.error(messageFrom(error, 'The template could not be saved.'))
    },
  })

  if (eventQuery.isLoading || templateQuery.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted" aria-live="polite">
        Loading invitation
      </div>
    )
  }

  if (eventQuery.isError || !event || templateQuery.isError || !templateQuery.data) {
    const missing = eventQuery.error instanceof ApiError && eventQuery.error.status === 404
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6">
        <EmptyState
          title={missing ? 'Event not found' : 'Invitation could not be loaded'}
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

  const design = draft ?? normalizeInvitationDesign(templateQuery.data.design)

  async function upload(slot: AssetSlot, file: File) {
    setUploading(slot)
    try {
      const asset = await invitationApi.uploadAsset(eventId, file)
      setDraft({ ...design, [assetKey[slot]]: asset.id })
    } catch (error) {
      toast.error(messageFrom(error, 'The image could not be uploaded.'))
    } finally {
      setUploading(null)
    }
  }

  return (
    <InvitationDesigner
      eventId={event.id}
      eventName={event.name}
      slug={event.slug}
      published={event.status === 'Active'}
      design={design}
      onChange={setDraft}
      uploading={uploading}
      onUpload={(slot, file) => void upload(slot, file)}
      saving={saveMutation.isPending}
      onSave={() => saveMutation.mutate(design)}
      replies={responsesQuery.data}
      repliesLoading={responsesQuery.isLoading}
    />
  )
}

function messageFrom(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback
  const field = error.errors ? Object.values(error.errors)[0]?.[0] : undefined
  return field || error.message || fallback
}
