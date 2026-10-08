import { CalendarDays, Clock, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { InvitationContent, ReplyMode } from '@/types/invitation'
import '@fontsource/amiri/400.css'
import '@fontsource/amiri/700.css'

const gold = '#9a7340'

function Line({ children, className = '' }: { children: string; className?: string }) {
  if (!children.trim()) return null
  return <p className={className}>{children}</p>
}

function showsAccept(mode: ReplyMode) {
  return mode !== 'DeclineOnly'
}

function showsDecline(mode: ReplyMode) {
  return mode !== 'AcceptOnly'
}

function ReplyButton({
  href,
  label,
}: {
  href?: string
  label: string
}) {
  const className =
    'inline-flex min-w-28 items-center justify-center rounded-full border border-[#9a7340] px-6 py-2 text-lg text-[#9a7340] transition-colors duration-150 hover:bg-[#9a7340]/10'

  if (!label.trim()) return null
  if (!href) {
    return <span className={className}>{label}</span>
  }

  return (
    <Link to={href} className={className}>
      {label}
    </Link>
  )
}

export function InvitationCard({
  invitation,
  hrefBase,
}: {
  invitation: InvitationContent
  hrefBase?: string
}) {
  const filled =
    invitation.addressee.trim() ||
    invitation.organizationName.trim() ||
    invitation.dateLine.trim() ||
    invitation.venueLine.trim()

  const acceptHref = hrefBase ? `${hrefBase}/confirm?response=accept` : undefined
  const declineHref = hrefBase ? `${hrefBase}/confirm?response=decline` : undefined
  const showAccept = showsAccept(invitation.replyMode)
  const showDecline = showsDecline(invitation.replyMode)

  return (
    <article
      dir="rtl"
      lang="ar"
      className="mx-auto w-full max-w-[28rem] bg-[#fbf8f3] px-8 py-12 text-center leading-relaxed text-[#1c1c1a]"
      style={{ fontFamily: '"Amiri", "Noto Naskh Arabic", serif' }}
    >
      {filled ? null : (
        <p className="text-lg text-[#6b645c]">The invitation appears here as you fill the fields.</p>
      )}

      <div className="space-y-6 text-[1.15rem]">
        <Line className="text-[1.4rem]">{invitation.addressee}</Line>

        <div className="space-y-1">
          <Line className="text-base text-[#3f3c38]">{invitation.patronageIntro}</Line>
          <Line className="text-[1.45rem] font-bold">{invitation.patronName}</Line>
          <Line className="text-base">{invitation.patronTitle}</Line>
          <Line className="text-base">{invitation.patronClosing}</Line>
        </div>

        <div className="space-y-1">
          <Line className="text-base text-[#3f3c38]">{invitation.hostIntro}</Line>
          <Line className="text-[1.35rem] font-bold">{invitation.hostName}</Line>
        </div>

        <div className="space-y-2">
          <Line className="text-base">{invitation.bodyIntro}</Line>
          {invitation.organizationName.trim() ? (
            <p className="text-[1.75rem] font-bold leading-snug" style={{ color: gold }}>
              {invitation.organizationName}
            </p>
          ) : null}
          <Line className="text-[1.2rem] font-bold">{invitation.organizationSubtitle}</Line>
          <Line className="text-base text-[#3f3c38]">{invitation.announcement}</Line>
          <Line className="text-base">{invitation.attendanceLine}</Line>
        </div>
      </div>

      {invitation.dateLine.trim() || invitation.timeLine.trim() || invitation.venueLine.trim() ? (
        <ul className="mx-auto mt-8 max-w-xs space-y-4 text-right text-base">
          {invitation.dateLine.trim() ? (
            <li className="flex items-center gap-3">
              <CalendarDays className="size-5 shrink-0" style={{ color: gold }} aria-hidden="true" />
              <span>
                <span className="block">{invitation.dateLine}</span>
                {invitation.hijriDateLine.trim() ? (
                  <span className="block text-[#6b645c]">{invitation.hijriDateLine}</span>
                ) : null}
              </span>
            </li>
          ) : null}
          {invitation.timeLine.trim() ? (
            <li className="flex items-center gap-3">
              <Clock className="size-5 shrink-0" style={{ color: gold }} aria-hidden="true" />
              <span>{invitation.timeLine}</span>
            </li>
          ) : null}
          {invitation.venueLine.trim() ? (
            <li className="flex items-center gap-3">
              <MapPin className="size-5 shrink-0" style={{ color: gold }} aria-hidden="true" />
              {invitation.locationUrl.trim() ? (
                <a href={invitation.locationUrl} className="underline decoration-[#9a7340]/40 underline-offset-4">
                  {invitation.venueLine}
                </a>
              ) : (
                <span>{invitation.venueLine}</span>
              )}
            </li>
          ) : null}
        </ul>
      ) : null}

      {invitation.rsvpNote.trim() || invitation.rsvpDeadline.trim() ? (
        <div className="mt-8 space-y-1 text-base">
          <Line>{invitation.rsvpNote}</Line>
          <Line className="font-bold">{invitation.rsvpDeadline}</Line>
        </div>
      ) : null}

      {showAccept || showDecline ? (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {showDecline ? <ReplyButton href={declineHref} label={invitation.declineLabel} /> : null}
          {showAccept ? <ReplyButton href={acceptHref} label={invitation.acceptLabel} /> : null}
        </div>
      ) : null}
    </article>
  )
}
