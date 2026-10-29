import { Loader2 } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import type { BulkEmailResult, Guest } from '@/api/guestApi'
import { Button } from '@/components/ui/Button'

/**
 * Confirm a bulk invitation email, then show who received it, who failed and who was skipped.
 */
export function BulkEmailDialog({
  open,
  scopeLabel,
  guests,
  configured,
  pending,
  result,
  error,
  reminder = false,
  onSend,
  onOpenSettings,
  onClose,
}: {
  /** Sends the same invitation with a "Reminder:" subject. */
  reminder?: boolean
  open: boolean
  /** e.g. "Ministry of Finance" or "all guests" */
  scopeLabel: string
  guests: Guest[]
  configured: boolean
  pending: boolean
  result: BulkEmailResult | null
  error: string | null
  onSend: () => void
  onOpenSettings: () => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const withEmail = guests.filter((guest) => guest.email?.trim())
  const without = guests.length - withEmail.length
  const already = withEmail.filter((guest) => guest.invitationCount > 0).length

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(32rem,calc(100vw-2rem))]"
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault()
      }}
    >
      <div className="max-h-[min(40rem,calc(100vh-2rem))] overflow-y-auto p-5">
        <h2 id={titleId} className="text-base font-semibold">
          {result ? 'Email results' : reminder ? `Send a final reminder to ${scopeLabel}` : `Email invitations to ${scopeLabel}`}
        </h2>

        {!result ? (
          <>
            {!configured ? (
              <div className="mt-3 rounded-md border border-border bg-hover p-3 text-sm">
                <p className="font-medium">Outgoing email is not set up yet.</p>
                <p className="mt-1 text-muted">Add your SMTP server and sender address first, and send yourself a test.</p>
                <Button className="mt-3" variant="secondary" onClick={onOpenSettings}>
                  Open email settings
                </Button>
              </div>
            ) : (
              <ul className="mt-3 grid gap-1 text-sm">
                <li>
                  <span className="font-semibold tabular-nums">{withEmail.length}</span> {withEmail.length === 1 ? 'guest' : 'guests'} will be emailed
                  their own invitation.
                </li>
                {already > 0 ? (
                  <li className="text-muted">
                    {already} of them already received one; they get it again and it is recorded as a new invitation.
                  </li>
                ) : null}
                {without > 0 ? (
                  <li className="text-muted">
                    {without} {without === 1 ? 'guest has' : 'guests have'} no email address and will be skipped.
                  </li>
                ) : null}
                <li className="text-muted">Guests without a guest category, or whose category has no invitation design, are skipped and listed afterwards.</li>
              </ul>
            )}
          </>
        ) : (
          <div className="mt-3 grid gap-3 text-sm">
            <p className={result.complete ? 'font-medium' : 'font-medium text-danger'}>{result.message}</p>
            <ResultList title="Sent" items={result.sent.map((item) => `${item.name} · ${item.email}`)} />
            <ResultList title="Not delivered" danger items={result.failed.map((item) => `${item.name}: ${item.reason}`)} />
            <ResultList title="Skipped" items={result.skipped.map((item) => `${item.name}: ${item.reason}`)} />
          </div>
        )}

        {error ? (
          <p role="alert" className="mt-3 rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && configured ? (
            <Button onClick={onSend} disabled={pending || withEmail.length === 0}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {pending
                ? 'Sending…'
                : reminder
                  ? `Send ${withEmail.length === 1 ? 'reminder' : `${withEmail.length} reminders`}`
                  : `Send ${withEmail.length} ${withEmail.length === 1 ? 'email' : 'emails'}`}
            </Button>
          ) : null}
        </div>
      </div>
    </dialog>
  )
}

function ResultList({ title, items, danger }: { title: string; items: string[]; danger?: boolean }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className={danger ? 'font-medium text-danger' : 'font-medium'}>
        {title} ({items.length})
      </p>
      <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5 text-muted">
        {items.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
