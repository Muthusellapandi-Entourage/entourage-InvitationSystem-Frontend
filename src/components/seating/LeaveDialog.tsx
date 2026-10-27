import { Loader2 } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { Button } from '@/components/ui/Button'

/** "Save your layout?" prompt shown when leaving the seating plan with unsaved changes. */
export function LeaveDialog({
  open,
  saving,
  error,
  onSave,
  onDiscard,
  onStay,
}: {
  open: boolean
  saving: boolean
  error: string | null
  onSave: () => void
  onDiscard: () => void
  onStay: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(28rem,calc(100vw-2rem))]"
      onCancel={(event) => {
        // Esc means "stay", never "discard".
        event.preventDefault()
        if (!saving) onStay()
      }}
    >
      <div className="p-5">
        <h2 id={titleId} className="text-base font-semibold">
          Save your seating layout?
        </h2>
        <p className="mt-2 text-sm text-muted">
          You have changes that are not saved yet. Save them before you leave, or they will be lost.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={saving} onClick={onStay}>
            Stay
          </Button>
          <Button variant="secondary" disabled={saving} onClick={onDiscard}>
            Leave without saving
          </Button>
          <Button disabled={saving} onClick={onSave} autoFocus>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {saving ? 'Saving…' : 'Save and leave'}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
