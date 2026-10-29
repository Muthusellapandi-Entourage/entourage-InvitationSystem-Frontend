import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { AccDecisionResult, AccStage } from '@/api/accreditationApi'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

/** Shows capacity warnings / skipped notes after a decision. */
export function reportDecision(result: AccDecisionResult, verb: string) {
  if (result.updated > 0) toast.success(`${result.updated} ${verb}.`)
  for (const warning of result.warnings) toast.warning(warning, { duration: 8000 })
  if (result.updated === 0 && result.skipped.length) toast.message(result.skipped[0])
}

/** Asks for the rejection reason (saved in the audit log and emailed to the applicant). */
export function RejectDialog({
  target,
  pending,
  onClose,
  onConfirm,
}: {
  target: { ids: string[]; stage: AccStage } | null
  pending: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const [last, setLast] = useState(target)
  if (target !== last) {
    setLast(target)
    setReason('')
  }
  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      width="sm"
      title={`Move ${target?.ids.length ?? 0} to ${target?.stage.name ?? ''}`}
      description="The reason is saved in the history and sent in the rejection email."
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (reason.trim()) onConfirm(reason.trim())
        }}
      >
        <label className="grid gap-1.5">
          <span className="text-sm font-medium">Reason</span>
          <textarea
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="h-28 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!reason.trim() || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Reject
          </Button>
        </div>
      </form>
    </Modal>
  )
}
