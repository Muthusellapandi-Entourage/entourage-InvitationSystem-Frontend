import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  MousePointerClick,
  Square,
  Trash2,
  Type,
  UserRound,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { AlphaColorInput } from '@/components/ui/AlphaColorInput'
import { BrandImageButton } from '@/components/brand/BrandImageButton'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import {
  actionLabels,
  autoArrangeMobile,
  builtInFonts,
  frameOf,
  pageInfo,
  showLabels,
  withFrame,
  type ButtonAction,
  type Frame,
  type Layout,
  type MicrositeDesign,
  type MicrositeElement,
  type PageKey,
  type Preset,
  type ShowRule,
} from '@/microsite/design'

export type FontOption = { value: string; label: string }

const kindNames: Record<MicrositeElement['kind'], string> = {
  text: 'Text',
  guestName: 'Guest name',
  image: 'Image',
  button: 'Button',
  shape: 'Shape',
  qr: 'Check-in QR',
  reasonBox: 'Reason box',
}

/** What each reply page needs to work, offered at the top of the Add panel. */
const pagePresets: Record<PageKey, { preset: Preset; label: string }[]> = {
  home: [
    { preset: 'accept', label: 'Accept button' },
    { preset: 'decline', label: 'Decline button' },
    { preset: 'badge', label: 'Digital pass button' },
  ],
  accept: [
    { preset: 'confirmAccept', label: 'Confirm button' },
    { preset: 'home', label: 'Back button' },
  ],
  decline: [
    { preset: 'confirmDecline', label: 'Confirm button' },
    { preset: 'reasonBox', label: 'Reason box' },
    { preset: 'home', label: 'Back button' },
  ],
  thanks: [
    { preset: 'qr', label: 'Check-in QR' },
    { preset: 'download', label: 'Download digital pass' },
    { preset: 'wallet', label: 'Apple Wallet' },
    { preset: 'badge', label: 'Digital pass page' },
  ],
  declined: [{ preset: 'home', label: 'Back button' }],
}

/* ------------------------------------------------------------------ */
/* Left: add elements + layers                                          */
/* ------------------------------------------------------------------ */

export function InsertPanel({
  design,
  pageKey,
  layout,
  selectedId,
  uploading,
  onAdd,
  onImage,
  onSelect,
  onToggleHidden,
  onReorder,
}: {
  design: MicrositeDesign
  pageKey: PageKey
  layout: Layout
  selectedId: string | null
  uploading: boolean
  onAdd: (preset: Preset) => void
  onImage: (file: File) => void
  onSelect: (id: string) => void
  onToggleHidden: (id: string) => void
  onReorder: (id: string, direction: 1 | -1) => void
}) {
  const items: { preset: Preset; label: string; icon: ReactNode }[] = [
    { preset: 'heading', label: 'Heading', icon: <Type className="size-4" /> },
    { preset: 'text', label: 'Text', icon: <Type className="size-3.5" /> },
    { preset: 'guestName', label: 'Guest name', icon: <UserRound className="size-4" /> },
    { preset: 'link', label: 'Link button', icon: <MousePointerClick className="size-4" /> },
    { preset: 'shape', label: 'Box', icon: <Square className="size-4" /> },
    { preset: 'divider', label: 'Divider', icon: <span className="block h-0.5 w-4 bg-current" /> },
  ]
  const layers = [...design.elements].reverse()

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <section className="border-b border-border p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">For this page</h2>
        <div className="mb-3 grid grid-cols-2 gap-1.5">
          {pagePresets[pageKey].map((item) => (
            <button
              key={item.preset}
              type="button"
              onClick={() => onAdd(item.preset)}
              className="flex h-12 items-center justify-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-2 text-center text-xs font-medium text-accent hover:border-accent"
            >
              {item.label}
            </button>
          ))}
        </div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Add</h2>
        <div className="grid grid-cols-2 gap-1.5">
          {items.map((item) => (
            <button
              key={item.preset}
              type="button"
              onClick={() => onAdd(item.preset)}
              className="flex h-14 flex-col items-center justify-center gap-1 rounded-lg border border-border text-xs hover:border-accent hover:bg-accent-soft"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
          <label className="flex h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-border text-xs hover:border-accent hover:bg-accent-soft">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
            Image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) onImage(file)
              }}
            />
          </label>
          <BrandImageButton label="Brand" className="h-14 flex-col gap-1 rounded-lg" disabled={uploading} onFile={onImage} />
        </div>
      </section>
      <section className="flex min-h-0 flex-1 flex-col p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Layers · {layout === 'desktop' ? 'Desktop' : 'Phone'}</h2>
        {layers.length === 0 ? (
          <p className="text-xs text-muted">Nothing on the page yet. Add a heading, text, image or buttons above.</p>
        ) : (
          <ol className="-mx-1 min-h-0 flex-1 overflow-y-auto">
            {layers.map((element) => {
              const frame = frameOf(element, layout)
              return (
                <li key={element.id} className={cn('group flex items-center gap-1 rounded-md px-1', element.id === selectedId && 'bg-accent-soft')}>
                  <button type="button" onClick={() => onSelect(element.id)} className={cn('min-w-0 flex-1 truncate py-1.5 text-left text-xs', frame.hidden && 'text-muted line-through')}>
                    <span className="font-medium">{kindNames[element.kind]}</span>
                    <span className="text-muted"> · {summary(element)}</span>
                  </button>
                  <span className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                    <MiniButton label="Bring forward" onClick={() => onReorder(element.id, 1)}>
                      <ArrowUp className="size-3" />
                    </MiniButton>
                    <MiniButton label="Send backward" onClick={() => onReorder(element.id, -1)}>
                      <ArrowDown className="size-3" />
                    </MiniButton>
                  </span>
                  <MiniButton label={frame.hidden ? 'Show on this layout' : 'Hide on this layout'} onClick={() => onToggleHidden(element.id)}>
                    {frame.hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  </MiniButton>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </aside>
  )
}

function summary(element: MicrositeElement) {
  if (element.kind === 'button') return element.label || actionLabels[element.action ?? 'link']
  if (element.kind === 'text' || element.kind === 'guestName') return (element.text ?? '').slice(0, 32) || 'Empty'
  if (element.kind === 'image') return 'Picture'
  if (element.kind === 'qr') return 'Guest QR'
  if (element.kind === 'reasonBox') return 'Decline reason'
  return element.desktop.h <= 4 ? 'Divider' : 'Box'
}

function MiniButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex size-6 items-center justify-center rounded text-muted hover:bg-hover hover:text-foreground">
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Right: selected element                                             */
/* ------------------------------------------------------------------ */

export function ElementPanel({
  element,
  layout,
  fonts,
  uploading,
  onChange,
  onReplaceImage,
  onDuplicate,
  onDelete,
  onReorder,
}: {
  element: MicrositeElement
  layout: Layout
  fonts: FontOption[]
  uploading: boolean
  onChange: (element: MicrositeElement) => void
  onReplaceImage: (file: File) => void
  onDuplicate: () => void
  onDelete: () => void
  onReorder: (direction: 1 | -1) => void
}) {
  const frame = frameOf(element, layout)
  const setFrame = (change: Partial<Frame>) => onChange(withFrame(element, layout, { ...frame, ...change }))
  const set = (change: Partial<MicrositeElement>) => onChange({ ...element, ...change })
  const isText = element.kind === 'text' || element.kind === 'guestName' || element.kind === 'button' || element.kind === 'reasonBox'
  // Text size: the desktop size is the element's; the phone layout keeps its own.
  const fontSize = layout === 'desktop' ? (element.fontSize ?? 18) : (frame.fontSize ?? element.fontSize ?? 18)
  const setFontSize = (size: number) => (layout === 'desktop' ? set({ fontSize: size }) : setFrame({ fontSize: size }))
  const fontOptions: FontOption[] = [...fonts, ...builtInFonts.map((font) => ({ value: font, label: font }))]

  return (
    <div className="flex flex-col">
      <PanelSection title={kindNames[element.kind]}>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" className="h-8 px-2 text-xs" onClick={onDuplicate}>
            <Copy className="size-3.5" aria-hidden="true" />
            Duplicate
          </Button>
          <Button variant="secondary" className="h-8 px-2 text-xs" onClick={() => onReorder(1)}>
            <ArrowUp className="size-3.5" aria-hidden="true" />
            Forward
          </Button>
          <Button variant="secondary" className="h-8 px-2 text-xs" onClick={() => onReorder(-1)}>
            <ArrowDown className="size-3.5" aria-hidden="true" />
            Back
          </Button>
          <Button variant="secondary" className="h-8 px-2 text-xs text-danger" onClick={onDelete}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </Button>
        </div>
      </PanelSection>

      {element.kind === 'text' || element.kind === 'guestName' ? (
        <PanelSection title="Content">
          <textarea
            value={element.text ?? ''}
            onChange={(event) => set({ text: event.target.value })}
            rows={element.kind === 'guestName' ? 2 : 5}
            className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm"
            aria-label="Text"
          />
          <p className="text-xs text-muted">
            {'{name}'}, {'{position}'}, {'{company}'} and {'{event}'} are replaced for each guest. Double-click text on the canvas to edit it there.
          </p>
        </PanelSection>
      ) : null}

      {element.kind === 'reasonBox' ? (
        <PanelSection title="Reason box">
          <Field label="Hint text inside the box">
            <input value={element.text ?? ''} onChange={(event) => set({ text: event.target.value })} className={inputClass} />
          </Field>
          <p className="text-xs text-muted">Shown on the Decline confirm page when “Ask for a reason” is on in the RSVP tab. Guests can leave it empty.</p>
        </PanelSection>
      ) : null}

      {element.kind === 'qr' ? (
        <PanelSection title="Check-in QR">
          <p className="text-xs text-muted">Each guest sees their own check-in QR here (the one the door scanner reads). Keep it square and at least 160 px.</p>
        </PanelSection>
      ) : null}

      {element.kind === 'button' ? (
        <PanelSection title="Button">
          <Field label="Label">
            <input value={element.label ?? ''} onChange={(event) => set({ label: event.target.value })} className={inputClass} />
          </Field>
          <Field label="When clicked">
            <select value={element.action ?? 'link'} onChange={(event) => set({ action: event.target.value as ButtonAction })} className={inputClass}>
              {(Object.keys(actionLabels) as ButtonAction[]).map((action) => (
                <option key={action} value={action}>
                  {actionLabels[action]}
                </option>
              ))}
            </select>
          </Field>
          {element.action === 'link' ? (
            <Field label="Link address">
              <input value={element.url ?? ''} onChange={(event) => set({ url: event.target.value })} placeholder="https://maps.google.com/…" className={inputClass} />
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Fill" value={element.background ?? null} onChange={(value) => set({ background: value })} />
            <ColorField label="Text" value={element.color ?? '#FFFFFF'} onChange={(value) => set({ color: value })} />
          </div>
        </PanelSection>
      ) : null}

      {isText ? (
        <PanelSection title="Text style">
          <Field label="Font">
            <select value={element.font ?? 'Arial'} onChange={(event) => set({ font: event.target.value })} className={inputClass}>
              {fontOptions.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label={layout === 'desktop' ? 'Size' : 'Size (phone)'} value={fontSize} min={6} max={400} onChange={setFontSize} />
            <Field label="Weight">
              <select value={element.fontWeight ?? '400'} onChange={(event) => set({ fontWeight: event.target.value as MicrositeElement['fontWeight'] })} className={inputClass}>
                <option value="300">Light</option>
                <option value="400">Regular</option>
                <option value="600">Semibold</option>
                <option value="700">Bold</option>
              </select>
            </Field>
          </div>
          {element.kind !== 'button' ? <ColorField label="Colour" value={element.color ?? '#111111'} onChange={(value) => set({ color: value })} /> : null}
          <div className="flex items-center gap-1">
            {(
              [
                ['left', AlignLeft],
                ['center', AlignCenter],
                ['right', AlignRight],
              ] as const
            ).map(([align, Icon]) => (
              <button
                key={align}
                type="button"
                aria-label={`Align ${align}`}
                aria-pressed={(element.align ?? 'left') === align}
                onClick={() => set({ align })}
                className={cn('flex size-8 items-center justify-center rounded-md border', (element.align ?? 'left') === align ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted')}
              >
                <Icon className="size-4" />
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={element.italic === true} onChange={(event) => set({ italic: event.target.checked })} />
              Italic
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Line height" value={element.lineHeight ?? 1.35} min={0.6} max={3.5} step={0.05} onChange={(value) => set({ lineHeight: value })} />
            <NumberField label="Letter spacing" value={element.letterSpacing ?? 0} min={-5} max={40} step={0.5} onChange={(value) => set({ letterSpacing: value })} />
          </div>
        </PanelSection>
      ) : null}

      {element.kind === 'image' ? (
        <PanelSection title="Image">
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-hover">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
            Replace image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) onReplaceImage(file)
              }}
            />
          </label>
          <BrandImageButton label="Replace from brand kit" className="w-fit" onFile={onReplaceImage} />
          <Field label="Fit">
            <select value={element.fit ?? 'cover'} onChange={(event) => set({ fit: event.target.value as MicrositeElement['fit'] })} className={inputClass}>
              <option value="cover">Fill the box (crop)</option>
              <option value="contain">Show whole image</option>
              <option value="fill">Stretch</option>
            </select>
          </Field>
        </PanelSection>
      ) : null}

      {element.kind === 'shape' ? (
        <PanelSection title="Box">
          <ColorField label="Fill" value={element.background ?? null} onChange={(value) => set({ background: value })} />
        </PanelSection>
      ) : null}

      {element.kind === 'shape' || element.kind === 'button' || element.kind === 'image' || element.kind === 'qr' || element.kind === 'reasonBox' ? (
        <PanelSection title="Corners & border">
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Corner radius" value={element.radius ?? 0} min={0} max={999} onChange={(value) => set({ radius: value })} />
            <NumberField label="Opacity %" value={Math.round((element.opacity ?? 1) * 100)} min={0} max={100} onChange={(value) => set({ opacity: value / 100 })} />
          </div>
          {element.kind !== 'image' && element.kind !== 'qr' ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Border" value={element.borderWidth ?? 0} min={0} max={40} onChange={(value) => set({ borderWidth: value })} />
              <ColorField label="Border colour" value={element.borderColor ?? null} onChange={(value) => set({ borderColor: value })} />
            </div>
          ) : null}
        </PanelSection>
      ) : null}

      <PanelSection title={`Position · ${layout === 'desktop' ? 'Desktop' : 'Phone'}`}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={frame.x} min={-2400} max={2400} onChange={(value) => setFrame({ x: value })} />
          <NumberField label="Y" value={frame.y} min={-1000} max={20000} onChange={(value) => setFrame({ y: value })} />
          <NumberField label="Width" value={frame.w} min={1} max={2400} onChange={(value) => setFrame({ w: value })} />
          <NumberField label="Height" value={frame.h} min={1} max={20000} onChange={(value) => setFrame({ h: value })} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={frame.hidden === true} onChange={(event) => setFrame({ hidden: event.target.checked })} />
          Hide on the {layout === 'desktop' ? 'desktop' : 'phone'} layout
        </label>
      </PanelSection>

      <PanelSection title="Show">
        <select value={element.show ?? 'always'} onChange={(event) => set({ show: event.target.value as ShowRule })} className={inputClass} aria-label="Show this element">
          {(Object.keys(showLabels) as ShowRule[]).map((rule) => (
            <option key={rule} value={rule}>
              {showLabels[rule]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">Guest names and RSVP buttons never show on the public page. The digital pass button shows once the guest has accepted.</p>
      </PanelSection>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Right: page (nothing selected)                                      */
/* ------------------------------------------------------------------ */

export function PagePanel({
  design,
  pageKey,
  onCopyHome,
  layout,
  published,
  publicEnabled,
  publicUrl,
  uploading,
  onChange,
  onBackgroundImage,
  onPublished,
  onPublicEnabled,
}: {
  design: MicrositeDesign
  pageKey: PageKey
  onCopyHome: () => void
  layout: Layout
  published: boolean
  publicEnabled: boolean
  publicUrl: string | null
  uploading: boolean
  onChange: (design: MicrositeDesign) => void
  onBackgroundImage: (file: File | null) => void
  onPublished: (value: boolean) => void
  onPublicEnabled: (value: boolean) => void
}) {
  const height = layout === 'desktop' ? design.desktopHeight : design.mobileHeight
  return (
    <div className="flex flex-col">
      {pageKey !== 'home' ? (
        <PanelSection title={pageInfo[pageKey].label}>
          <p className="text-xs text-muted">{pageInfo[pageKey].hint}</p>
          <p className="text-xs text-muted">
            {design.elements.length === 0
              ? 'This page is empty, so guests see the built-in page. Add elements to use your design.'
              : 'Guests see this design. Remove every element to go back to the built-in page.'}
          </p>
          <Button variant="secondary" className="h-9 w-fit" onClick={onCopyHome}>
            Start from the home page design
          </Button>
        </PanelSection>
      ) : null}

      {pageKey === 'home' ? (
      <PanelSection title="Publishing">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={published} onChange={(event) => onPublished(event.target.checked)} />
          <span>
            <span className="block font-medium">Guests&apos; links open this microsite</span>
            <span className="block text-xs text-muted">Each invited guest sees their own version with their name and Accept / Decline.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={publicEnabled} onChange={(event) => onPublicEnabled(event.target.checked)} />
          <span>
            <span className="block font-medium">Public page on the event domain</span>
            <span className="block text-xs text-muted">Anyone opening the domain sees it without names or RSVP buttons.</span>
          </span>
        </label>
        {publicUrl ? (
          <a href={publicUrl} target="_blank" rel="noreferrer" className="break-all text-xs text-accent underline underline-offset-4">
            {publicUrl}
          </a>
        ) : (
          <p className="text-xs text-muted">The microsite goes live on the event domain. Set one up under Event settings → Invitation domain. Save to apply.</p>
        )}
      </PanelSection>
      ) : null}

      <PanelSection title="Page">
        <Field label="Browser tab title">
          <input value={design.title ?? ''} onChange={(event) => onChange({ ...design, title: event.target.value || null })} placeholder="Event name" className={inputClass} />
        </Field>
        <ColorField label="Background colour" value={design.background} onChange={(value) => onChange({ ...design, background: value ?? '#FFFFFF' })} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-hover">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
            {design.backgroundAssetId ? 'Replace background image' : 'Background image'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) onBackgroundImage(file)
              }}
            />
          </label>
          <BrandImageButton compact onFile={(file) => onBackgroundImage(file)} />
          {design.backgroundAssetId ? (
            <Button variant="ghost" className="h-8 text-xs text-danger" onClick={() => onBackgroundImage(null)}>
              Remove
            </Button>
          ) : null}
        </div>
        <NumberField
          label={`Page height · ${layout === 'desktop' ? 'desktop' : 'phone'} (px)`}
          value={height}
          min={200}
          max={20000}
          onChange={(value) => onChange(layout === 'desktop' ? { ...design, desktopHeight: value } : { ...design, mobileHeight: value })}
        />
      </PanelSection>

      <PanelSection title="Phone layout">
        <p className="text-xs text-muted">
          Each element has its own place on the phone layout. Rebuild it to stack everything in reading order, full width, with smaller text.
        </p>
        <Button
          variant="secondary"
          className="h-9 w-fit"
          onClick={() => {
            if (window.confirm('Rebuild the phone layout from the desktop layout? Phone positions you set by hand are replaced.')) onChange(autoArrangeMobile(design))
          }}
        >
          Rebuild phone layout
        </Button>
      </PanelSection>

      <PanelSection title="Shortcuts">
        <ul className="grid gap-1 text-xs text-muted">
          <li>Drag to move · handles to resize · Alt to move without snapping</li>
          <li>Double-click text to edit</li>
          <li>Arrows nudge 1 px (Shift: 10 px) · Delete removes</li>
          <li>Ctrl+D duplicate · Ctrl+Z undo · Ctrl+Shift+Z redo · Ctrl+S save</li>
        </ul>
      </PanelSection>
    </div>
  )
}

/* ------------------------------------------------------------------ */

const inputClass = 'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm'

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5 border-b border-border p-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={Number.isInteger(value) ? value : Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, step < 1 ? next : Math.round(next))))
        }}
        className={cn(inputClass, 'tabular-nums')}
      />
    </Field>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string | null; onChange: (value: string | null) => void }) {
  return (
    <Field label={label}>
      <AlphaColorInput label={label} value={value} onChange={onChange} onClear={() => onChange(null)} />
    </Field>
  )
}
