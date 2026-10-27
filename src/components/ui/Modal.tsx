import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Simple modal built on <dialog>: title, close button, scrolling body. */
export function Modal({
  open,
  title,
  description,
  width = 'md',
  onClose,
  children,
}: {
  open: boolean
  title: string
  description?: string
  width?: 'sm' | 'md' | 'lg'
  onClose: () => void
  children: ReactNode
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
      className={cn(
        width === 'sm' && 'w-[min(26rem,calc(100vw-2rem))]',
        width === 'md' && 'w-[min(34rem,calc(100vw-2rem))]',
        width === 'lg' && 'w-[min(52rem,calc(100vw-2rem))]',
      )}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="max-h-[min(46rem,calc(100vh-2rem))] overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        {open ? <div className="mt-4">{children}</div> : null}
      </div>
    </dialog>
  )
}
