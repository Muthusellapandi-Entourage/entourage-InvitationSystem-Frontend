import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { checkInApi } from '@/api/checkInApi'
import { LIVE_POLL_MS, LiveBoard } from '@/components/live/LiveBoard'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/** The read-only live attendance board behind a viewer link (/live/{token}); no sign-in. */
export function PublicLivePage() {
  const { token = '' } = useParams()
  const [paused, setPaused] = useState(false)
  const query = useQuery({
    queryKey: ['public-live', token],
    queryFn: () => checkInApi.publicLive(token),
    enabled: Boolean(token),
    refetchInterval: (state) => {
      const status = state.state.error instanceof ApiError ? state.state.error.status : 0
      // A link that was turned off or an event that ended will not come back: stop asking.
      return paused || status === 404 || status === 410 ? false : LIVE_POLL_MS
    },
    refetchIntervalInBackground: true,
    retry: (count, error) => !(error instanceof ApiError && (error.status === 404 || error.status === 410)) && count < 3,
  })
  const data = query.data
  useDocumentTitle(data ? `Live attendance · ${data.eventName}` : 'Live attendance')

  const gone = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 410)

  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-6xl">
        {gone ? (
          <div className="mx-auto mt-24 max-w-md text-center">
            <h1 className="text-2xl font-semibold">Live attendance unavailable</h1>
            <p className="mt-2 text-sm text-muted">{query.error instanceof ApiError ? query.error.message : ''} Ask the organiser for a new link.</p>
          </div>
        ) : !data ? (
          <p className="text-sm text-muted" aria-live="polite">
            {query.isError ? 'Could not load live attendance. Retrying…' : 'Loading live attendance…'}
          </p>
        ) : (
          <LiveBoard
            data={data.live}
            updatedAt={query.dataUpdatedAt}
            failed={query.isError}
            paused={paused}
            onPause={setPaused}
            timezone={data.timezone}
            heading={
              <header>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Live attendance</p>
                <h1 className="mt-1 text-[1.75rem] font-semibold tracking-[-0.02em]">{data.eventName}</h1>
                {data.status !== 'Active' ? (
                  <p className="mt-2 text-sm text-muted">The event is not live yet — arrivals appear here once check-in opens.</p>
                ) : null}
              </header>
            }
          />
        )}
      </div>
    </main>
  )
}
