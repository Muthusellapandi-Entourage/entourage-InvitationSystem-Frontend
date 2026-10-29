import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, Link2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { frontDeskApi, frontDeskUrl } from '@/api/frontDeskApi'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

/** Create, copy, replace or turn off the front-desk dashboard link (no sign-in for ushers). */
export function FrontDeskLinkDialog({ eventId, live, open, onClose }: { eventId: string; live: boolean; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['front-desk-share', eventId], queryFn: () => frontDeskApi.getShare(eventId), enabled: open })
  const token = query.data?.token ?? null
  const url = token ? frontDeskUrl(token) : null

  const done = (next: { token: string | null }) => queryClient.setQueryData(['front-desk-share', eventId], next)
  const failed = (error: unknown) => toast.error(error instanceof ApiError ? error.message : 'The front desk screen link could not be changed.')
  const renew = useMutation({ mutationFn: () => frontDeskApi.renewShare(eventId), onSuccess: done, onError: failed })
  const disable = useMutation({ mutationFn: () => frontDeskApi.disableShare(eventId), onSuccess: done, onError: failed })

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Front desk screen link copied.')
    } catch {
      toast.error('The link could not be copied. Select it and copy it by hand.')
    }
  }

  return (
    <Modal
      open={open}
      width="lg"
      title="Front desk screen"
      description="Share with ushers and the front desk. They see the guest list with RSVP, seat and check-in details, and can check guests in or mark them seated — no sign-in needed."
      onClose={onClose}
    >
      {!live ? (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm">
          The event is not Live yet. Staff can open the list, but checking in only works once the event is Live.
        </p>
      ) : null}
      {query.isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : url ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              aria-label="Front desk screen link"
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              className="h-10 min-w-0 flex-1 basis-72 rounded-md border border-border bg-background px-3 font-mono text-sm text-accent"
            />
            <Button variant="secondary" onClick={() => void copy()}>
              <Copy className="size-4" aria-hidden="true" />
              Copy
            </Button>
            <Button variant="secondary" onClick={() => window.open(url, '_blank', 'noopener')}>
              <ExternalLink className="size-4" aria-hidden="true" />
              Open
            </Button>
          </div>
          <p className="text-xs text-muted">Anyone with this link can see guest names and emails and check guests in. Share it only with your event team.</p>
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              variant="ghost"
              className="h-9 text-sm"
              disabled={renew.isPending}
              onClick={() => {
                if (window.confirm('Make a new link? The current link stops working for everyone who has it.')) renew.mutate()
              }}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              New link
            </Button>
            <Button
              variant="ghost"
              className="h-9 text-sm text-danger"
              disabled={disable.isPending}
              onClick={() => {
                if (window.confirm('Turn off the front desk screen link? Everyone who has it loses access.')) disable.mutate()
              }}
            >
              Turn off
            </Button>
          </div>
        </div>
      ) : (
        <Button disabled={renew.isPending} onClick={() => renew.mutate()}>
          <Link2 className="size-4" aria-hidden="true" />
          {renew.isPending ? 'Creating…' : 'Create front desk screen link'}
        </Button>
      )}
    </Modal>
  )
}
