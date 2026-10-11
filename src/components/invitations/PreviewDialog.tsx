import { useId, useState } from 'react'
import { Button, buttonClassName } from '@/components/ui/Button'

export type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; url: string; html: string; expiresOn: string }
  | { status: 'error'; message: string }

export function PreviewDialog({ preview, onClose }: { preview: PreviewState; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const titleId = useId()
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="grid w-full max-w-lg gap-4 rounded-md border border-border bg-surface p-5 text-foreground"
        style={{ boxShadow: 'var(--shadow)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold">
          Guest preview
        </h2>
        {preview.status === 'loading' ? <p className="text-sm text-muted">Creating a preview link…</p> : null}
        {preview.status === 'error' ? <p className="text-sm text-danger">{preview.message}</p> : null}
        {preview.status === 'ready' ? (
          <>
            <p className="text-sm text-muted">
              This link opens the invitation exactly as the email renders it. It stops working at{' '}
              {new Date(preview.expiresOn).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
            </p>
            <input readOnly value={preview.url} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" />
            <div className="flex flex-wrap gap-2">
              <a href={preview.url} target="_blank" rel="noreferrer" className={buttonClassName()}>
                Open preview
              </a>
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(preview.url).then(() => setCopied(true))
                }}
              >
                {copied ? 'Copied' : 'Copy URL'}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-muted">View HTML</summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-background p-3 text-xs">{preview.html}</pre>
            </details>
          </>
        ) : (
          <div>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
