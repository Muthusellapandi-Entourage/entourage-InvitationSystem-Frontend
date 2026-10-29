import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { eventApi } from '@/api/eventApi'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { EventItem, EventStatus } from '@/types/event'
import { formatTableDate } from '@/utils/dates'

function failureMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export function EventTable({ events, loading }: { events: EventItem[]; loading?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pendingDelete, setPendingDelete] = useState<EventItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['events'] })
  }

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EventStatus }) => eventApi.updateStatus(id, status),
    onSuccess: async () => {
      toast.success('Event updated successfully.')
      await invalidate()
    },
    onError: (error) => toast.error(failureMessage(error, 'Failed to update event.')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => eventApi.remove(id),
    onSuccess: async () => {
      toast.success('Event deleted successfully.')
      setPendingDelete(null)
      setDeleteError(null)
      await invalidate()
    },
    onError: (error) => setDeleteError(failureMessage(error, 'Failed to delete event.')),
  })

  if (loading) {
    return (
      <div className="space-y-3 py-2" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm">
          <caption className="sr-only">Events</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-3 pr-4">
                Event
              </th>
              <th scope="col" className="py-3 pr-4">
                Date
              </th>
              <th scope="col" className="py-3 pr-4">
                Status
              </th>
              <th scope="col" className="py-3 pr-4">
                Created
              </th>
              <th scope="col" className="w-[380px] py-3 text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((event) => {
              const busy = statusMutation.isPending && statusMutation.variables?.id === event.id
              return (
                <tr key={event.id} className="transition-colors duration-150 hover:bg-hover">
                  <th scope="row" className="py-3 pr-4 text-left font-medium">
                    <Link to={`/events/${event.id}`} className="hover:underline">
                      {event.name}
                    </Link>
                  </th>
                  <td className="py-3 pr-4 tabular-nums text-muted">{formatTableDate(event.startDate)}</td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={event.status} />
                  </td>
                  <td className="py-3 pr-4 tabular-nums text-muted">{formatTableDate(event.createdOn)}</td>
                  <td className="py-2.5 pl-4 text-right">
                    <div className="flex flex-nowrap items-center justify-end gap-2">
                      <Button variant="secondary" className="h-9 px-3" onClick={() => navigate(`/events/${event.id}`)}>
                        Open
                      </Button>
                      <Button variant="secondary" className="h-9 px-3" onClick={() => navigate(`/events/${event.id}/settings`)}>
                        Edit
                      </Button>
                      {event.status === 'Active' ? (
                        <Button
                          variant="secondary"
                          className="h-9 px-3"
                          disabled={busy}
                          onClick={() => statusMutation.mutate({ id: event.id, status: 'Archived' })}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          className="h-9 px-3"
                          disabled={busy}
                          onClick={() => statusMutation.mutate({ id: event.id, status: 'Active' })}
                        >
                          Activate
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        className="h-9 px-3"
                        disabled={busy}
                        onClick={() => {
                          setDeleteError(null)
                          setPendingDelete(event)
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this event?"
        description={
          pendingDelete
            ? `${pendingDelete.name} will be removed. This cannot be undone.`
            : 'This event will be removed. This cannot be undone.'
        }
        confirmLabel="Delete"
        pendingLabel="Deleting..."
        pending={deleteMutation.isPending}
        error={deleteError}
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id)
        }}
        onClose={() => {
          if (deleteMutation.isPending) return
          setPendingDelete(null)
          setDeleteError(null)
        }}
      />
    </>
  )
}
