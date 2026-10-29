import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Scissors } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { guestTypeApi } from '@/api/guestTypeApi'
import { invitationApi } from '@/api/invitationApi'
import { InvitationDesigner, type AssetSlot } from '@/components/invitations/InvitationDesigner'
import { SliceDesigner } from '@/components/invitations/SliceDesigner'
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
  const { eventId = '', guestTypeId } = useParams()
  const navigate = useNavigate()
  const eventQuery = useEvent(eventId)
  const event = eventQuery.data
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<InvitationDesign | null>(null)
  const [uploading, setUploading] = useState<AssetSlot | null>(null)
  const typeQuery = useQuery({
    queryKey: ['guest-types', eventId],
    queryFn: () => guestTypeApi.list(eventId),
    enabled: Boolean(eventId),
  })
  const guestType = typeQuery.data?.find((type) => type.id === guestTypeId)
  useDocumentTitle(event ? `${event.name} invitation` : 'Create invitation')

  const templateQuery = useQuery({
    queryKey: guestTypeId ? ['guest-type-invitation', eventId, guestTypeId] : ['invitation-template', eventId],
    queryFn: () =>
      guestTypeId ? guestTypeApi.getInvitation(eventId, guestTypeId) : invitationApi.getTemplate(eventId),
    enabled: Boolean(eventId) && (!guestTypeId || Boolean(guestType)),
  })

  const responsesQuery = useQuery({
    queryKey: ['invitation-responses', eventId],
    queryFn: () => invitationApi.responses(eventId),
    enabled: Boolean(eventId) && !guestTypeId,
  })

  const [mode, setMode] = useState<'slices' | 'classic' | null>(null)

  useEffect(() => {
    setDraft(null)
    setMode(null)
  }, [eventId, guestTypeId])

  const serverDesign = templateQuery.data ? normalizeInvitationDesign(templateQuery.data.design) : null
  const dirty = draft !== null && serverDesign !== null && JSON.stringify(normalizeInvitationDesign(draft)) !== JSON.stringify(serverDesign)
  useEffect(() => {
    if (!dirty) return
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty])

  const saveMutation = useMutation({
    mutationFn: (design: InvitationDesign) =>
      guestTypeId ? guestTypeApi.saveInvitation(eventId, guestTypeId, design) : invitationApi.saveTemplate(eventId, design),
    onSuccess: async (saved) => {
      setDraft(normalizeInvitationDesign(saved.design))
      toast.success(guestTypeId ? 'Invitation design saved for this guest type.' : 'Invitation template saved.')
      await queryClient.invalidateQueries({ queryKey: guestTypeId ? ['guest-type-invitation', eventId, guestTypeId] : ['invitation-template', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['guest-types', eventId] })
      if (!guestTypeId) await queryClient.invalidateQueries({ queryKey: ['public-invitation'] })
    },
    onError: (error) => {
      toast.error(messageFrom(error, 'The template could not be saved.'))
    },
  })

  if (eventQuery.isLoading || templateQuery.isLoading || (guestTypeId && typeQuery.isLoading)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted" aria-live="polite">
        Loading invitation
      </div>
    )
  }

  if (eventQuery.isError || !event || templateQuery.isError || !templateQuery.data || (guestTypeId && !guestType)) {
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

  // Single-image design is the default; the classic designer stays one click away.
  const sliceMode = Boolean(guestTypeId) && mode !== 'classic'
  const backTo = `/events/${event.id}/guest-types`

  if (sliceMode) {
    return (
      <SliceDesigner
        key={guestTypeId}
        eventId={event.id}
        title={`${guestType?.name ?? 'Guest type'} · ${event.name}`}
        design={design}
        saving={saveMutation.isPending}
        onSave={(next) => {
          setDraft(next)
          saveMutation.mutate(next)
        }}
        onBack={() => {
          if (dirty && !window.confirm('This design has unsaved changes. Leave without saving?')) return
          navigate(backTo)
        }}
        backLabel="Guest types"
        onUseClassic={() => {
          if (
            design.slices &&
            !window.confirm('Switch to the classic designer? Saving there replaces the single-image design for this guest type.')
          )
            return
          setMode('classic')
        }}
      />
    )
  }

  return (
    <>
    {guestTypeId ? (
      <button
        type="button"
        onClick={() => setMode('slices')}
        className="fixed bottom-5 left-1/2 z-50 inline-flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-hover"
      >
        <Scissors className="size-4 text-accent" aria-hidden="true" />
        Use single-image design
      </button>
    ) : null}
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
      onSave={() => saveMutation.mutate({ ...design, slices: null })}
      replies={guestTypeId ? [] : responsesQuery.data}
      repliesLoading={guestTypeId ? false : responsesQuery.isLoading}
      backTo={guestTypeId ? `/events/${event.id}/guest-types` : undefined}
      backLabel={guestTypeId ? 'Guest types' : undefined}
      context="Design: HTML invitation"
      guestTypes={typeQuery.data?.map((type) => ({ id: type.id, name: type.name }))}
      guestTypeId={guestTypeId}
      onGuestTypeChange={(nextId) => {
        if (nextId === (guestTypeId ?? '')) return
        if (dirty && !window.confirm('This design has unsaved changes. Load another guest type without saving?')) return
        navigate(nextId ? `/events/${event.id}/guest-types/${nextId}/invitation` : `/events/${event.id}/invitations`)
      }}
    />
    </>
  )
}

function messageFrom(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback
  const field = error.errors ? Object.values(error.errors)[0]?.[0] : undefined
  return field || error.message || fallback
}
