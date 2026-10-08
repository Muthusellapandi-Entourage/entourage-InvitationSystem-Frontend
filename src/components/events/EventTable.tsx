import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { eventApi } from '@/api/eventApi'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
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
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <caption className="sr-only">Events</caption>
          <thead className="text-muted">
            <tr className="border-b border-border">
              <th scope="col" className="py-2.5 pr-4 font-medium">
                Event
              </th>
              <th scope="col" className="py-2.5 pr-4 font-medium">
                Date
              </th>
              <th scope="col" className="py-2.5 pr-4 font-medium">
                Status
              </th>
              <th scope="col" className="py-2.5 pr-4 font-medium">
                Created
              </th>
              <th scope="col" className="py-2.5 text-right font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const busy = statusMutation.isPending && statusMutation.variables?.id === event.id
              return (
                <tr key={event.id} className="border-b border-border transition-colors duration-150 hover:bg-hover">
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
                  <td className="py-2 text-right">
                    <Menu>
                      <MenuTrigger asChild>
                        <IconButton aria-label={`Actions for ${event.name}`} disabled={busy}>
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                        </IconButton>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem onSelect={() => navigate(`/events/${event.id}`)}>Open</MenuItem>
                        <MenuItem onSelect={() => navigate(`/events/${event.id}/settings`)}>Edit</MenuItem>
                        {event.status === 'Active' ? (
                          <MenuItem onSelect={() => statusMutation.mutate({ id: event.id, status: 'Archived' })}>
                            Deactivate
                          </MenuItem>
                        ) : (
                          <MenuItem onSelect={() => statusMutation.mutate({ id: event.id, status: 'Active' })}>
                            Activate
                          </MenuItem>
                        )}
                        <MenuSeparator />
                        <MenuItem
                          className="text-danger data-[highlighted]:bg-danger-soft"
                          onSelect={() => {
                            setDeleteError(null)
                            setPendingDelete(event)
                          }}
                        >
                          Delete
                        </MenuItem>
                      </MenuContent>
                    </Menu>
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
