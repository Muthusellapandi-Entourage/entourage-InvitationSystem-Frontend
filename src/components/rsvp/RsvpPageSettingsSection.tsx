import { MessageSquareText, Paintbrush } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonClassName } from '@/components/ui/Button'

/**
 * Responses tab: a pointer to the responses page designer (Designs → Responses page), where the wording,
 * look and decline reasons of the accept / decline pages are set.
 */
export function RsvpPageSettingsSection({ eventId, askDeclineReason }: { eventId: string; askDeclineReason: boolean }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <MessageSquareText className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Responses page</h2>
          <p className="text-sm text-muted">
            What guests see when they accept or decline. Decline reasons are {askDeclineReason ? 'asked' : 'not asked'}.
          </p>
        </div>
      </div>
      <Link to={`/events/${eventId}/rsvp/design`} className={buttonClassName('secondary')}>
        <Paintbrush className="size-4" aria-hidden="true" />
        Edit design
      </Link>
    </section>
  )
}
