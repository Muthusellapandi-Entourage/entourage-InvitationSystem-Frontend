import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, Image as ImageIcon, Info, Link2Off, Loader2, MonitorSmartphone, RefreshCw, Upload } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ApiError, apiBaseUrl } from '@/api/client'
import { invitationApi } from '@/api/invitationApi'
import { kioskApi, kioskUrl, type KioskSettings } from '@/api/printBadgeApi'
import { KioskScreen, type KioskStep } from '@/components/kiosk/KioskScreen'
import { AlphaColorInput } from '@/components/ui/AlphaColorInput'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { sampleGuest } from '@/printing/PrintBadgeView'

const assetOrigin = apiBaseUrl || window.location.origin

type PreviewStep = 'welcome' | 'confirm' | 'printing' | 'done' | 'error'

/**
 * Self check-in kiosk (Scanner tab): the secret kiosk link, and the kiosk's wording, look and behaviour
 * with a live preview of every step.
 */
export function KioskSettingsSection({ eventId, eventName }: { eventId: string; eventName: string }) {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({ queryKey: ['kiosk-settings', eventId], queryFn: () => kioskApi.settings(eventId) })
  const shareQuery = useQuery({ queryKey: ['kiosk-share', eventId], queryFn: () => kioskApi.share(eventId) })
  const [draft, setDraft] = useState<KioskSettings | null>(null)
  const [preview, setPreview] = useState<PreviewStep>('welcome')
  const [uploading, setUploading] = useState<'background' | 'logo' | null>(null)

  useEffect(() => {
    if (settingsQuery.data && !draft) setDraft(settingsQuery.data)
  }, [settingsQuery.data, draft])

  const save = useMutation({
    mutationFn: (value: KioskSettings) => kioskApi.saveSettings(eventId, value),
    onSuccess: (saved) => {
      queryClient.setQueryData(['kiosk-settings', eventId], saved)
      setDraft(saved)
      toast.success('Kiosk saved.')
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'The kiosk could not be saved.'),
  })
  const share = useMutation({
    mutationFn: (kind: 'renew' | 'disable') => (kind === 'renew' ? kioskApi.renew(eventId) : kioskApi.disable(eventId)),
    onSuccess: (result) => {
      queryClient.setQueryData(['kiosk-share', eventId], result)
      toast.success(result.token ? 'Kiosk link ready.' : 'Kiosk link turned off.')
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'That did not work.'),
  })

  if (!draft || !settingsQuery.data) return <p className="text-sm text-muted">Loading the kiosk…</p>

  const dirty = JSON.stringify(draft) !== JSON.stringify(settingsQuery.data)
  const set = (change: Partial<KioskSettings>) => setDraft({ ...draft, ...change })
  const token = shareQuery.data?.token ?? null
  const url = token ? kioskUrl(token) : null

  async function upload(kind: 'background' | 'logo', file: File) {
    setUploading(kind)
    try {
      const asset = await invitationApi.uploadAsset(eventId, file)
      setDraft((current) => (current ? { ...current, ...(kind === 'background' ? { backgroundAssetId: asset.id } : { logoAssetId: asset.id }) } : current))
    } catch {
      toast.error('The image could not be uploaded. Use a PNG, JPG or WEBP up to 15 MB.')
    } finally {
      setUploading(null)
    }
  }

  const steps: Record<PreviewStep, KioskStep> = {
    welcome: { kind: 'welcome' },
    confirm: { kind: 'confirm', guest: sampleGuest, already: false },
    printing: { kind: 'printing', guest: sampleGuest },
    done: { kind: 'done', guest: sampleGuest },
    error: { kind: 'error', message: draft.notFoundText },
  }

  return (
    <section className="rounded-md border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
            <MonitorSmartphone className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Self check-in kiosk</h2>
            <p className="text-sm text-muted">Guests scan their E-Badge, confirm it’s them, and their badge prints. No staff needed.</p>
          </div>
        </div>
        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate(draft)}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Save kiosk
        </Button>
      </div>

      {/* Link */}
      <div className="border-b border-border py-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Kiosk link</p>
        {url ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-3 py-2.5 text-sm text-accent">{url}</code>
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success('Kiosk link copied.'))}>
              <Copy className="size-4" aria-hidden="true" />
              Copy
            </Button>
            <Button variant="secondary" onClick={() => window.open(url, '_blank', 'noopener')}>
              <ExternalLink className="size-4" aria-hidden="true" />
              Open
            </Button>
            <Button variant="secondary" disabled={share.isPending} onClick={() => window.confirm('Make a new link? The current kiosk link stops working.') && share.mutate('renew')}>
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
            <p className="text-sm text-muted">No kiosk link yet.</p>
            <Button disabled={share.isPending} onClick={() => share.mutate('renew')}>
              Create kiosk link
            </Button>
          </div>
        )}
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
          Open the link on the kiosk laptop with a USB scanner (or a tablet with its camera) and the badge printer set as the default printer. To print without the
          dialog, start Chrome in kiosk mode: <code className="font-mono">chrome --kiosk --kiosk-printing {url ?? '<kiosk link>'}</code>
        </p>
      </div>

      <div className="grid gap-6 pt-5 xl:grid-cols-12">
        {/* Settings */}
        <div className="grid content-start gap-6 xl:col-span-6">
          <Group title="Behaviour">
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

          <Group title="Wording">
            <Text label="Welcome title" value={draft.welcomeTitle} onChange={(welcomeTitle) => set({ welcomeTitle })} />
            <Text label="Welcome message" value={draft.welcomeText} onChange={(welcomeText) => set({ welcomeText })} area />
            <div className="grid gap-3 md:grid-cols-3">
              <Text label="Confirm title" value={draft.confirmTitle} onChange={(confirmTitle) => set({ confirmTitle })} />
              <Text label="Confirm button" value={draft.confirmButton} onChange={(confirmButton) => set({ confirmButton })} />
              <Text label="Cancel button" value={draft.cancelButton} onChange={(cancelButton) => set({ cancelButton })} />
            </div>
            <Text label="While printing" value={draft.printingText} onChange={(printingText) => set({ printingText })} />
            <Text label="Done title" value={draft.doneTitle} onChange={(doneTitle) => set({ doneTitle })} />
            <Text label="Done message" value={draft.doneText} onChange={(doneText) => set({ doneText })} area />
            <Text label="Already checked in" value={draft.alreadyText} onChange={(alreadyText) => set({ alreadyText })} />
            <Text label="Badge not found" value={draft.notFoundText} onChange={(notFoundText) => set({ notFoundText })} />
            <Text label="Guest declined" value={draft.declinedText} onChange={(declinedText) => set({ declinedText })} />
          </Group>

          <Group title="Look">
            <div className="grid gap-4 md:grid-cols-2">
              <ImagePick label="Background image" assetId={draft.backgroundAssetId} busy={uploading === 'background'} onFile={(file) => void upload('background', file)} onClear={() => set({ backgroundAssetId: null })} />
              <ImagePick label="Logo" assetId={draft.logoAssetId} busy={uploading === 'logo'} onFile={(file) => void upload('logo', file)} onClear={() => set({ logoAssetId: null })} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Colour label="Background" value={draft.backgroundColor} onChange={(backgroundColor) => set({ backgroundColor })} />
              <Colour label="Card" value={draft.cardColor} onChange={(cardColor) => set({ cardColor })} />
              <Colour label="Text" value={draft.textColor} onChange={(textColor) => set({ textColor })} />
              <Colour label="Button" value={draft.accentColor} onChange={(accentColor) => set({ accentColor })} />
              <Colour label="Button text" value={draft.accentTextColor} onChange={(accentTextColor) => set({ accentTextColor })} />
            </div>
          </Group>
        </div>

        {/* Preview */}
        <div className="xl:col-span-6">
          <div className="sticky top-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Preview</p>
              <div className="flex rounded-md border border-border p-0.5">
                {(['welcome', 'confirm', 'printing', 'done', 'error'] as PreviewStep[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={preview === value}
                    className={cn('h-7 rounded-sm px-2.5 text-xs font-medium capitalize', preview === value ? 'bg-accent-soft text-accent' : 'text-muted hover:text-foreground')}
                    onClick={() => setPreview(value)}
                  >
                    {value === 'confirm' ? 'Is this you?' : value}
                  </button>
                ))}
              </div>
            </div>
            <div className="aspect-[16/10] overflow-hidden rounded-md border border-border">
              <div className="pointer-events-none size-full">
                <KioskScreen settings={draft} eventName={eventName} assetOrigin={assetOrigin} step={steps[preview]} countdown={draft.resetSeconds} preview />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">The kiosk fills the whole screen. Badges print with each guest type’s print badge design.</p>
          </div>
        </div>
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

function Text({ label, value, onChange, area }: { label: string; value: string; onChange: (value: string) => void; area?: boolean }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {area ? (
        <textarea rows={2} className="resize-y rounded-md border border-border bg-background px-3 py-2 text-sm" value={value} onChange={(change) => onChange(change.target.value)} />
      ) : (
        <input className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={value} onChange={(change) => onChange(change.target.value)} />
      )}
    </label>
  )
}

function Colour({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <AlphaColorInput label={label} value={value} onChange={onChange} />
    </div>
  )
}

function ImagePick({ label, assetId, busy, onFile, onClear }: { label: string; assetId: string | null; busy: boolean; onFile: (file: File) => void; onClear: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
        {assetId ? <img src={`${assetOrigin}/api/public/assets/${assetId}`} alt="" className="size-full object-contain p-1" /> : <ImageIcon className="size-5 text-muted" aria-hidden="true" />}
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-3">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-hover">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            {assetId ? 'Replace' : 'Upload'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(change) => {
                const file = change.target.files?.[0]
                change.target.value = ''
                if (file) onFile(file)
              }}
            />
          </label>
          {assetId ? (
            <button type="button" className="text-sm font-medium text-danger hover:underline" onClick={onClear}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
