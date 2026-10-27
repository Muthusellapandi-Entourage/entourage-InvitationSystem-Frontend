import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { micrositeApi } from '@/api/micrositeApi'
import { MicrositeDesigner } from '@/components/microsite/MicrositeDesigner'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { normalizeDesign, type MicrositeDesign } from '@/microsite/design'

/** Full-screen microsite designer for one event. */
export function MicrositePage() {
  const { eventId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const event = useEvent(eventId).data
  useDocumentTitle(event ? `Microsite · ${event.name}` : 'Microsite')
  const query = useQuery({ queryKey: ['microsite', eventId], queryFn: () => micrositeApi.get(eventId), enabled: Boolean(eventId) })

  const save = useMutation({
    mutationFn: (input: { design: MicrositeDesign; published: boolean; publicEnabled: boolean }) =>
      micrositeApi.save(eventId, input.design, input.published, input.publicEnabled),
    onSuccess: (saved) => {
      queryClient.setQueryData(['microsite', eventId], saved)
      toast.success('Microsite saved.')
    },
    onError: (error) => {
      const field = error instanceof ApiError && error.errors ? Object.values(error.errors)[0]?.[0] : undefined
      toast.error(field ?? (error instanceof ApiError ? error.message : 'The microsite could not be saved.'))
    },
  })

  if (query.isLoading || !event) {
    return <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted">Loading microsite…</div>
  }
  if (query.isError || !query.data) {
    return <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-danger">The microsite could not be loaded.</div>
  }

  return (
    <MicrositeDesigner
      key={eventId}
      eventId={eventId}
      eventName={event.name}
      initial={normalizeDesign(query.data.design)}
      initialPublished={query.data.isPublished}
      initialPublic={query.data.publicEnabled}
      publicUrl={query.data.publicUrl}
      saving={save.isPending}
      onSave={async (design, published, publicEnabled) => {
        try {
          await save.mutateAsync({ design, published, publicEnabled })
          return true
        } catch {
          return false
        }
      }}
      onBack={(dirty) => {
        if (dirty && !window.confirm('The microsite has unsaved changes. Leave without saving?')) return
        navigate(`/events/${eventId}`)
      }}
    />
  )
}
