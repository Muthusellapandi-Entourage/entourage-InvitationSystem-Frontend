import { Menu, Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { NotificationMenu } from '@/components/layout/NotificationMenu'
import { ThemeMenu } from '@/components/layout/ThemeMenu'
import { UserMenu } from '@/components/layout/UserMenu'
import { IconButton } from '@/components/ui/IconButton'
import { useBreadcrumbs } from '@/stores/breadcrumbStore'

export function Header({ onOpenNav }: { onOpenNav: () => void }) {
  const { items } = useBreadcrumbs()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:gap-3 sm:px-4">
      <IconButton className="shrink-0 md:hidden" aria-label="Open navigation" onClick={onOpenNav}>
        <Menu className="size-4" aria-hidden="true" />
      </IconButton>
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {items.map((item, index) => {
            const current = index === items.length - 1
            return (
              <li
                key={`${item.label}-${index}`}
                className={`${current ? 'flex' : 'hidden sm:flex'} min-w-0 items-center gap-1.5`}
              >
                {index > 0 ? <span className="hidden text-muted sm:inline">/</span> : null}
                {item.to && !current ? (
                  <Link to={item.to} className="truncate text-muted hover:text-foreground">
                    {item.label}
                  </Link>
                ) : (
                  <span className="whitespace-nowrap font-medium sm:truncate" aria-current={current ? 'page' : undefined}>
                    {item.label}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
      <form
        role="search"
        className="relative w-16 shrink-0 sm:w-56"
        onSubmit={(event) => {
          event.preventDefault()
          const next = query.trim()
          navigate(next ? `/events?q=${encodeURIComponent(next)}` : '/events')
        }}
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search events"
          placeholder="Search"
          className="h-9 w-full min-w-0 rounded-md border border-border bg-surface pl-8 pr-2 text-sm placeholder:text-transparent sm:placeholder:text-muted"
        />
      </form>
      <div className="flex shrink-0 items-center">
        <ThemeMenu />
        <NotificationMenu />
        <UserMenu />
      </div>
    </header>
  )
}
