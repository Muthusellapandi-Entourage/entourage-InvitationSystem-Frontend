import { cn } from '@/lib/cn'
import type { EventStatus } from '@/types/event'

const styles: Record<EventStatus, string> = {
  Draft: 'bg-selected text-foreground',
  Active: 'bg-accent-soft text-accent',
  Archived: 'border border-border text-muted',
}

export function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <span className={cn('inline-flex h-6 items-center rounded-md px-2 text-xs font-medium', styles[status])}>
      {status}
    </span>
  )
}
