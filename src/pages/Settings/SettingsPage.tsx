import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAuth } from '@/stores/authStore'
import { usePageBreadcrumbs } from '@/stores/breadcrumbStore'
import { useTheme, type ThemePreference } from '@/stores/themeStore'
import { formatTimestamp } from '@/utils/dates'
import { cn } from '@/lib/cn'

const themes: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'light', label: 'Light', description: 'Warm paper and charcoal ink.' },
  { value: 'dark', label: 'Dark', description: 'A dim room with the same structure.' },
  { value: 'system', label: 'System', description: 'Follow this device.' },
]

export function SettingsPage() {
  const { user } = useAuth()
  const { preference, setPreference } = useTheme()
  useDocumentTitle('Settings')
  usePageBreadcrumbs([
    { label: 'Dashboard', to: '/' },
    { label: 'Settings' },
  ])

  return (
    <div className="max-w-3xl">
      <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">Settings</h1>
      <p className="mt-2 text-sm text-muted">Account and appearance for this browser.</p>

      <section id="appearance" className="mt-10 scroll-mt-20">
        <h2 className="text-base font-semibold">Appearance</h2>
        <fieldset className="mt-4">
          <legend className="text-sm text-muted">Theme</legend>
          <div className="mt-3 grid gap-2">
            {themes.map((theme) => {
              const selected = preference === theme.value
              return (
                <label
                  key={theme.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3',
                    selected ? 'border-foreground' : 'border-border',
                  )}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={theme.value}
                    checked={selected}
                    onChange={() => setPreference(theme.value)}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">{theme.label}</span>
                    <span className="block text-sm text-muted">{theme.description}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="text-base font-semibold">Authentication / Security</h2>
        <dl className="mt-4 border-t border-border">
          {[
            { label: 'Email', value: user?.email ?? '—' },
            { label: 'Role', value: user?.role ?? '—' },
            { label: 'Last sign-in', value: formatTimestamp(user?.lastLoginOn ?? null) },
          ].map((row) => (
            <div key={row.label} className="grid gap-1 border-b border-border py-3 sm:grid-cols-[180px_1fr]">
              <dt className="text-sm text-muted">{row.label}</dt>
              <dd className="text-sm">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
