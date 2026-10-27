import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Copy, ExternalLink, FileDown, ImageDown, Mail, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { toast } from 'sonner'
import { ApiError, apiBaseUrl } from '@/api/client'
import { guestApi, type Guest, type GuestRsvpStatus } from '@/api/guestApi'
import { guestTypeApi } from '@/api/guestTypeApi'
import { guestQrDataUrl } from '@/badges/sampleQr'
import type { GroupDownload } from '@/components/guests/GroupCard'
import { blobToDataUrl, nameImageApi } from '@/api/fontApi'
import { renderInvitationHtml, usesGuestNameImage } from '@/invitations/emailHtml'
import { personalInvitationUrl, rsvpUrl } from '@/invitations/guestLinks'
import { cn } from '@/lib/cn'

const statusTone: Record<GuestRsvpStatus, string> = {
  Pending: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
  Accepted: 'border-accent/60 bg-accent-soft text-accent',
  Declined: 'border-danger/60 bg-danger-soft text-danger',
}

/**
 * Everything about one guest in a panel opened from the row's "More" button:
 * status, contact, personal invitation link, email / reminder, guest pass (QR + downloads) and history.
 */
export function GuestDetailsDialog({
  guest,
  eventId,
  eventSlug,
  eventLive = true,
  timezone,
  busy,
  onClose,
  onEdit,
  onDelete,
  onEmail,
  onRecord,
  onDownload,
}: {
  guest: Guest | null
  eventId: string
  eventSlug: string
  /** Only an Active event's guest pages are open; otherwise "View invitation" shows the in-app copy. */
  eventLive?: boolean
  timezone: string | null
  busy: boolean
  onClose: () => void
  onEdit: (guest: Guest) => void
  onDelete: (guest: Guest) => void
  onEmail: (guest: Guest, reminder: boolean) => void
  onRecord: (guest: Guest) => void
  /** Resolves to an error message to show in the panel, or null when the file was saved. */
  onDownload: (guest: Guest, kind: GroupDownload) => Promise<string | null>
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const queryClient = useQueryClient()
  const [qr, setQr] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<GroupDownload | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  useEffect(() => setDownloadError(null), [guest?.id])
  const open = guest !== null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    let alive = true
    setQr(null)
    if (guest) {
      guestQrDataUrl(guest.checkInCode)
        .then((url) => alive && setQr(url))
        .catch(() => alive && setQr(null))
    }
    return () => {
      alive = false
    }
  }, [guest?.checkInCode])

  const activityQuery = useQuery({
    queryKey: ['guest-activity', eventId, guest?.id],
    queryFn: () => guestApi.activity(eventId, guest!.id),
    enabled: open,
  })

  const statusMutation = useMutation({
    mutationFn: (status: GuestRsvpStatus) => guestApi.setRsvp(eventId, guest!.id, status),
    onSuccess: async (_activity, status) => {
      toast.success(`${guest?.name} is now ${status}.`)
      await queryClient.invalidateQueries({ queryKey: ['guests', eventId] })
      await queryClient.invalidateQueries({ queryKey: ['guest-activity', eventId, guest?.id] })
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'The status could not be changed.'),
  })

  if (!guest) {
    return <dialog ref={dialogRef} aria-labelledby={titleId} onClose={onClose} />
  }

  const status: GuestRsvpStatus = guest.rsvpStatus ?? 'Pending'
  // With a confirmed event domain every guest has their own link; otherwise the shared page with their name.
  const link =
    guest.invitationUrl ??
    (guest.inviteToken
      ? personalInvitationUrl(guest.inviteToken)
      : `${window.location.origin}/invite/${encodeURIComponent(eventSlug)}?name=${encodeURIComponent(guest.name)}${
          guest.position ? `&position=${encodeURIComponent(guest.position)}` : ''
        }`)
  const when = (value: string | null | undefined) => formatWhen(value, timezone)
  const hasEmail = Boolean(guest.email?.trim())
  const activities = activityQuery.data ?? []

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Invitation link copied.')
    } catch {
      toast.error('The link could not be copied. Select it and copy it by hand.')
    }
  }

  /** Opens this guest's own invitation (their type's design with their name) in a new tab. */
  async function viewInvitation() {
    if (!guest?.guestTypeId) {
      toast.error('Assign a guest type first; the invitation design comes from the type.')
      return
    }
    if (guest.invitationUrl && eventLive) {
      // The guest's real page on the event domain. Opening it does not reply for them.
      window.open(guest.invitationUrl, '_blank', 'noopener')
      return
    }
    const preview = window.open('', '_blank')
    try {
      const invitation = await guestTypeApi.getInvitation(eventId, guest.guestTypeId)
      if (!invitation.configured || !invitation.html) throw new Error(`The ${guest.guestTypeName ?? 'guest type'} invitation design has not been configured.`)
      const rsvp = `${window.location.origin}/invite/${encodeURIComponent(eventSlug)}/rsvp`
      const nameImage = usesGuestNameImage(invitation.html)
        ? await blobToDataUrl(await nameImageApi.forGuest(eventId, guest.id))
        : undefined
      const html = renderInvitationHtml(invitation.html, {
        guestName: guest.name,
        guestPosition: guest.position ?? '',
        // Accept / Decline open the guest's own RSVP page (confirm → thank-you), not the shared one.
        acceptUrl: guest.inviteToken ? rsvpUrl(guest.inviteToken, 'accept') : `${rsvp}?status=accept`,
        declineUrl: guest.inviteToken ? rsvpUrl(guest.inviteToken, 'decline') : `${rsvp}?status=decline`,
        assetOrigin: apiBaseUrl,
        nameImage,
      })
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      if (preview) preview.location.href = url
      else window.open(url, '_blank')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      preview?.close()
      toast.error(error instanceof Error ? error.message : 'The invitation could not be opened.')
    }
  }

  async function download(kind: GroupDownload) {
    if (!guest || downloading) return
    setDownloading(kind)
    setDownloadError(null)
    try {
      // Toasts sit behind this modal, so problems are shown in the panel itself.
      setDownloadError(await onDownload(guest, kind))
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'The download failed.')
    } finally {
      setDownloading(null)
    }
    await queryClient.invalidateQueries({ queryKey: ['guest-activity', eventId, guest.id] })
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(72rem,calc(100vw-2rem))]"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="grid max-h-[min(52rem,calc(100vh-2rem))] overflow-y-auto lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Main column */}
        <div className="min-w-0 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h2 id={titleId} className="text-2xl font-semibold tracking-[-0.01em]">
                {guest.name}
              </h2>
              {guest.guestTypeName ? (
                <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-sm font-medium text-amber-400">
                  {guest.guestTypeName}
                </span>
              ) : (
                <span className="rounded-md border border-border px-2 py-0.5 text-sm text-muted">No guest type</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('inline-flex items-center gap-2 rounded-md border px-3 py-1 text-sm font-medium', statusTone[status])}>
                <span className="size-2 rounded-full bg-current" aria-hidden="true" />
                {status}
              </span>
              <button
                type="button"
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground lg:hidden"
                onClick={onClose}
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">Position</dt>
              <dd className="mt-0.5">{guest.position || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Email</dt>
              <dd className="mt-0.5 break-all">{guest.email || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Group</dt>
              <dd className="mt-0.5">{guest.guestGroupName ?? 'No group'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Check-in code</dt>
              <dd className="mt-0.5 font-mono text-sm">{guest.checkInCode}</dd>
            </div>
          </dl>

          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span>Email sent: {when(guest.lastEmailedOn)}</span>
            <span className="hidden h-4 w-px self-center bg-border sm:block" aria-hidden="true" />
            <span>Status changed: {when(guest.rsvpUpdatedOn)}</span>
          </p>
          {status === 'Declined' && guest.declineReason ? (
            <blockquote className="mt-3 rounded-md bg-hover px-3 py-2 text-sm">
              <span className="mr-1 font-medium">Decline reason:</span>
              <span className="italic">“{guest.declineReason}”</span>
            </blockquote>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <select
              aria-label="RSVP status"
              className="h-10 min-w-40 rounded-md border border-border bg-surface px-3 text-sm"
              value={status}
              disabled={statusMutation.isPending}
              onChange={(event) => statusMutation.mutate(event.target.value as GuestRsvpStatus)}
            >
              <option value="Pending">Pending</option>
              <option value="Accepted">Accepted</option>
              <option value="Declined">Declined</option>
            </select>
            <PanelButton onClick={() => onEdit(guest)}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </PanelButton>
            <PanelButton tone="danger" onClick={() => onDelete(guest)}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </PanelButton>
          </div>

          <section className="mt-6 border-t border-border pt-5">
            <h3 className="font-semibold">Invitation</h3>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                readOnly
                aria-label="Personal invitation link"
                value={link}
                onFocus={(event) => event.currentTarget.select()}
                className="h-10 min-w-0 flex-1 basis-72 truncate rounded-md border border-border bg-background px-3 text-sm text-accent"
              />
              <PanelButton onClick={() => void copyLink()}>
                <Copy className="size-4" aria-hidden="true" />
                Copy
              </PanelButton>
              <PanelButton onClick={() => void viewInvitation()}>
                <ExternalLink className="size-4" aria-hidden="true" />
                View invitation
              </PanelButton>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PanelButton tone="primary" disabled={!hasEmail || busy} onClick={() => onEmail(guest, false)}>
                <Mail className="size-4" aria-hidden="true" />
                {guest.invitationCount > 0 ? 'Send mail again' : 'Send mail'}
              </PanelButton>
              <PanelButton
                tone="warning"
                disabled={!hasEmail || busy || guest.invitationCount === 0}
                title={guest.invitationCount === 0 ? 'Send the invitation first' : 'Email the invitation again with a "Reminder" subject'}
                onClick={() => onEmail(guest, true)}
              >
                <Bell className="size-4" aria-hidden="true" />
                Final reminder
              </PanelButton>
              <PanelButton title="Record the invitation as sent without emailing it" onClick={() => onRecord(guest)}>
                <RotateCcw className="size-4" aria-hidden="true" />
                {guest.invitationCount > 0 ? 'Record again' : 'Record without email'}
              </PanelButton>
              {!hasEmail ? <span className="text-sm text-muted">No email address — add one with Edit to send mail.</span> : null}
            </div>
          </section>

          <section className="mt-6 border-t border-border pt-5">
            <h3 className="font-semibold">Activity</h3>
            {activityQuery.isLoading ? (
              <p className="mt-3 text-sm text-muted">Loading…</p>
            ) : activities.length === 0 ? (
              <p className="mt-3 text-sm italic text-muted">No activity recorded yet.</p>
            ) : (
              <ul className="mt-3 max-h-64 divide-y divide-border overflow-y-auto text-sm">
                {activities.map((item) => (
                  <li key={item.id} className="grid grid-cols-[10rem_minmax(0,1fr)_auto] gap-3 py-2">
                    <span className="font-medium">{item.kind}</span>
                    <span className="truncate text-muted" title={item.detail ?? undefined}>
                      {item.detail ?? ''}
                    </span>
                    <span className="whitespace-nowrap text-muted tabular-nums">{when(item.createdOn)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Guest pass */}
        <aside className="border-t border-border p-6 lg:border-l lg:border-t-0">
          <div className="flex items-start justify-between">
            <h3 className="text-xl font-semibold">Guest pass</h3>
            <button
              type="button"
              aria-label="Close"
              className="hidden size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground lg:flex"
              onClick={onClose}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-5 flex justify-center">
            <div className="flex size-48 items-center justify-center rounded-lg bg-white p-3">
              {qr ? <img src={qr} alt={`Check-in QR code for ${guest.name}`} className="size-full" /> : <span className="text-xs text-neutral-500">Loading QR…</span>}
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-muted">Scanned at check-in. It never changes.</p>
          <div className="mt-5 grid gap-2.5">
            <PanelButton tone="accent" disabled={busy || !!downloading || !guest.guestTypeId} onClick={() => void download('invitations')}>
              <FileDown className="size-4" aria-hidden="true" />
              {downloading === 'invitations' ? 'Preparing…' : 'Download invite-card'}
            </PanelButton>
            <PanelButton tone="accent" disabled={busy || !!downloading || !guest.guestTypeId} onClick={() => void download('badges-png')}>
              <ImageDown className="size-4" aria-hidden="true" />
              {downloading === 'badges-png' ? 'Preparing…' : 'E-Badge image'}
            </PanelButton>
            <PanelButton tone="accent" disabled={busy || !!downloading || !guest.guestTypeId} onClick={() => void download('badges-pdf')}>
              <FileDown className="size-4" aria-hidden="true" />
              {downloading === 'badges-pdf' ? 'Preparing…' : 'E-Badge PDF'}
            </PanelButton>
            {downloadError ? (
              <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {downloadError}
              </p>
            ) : null}
            {!guest.guestTypeId ? <p className="text-xs text-muted">Assign a guest type to download the invite-card and e-badge.</p> : null}
          </div>
        </aside>
      </div>
    </dialog>
  )
}

function PanelButton({
  tone = 'neutral',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'neutral' | 'primary' | 'accent' | 'warning' | 'danger' }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'neutral' && 'border-border bg-surface text-foreground hover:bg-hover',
        tone === 'primary' && 'border-accent bg-accent text-accent-foreground hover:bg-accent-hover',
        tone === 'accent' && 'justify-start border-accent/60 bg-surface text-accent hover:bg-accent-soft',
        tone === 'warning' && 'border-amber-500/60 bg-surface text-amber-400 hover:bg-amber-500/10',
        tone === 'danger' && 'border-danger/60 bg-surface text-danger hover:bg-danger-soft',
        className,
      )}
      {...props}
    />
  )
}

/** "Oct 23, 2026, 03:01 PM GMT+4" in the event's time zone; "—" when empty. */
function formatWhen(value: string | null | undefined, timezone: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'shortOffset',
  }
  try {
    return date.toLocaleString(undefined, timezone ? { ...options, timeZone: timezone } : options)
  } catch {
    return date.toLocaleString(undefined, options)
  }
}
