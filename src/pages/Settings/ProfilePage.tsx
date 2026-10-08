import { Link } from 'react-router-dom'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAuth } from '@/stores/authStore'
import { usePageBreadcrumbs } from '@/stores/breadcrumbStore'

export function ProfilePage() {
  const { user } = useAuth()
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Administrator'
  useDocumentTitle('Profile')
  usePageBreadcrumbs([
    { label: 'Dashboard', to: '/' },
    { label: 'Profile' },
  ])

  const rows = [
    { label: 'Name', value: name },
    { label: 'Email', value: user?.email ?? '—' },
    { label: 'Role', value: user?.role ?? '—' },
  ]

  return (
    <div className="max-w-3xl">
      <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">My profile</h1>
      <p className="mt-2 text-sm text-muted">The account signed in on this browser.</p>
      <dl className="mt-8 border-t border-border">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 border-b border-border py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-sm text-muted">{row.label}</dt>
            <dd className="text-sm">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-sm text-muted">
        Theme and session details live in{' '}
        <Link to="/settings" className="text-foreground underline underline-offset-4">
          Settings
        </Link>
        .
      </p>
    </div>
  )
}
