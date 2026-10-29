import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, Link2, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { checkInApi } from '@/api/checkInApi'
import { LIVE_POLL_MS, LiveBoard } from '@/components/live/LiveBoard'
import { Button } from '@/components/ui/Button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'

/** Live attendance tab: the board, plus a read-only link to send to people who only need to watch. */
export function LiveAttendancePage() {
  const { eventId = '' } = useParams()
  const event = useEvent(eventId).data
  useDocumentTitle(event ? `Live attendance · ${event.name}` : 'Live attendance')
  const live = event?.status === 'Active'
  const [paused, setPaused] = useState(false)

  const query = useQuery({
    queryKey: ['live-attendance', eventId],
    queryFn: () => checkInApi.live(eventId, 200),
    enabled: Boolean(eventId) && live,
    refetchInterval: paused ? false : LIVE_POLL_MS,
    refetchIntervalInBackground: true,
  })

  if (!event) return null
  if (!live) {
    return (
      <p className="max-w-xl text-sm text-muted">
        Live attendance opens while the event is Live. Make the event Live in its settings to start checking guests in.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <ViewerLink eventId={eventId} />
      <LiveBoard
        data={query.data}
        updatedAt={query.dataUpdatedAt}
        failed={query.isError}
        paused={paused}
        onPause={setPaused}
        timezone={event.timezone}
      />
    </div>
  )
}

function ViewerLink({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient()
  const shareQuery = useQuery({ queryKey: ['live-share', eventId], queryFn: () => checkInApi.getShare(eventId) })
  const token = shareQuery.data?.token ?? null
  const url = token ? `${window.location.origin}/live/${token}` : null

  const onDone = (next: { token: string | null }) => queryClient.setQueryData(['live-share', eventId], next)
  const onError = (error: unknown) => toast.error(error instanceof ApiError ? error.message : 'The viewer link could not be changed.')
  const renew = useMutation({ mutationFn: () => checkInApi.renewShare(eventId), onSuccess: onDone, onError })
  const disable = useMutation({ mutationFn: () => checkInApi.disableShare(eventId), onSuccess: onDone, onError })

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Viewer link copied.')
    } catch {
      toast.error('The link could not be copied. Select it and copy it by hand.')
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-accent" aria-hidden="true" />
        <h2 className="text-base font-semibold">Viewer link</h2>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Send this to people who only need to watch arrivals. They see this board without signing in and cannot change anything. Anyone with the link can see guest
        names, so share it only with your team.
      </p>
      {shareQuery.isLoading ? null : url ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              readOnly
              aria-label="Viewer link"
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
              Open in new tab
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="ghost"
              className="h-8 text-xs"
              disabled={renew.isPending}
              onClick={() => {
                if (window.confirm('Make a new link? The current link stops working for everyone who has it.')) renew.mutate()
              }}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              New link
            </Button>
            <Button
              variant="ghost"
              className="h-8 text-xs text-danger"
              disabled={disable.isPending}
              onClick={() => {
                if (window.confirm('Turn off the viewer link? Everyone who has it loses access.')) disable.mutate()
              }}
            >
              Turn off
            </Button>
          </div>
        </>
      ) : (
        <Button className="mt-4" disabled={renew.isPending} onClick={() => renew.mutate()}>
          <Link2 className="size-4" aria-hidden="true" />
          {renew.isPending ? 'Creating…' : 'Create viewer link'}
        </Button>
      )}
    </section>
  )
}
