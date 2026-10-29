import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BadgeCheck, Globe, Mail, Monitor, Palette, Printer, Smartphone, Table2, UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { guestTypeApi } from '@/api/guestTypeApi'
import { micrositeApi } from '@/api/micrositeApi'
import { buttonClassName } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'

/** One place for every design of the event: per guest category, then the event's pages. */
export function DesignsPage() {
  const { eventId = '' } = useParams()
  useDocumentTitle('Designs')
  const types = useQuery({ queryKey: ['guest-types', eventId], queryFn: () => guestTypeApi.list(eventId), enabled: Boolean(eventId) })
  const microsite = useQuery({ queryKey: ['microsite', eventId], queryFn: () => micrositeApi.get(eventId), enabled: Boolean(eventId) })

  return (
    <div className="grid gap-10">
      <section>
        <header className="mb-4">
          <h2 className="text-lg font-semibold">Per guest category</h2>
          <p className="mt-1 text-sm text-muted">Each guest category has its own invitation, digital pass and printed badge. Every designer works the same way.</p>
        </header>

        {types.isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (types.data ?? []).length === 0 ? (
          <EmptyState
            title="No guest categories yet"
            description="Add a guest category (for example VIP or Media) first. Its invitation, digital pass and printed badge are designed here."
            action={
              <Link to={`/events/${eventId}/guest-types`} className={buttonClassName('primary')}>
                Add guest categories
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3">
            {(types.data ?? []).map((type) => (
              <div key={type.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold">
                    {type.name}
                    {!type.isEnabled ? <span className="ml-2 text-xs font-normal text-muted">(disabled)</span> : null}
                  </h3>
                  <span className="text-xs tabular-nums text-muted">
                    {type.guestCount} {type.guestCount === 1 ? 'guest' : 'guests'}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <DesignCard
                    icon={<Mail />}
                    title="Invitation"
                    hint="Email and invite card"
                    ready={type.invitationConfigured}
                    to={`/events/${eventId}/guest-types/${type.id}/invitation`}
                  />
                  <DesignCard
                    icon={<Smartphone />}
                    title="Digital pass"
                    hint="On the guest's phone after accepting"
                    ready={type.badgeConfigured}
                    to={`/events/${eventId}/guest-types/${type.id}/badge`}
                  />
                  <DesignCard
                    icon={<Printer />}
                    title="Printed badge"
                    hint="Printed at the front desk"
                    ready={Boolean(type.printBadgeConfigured)}
                    to={`/events/${eventId}/guest-types/${type.id}/print-badge`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <header className="mb-4">
          <h2 className="text-lg font-semibold">Event pages</h2>
          <p className="mt-1 text-sm text-muted">Pages guests open, and the screens used on the day.</p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DesignCard
            icon={<Globe />}
            title="Microsite"
            hint="Personal page for each guest, with Accept / Decline"
            ready={microsite.data ? microsite.data.isPublished || microsite.data.publicEnabled : undefined}
            readyLabel="Live"
            notReadyLabel="Not live"
            to={`/events/${eventId}/microsite`}
          />
          <DesignCard icon={<BadgeCheck />} title="Responses page" hint="What guests see when they accept or decline" to={`/events/${eventId}/rsvp/design`} />
          <DesignCard icon={<UserPlus />} title="Self-registration page" hint="Sign-up form for walk-ins" to={`/events/${eventId}/registration/design`} />
          <DesignCard icon={<Monitor />} title="Self check-in screen" hint="Kiosk at the entrance" to={`/events/${eventId}/check-in/design`} />
          <DesignCard icon={<Table2 />} title="Seating plan" hint="Tables and seats" to={`/events/${eventId}/seating`} />
          <DesignCard icon={<Palette />} title="Brand kit" hint="Logos, colours, fonts used by every designer" to={`/events/${eventId}/brand`} />
        </div>
      </section>
    </div>
  )
}

function DesignCard({
  icon,
  title,
  hint,
  to,
  ready,
  readyLabel = 'Designed',
  notReadyLabel = 'Not designed yet',
}: {
  icon: ReactNode
  title: string
  hint: string
  to: string
  /** Undefined hides the status line. */
  ready?: boolean
  readyLabel?: string
  notReadyLabel?: string
}) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 rounded-md border border-border bg-background p-3 transition-colors hover:border-accent hover:bg-accent-soft/40"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent [&_svg]:size-4" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-medium">
          {title}
          <ArrowRight className="size-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
        </span>
        <span className="block text-xs text-muted">{hint}</span>
        {ready !== undefined ? (
          <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs">
            <span className={cn('size-2 rounded-full', ready ? 'bg-accent' : 'bg-muted')} aria-hidden="true" />
            {ready ? readyLabel : notReadyLabel}
          </span>
        ) : null}
      </span>
    </Link>
  )
}
