import { useEffect, useId, useRef } from 'react'
import { Button } from '@/components/ui/Button'

/** Modal progress bar for long bulk jobs (downloads, emails). */
export function ProgressDialog({
  open,
  title,
  done,
  total,
  detail,
  onCancel,
}: {
  open: boolean
  title: string
  done: number
  total: number
  detail?: string
  onCancel?: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(26rem,calc(100vw-2rem))]"
      onCancel={(event) => {
        event.preventDefault()
        onCancel?.()
      }}
    >
      <div className="p-5">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-hover"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${total > 0 ? percent : 15}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted tabular-nums">
          {total > 0 ? `${done} of ${total} · ${percent}%` : 'Preparing…'}
          {detail ? ` · ${detail}` : ''}
        </p>
        {onCancel ? (
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        ) : null}
      </div>
    </dialog>
  )
}
