import { CalendarDays, Copy, ExternalLink, Image as ImageIcon, Mail, MessageSquareText, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import type { InvitationDesign } from '@/invitations/design'
import type { InvitationResponseItem } from '@/types/invitation'
import { formatTimestamp } from '@/utils/dates'
import { Disclosure, InfoNote, Switch } from '../designerControls'
import type { SampleGuest } from './GuestStep'

export type ReviewTarget = 'artwork' | 'guest' | 'event' | 'rsvp'

export function ReviewStep({
  design,
  sample,
  onSample,
  hideTitle,
  onHideTitle,
  onEdit,
  onOpenPreview,
  previewLoading,
  slug,
  published,
  replies,
  repliesLoading,
}: {
  design: InvitationDesign
  sample: SampleGuest
  onSample: (sample: SampleGuest) => void
  hideTitle: boolean
  onHideTitle: (value: boolean) => void
  onEdit: (step: ReviewTarget) => void
  onOpenPreview: () => void
  previewLoading: boolean
  slug: string
  published: boolean
  replies: InvitationResponseItem[] | undefined
  repliesLoading: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [repliesOpen, setRepliesOpen] = useState(false)
  const guestLink = `${window.location.origin}/invite/${slug}`
  const items: { step: ReviewTarget; label: string; status: string | null; icon: typeof ImageIcon }[] = [
    { step: 'artwork', label: 'Artwork', status: design.headerAssetId ? null : 'No image yet', icon: ImageIcon },
    { step: 'guest', label: 'Guest greeting', status: design.guestPosition.enabled ? null : 'Job title hidden', icon: UserRound },
    { step: 'event', label: 'Event details', status: design.detailsAssetId ? null : 'No image yet', icon: CalendarDays },
    {
      step: 'rsvp',
      label: 'Reply buttons',
      status: design.acceptAssetId && design.declineAssetId ? null : design.acceptAssetId ? 'Accept only' : 'No buttons yet',
      icon: Mail,
    },
  ]

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(guestLink)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="grid gap-5">
      <ul className="divide-y divide-border rounded-md border border-border bg-surface">
        {items.map((item) => (
          <li key={item.step} className="flex h-11 items-center gap-3 px-3">
            <item.icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-sm font-medium">{item.label}</span>
            {item.status ? <span className="text-xs text-muted">{item.status}</span> : null}
            <button type="button" className="text-sm font-medium text-accent hover:underline" onClick={() => onEdit(item.step)}>
              Edit
              <span className="sr-only"> {item.label.toLowerCase()}</span>
            </button>
          </li>
        ))}
      </ul>
      <div>
        <h3 className="text-sm font-medium">Preview as a guest</h3>
        <div className="mt-2 grid gap-3 rounded-md border border-border bg-surface p-3">
          <label className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 text-sm">
            <span className="font-medium">Guest name</span>
            <input
              value={sample.name}
              className="h-10 min-w-0 rounded-md border border-border bg-surface px-3 text-sm"
              onChange={(event) => onSample({ ...sample, name: event.target.value })}
            />
          </label>
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 text-sm">
            <span className="font-medium">Show job title</span>
            <div className="flex items-center gap-3">
              <Switch checked={design.guestPosition.enabled && !hideTitle} label="Show job title" hideLabel onChange={(value) => onHideTitle(!value)} />
              {design.guestPosition.enabled && !hideTitle ? (
                <input
                  aria-label="Sample job title"
                  value={sample.title}
                  className="h-10 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-sm"
                  onChange={(event) => onSample({ ...sample, title: event.target.value })}
                />
              ) : (
                <span className="text-xs text-muted">{design.guestPosition.enabled ? 'Hidden in this preview' : 'Turned off in Guest details'}</span>
              )}
            </div>
          </div>
          <InfoNote>This is a sample. Each guest will see their own name.</InfoNote>
          <Button variant="secondary" className="border-accent text-accent hover:bg-accent-soft" onClick={onOpenPreview} disabled={previewLoading}>
            <ExternalLink className="size-4" aria-hidden="true" />
            {previewLoading ? 'Preparing preview…' : 'Open guest preview'}
          </Button>
          {published ? (
            <div className="flex items-center gap-2">
              <input readOnly value={guestLink} className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm" />
              <Button variant="secondary" onClick={() => void copyLink()}>
                <Copy className="size-4" aria-hidden="true" />
                {copied ? 'Copied' : 'Copy guest link'}
              </Button>
            </div>
          ) : (
            <>
              <InfoNote tone="warning">Guest links become available when your event is Live.</InfoNote>
              <Button variant="secondary" disabled>
                <Copy className="size-4" aria-hidden="true" />
                Copy guest link
              </Button>
            </>
          )}
        </div>
      </div>
      <Disclosure
        icon={<MessageSquareText className="size-4" aria-hidden="true" />}
        title="Guest replies"
        summary={repliesLoading ? 'Loading…' : !replies || replies.length === 0 ? 'No replies yet.' : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
        open={repliesOpen}
        onToggle={() => setRepliesOpen((value) => !value)}
      >
        {repliesLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : replies && replies.length > 0 ? (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Invitation replies</caption>
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Name
                </th>
                <th scope="col" className="py-2 font-medium">
                  Reply
                </th>
              </tr>
            </thead>
            <tbody>
              {replies.map((reply) => (
                <tr key={reply.id} className="border-b border-border last:border-b-0">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {reply.guestName}
                  </th>
                  <td className="py-2">
                    {reply.status === 'Accepted' ? 'Accepted' : 'Declined'}
                    <span className="mt-0.5 block text-muted tabular-nums">{formatTimestamp(reply.createdOn)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">No replies yet.</p>
        )}
      </Disclosure>
    </div>
  )
}
