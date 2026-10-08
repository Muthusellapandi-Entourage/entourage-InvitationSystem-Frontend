import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-7 shrink-0', className)}>
      <rect x="2.5" y="2.5" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 8.5h10M7 12h7.5M7 15.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function Logo({
  to,
  className,
  markClassName,
}: {
  to?: string
  className?: string
  markClassName?: string
}) {
  const content = (
    <span className={cn('flex items-center gap-2.5 text-foreground', className)}>
      <LogoMark className={markClassName} />
      <span className="min-w-0 text-left">
        <span className="block text-[13px] font-semibold tracking-[0.16em]">ENTOURAGE</span>
        <span className="block text-xs text-muted">Event Platform</span>
      </span>
    </span>
  )

  if (!to) return content

  return (
    <Link to={to} className="rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
      {content}
    </Link>
  )
}
