import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, ExternalLink, Info, Loader2, Paintbrush, QrCode, Users } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { guestGroupApi } from '@/api/guestGroupApi'
import { guestTypeApi } from '@/api/guestTypeApi'
import { registrationApi, type RegistrationSettings } from '@/api/registrationApi'
import { Button, buttonClassName } from '@/components/ui/Button'
import { Badge } from '@/components/ui/StatusBadge'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { cn } from '@/lib/cn'
import { cleanRegistration } from '@/pages/Events/RegistrationDesignerPage'

type Publishing = Pick<RegistrationSettings, 'open' | 'guestTypeId' | 'guestGroupId' | 'closesOn' | 'capacity'>
const publishingOf = (settings: RegistrationSettings): Publishing => ({
  open: settings.open,
  guestTypeId: settings.guestTypeId,
  guestGroupId: settings.guestGroupId,
  closesOn: settings.closesOn,
  capacity: settings.capacity,
})

/**
 * Self-registration (direct RSVP): publish the page, share its link and QR, choose where sign-ups go and set
 * limits. The form itself is designed under Designs → Self-registration page.
 */
export function RegistrationPage() {
  const { eventId = '' } = useParams()
  const event = useEvent(eventId).data
  useDocumentTitle(event ? `Self-registration · ${event.name}` : 'Self-registration')
  const queryClient = useQueryClient()

  const query = useQuery({ queryKey: ['registration', eventId], queryFn: () => registrationApi.get(eventId), enabled: Boolean(eventId), refetchInterval: 30_000 })
  const typesQuery = useQuery({ queryKey: ['guest-types', eventId], queryFn: () => guestTypeApi.list(eventId), enabled: Boolean(eventId) })
  const groupsQuery = useQuery({ queryKey: ['guest-groups', eventId], queryFn: () => guestGroupApi.list(eventId), enabled: Boolean(eventId) })

  const [draft, setDraft] = useState<Publishing | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const saved = query.data?.settings

  useEffect(() => {
    if (saved && !draft) setDraft(publishingOf(saved))
  }, [saved, draft])

  // QR code for the public page (refreshed when the address changes).
  const publicUrl = query.data?.publicUrl
  useEffect(() => {
    if (!publicUrl) return
    let url: string | null = null
    let cancelled = false
    registrationApi
      .qr(eventId)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setQrUrl(url)
      })
      .catch(() => setQrUrl(null))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [eventId, publicUrl])

  const save = useMutation({
    // Only publishing changes here; the design is whatever is saved now.
    mutationFn: async (value: Publishing) => {
      const latest = (await registrationApi.get(eventId)).settings
      return registrationApi.save(eventId, cleanRegistration({ ...latest, ...value }))
    },
    onSuccess: (info) => {
      queryClient.setQueryData(['registration', eventId], info)
      setDraft(publishingOf(info.settings))
      toast.success(info.acceptingNow ? 'Registration page saved and live.' : 'Registration page saved.')
    },
    onError: (error) => {
      const field = error instanceof ApiError && error.errors ? Object.values(error.errors)[0]?.[0] : undefined
      toast.error(field ?? (error instanceof ApiError ? error.message : 'The registration page could not be saved.'))
    },
  })

  if (!event) return null
  if (query.isLoading || !draft || !query.data || !saved) return <p className="text-sm text-muted">Loading the registration page…</p>

  const info = query.data
  const dirty = JSON.stringify(draft) !== JSON.stringify(publishingOf(saved))
  const set = (change: Partial<Publishing>) => setDraft({ ...draft, ...change })
  const types = typesQuery.data ?? []
  const chosenType = types.find((type) => type.id === draft.guestTypeId)

  const state = !info.eventActive
    ? { tone: 'amber' as const, label: event.status === 'Archived' ? 'Finished' : 'Event not live' }
    : info.acceptingNow
      ? { tone: 'teal' as const, label: 'Live' }
      : { tone: 'gray' as const, label: draft.open ? 'Closed' : 'Not published' }

  return (
    <div className="flex flex-col gap-6">
      {/* Publish card */}
      <section className="rounded-md border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold tracking-tight">Self-registration</h2>
              <Badge tone={state.tone}>{state.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">{info.stateText}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={`/events/${eventId}/guests`}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-hover"
              title="Registrations join the guest list as Accepted"
            >
              <Users className="size-4 text-accent" aria-hidden="true" />
              <span className="tabular-nums font-semibold">{info.registrations}</span>
              <span className="text-muted">registered</span>
            </Link>
            <Link to={`/events/${eventId}/registration/design`} className={buttonClassName('secondary')}>
              <Paintbrush className="size-4" aria-hidden="true" />
              Edit design
            </Link>
            <Toggle label="Accept registrations" checked={draft.open} onChange={(open) => set({ open })} />
          </div>
        </div>

        <div className="mt-5 grid gap-5 border-t border-border pt-5 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Public link</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2.5 text-sm">{info.publicUrl}</code>
              <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(info.publicUrl).then(() => toast.success('Link copied.'))}>
                <Copy className="size-4" aria-hidden="true" />
                Copy
              </Button>
              <Button variant="secondary" onClick={() => window.open(info.publicUrl, '_blank', 'noopener')}>
                <ExternalLink className="size-4" aria-hidden="true" />
                Open
              </Button>
            </div>
            <p className="mt-2 flex items-start gap-2 text-xs text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
              {info.onEventDomain
                ? 'On the event’s own domain. Share the link or the QR code on posters, emails and social media.'
                : 'Set up and confirm the event domain (event settings) to use eventdomain.com/register. Until then this app address works.'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex size-32 items-center justify-center rounded-md bg-white p-2">
              {qrUrl ? <img src={qrUrl} alt="QR code to the registration page" className="size-full" /> : <QrCode className="size-8 text-neutral-400" aria-hidden="true" />}
            </div>
            <div className="grid gap-2">
              <Button
                variant="secondary"
                disabled={!qrUrl}
                onClick={() => {
                  if (!qrUrl) return
                  const link = document.createElement('a')
                  link.href = qrUrl
                  link.download = `${event.slug || 'event'}-registration-qr.png`
                  link.click()
                }}
              >
                <Download className="size-4" aria-hidden="true" />
                Download QR
              </Button>
              <p className="max-w-40 text-xs text-muted">High-resolution PNG for print.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Step title="Where sign-ups go" subtitle="Every registration is added to the guest list as Accepted.">
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Guest category</span>
              <select
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={draft.guestTypeId ?? ''}
                onChange={(change) => set({ guestTypeId: change.target.value || null })}
              >
                <option value="">No guest category</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
              <span className={cn('text-xs', chosenType?.badgeConfigured ? 'text-muted' : 'text-warning')}>
                {chosenType
                  ? chosenType.badgeConfigured
                    ? 'Guests can download their digital pass right after registering.'
                    : `${chosenType.name} has no digital pass design yet; guests will see their QR code only.`
                  : 'Choose a guest category with a digital pass design so guests can download their pass.'}
              </span>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Group</span>
              <select
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={draft.guestGroupId ?? ''}
                onChange={(change) => set({ guestGroupId: change.target.value || null })}
              >
                <option value="">“Self-registered” (created automatically)</option>
                {(groupsQuery.data ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">Keeps registrations together on the Guests page.</span>
            </label>
          </div>
        </Step>

        <Step title="Limits" subtitle="Optional. Leave empty for no limit.">
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Closes on</span>
              <input
                type="datetime-local"
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={toLocalInput(draft.closesOn)}
                onChange={(change) => set({ closesOn: change.target.value ? new Date(change.target.value).toISOString() : null })}
              />
              <span className="text-xs text-muted">Your local time. The page closes automatically.</span>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Maximum registrations</span>
              <input
                type="number"
                min={1}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={draft.capacity ?? ''}
                placeholder="No limit"
                onChange={(change) => set({ capacity: change.target.value ? Math.max(1, Math.round(Number(change.target.value))) : null })}
              />
              <span className="text-xs text-muted tabular-nums">{info.registrations} registered so far.</span>
            </label>
          </div>
        </Step>
      </div>

      {/* Save bar */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background px-1 py-4">
        {dirty ? (
          <>
            <span className="mr-auto text-sm text-muted">You have unsaved changes.</span>
            <Button variant="secondary" onClick={() => setDraft(publishingOf(saved))}>
              Discard
            </Button>
          </>
        ) : null}
        <Button className="px-6" disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {save.isPending ? 'Saving…' : draft.open ? 'Save & publish' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function Step({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold">{title}</h3>
        {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="flex items-center gap-2.5 text-sm" onClick={() => onChange(!checked)}>
      <span className={cn('relative h-6 w-11 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-border')}>
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-white transition-all', checked ? 'left-[1.375rem]' : 'left-0.5')} />
      </span>
      <span className="font-medium">{label}</span>
    </button>
  )
}
