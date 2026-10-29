import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, FolderPlus, Loader2, Pencil, Plus, Trash2, Type, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { brandApi, toBrandKitWrite, type BrandColor, type BrandGroup, type BrandKit } from '@/api/brandApi'
import { apiBaseUrl } from '@/api/client'
import { fontApi } from '@/api/fontApi'
import { invitationApi } from '@/api/invitationApi'
import { registerBrandFonts } from '@/brand/useBrandKit'
import { AlphaColorInput } from '@/components/ui/AlphaColorInput'
import { Button, buttonClassName } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'

type Draft = Pick<BrandKit, 'colors' | 'groups'>

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)

/**
 * The event's brand kit: colours (offered in every colour picker), logos, backgrounds, custom image groups
 * (offered as "Brand kit" next to every image upload) and fonts (offered in every font list).
 * Changes save automatically.
 */
export function BrandKitPage() {
  const { eventId = '' } = useParams()
  const [params] = useSearchParams()
  const isNew = params.get('new') === '1'
  const queryClient = useQueryClient()
  useDocumentTitle('Brand kit')
  const query = useQuery({ queryKey: ['brand-kit', 'event', eventId], queryFn: () => brandApi.get(eventId) })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [savedJson, setSavedJson] = useState<string>('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (query.data && draft === null) {
      const initial = { colors: query.data.colors, groups: query.data.groups }
      setDraft(initial)
      setSavedJson(JSON.stringify(toBrandKitWrite(initial)))
    }
  }, [query.data, draft])

  const save = useMutation({
    mutationFn: (value: Draft) => brandApi.save(eventId, toBrandKitWrite(value)),
    onMutate: () => setSaveState('saving'),
    onSuccess: (kit, value) => {
      setSavedJson(JSON.stringify(toBrandKitWrite(value)))
      queryClient.setQueryData(['brand-kit', 'event', eventId], kit)
      setSaveState('saved')
    },
    onError: (error) => {
      setSaveState('error')
      toast.error(errorText(error, 'The brand kit could not be saved.'))
    },
  })

  // Autosave shortly after each change.
  const latest = useRef(save.mutate)
  latest.current = save.mutate
  useEffect(() => {
    if (!draft) return
    if (JSON.stringify(toBrandKitWrite(draft)) === savedJson) return
    const timer = window.setTimeout(() => latest.current(draft), 700)
    return () => window.clearTimeout(timer)
  }, [draft, savedJson])

  if (query.isLoading || !draft) return <Skeleton className="h-96 w-full" />
  if (query.isError) return <p role="alert" className="text-sm text-danger">{errorText(query.error, 'The brand kit could not be loaded.')}</p>

  const setGroups = (groups: BrandGroup[]) => setDraft({ ...draft, groups })
  const setColors = (colors: BrandColor[]) => setDraft({ ...draft, colors })

  return (
    <div className="grid gap-6">
      {isNew ? (
        <div className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-semibold">Event created.</span> Add the brand elements now — logos, fonts, backgrounds and colours — and they will be ready in
            every designer.
          </p>
          <Link to={`/events/${eventId}`} className={buttonClassName('secondary', 'h-9')}>
            Done for now
          </Link>
        </div>
      ) : null}

      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Brand kit</h2>
          <p className="mt-1 text-sm text-muted">
            Used across invitations, digital passes, printed badges, RSVP and registration pages, the self check-in screen, the microsite and accreditation badges.
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted" role="status">
          {saveState === 'saving' ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : saveState === 'saved' ? <Check className="size-3.5 text-accent" aria-hidden="true" /> : null}
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : saveState === 'error' ? 'Not saved — check your connection' : 'Changes save automatically'}
        </p>
      </div>

      <Card title="Colours" description="Shown as swatches at the top of every colour picker for this event.">
        <ColorsEditor colors={draft.colors} onChange={setColors} />
      </Card>

      {draft.groups.map((group, index) => (
        <ImageGroupCard
          key={group.id}
          eventId={eventId}
          group={group}
          onChange={(next) => setGroups(draft.groups.map((item, at) => (at === index ? next : item)))}
          onDelete={group.kind === 'custom' ? () => setGroups(draft.groups.filter((_, at) => at !== index)) : undefined}
        />
      ))}

      <div>
        <Button
          variant="secondary"
          onClick={() =>
            setGroups([...draft.groups, { id: Math.random().toString(36).slice(2, 12), name: 'New group', kind: 'custom', items: [] }])
          }
        >
          <FolderPlus className="size-4" aria-hidden="true" />
          Add custom group
        </Button>
        <p className="mt-1.5 text-xs text-muted">For anything else you reuse: sponsor logos, icons, patterns, signatures, partner marks…</p>
      </div>

      <FontsCard eventId={eventId} />
    </div>
  )
}

function Card({ title, description, actions, children }: { title: ReactNode; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

function ColorsEditor({ colors, onChange }: { colors: BrandColor[]; onChange: (colors: BrandColor[]) => void }) {
  const update = (index: number, patch: Partial<BrandColor>) => onChange(colors.map((color, at) => (at === index ? { ...color, ...patch } : color)))
  return (
    <div className="grid gap-3">
      {colors.length === 0 ? <p className="text-sm text-muted">No brand colours yet. Paste the hex codes from the brand guidelines.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {colors.map((color, index) => (
          <div key={index} className="flex items-end gap-2 rounded-md border border-border p-2.5">
            <div className="grid min-w-0 flex-1 gap-1.5">
              <input
                aria-label="Colour name"
                value={color.name}
                onChange={(event) => update(index, { name: event.target.value })}
                placeholder="e.g. Primary gold"
                className="h-8 rounded-sm border border-transparent bg-transparent px-1 text-sm font-medium hover:border-border focus:border-accent"
              />
              <AlphaColorInput label={color.name || 'Brand colour'} value={color.hex} onChange={(hex) => update(index, { hex })} />
            </div>
            <button
              type="button"
              aria-label={`Remove ${color.name || 'colour'}`}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-danger"
              onClick={() => onChange(colors.filter((_, at) => at !== index))}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <div>
        <Button
          variant="ghost"
          className="h-9"
          disabled={colors.length >= 40}
          onClick={() => onChange([...colors, { name: colors.length === 0 ? 'Primary' : colors.length === 1 ? 'Secondary' : `Colour ${colors.length + 1}`, hex: '#38B8A2' }])}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add colour
        </Button>
      </div>
    </div>
  )
}

const groupHelp: Record<BrandGroup['kind'], string> = {
  logos: 'Transparent PNGs work best. Add light and dark versions if you have them.',
  backgrounds: 'Full artwork, textures and patterns for invitations, badges and pages.',
  custom: 'Your own image group.',
}

function ImageGroupCard({
  eventId,
  group,
  onChange,
  onDelete,
}: {
  eventId: string
  group: BrandGroup
  onChange: (group: BrandGroup) => void
  onDelete?: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [renaming, setRenaming] = useState(false)

  async function upload(files: File[]) {
    setUploading(files.length)
    const added: BrandGroup['items'] = []
    for (const file of files) {
      try {
        const asset = await invitationApi.uploadAsset(eventId, file)
        added.push({ assetId: asset.id, name: file.name.replace(/\.[^.]+$/, ''), url: `/api/public/assets/${asset.id}` })
      } catch (error) {
        toast.error(`${file.name}: ${errorText(error, 'could not be uploaded')}`)
      } finally {
        setUploading((count) => count - 1)
      }
    }
    if (added.length) onChange({ ...group, items: [...group.items, ...added] })
  }

  return (
    <Card
      title={
        group.kind === 'custom' && renaming ? (
          <input
            autoFocus
            value={group.name}
            onChange={(event) => onChange({ ...group, name: event.target.value })}
            onBlur={() => setRenaming(false)}
            onKeyDown={(event) => event.key === 'Enter' && setRenaming(false)}
            className="h-8 rounded-sm border border-border bg-background px-2 text-base font-semibold"
          />
        ) : (
          <span className="inline-flex items-center gap-2">
            {group.name}
            {group.kind === 'custom' ? (
              <button type="button" aria-label="Rename group" className="text-muted hover:text-foreground" onClick={() => setRenaming(true)}>
                <Pencil className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        )
      }
      description={groupHelp[group.kind]}
      actions={
        <>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              event.target.value = ''
              if (files.length) void upload(files)
            }}
          />
          <Button variant="secondary" className="h-9" disabled={uploading > 0} onClick={() => input.current?.click()}>
            {uploading > 0 ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            {uploading > 0 ? `Uploading ${uploading}…` : 'Upload images'}
          </Button>
          {onDelete ? (
            <Button variant="ghost" className="h-9 text-danger" onClick={onDelete} aria-label={`Delete ${group.name}`}>
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </>
      }
    >
      {group.items.length === 0 ? (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-sm text-muted hover:border-accent hover:text-foreground"
        >
          <Upload className="size-5" aria-hidden="true" />
          Upload PNG, JPG or WEBP (several at once is fine)
        </button>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {group.items.map((item, index) => (
            <li key={item.assetId} className="overflow-hidden rounded-md border border-border">
              <div
                className={cn('flex h-28 items-center justify-center p-2', group.kind === 'backgrounds' ? 'p-0' : '')}
                style={{ background: 'repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 50% / 12px 12px' }}
              >
                <img
                  src={`${apiBaseUrl}${item.url}`}
                  alt={item.name}
                  className={group.kind === 'backgrounds' ? 'size-full object-cover' : 'max-h-full max-w-full object-contain'}
                  loading="lazy"
                />
              </div>
              <div className="flex items-center gap-1 border-t border-border px-1.5 py-1">
                <input
                  aria-label="Image name"
                  value={item.name}
                  onChange={(event) => onChange({ ...group, items: group.items.map((entry, at) => (at === index ? { ...entry, name: event.target.value } : entry)) })}
                  className="h-7 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-1 text-xs hover:border-border focus:border-accent"
                />
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-hover hover:text-danger"
                  onClick={() => onChange({ ...group, items: group.items.filter((_, at) => at !== index) })}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function FontsCard({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const fonts = useQuery({ queryKey: ['fonts', eventId], queryFn: () => fontApi.list(eventId) })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['fonts', eventId] })
    void queryClient.invalidateQueries({ queryKey: ['brand-kit'] })
  }
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) await fontApi.upload(eventId, file)
    },
    onSuccess: () => {
      toast.success('Fonts uploaded.')
      refresh()
    },
    onError: (error) => {
      toast.error(errorText(error, 'The font could not be uploaded.'))
      refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (fontId: string) => fontApi.remove(eventId, fontId),
    onSuccess: refresh,
    onError: (error) => toast.error(errorText(error, 'The font could not be removed.')),
  })

  useEffect(() => {
    if (fonts.data) registerBrandFonts(fonts.data)
  }, [fonts.data])

  return (
    <Card
      title="Fonts"
      description="TTF, OTF or WOFF files. They appear in the font lists of the designers."
      actions={
        <>
          <input
            ref={input}
            type="file"
            multiple
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              event.target.value = ''
              if (files.length) upload.mutate(files)
            }}
          />
          <Button variant="secondary" className="h-9" disabled={upload.isPending} onClick={() => input.current?.click()}>
            {upload.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            Upload fonts
          </Button>
        </>
      }
    >
      {fonts.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (fonts.data ?? []).length === 0 ? (
        <p className="text-sm text-muted">No fonts yet. Upload the brand fonts (regular and bold files separately).</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {(fonts.data ?? []).map((font) => (
            <li key={font.id} className="flex items-center gap-3 px-3 py-2.5">
              <Type className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg" style={{ fontFamily: `"${font.name}", Inter, sans-serif` }}>
                  {font.name} — The quick brown fox
                </span>
                <span className="block truncate text-xs text-muted">{font.fileName}</span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${font.name}`}
                disabled={remove.isPending}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-danger"
                onClick={() => remove.mutate(font.id)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
