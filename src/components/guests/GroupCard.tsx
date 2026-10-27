import { ChartColumn, ChevronDown, FileDown, ImageDown, Mail, Pencil, Trash2, UserPlus } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '@/lib/cn'

export type GroupDownload = 'invitations' | 'badges-pdf' | 'badges-png'

/**
 * Header of one group card: collapse arrow, name, summary, and the group's actions as visible buttons:
 * Add guest · PDFs · E-Badges · E-Badge PDFs · RSVP report · Send unsent · Delete group.
 */
export function GroupCardHeader({
  name,
  open,
  createdOn,
  total,
  notInvited,
  busy,
  manageable,
  onToggle,
  onDownload,
  onReport,
  onSendUnsent,
  onAddGuest,
  onRename,
  onDelete,
}: {
  name: string
  open: boolean
  createdOn: string | null
  total: number
  notInvited: number
  busy: boolean
  /** False for the "No group" card, which cannot be renamed or deleted. */
  manageable: boolean
  onToggle: () => void
  onDownload: (kind: GroupDownload) => void
  onReport: () => void
  onSendUnsent: () => void
  onAddGuest: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const created = createdOn ? new Date(createdOn).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : null
  const summary = [
    created ? `Created ${created}` : null,
    `${total} ${total === 1 ? 'guest' : 'guests'}`,
    total === 0 ? null : notInvited > 0 ? `${notInvited} not invited` : 'all invited',
  ]
    .filter(Boolean)
    .join(' · ')
  const empty = total === 0

  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
      <div className="flex min-w-[14rem] flex-1 items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground"
          onClick={onToggle}
        >
          <ChevronDown className={cn('size-5 transition-transform', !open && '-rotate-90')} aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <button type="button" className="truncate text-left text-lg font-semibold leading-snug" onClick={onToggle}>
              {name}
            </button>
            {manageable ? (
              <button
                type="button"
                aria-label={`Rename ${name}`}
                title="Rename group"
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground"
                onClick={onRename}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <p className="text-sm text-muted tabular-nums">{summary}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CardButton tone="accent" onClick={onAddGuest}>
          <UserPlus className="size-4" aria-hidden="true" />
          Add guest
        </CardButton>
        <CardButton disabled={busy || empty} title="Invitations as one PDF, a page per guest" onClick={() => onDownload('invitations')}>
          <FileDown className="size-4" aria-hidden="true" />
          PDFs
        </CardButton>
        <CardButton disabled={busy || empty} title="E-badges as images (PNG) in a ZIP" onClick={() => onDownload('badges-png')}>
          <FileDown className="size-4" aria-hidden="true" />
          E-Badges
        </CardButton>
        <CardButton disabled={busy || empty} title="E-badges as one PDF, a page per guest" onClick={() => onDownload('badges-pdf')}>
          <ImageDown className="size-4" aria-hidden="true" />
          E-Badge PDFs
        </CardButton>
        <CardButton disabled={empty} title="Spreadsheet of invitation, RSVP and badge status" onClick={onReport}>
          <ChartColumn className="size-4" aria-hidden="true" />
          RSVP report
        </CardButton>
        <CardButton disabled={busy || notInvited === 0} title="Email the invitation to guests who have not received one yet" onClick={onSendUnsent}>
          <Mail className="size-4" aria-hidden="true" />
          Send unsent
        </CardButton>
        {manageable ? (
          <CardButton tone="danger" onClick={onDelete}>
            <Trash2 className="size-4" aria-hidden="true" />
            Delete group
          </CardButton>
        ) : null}
      </div>
    </div>
  )
}

/** Outlined button used on group cards and guest rows. */
export function CardButton({
  children,
  tone = 'neutral',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'danger'
  size?: 'sm' | 'md'
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-surface font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-10 px-3.5 text-sm' : 'h-9 px-3 text-[13px]',
        tone === 'neutral' && 'border-border text-foreground hover:bg-hover',
        tone === 'accent' && 'border-accent/70 text-foreground hover:bg-accent-soft [&>svg]:text-accent',
        tone === 'danger' && 'border-danger/70 text-danger hover:bg-danger-soft',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
