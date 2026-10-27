import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Eye, Image as ImageIcon, Info, Loader2, Upload } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ApiError, apiBaseUrl } from '@/api/client'
import { fontApi } from '@/api/fontApi'
import { invitationApi } from '@/api/invitationApi'
import { rsvpApi, type RsvpPageSettings, type RsvpPreviewView } from '@/api/rsvpApi'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

const DEFAULT_REASONS = ['I have a prior commitment', 'Personal reasons.']

/**
 * RSVP page settings: what guests see after tapping Accept or Decline. Four numbered sections
 * (appearance, confirmation messages, after accepting, after declining) and previews of each step.
 */
export function RsvpPageSettingsSection({
  eventId,
  askDeclineReason,
  askPending,
  onAskDeclineReason,
}: {
  eventId: string
  askDeclineReason: boolean
  askPending: boolean
  onAskDeclineReason: (value: boolean) => void
}) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['rsvp-page', eventId], queryFn: () => rsvpApi.getPage(eventId) })
  const fontsQuery = useQuery({ queryKey: ['event-fonts', eventId], queryFn: () => fontApi.list(eventId) })
  const [draft, setDraft] = useState<RsvpPageSettings | null>(null)
  const [reasons, setReasons] = useState('')
  const [uploading, setUploading] = useState<'background' | 'logo' | null>(null)
  const [previewing, setPreviewing] = useState<RsvpPreviewView | null>(null)

  useEffect(() => {
    if (!query.data) return
    setDraft(query.data)
    setReasons((query.data.declineReasons ?? DEFAULT_REASONS).join('\n'))
  }, [query.data])

  const save = useMutation({
    // Empty texts are left out, so the server uses its default wording instead of rejecting the save.
    mutationFn: (value: RsvpPageSettings) =>
      rsvpApi.savePage(
        eventId,
        Object.fromEntries(Object.entries(value).filter(([, item]) => !(typeof item === 'string' && item.trim() === ''))) as RsvpPageSettings,
      ),
    onSuccess: (saved) => {
      queryClient.setQueryData(['rsvp-page', eventId], saved)
      toast.success('RSVP page saved.')
    },
    onError: (error) => {
      const field = error instanceof ApiError && error.errors ? Object.values(error.errors)[0]?.[0] : undefined
      toast.error(field ?? (error instanceof ApiError ? error.message : 'The RSVP page could not be saved.'))
    },
  })

  if (!draft || !query.data) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted" aria-busy="true">
        Loading the RSVP page settings…
      </section>
    )
  }

  const settings: RsvpPageSettings = { ...draft, declineReasons: reasons.split('\n').map((line) => line.trim()).filter(Boolean) }
  const savedSettings = { ...query.data, declineReasons: query.data.declineReasons ?? DEFAULT_REASONS }
  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)
  const set = (change: Partial<RsvpPageSettings>) => setDraft({ ...draft, ...change })
  const text = (key: keyof RsvpPageSettings) => ({
    value: String(draft[key] ?? ''),
    onChange: (value: string) => set({ [key]: value } as Partial<RsvpPageSettings>),
  })

  async function upload(kind: 'background' | 'logo', file: File) {
    setUploading(kind)
    try {
      const asset = await invitationApi.uploadAsset(eventId, file)
      set(kind === 'background' ? { backgroundAssetId: asset.id } : { logoAssetId: asset.id })
    } catch {
      toast.error('The image could not be uploaded. Use a PNG, JPG or WEBP up to 15 MB.')
    } finally {
      setUploading(null)
    }
  }

  async function preview(view: RsvpPreviewView) {
    const tab = window.open('', '_blank')
    setPreviewing(view)
    try {
      const html = await rsvpApi.previewPage(eventId, settings, view)
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      if (tab) tab.location.href = url
      else window.open(url, '_blank')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      tab?.close()
      toast.error('The preview could not be opened.')
    } finally {
      setPreviewing(null)
    }
  }

  return (
    <section aria-labelledby="rsvp-page-title" className="rounded-2xl border border-border bg-surface p-5 sm:p-7">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h2 id="rsvp-page-title" className="text-2xl font-semibold tracking-[-0.01em]">
            RSVP page settings
          </h2>
          <p className="mt-1 text-sm text-muted">Customize what guests see when they accept or decline.</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Info className="size-3.5 shrink-0" aria-hidden="true" />
            Used on the event domain and on guests&apos; personal invitation links.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['confirm-accept', 'Preview accept'],
              ['confirm-decline', 'Preview decline'],
              ['accepted', 'Preview thank you'],
              ['declined', 'Preview declined'],
            ] as const
          ).map(([view, label]) => (
            <Button key={view} variant="secondary" className="h-9 px-3 text-xs" disabled={previewing !== null} onClick={() => void preview(view)}>
              {previewing === view ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* 01 Appearance */}
      <Step number="01" title="Appearance">
        <div className="grid gap-5 md:grid-cols-2 md:divide-x md:divide-border">
          <ImagePick
            label="Background image"
            assetId={draft.backgroundAssetId}
            busy={uploading === 'background'}
            onFile={(file) => void upload('background', file)}
            onClear={() => set({ backgroundAssetId: null })}
          />
          <div className="md:pl-5">
            <ImagePick
              label="Logo (top right)"
              assetId={draft.logoAssetId}
              busy={uploading === 'logo'}
              contain
              onFile={(file) => void upload('logo', file)}
              onClear={() => set({ logoAssetId: null })}
            />
          </div>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:divide-x lg:divide-border">
          <Field label="Font" hint="Upload fonts in the invitation designer's Fonts settings.">
            <div className="relative">
              <select
                value={draft.fontId ?? ''}
                onChange={(event) => set({ fontId: event.target.value || null })}
                className="h-11 w-full appearance-none rounded-lg border border-border bg-background px-3.5 pr-10 text-sm"
              >
                <option value="">Manifa Pro / Tahoma (default)</option>
                {(fontsQuery.data ?? []).map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:pl-5">
            <ColorField label="Background" value={draft.backgroundColor} onChange={(value) => set({ backgroundColor: value })} />
            <ColorField label="Text" value={draft.textColor} onChange={(value) => set({ textColor: value })} />
            <ColorField label="Button background" value={draft.buttonColor} onChange={(value) => set({ buttonColor: value })} />
            <ColorField label="Button text" value={draft.buttonTextColor} onChange={(value) => set({ buttonTextColor: value })} />
          </div>
        </div>
      </Step>

      {/* 02 Confirmation messages */}
      <Step number="02" title="Confirmation messages" subtitle="Shown before a guest confirms their response.">
        <div className="grid gap-5 md:grid-cols-2 md:divide-x md:divide-border">
          <div className="grid gap-4">
            <TextInput label="Accept confirmation" {...text('confirmAcceptText')} />
            <TextInput label="Accept button label" {...text('acceptButton')} />
          </div>
          <div className="grid gap-4 md:pl-5">
            <TextInput label="Decline confirmation" {...text('confirmDeclineText')} />
            <TextInput label="Decline button label" {...text('declineButton')} />
          </div>
        </div>
      </Step>

      {/* 03 After accepting */}
      <Step number="03" title="After accepting" subtitle="Shown after a guest confirms attendance.">
        <div className="grid gap-4">
          <TextArea label="Thank-you message" {...text('thankYouText')} />
          <TextArea label="Text below the QR code" {...text('qrText')} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Download button label" {...text('downloadButton')} />
            <TextInput label="Wallet button label" {...text('walletButton')} />
          </div>
          <TextArea label="Entry information" {...text('infoText')} />
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <TextInput label="Contact line" {...text('contactText')} />
            <TextInput label="Sign-off" {...text('signOff')} />
          </div>
        </div>
      </Step>

      {/* 04 After declining */}
      <Step number="04" title="After declining" subtitle="Shown after a guest declines." last>
        <div className="grid gap-4">
          <TextArea label="Decline thank-you message" {...text('declineText')} />
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={askDeclineReason}
              disabled={askPending}
              onChange={(event) => onAskDeclineReason(event.target.checked)}
            />
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent',
                askDeclineReason ? 'border-accent bg-accent text-accent-foreground' : 'border-border bg-background',
              )}
            >
              {askDeclineReason ? <Check className="size-4" strokeWidth={3} /> : null}
            </span>
            <span>
              <span className="block text-sm font-semibold">Ask for a reason when a guest declines</span>
              <span className="block text-sm text-muted">Adds an optional reason field to the decline confirmation page.</span>
            </span>
          </label>
          <div className={cn('grid gap-4', !askDeclineReason && 'opacity-60')}>
            <TextArea label="Decline reason question" rows={2} {...text('reasonsPrompt')} />
            <TextArea label="Decline reasons" rows={3} value={reasons} onChange={setReasons} hint={'One reason per line. “Other” is always included.'} />
          </div>
        </div>
      </Step>

      {/* Footer */}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
        {dirty ? (
          <>
            <span className="mr-auto text-sm text-muted">You have unsaved changes.</span>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(query.data)
                setReasons((query.data.declineReasons ?? DEFAULT_REASONS).join('\n'))
              }}
            >
              Discard
            </Button>
          </>
        ) : null}
        <Button className="h-11 px-6 text-base" disabled={!dirty || save.isPending} onClick={() => save.mutate(settings)}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {save.isPending ? 'Saving…' : 'Save RSVP page'}
        </Button>
      </div>
    </section>
  )
}

function Step({ number, title, subtitle, last, children }: { number: string; title: string; subtitle?: string; last?: boolean; children: ReactNode }) {
  return (
    <section className={cn('py-6', !last && 'border-b border-border')}>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold tabular-nums text-accent-foreground">
          {number}
        </span>
        <h3 className="text-lg font-semibold">{title}</h3>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  )
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm" />
    </label>
  )
}

function TextArea({ label, value, onChange, rows = 2, hint }: { label: string; value: string; onChange: (value: string) => void; rows?: number; hint?: string }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm leading-relaxed"
      />
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="truncate text-sm font-medium">{label}</span>
      <span className="flex h-11 items-center gap-2.5 rounded-lg border border-border bg-background px-2.5">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="size-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
          aria-label={`${label} colour`}
        />
        <span className="truncate font-mono text-xs">{value}</span>
      </span>
    </label>
  )
}

function ImagePick({
  label,
  assetId,
  busy,
  contain,
  onFile,
  onClear,
}: {
  label: string
  assetId: string | null
  busy: boolean
  contain?: boolean
  onFile: (file: File) => void
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-5">
      <div className={cn('flex h-[86px] w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border', contain ? 'bg-[#1b1b19]' : 'bg-hover')}>
        {assetId ? (
          <img src={`${apiBaseUrl}/api/public/assets/${assetId}`} alt="" className={cn('size-full', contain ? 'object-contain p-1.5' : 'object-cover')} />
        ) : (
          <ImageIcon className="size-6 text-muted" aria-hidden="true" />
        )}
      </div>
      <div className="grid gap-2.5">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-border px-4 text-sm font-medium hover:bg-hover focus-within:ring-2 focus-within:ring-accent">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            {assetId ? 'Replace' : 'Upload'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
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
