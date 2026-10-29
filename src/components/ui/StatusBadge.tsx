import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { EventStatus } from '@/types/event'

/** Compact, flat status chips: teal = active/done, amber = pending, gray = not started, rose = problem. */
export type BadgeTone = 'teal' | 'amber' | 'gray' | 'rose'

const tones: Record<BadgeTone, string> = {
  teal: 'bg-accent-soft text-accent',
  amber: 'bg-warning-soft text-warning',
  gray: 'bg-hover text-muted',
  rose: 'bg-danger-soft text-danger',
}

export function Badge({ tone = 'gray', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-sm px-2 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  )
}

const statusTone: Record<EventStatus, BadgeTone> = {
  Draft: 'amber',
  Active: 'teal',
  Archived: 'gray',
}

export function StatusBadge({ status }: { status: EventStatus }) {
  return <Badge tone={statusTone[status]}>{status}</Badge>
}
