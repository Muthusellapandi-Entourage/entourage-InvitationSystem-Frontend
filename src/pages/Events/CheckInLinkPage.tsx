import { Copy, ExternalLink } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'

/** Check-in tab: the EventPass scanner address for door staff, to open or share. */
export function CheckInLinkPage() {
  const { eventId = '' } = useParams()
  const url = `${window.location.origin}/scan/${eventId}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Scanner link copied.')
    } catch {
      toast.error('The link could not be copied. Select it and copy it by hand.')
    }
  }

  return (
    <section className="max-w-2xl">
      <h2 className="text-base font-semibold">Scanner link</h2>
      <p className="mt-1 text-sm text-muted">Open this on the phones, tablets or desk computers at the entrance. Staff sign in with their usual account.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          readOnly
          aria-label="Scanner link"
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="h-10 min-w-0 flex-1 basis-72 rounded-md border border-border bg-background px-3 font-mono text-sm text-accent"
        />
        <Button variant="secondary" onClick={() => void copy()}>
          <Copy className="size-4" aria-hidden="true" />
          Copy
        </Button>
        <Button onClick={() => window.open(url, '_blank', 'noopener')}>
          <ExternalLink className="size-4" aria-hidden="true" />
          Open in new tab
        </Button>
      </div>
    </section>
  )
}
