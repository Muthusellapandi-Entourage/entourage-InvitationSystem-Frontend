import { CalendarDays, LayoutDashboard, LogOut, Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { cn } from '@/lib/cn'
import { useAuth } from '@/stores/authStore'

function navClass(isActive: boolean) {
  return cn(
    'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-150',
    isActive ? 'bg-selected font-medium text-foreground' : 'text-muted hover:bg-hover hover:text-foreground',
  )
}

function initials(firstName: string, lastName: string) {
  const letters = `${firstName.charAt(0)}${lastName.charAt(0)}`.trim()
  return (letters || firstName.slice(0, 2) || 'A').toUpperCase()
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  const name = user?.firstName || 'Administrator'

  return (
    <div className="flex h-full flex-col bg-sidebar text-foreground">
      <div className="px-4 py-5">
        <Logo to="/" />
      </div>
      <nav className="flex-1 px-3" aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => navClass(isActive)} onClick={onNavigate}>
          <LayoutDashboard className="size-4" aria-hidden="true" />
          Overview
        </NavLink>
        <div className="mx-2.5 my-3 border-t border-border" role="separator" />
        <NavLink to="/events" className={({ isActive }) => navClass(isActive)} onClick={onNavigate}>
          <CalendarDays className="size-4" aria-hidden="true" />
          Events
        </NavLink>
        <div className="mx-2.5 my-3 border-t border-border" role="separator" />
        <NavLink to="/settings" className={({ isActive }) => navClass(isActive)} onClick={onNavigate}>
          <Settings className="size-4" aria-hidden="true" />
          Settings
        </NavLink>
      </nav>
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 px-1">
          <span
            aria-hidden="true"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-selected text-xs font-medium"
          >
            {initials(user?.firstName ?? '', user?.lastName ?? '')}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted">{user?.role ?? 'Administrator'}</span>
          </span>
        </div>
        <button
          type="button"
          className="mt-2 flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-muted transition-colors duration-150 hover:bg-hover hover:text-foreground"
          onClick={() => {
            onNavigate?.()
            void logout()
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          Log out
        </button>
      </div>
    </div>
  )
}
