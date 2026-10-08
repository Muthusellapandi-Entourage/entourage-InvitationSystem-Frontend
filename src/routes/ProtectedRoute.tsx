import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/stores/authStore'

export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'unknown') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-foreground">
        <p className="text-sm text-muted">Checking your session…</p>
      </div>
    )
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }

  return <Outlet />
}
