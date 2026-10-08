import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { eventApi } from '@/api/eventApi'
import { EventForm } from '@/components/events/EventForm'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePageBreadcrumbs } from '@/stores/breadcrumbStore'
import type { EventInput } from '@/types/event'

export function CreateEventPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  useDocumentTitle('Create event')
  usePageBreadcrumbs([
    { label: 'Dashboard', to: '/' },
    { label: 'Events', to: '/events' },
    { label: 'Create event' },
  ])

  const mutation = useMutation({
    mutationFn: (input: EventInput) => eventApi.create(input),
    onSuccess: async (event) => {
      toast.success('Event created successfully.')
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      navigate(`/events/${event.id}`)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.errors) return
      toast.error(error instanceof ApiError ? error.message : 'Failed to create event.')
    },
  })

  return (
    <div>
      <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">Create event</h1>
      <p className="mb-8 mt-2 text-sm text-muted">Add the details for a new event.</p>
      <EventForm
        mode="create"
        cancelTo="/events"
        submitting={mutation.isPending}
        onSubmit={async (input) => {
          await mutation.mutateAsync(input)
        }}
      />
    </div>
  )
}
