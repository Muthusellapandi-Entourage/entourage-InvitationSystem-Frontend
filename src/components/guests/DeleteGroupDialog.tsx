import { Loader2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { GuestGroup } from '@/api/guestGroupApi'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

/** Delete a group, choosing what happens to its guests: keep them ungrouped, or delete them too. */
export function DeleteGroupDialog({
  group,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  group: GuestGroup | null
  pending: boolean
  error: string | null
  onConfirm: (deleteGuests: boolean) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [deleteGuests, setDeleteGuests] = useState(false)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (group && !dialog.open) {
      setDeleteGuests(false)
      setTyped('')
      dialog.showModal()
    }
    if (!group && dialog.open) dialog.close()
  }, [group])

  const count = group?.guestCount ?? 0
  // Deleting guests cannot be undone, so it needs the group name typed in.
  const confirmed = !deleteGuests || typed.trim().toLowerCase() === (group?.name ?? '').trim().toLowerCase()

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(30rem,calc(100vw-2rem))]"
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault()
      }}
    >
      <div className="p-5">
        <h2 id={titleId} className="text-base font-semibold">
          Delete “{group?.name}”?
        </h2>
        {count === 0 ? (
          <p className="mt-2 text-sm text-muted">This group has no guests. Only the group is removed.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              This group has {count} {count === 1 ? 'guest' : 'guests'}. What should happen to them?
            </p>
            <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Guests in this group">
              <Choice
                checked={!deleteGuests}
                title="Keep the guests"
                description="They stay on the event with their invitations, badges and seats, just without a group."
                onSelect={() => setDeleteGuests(false)}
              />
              <Choice
                checked={deleteGuests}
                danger
                title={`Delete the ${count} ${count === 1 ? 'guest' : 'guests'} too`}
                description="Removes them from the event with their invitation and badge history, and frees their seats. This cannot be undone."
                onSelect={() => setDeleteGuests(true)}
              />
            </div>
            {deleteGuests ? (
              <label className="mt-3 block text-sm">
                <span className="mb-1.5 block font-medium">Type the group name to confirm</span>
                <input
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  placeholder={group?.name}
                  className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-danger"
                />
              </label>
            ) : null}
          </>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending} autoFocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => onConfirm(deleteGuests)} disabled={pending || !confirmed}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {pending ? 'Deleting…' : deleteGuests ? 'Delete group and guests' : 'Delete group'}
          </Button>
        </div>
      </div>
    </dialog>
  )
}

function Choice({
  checked,
  danger,
  title,
  description,
  onSelect,
}: {
  checked: boolean
  danger?: boolean
  title: string
  description: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className={cn(
        'flex items-start gap-3 rounded-md border p-3 text-left text-sm',
        checked ? (danger ? 'border-danger bg-danger-soft' : 'border-accent bg-accent-soft') : 'border-border hover:bg-hover',
      )}
      onClick={onSelect}
    >
      <span
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
          checked ? (danger ? 'border-danger' : 'border-accent') : 'border-border',
        )}
        aria-hidden="true"
      >
        {checked ? <span className={cn('size-2 rounded-full', danger ? 'bg-danger' : 'bg-accent')} /> : null}
      </span>
      <span>
        <span className={cn('block font-medium', checked && danger && 'text-danger')}>{title}</span>
        <span className="block text-muted">{description}</span>
      </span>
    </button>
  )
}
