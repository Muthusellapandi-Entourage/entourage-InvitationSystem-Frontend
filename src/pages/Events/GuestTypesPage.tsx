import { ChevronDown, ChevronUp, Copy, GripVertical, MoreHorizontal, Pencil, Plus, Trash2, Ban } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { guestTypeApi, type GuestType } from '@/api/guestTypeApi'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { SelectField } from '@/components/ui/SelectField'
import { TextField } from '@/components/ui/TextField'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { cn } from '@/lib/cn'
import { usePageBreadcrumbs } from '@/stores/breadcrumbStore'

export function GuestTypesPage() {
  const { eventId = '' } = useParams()
  const eventQuery = useEvent(eventId)
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<GuestType | null>(null)
  const [editName, setEditName] = useState('')
  const [duplicate, setDuplicate] = useState<GuestType | null>(null)
  const [category, setCategory] = useState<'invitation' | 'badge'>('invitation')
  const [destinationId, setDestinationId] = useState('')
  const [replace, setReplace] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<GuestType | null>(null)
  useDocumentTitle(eventQuery.data ? `${eventQuery.data.name} guest types` : 'Guest types')
  usePageBreadcrumbs([
    { label: 'Dashboard', to: '/' },
    { label: 'Events', to: '/events' },
    { label: eventQuery.data?.name ?? 'Event', to: `/events/${eventId}` },
    { label: 'Guest types' },
  ])

  const typesQuery = useQuery({
    queryKey: ['guest-types', eventId],
    queryFn: () => guestTypeApi.list(eventId),
    enabled: Boolean(eventId),
  })

  function refresh() {
    return queryClient.invalidateQueries({ queryKey: ['guest-types', eventId] })
  }

  const createMutation = useMutation({
    mutationFn: () => guestTypeApi.create(eventId, name.trim()),
    onSuccess: async () => {
      setName('')
      toast.success('Guest type created.')
      await refresh()
    },
    onError: (error) => toast.error(messageFrom(error, 'The guest type could not be created.')),
  })

  const saveMutation = useMutation({
    mutationFn: () => guestTypeApi.update(eventId, editing!.id, { name: editName.trim(), isEnabled: editing!.isEnabled }),
    onSuccess: async () => {
      setEditing(null)
      toast.success('Guest type saved.')
      await refresh()
    },
    onError: (error) => toast.error(messageFrom(error, 'The guest type could not be saved.')),
  })

  const toggleMutation = useMutation({
    mutationFn: (type: GuestType) => guestTypeApi.update(eventId, type.id, { name: type.name, isEnabled: !type.isEnabled }),
    onSuccess: async (type) => {
      toast.success(type.isEnabled ? `${type.name} is enabled.` : `${type.name} is disabled. New assignments and sends are blocked.`)
      await refresh()
    },
    onError: (error) => toast.error(messageFrom(error, 'The guest type could not be updated.')),
  })

  const orderMutation = useMutation({
    mutationFn: (ids: string[]) => guestTypeApi.reorder(eventId, ids),
    onSuccess: async () => {
      await refresh()
    },
    onError: (error) => toast.error(messageFrom(error, 'The order could not be saved.')),
  })

  const duplicateMutation = useMutation({
    mutationFn: () =>
      guestTypeApi.duplicate(eventId, duplicate!.id, {
        category,
        destinationGuestTypeId: destinationId,
        replace,
      }),
    onSuccess: async () => {
      toast.success('Design copied. The source design was not changed.')
      setDuplicate(null)
      setReplace(false)
      await refresh()
    },
    onError: (error) => toast.error(messageFrom(error, 'The design could not be copied.')),
  })

  const deleteMutation = useMutation({
    mutationFn: (discardDesigns: boolean) => guestTypeApi.remove(eventId, pendingDelete!.id, discardDesigns),
    onSuccess: async () => {
      toast.success('Guest type deleted.')
      setPendingDelete(null)
      await refresh()
    },
    onError: (error) => toast.error(messageFrom(error, 'The guest type could not be deleted.')),
  })

  const types = typesQuery.data ?? []
  const destination = types.find((type) => type.id === destinationId)
  const destinationConfigured = destination
    ? category === 'invitation'
      ? destination.invitationConfigured
      : destination.badgeConfigured
    : false

  function move(type: GuestType, direction: -1 | 1) {
    const index = types.findIndex((item) => item.id === type.id)
    const next = index + direction
    if (index < 0 || next < 0 || next >= types.length) return
    const ids = types.map((item) => item.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(next, 0, moved)
    orderMutation.mutate(ids)
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">Guest types</h1>
          <p className="mt-2 text-sm text-muted">Manage guest groups and their designs.</p>
        </div>
      </div>

      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) createMutation.mutate()
        }}
      >
        <div className="w-full sm:max-w-xs">
          <TextField label="New guest type" value={name} onChange={(event) => setName(event.target.value)} placeholder="VIP" />
        </div>
        <Button type="submit" className="h-10" disabled={!name.trim() || createMutation.isPending}>
          <Plus className="size-4" aria-hidden="true" />
          {createMutation.isPending ? 'Creating…' : 'Create guest type'}
        </Button>
      </form>

      <div className="mt-8">
        {typesQuery.isLoading ? (
          <p className="text-sm text-muted">Loading guest types</p>
        ) : typesQuery.isError ? (
          <EmptyState title="Guest types could not be loaded" description="Try again in a moment." />
        ) : types.length === 0 ? (
          <EmptyState
            title="No guest types yet"
            description="Create a type such as VIP or Media, then design its invitation and badge."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-surface text-muted">
                <tr>
                  <th className="w-10 py-3" />
                  <th className="py-3 pr-3 font-medium">Guest type</th>
                  <th className="py-3 pr-3 text-center font-medium">Guests</th>
                  <th className="py-3 pr-3 text-center font-medium">Invitation</th>
                  <th className="py-3 pr-3 text-center font-medium">Badge</th>
                  <th className="py-3 pr-3 text-center font-medium">Status</th>
                  <th className="w-12 py-3" />
                </tr>
              </thead>
              <tbody>
                {types.map((type, index) => (
                  <tr key={type.id} className="border-t border-border">
                    <td className="py-3 pl-3 text-muted">
                      <GripVertical className="size-4" aria-hidden="true" />
                    </td>
                    <td className="py-3 pr-3 font-medium">{type.name}</td>
                    <td className="py-3 pr-3 text-center tabular-nums">{type.guestCount}</td>
                    <td className="py-3 pr-3">
                      <DesignStatus
                        configured={type.invitationConfigured}
                        to={`/events/${eventId}/guest-types/${type.id}/invitation`}
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <DesignStatus configured={type.badgeConfigured} to={`/events/${eventId}/guest-types/${type.id}/badge`} />
                    </td>
                    <td className="py-3 pr-3 text-center">
                      <span
                        className={cn(
                          'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium',
                          type.isEnabled ? 'bg-accent-soft text-accent' : 'bg-selected text-muted',
                        )}
                      >
                        {type.isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 pr-2 text-right">
                      <Menu>
                        <MenuTrigger
                          aria-label={`Actions for ${type.name}`}
                          className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground"
                        >
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem
                            onSelect={() => {
                              setEditing(type)
                              setEditName(type.name)
                            }}
                          >
                            <Pencil className="mr-2 size-4" aria-hidden="true" />
                            Edit guest type
                          </MenuItem>
                          <MenuItem
                            onSelect={() => {
                              setDuplicate(type)
                              setDestinationId(types.find((item) => item.id !== type.id)?.id ?? '')
                              setReplace(false)
                            }}
                          >
                            <Copy className="mr-2 size-4" aria-hidden="true" />
                            Duplicate design
                          </MenuItem>
                          <MenuItem disabled={index === 0 || orderMutation.isPending} onSelect={() => move(type, -1)}>
                            <ChevronUp className="mr-2 size-4" aria-hidden="true" />
                            Move up
                          </MenuItem>
                          <MenuItem disabled={index === types.length - 1 || orderMutation.isPending} onSelect={() => move(type, 1)}>
                            <ChevronDown className="mr-2 size-4" aria-hidden="true" />
                            Move down
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem onSelect={() => toggleMutation.mutate(type)}>
                            <Ban className="mr-2 size-4" aria-hidden="true" />
                            {type.isEnabled ? 'Disable' : 'Enable'}
                          </MenuItem>
                          <MenuItem className="text-danger data-[highlighted]:text-danger" onSelect={() => setPendingDelete(type)}>
                            <Trash2 className="mr-2 size-4" aria-hidden="true" />
                            Delete
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing ? (
        <form
          className="mt-6 max-w-md rounded-md border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault()
            saveMutation.mutate()
          }}
        >
          <h2 className="text-sm font-medium">Edit {editing.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {editing.isEnabled
              ? 'Enabled types can receive new guests.'
              : 'Disabled types cannot receive new guests, invitations, or badges. Existing records stay.'}
          </p>
          <div className="mt-3">
            <TextField label="Name" value={editName} onChange={(event) => setEditName(event.target.value)} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="submit" disabled={!editName.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save name'}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {duplicate ? (
        <form
          className="mt-6 max-w-lg rounded-md border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!destinationId) return
            duplicateMutation.mutate()
          }}
        >
          <h2 className="text-sm font-medium">Duplicate a design</h2>
          <p className="mt-1 text-sm text-muted">
            Copy from {duplicate.name} into another type. The source stays unchanged, and the other design category is not copied.
          </p>
          <div className="mt-3 grid gap-3">
            <SelectField
              label="Design"
              value={category}
              options={[
                { value: 'invitation', label: 'Invitation' },
                { value: 'badge', label: 'Badge' },
              ]}
              onChange={(event) => {
                setCategory(event.target.value as 'invitation' | 'badge')
                setReplace(false)
              }}
            />
            <SelectField
              label="Destination guest type"
              value={destinationId}
              options={[
                { value: '', label: 'Choose a type' },
                ...types
                  .filter((type) => type.id !== duplicate.id)
                  .map((type) => ({ value: type.id, label: type.name })),
              ]}
              onChange={(event) => {
                setDestinationId(event.target.value)
                setReplace(false)
              }}
            />
            {destinationConfigured ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={replace} onChange={(event) => setReplace(event.target.checked)} />
                <span>Replace the existing {category} design on {destination?.name}. This does not change {duplicate.name}.</span>
              </label>
            ) : null}
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="submit" disabled={!destinationId || (destinationConfigured && !replace) || duplicateMutation.isPending}>
              {duplicateMutation.isPending ? 'Copying…' : 'Copy design'}
            </Button>
            <Button variant="secondary" onClick={() => setDuplicate(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : 'Delete guest type?'}
        description={
          pendingDelete && pendingDelete.guestCount > 0
            ? `Reassign the ${pendingDelete.guestCount} guests on ${pendingDelete.name} before deleting it.`
            : pendingDelete && (pendingDelete.invitationConfigured || pendingDelete.badgeConfigured)
              ? `${pendingDelete.name} has a saved design. Deleting it removes that invitation and badge design. Previously issued invitations stay in guest history.`
              : 'This removes the guest type. It does not change other events.'
        }
        confirmLabel="Delete guest type"
        pendingLabel="Deleting…"
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (!pendingDelete) return
          if (pendingDelete.guestCount > 0) {
            toast.error(`Reassign the ${pendingDelete.guestCount} guests on ${pendingDelete.name} before deleting it.`)
            return
          }
          const discard = pendingDelete.invitationConfigured || pendingDelete.badgeConfigured
          deleteMutation.mutate(discard)
        }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}

function DesignStatus({ configured, to }: { configured: boolean; to: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="inline-flex items-center gap-2">
        <span className={cn('size-2 rounded-full', configured ? 'bg-accent' : 'bg-muted')} aria-hidden="true" />
        {configured ? 'Configured' : 'Missing'}
      </span>
      <Link to={to} className="text-accent hover:underline">
        Edit design
      </Link>
    </div>
  )
}

function messageFrom(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback
  const field = error.errors ? Object.values(error.errors)[0]?.[0] : undefined
  return field || error.message || fallback
}
