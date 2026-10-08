import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { eventApi } from '@/api/eventApi'
import { EventForm } from '@/components/events/EventForm'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { usePageBreadcrumbs } from '@/stores/breadcrumbStore'
import type { EventInput } from '@/types/event'

export function EventSettingsPage() {
  const { eventId = '' } = useParams()
  const query = useEvent(eventId)
  const event = query.data
  const queryClient = useQueryClient()
  useDocumentTitle(event ? `${event.name} settings` : 'Event settings')
  usePageBreadcrumbs([
    { label: 'Dashboard', to: '/' },
    { label: 'Events', to: '/events' },
    { label: event?.name ?? 'Event', to: event ? `/events/${event.id}` : undefined },
    { label: 'Settings' },
  ])

  const mutation = useMutation({
    mutationFn: (input: EventInput) => eventApi.update(eventId, input),
    onSuccess: async () => {
      toast.success('Event updated successfully.')
      await queryClient.invalidateQueries({ queryKey: ['events'] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.errors) return
      toast.error(error instanceof ApiError ? error.message : 'Failed to update event.')
    },
  })

  if (!event) return null

  return (
    <div className="max-w-3xl">
      <section>
        <h2 className="text-base font-semibold">Event information</h2>
        <p className="mb-6 mt-1 text-sm text-muted">Update the details used across this event.</p>
        <EventForm
          key={event.updatedOn}
          mode="edit"
          event={event}
          cancelTo={`/events/${event.id}`}
          submitting={mutation.isPending}
          onSubmit={async (input) => {
          await mutation.mutateAsync(input)
        }}
        />
      </section>
      <section className="mt-12 border-t border-border pt-8">
        <h2 className="text-base font-semibold">Authentication / Security</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Who can sign in to the platform is managed in{' '}
          <Link to="/settings" className="text-foreground underline underline-offset-4">
            Settings
          </Link>
          .
        </p>
      </section>
      <section className="mt-8 border-t border-border pt-8">
        <h2 className="text-base font-semibold">Appearance</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Theme follows your account preference in{' '}
          <Link to="/settings#appearance" className="text-foreground underline underline-offset-4">
            Settings
          </Link>
          .
        </p>
      </section>
    </div>
  )
}
