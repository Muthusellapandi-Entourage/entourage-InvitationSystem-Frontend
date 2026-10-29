import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, Info, Link2Off, Loader2, MonitorSmartphone, Paintbrush, RefreshCw } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError, apiBaseUrl } from '@/api/client'
import { kioskApi, kioskUrl, type KioskSettings } from '@/api/printBadgeApi'
import { KioskScreen } from '@/components/kiosk/KioskScreen'
import { Button, buttonClassName } from '@/components/ui/Button'

const assetOrigin = apiBaseUrl || window.location.origin

type Behaviour = Pick<KioskSettings, 'allowReprint' | 'showSeat' | 'useCamera' | 'resetSeconds'>
const behaviourOf = (settings: KioskSettings): Behaviour => ({
  allowReprint: settings.allowReprint,
  showSeat: settings.showSeat,
  useCamera: settings.useCamera,
  resetSeconds: settings.resetSeconds,
})

/**
 * Self check-in (Check-in tab): the secret link and how the screen behaves on the day. Its wording and
 * look are designed under Designs → Self check-in screen.
 */
export function KioskSettingsSection({ eventId, eventName }: { eventId: string; eventName: string }) {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({ queryKey: ['kiosk-settings', eventId], queryFn: () => kioskApi.settings(eventId) })
  const shareQuery = useQuery({ queryKey: ['kiosk-share', eventId], queryFn: () => kioskApi.share(eventId) })
  const [draft, setDraft] = useState<Behaviour | null>(null)

  useEffect(() => {
    if (settingsQuery.data && !draft) setDraft(behaviourOf(settingsQuery.data))
  }, [settingsQuery.data, draft])

  const save = useMutation({
    // Only the behaviour changes here; the design is whatever is saved now.
    mutationFn: async (value: Behaviour) => kioskApi.saveSettings(eventId, { ...(await kioskApi.settings(eventId)), ...value }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['kiosk-settings', eventId], saved)
      setDraft(behaviourOf(saved))
      toast.success('Self check-in saved.')
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'The self check-in settings could not be saved.'),
  })
  const share = useMutation({
    mutationFn: (kind: 'renew' | 'disable') => (kind === 'renew' ? kioskApi.renew(eventId) : kioskApi.disable(eventId)),
    onSuccess: (result) => {
      queryClient.setQueryData(['kiosk-share', eventId], result)
      toast.success(result.token ? 'Self check-in link ready.' : 'Self check-in link turned off.')
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'That did not work.'),
  })

  if (!draft || !settingsQuery.data) return <p className="text-sm text-muted">Loading self check-in…</p>

  const dirty = JSON.stringify(draft) !== JSON.stringify(behaviourOf(settingsQuery.data))
  const set = (change: Partial<Behaviour>) => setDraft({ ...draft, ...change })
  const token = shareQuery.data?.token ?? null
  const url = token ? kioskUrl(token) : null

  return (
    <section className="rounded-md border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
            <MonitorSmartphone className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Self check-in screen</h2>
            <p className="text-sm text-muted">Guests scan their digital pass, confirm it’s them, and their badge prints. No staff needed.</p>
          </div>
        </div>
        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Save
        </Button>
      </div>

      {/* Link */}
      <div className="border-b border-border py-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Self check-in link</p>
        {url ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2.5 text-sm text-accent">{url}</code>
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success('Self check-in link copied.'))}>
              <Copy className="size-4" aria-hidden="true" />
              Copy
            </Button>
            <Button variant="secondary" onClick={() => window.open(url, '_blank', 'noopener')}>
              <ExternalLink className="size-4" aria-hidden="true" />
              Open
            </Button>
            <Button variant="secondary" disabled={share.isPending} onClick={() => window.confirm('Make a new link? The current self check-in link stops working.') && share.mutate('renew')}>
              <RefreshCw className="size-4" aria-hidden="true" />
              New link
            </Button>
            <Button variant="danger" disabled={share.isPending} onClick={() => share.mutate('disable')}>
              <Link2Off className="size-4" aria-hidden="true" />
              Turn off
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted">No self check-in link yet.</p>
            <Button disabled={share.isPending} onClick={() => share.mutate('renew')}>
              Create self check-in link
            </Button>
          </div>
        )}
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
          Open the link on the self check-in laptop with a USB scanner (or a tablet with its camera) and the badge printer set as the default printer. To print without the
          print window popping up, start Chrome like this: <code className="font-mono">chrome --kiosk --kiosk-printing {url ?? '<self check-in link>'}</code>
        </p>
      </div>

      <div className="grid gap-6 pt-5 md:grid-cols-2">
        <Group title="On the day">
          <Toggle label="Allow guests to print their badge again" hint="If off, a second scan sends them to the front desk." checked={draft.allowReprint} onChange={(allowReprint) => set({ allowReprint })} />
          <Toggle label="Show the guest’s table and seat" checked={draft.showSeat} onChange={(showSeat) => set({ showSeat })} />
          <Toggle label="Use the camera to scan" hint="For tablets. Leave off for a USB / Bluetooth scanner." checked={draft.useCamera} onChange={(useCamera) => set({ useCamera })} />
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Back to the start after (seconds)</span>
            <input
              type="number"
              min={3}
              max={60}
              className="h-10 w-32 rounded-md border border-border bg-background px-3 text-sm"
              value={draft.resetSeconds}
              onChange={(change) => set({ resetSeconds: Math.max(3, Math.min(60, Number(change.target.value) || 8)) })}
            />
          </label>
        </Group>

        <Group title="Design">
          <Link to={`/events/${eventId}/check-in/design`} className="group block overflow-hidden rounded-md border border-border hover:border-accent" title="Edit the self check-in screen design">
            <div className="pointer-events-none aspect-[16/10] overflow-hidden">
              <div style={{ width: 1280, height: 800, transform: 'scale(0.3)', transformOrigin: '0 0' }}>
                <KioskScreen settings={settingsQuery.data} eventName={eventName} assetOrigin={assetOrigin} step={{ kind: 'welcome' }} countdown={settingsQuery.data.resetSeconds} preview />
              </div>
            </div>
          </Link>
          <Link to={`/events/${eventId}/check-in/design`} className={buttonClassName('secondary', 'w-fit')}>
            <Paintbrush className="size-4" aria-hidden="true" />
            Edit design
          </Link>
        </Group>
      </div>
    </section>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">{title}</h3>
      <div className="grid gap-3">{children}</div>
    </div>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={checked} onChange={(change) => onChange(change.target.checked)} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  )
}
