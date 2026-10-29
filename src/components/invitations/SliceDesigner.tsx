import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Trash2, Upload } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ApiError, apiBaseUrl } from '@/api/client'
import { fontApi, type EventFont } from '@/api/fontApi'
import { invitationApi } from '@/api/invitationApi'
import { AlphaColorInput } from '@/components/ui/AlphaColorInput'
import { BrandImageButton } from '@/components/brand/BrandImageButton'
import { Button } from '@/components/ui/Button'
import { Advanced, DesignerShell, PanelSection, PanelTabs, useZoom } from '@/designer/DesignerShell'
import { useDesignerSettings } from '@/designer/settings'
import { emptyGuides, Ruler, zoomLimits, type StageGuides } from '@/designer/Stage'
import { useHistory } from '@/designer/useHistory'
import {
  builtInNameFonts,
  defaultGuestNameImage,
  type GuestNameImage,
  type InvitationDesign,
  type SliceDesign,
  type SlicePiece,
  type SliceRole,
  type SliceStrip,
} from '@/invitations/design'
import { cn } from '@/lib/cn'

type Source = { assetId: string; width: number; height: number; type: string }
type Span = { x1: number; x2: number }
type Guides = { x?: number[]; y?: number[] } | null
type Strip = { label: string; role: SliceRole; tone: string; hint: string; y: number; height: number }

/** Everything the undo history covers. */
type SliceState = {
  source: Source | null
  cuts: number[]
  footer: boolean
  accept: Span | null
  decline: Span | null
  name: GuestNameImage
  emailWidth: number
}

/** The fixed slice layout, top to bottom. The footer is optional. */
const SECTIONS: { label: string; role: SliceRole; tone: string; hint: string }[] = [
  { label: 'Header', role: 'image', tone: '#94A3B8', hint: 'Logo and title' },
  { label: 'Guest name', role: 'name', tone: '#F59E0B', hint: "Each guest's name is drawn here" },
  { label: 'Info', role: 'image', tone: '#38BDF8', hint: 'Date, time, venue' },
  { label: 'Accept / Decline', role: 'buttons', tone: '#10B981', hint: 'The two RSVP buttons' },
  { label: 'Footer', role: 'image', tone: '#C084FC', hint: 'Optional closing text' },
]
const WITH_FOOTER = SECTIONS.map((section) => section.role).join(',')
const WITHOUT_FOOTER = SECTIONS.slice(0, 4).map((section) => section.role).join(',')

const MIN_STRIP = 8
const GUTTER = 128
const RULER = 20
const PAD = 24
/** Snap distance in screen pixels. */
const SNAP_SCREEN_PX = 8
const BUTTONS_INDEX = 3

/** Uploaded fonts already registered with the browser for the live preview. */
const registeredFonts = new Set<string>()

/** Compares designs without the image type, which is only learned after loading. */
const comparable = (state: SliceState) => JSON.stringify({ ...state, source: state.source ? { ...state.source, type: '' } : null })

/**
 * "One-image" invitation designer on the shared designer frame: upload the whole design once, drag the
 * cut lines to split it into Header · Guest name · Info · Accept / Decline · Footer, place the Accept and
 * Decline areas, and set how each guest's name is drawn. Saving cuts the slices in the browser, uploads
 * them and saves the design.
 */
export function SliceDesigner({
  eventId,
  title,
  design,
  saving,
  onSave,
  backTo,
  backLabel,
  switcher,
}: {
  eventId: string
  title: string
  design: InvitationDesign
  saving: boolean
  onSave: (design: InvitationDesign) => Promise<boolean>
  backTo: string
  backLabel: string
  switcher: ReactNode
}) {
  const savedSlices = design.slices ?? null
  const [initial] = useState<SliceState>(() => {
    const layout = initialLayout(savedSlices)
    return {
      source: savedSlices ? { assetId: savedSlices.sourceAssetId, width: savedSlices.sourceWidth, height: savedSlices.sourceHeight, type: 'image/png' } : null,
      cuts: layout.cuts,
      footer: layout.footer,
      accept: layout.accept,
      decline: layout.decline,
      name: savedSlices?.name ?? defaultGuestNameImage(),
      emailWidth: design.width && design.slices ? design.width : 600,
    }
  })
  const history = useHistory<SliceState>(initial)
  const state = history.present
  const { source, cuts, footer, accept, decline, name, emailWidth } = state
  const [saved, setSaved] = useState(() => comparable(initial))
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [sample, setSample] = useState({ name: 'Salman K Juma', position: 'Director, Finance' })
  const [gridStep, setGridStep] = useState(savedSlices ? autoStep(savedSlices.sourceWidth) : 25)
  const [guides, setGuides] = useState<StageGuides>(emptyGuides)
  const [selected, setSelected] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [preparing, setPreparing] = useState<string | null>(null)
  const zoom = useZoom()
  const dragStart = useRef<SliceState | null>(null)
  const queryClient = useQueryClient()

  const set = (change: Partial<SliceState>) => history.commit((current) => ({ ...current, ...change }))
  const setName = (next: GuestNameImage) => set({ name: next })
  const drag = {
    live: (change: Partial<SliceState>) => {
      if (!dragStart.current) dragStart.current = history.current()
      history.live((current) => ({ ...current, ...change }))
    },
    end: () => {
      if (dragStart.current) history.settle(dragStart.current)
      dragStart.current = null
    },
  }

  const fontsQuery = useQuery({ queryKey: ['event-fonts', eventId], queryFn: () => fontApi.list(eventId) })
  const fonts = useMemo(() => fontsQuery.data ?? [], [fontsQuery.data])

  // Load the design image as a same-origin blob so it can be cut on a canvas.
  useEffect(() => {
    if (!source) {
      setImage(null)
      return
    }
    let url: string | null = null
    let alive = true
    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/public/assets/${source.assetId}`, { mode: 'cors', cache: 'no-store' })
        if (!response.ok) throw new Error()
        const blob = await response.blob()
        url = URL.createObjectURL(blob)
        const element = new Image()
        element.src = url
        await element.decode()
        if (!alive) return
        setImage(element)
        // The type is not part of the design's history.
        history.live((current) => (current.source ? { ...current, source: { ...current.source, type: blob.type || current.source.type } } : current))
      } catch {
        if (alive) toast.error('The design image could not be loaded. Upload it again.')
      }
    })()
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.assetId])

  // Make uploaded fonts available to the browser preview.
  useEffect(() => {
    for (const font of fonts) {
      const family = familyFor(font.id)
      if (registeredFonts.has(family)) continue
      registeredFonts.add(family)
      const face = new FontFace(family, `url(${fontApi.fileUrl(font)})`)
      document.fonts.add(face)
      face.load().catch(() => registeredFonts.delete(family))
    }
  }, [fonts])

  const height = source?.height ?? 0
  const width = source?.width ?? 0
  const sections = footer ? SECTIONS : SECTIONS.slice(0, 4)
  const bounds = [0, ...cuts, height]
  const strips: Strip[] = sections.map((section, index) => ({
    ...section,
    y: bounds[index] ?? 0,
    height: (bounds[index + 1] ?? height) - (bounds[index] ?? 0),
  }))
  const dirty = comparable(state) !== saved

  const uploadFontMutation = useMutation({
    mutationFn: (file: File) => fontApi.upload(eventId, file),
    onSuccess: async (font) => {
      toast.success(`${font.name} uploaded.`)
      await queryClient.invalidateQueries({ queryKey: ['event-fonts', eventId] })
      setName({ ...history.current().name, fontId: font.id })
    },
    onError: (error) => toast.error(messageOf(error, 'The font could not be uploaded.')),
  })

  async function uploadSource(file: File) {
    setUploading(true)
    try {
      const asset = await invitationApi.uploadAsset(eventId, file)
      const url = URL.createObjectURL(file)
      const element = new Image()
      element.src = url
      await element.decode()
      const w = element.naturalWidth
      const h = element.naturalHeight
      URL.revokeObjectURL(url)
      const firstAccept = defaultAccept(w)
      history.commit((current) => ({
        ...current,
        source: { assetId: asset.id, width: w, height: h, type: file.type },
        cuts: defaultCuts(h, current.footer),
        accept: firstAccept,
        decline: mirror(firstAccept, w),
        name: savedSlices ? current.name : defaultGuestNameImage(w),
      }))
      setGridStep(autoStep(w))
      zoom.set('fit')
      toast.success('Design uploaded. Drag the cut lines to match your design.')
    } catch (error) {
      toast.error(messageOf(error, 'The design could not be uploaded.'))
    } finally {
      setUploading(false)
    }
  }

  function toggleFooter(on: boolean) {
    if (on === footer) return
    if (on) {
      const last = cuts[cuts.length - 1] ?? 0
      if (height - last < MIN_STRIP * 2) {
        toast.error('Make the Accept / Decline section taller first; there is no room for a footer.')
        return
      }
      set({ footer: true, cuts: [...cuts, Math.round(last + (height - last) / 2)] })
    } else {
      // The Accept / Decline slice then runs to the bottom of the design.
      set({ footer: false, cuts: cuts.slice(0, -1) })
    }
  }

  function mirrorDecline() {
    if (!accept) return
    const next = mirror(accept, width)
    if (overlaps(next, accept)) {
      toast.error('Accept crosses the centre line. Move it to one side first.')
      return
    }
    set({ decline: next })
  }

  function centerPair() {
    if (!accept || !decline) return
    const left = Math.min(accept.x1, decline.x1)
    const right = Math.max(accept.x2, decline.x2)
    const shift = Math.round(width / 2 - (left + right) / 2)
    set({ accept: { x1: accept.x1 + shift, x2: accept.x2 + shift }, decline: { x1: decline.x1 + shift, x2: decline.x2 + shift } })
  }

  const problems = source ? validate(strips, accept, decline) : ['Upload the invitation design first.']

  async function save(): Promise<boolean> {
    if (!source || !image || !accept || !decline || problems.length > 0) {
      toast.error(problems[0] ?? 'The design is still loading.')
      return false
    }
    try {
      const output: SliceStrip[] = []
      const pieces = piecesFor(width, accept, decline)
      const total = strips.length - 1 + pieces.length
      let done = 0
      const step = () => setPreparing(`Cutting and uploading sections… ${++done} of ${total}`)
      setPreparing(`Cutting and uploading sections… 0 of ${total}`)
      for (const [index, strip] of strips.entries()) {
        if (index === BUTTONS_INDEX) {
          const uploaded: SlicePiece[] = []
          for (const piece of pieces) {
            const assetId = await cutAndUpload(eventId, image, source.type, piece.x, strip.y, piece.width, strip.height, `slice-buttons-${piece.kind}`)
            uploaded.push({ ...piece, assetId })
            step()
          }
          output.push({ role: 'buttons', y: strip.y, height: strip.height, assetId: null, pieces: uploaded })
        } else {
          const label = strip.label.toLowerCase().replace(/[^a-z]+/g, '-')
          const assetId = await cutAndUpload(eventId, image, source.type, 0, strip.y, width, strip.height, `slice-${label}`)
          output.push({ role: strip.role, y: strip.y, height: strip.height, assetId, pieces: null })
          step()
        }
      }
      const slices: SliceDesign = { sourceAssetId: source.assetId, sourceWidth: width, sourceHeight: height, strips: output, name }
      setPreparing(null)
      const ok = await onSave({ ...design, width: clamp(Math.round(emailWidth), 400, 1000), slices })
      if (ok) setSaved(comparable(history.current()))
      return ok
    } catch (error) {
      toast.error(messageOf(error, 'The sections could not be uploaded.'))
      return false
    } finally {
      setPreparing(null)
    }
  }

  const fontOptions = [
    ...fonts.map((font) => ({ value: `font:${font.id}`, label: `${font.name} (uploaded)` })),
    ...builtInNameFonts.map((font) => ({ value: `builtin:${font}`, label: font })),
  ]

  /* ---------------- panels ---------------- */
  const designPanel = (
    <>
      <PanelSection
        title="Design image"
        hint={source ? `${width} × ${height} px` : 'Upload the complete invitation as one PNG or JPG. Leave the guest name area empty in the design.'}
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-hover">
            {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            {source ? 'Replace design' : 'Upload design'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void uploadSource(file)
              }}
            />
          </label>
          <BrandImageButton compact disabled={uploading} onFile={(file) => uploadSource(file)} />
        </div>
      </PanelSection>
      <PanelSection title="Email" hint="How wide the invitation shows in email. 600 suits most inboxes.">
        <NumberRow label="Email width (px)" value={emailWidth} min={400} max={1000} onChange={(value) => set({ emailWidth: value })} />
      </PanelSection>
      <Advanced>
        <PanelSection title="Grid" hint="The grid is centred on the design; turn it on with the grid button in the top bar.">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <NumberRow label="Grid size (px)" value={gridStep} min={4} max={500} onChange={setGridStep} />
            </div>
            <Button variant="ghost" className="h-9 text-xs" onClick={() => setGridStep(autoStep(width || 1200))}>
              Auto
            </Button>
          </div>
        </PanelSection>
      </Advanced>
    </>
  )

  const layersPanel = source ? (
    <>
      <ol className="grid gap-1">
        {strips.map((strip, index) => (
          <li key={strip.label}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setSelected(strip.label)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setSelected(strip.label)
              }}
              className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm', selected === strip.label ? 'bg-accent-soft' : 'hover:bg-hover')}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: strip.tone }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{strip.label}</span>
                <span className="block text-[11px] text-muted">
                  {strip.hint} · {strip.height}px
                </span>
              </span>
              {index > 0 ? (
                <label className="flex items-center gap-1 text-[11px] text-muted" onClick={(event) => event.stopPropagation()}>
                  top
                  <input
                    type="number"
                    aria-label={`${strip.label} top (px)`}
                    value={cuts[index - 1]}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      if (Number.isFinite(value)) set({ cuts: withCut(cuts, index - 1, value, height) })
                    }}
                    className="h-7 w-16 rounded border border-border bg-background px-1.5 text-xs tabular-nums text-foreground"
                  />
                </label>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={footer} onChange={(event) => toggleFooter(event.target.checked)} />
        Footer section (optional)
      </label>
      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Button areas</p>
        {(['accept', 'decline'] as const).map((which) => {
          const span = which === 'accept' ? accept : decline
          return (
            <button
              key={which}
              type="button"
              onClick={() => setSelected(which)}
              className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', selected === which ? 'bg-accent-soft' : 'hover:bg-hover')}
            >
              <span className={cn('size-2.5 shrink-0 rounded-sm', which === 'accept' ? 'bg-accent' : 'bg-danger')} aria-hidden="true" />
              <span className="flex-1 font-medium">{which === 'accept' ? 'Accept' : 'Decline'}</span>
              <span className="text-[11px] tabular-nums text-muted">{span ? `${span.x1}–${span.x2}px` : '—'}</span>
            </button>
          )
        })}
      </div>
    </>
  ) : (
    <p className="text-xs text-muted">Upload the design first. Its sections show up here.</p>
  )

  const right = (
    <>
      {source ? (
        <PanelSection title="Accept / Decline" hint="The boxes snap to the centre line, guides and each other's mirror position and width.">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="h-8 text-xs" onClick={mirrorDecline}>
              Mirror Decline from Accept
            </Button>
            <Button variant="secondary" className="h-8 text-xs" onClick={centerPair}>
              Centre the pair
            </Button>
          </div>
        </PanelSection>
      ) : null}

      {problems.length > 0 && source ? (
        <div role="alert" className="mb-5 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-300">
          {problems.map((problem) => (
            <p key={problem}>• {problem}</p>
          ))}
        </div>
      ) : null}

      <PanelSection title="Guest name">
        <div className="grid gap-2.5">
          <TextRow label="Greeting" value={name.template} onChange={(template) => setName({ ...name, template })} hint="{name} is replaced by each guest's name." />
          <SelectRow
            label="Font"
            value={name.fontId ? `font:${name.fontId}` : `builtin:${name.font}`}
            options={fontOptions.map((font): [string, string] => [font.value, font.label])}
            onChange={(value) => setName(value.startsWith('font:') ? { ...name, fontId: value.slice(5) } : { ...name, fontId: null, font: value.slice(8) })}
          />
          <FontUpload uploading={uploadFontMutation.isPending} onFile={(file) => uploadFontMutation.mutate(file)} />
          <FontList eventId={eventId} fonts={fonts} />
          <div className="grid grid-cols-2 gap-2">
            <NumberRow label="Size" value={name.fontSize} min={6} max={400} onChange={(fontSize) => setName({ ...name, fontSize })} />
            <ColorRow label="Colour" value={name.color} onChange={(color) => setName({ ...name, color })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectRow
              label="Align"
              value={name.align}
              options={[
                ['left', 'Left'],
                ['center', 'Centre'],
                ['right', 'Right'],
              ]}
              onChange={(align) => setName({ ...name, align: align as GuestNameImage['align'] })}
            />
            <SelectRow
              label="Vertical"
              value={name.valign}
              options={[
                ['top', 'Top'],
                ['middle', 'Middle'],
                ['bottom', 'Bottom'],
              ]}
              onChange={(valign) => setName({ ...name, valign: valign as GuestNameImage['valign'] })}
            />
          </div>
          <Advanced>
            <div className="grid grid-cols-2 gap-2">
              <NumberRow label="Side padding" value={name.paddingX} min={0} max={3000} onChange={(paddingX) => setName({ ...name, paddingX })} />
              <NumberRow label="Nudge up/down" value={name.offsetY} min={-2000} max={2000} onChange={(offsetY) => setName({ ...name, offsetY })} />
            </div>
          </Advanced>
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={name.positionEnabled} onChange={(event) => setName({ ...name, positionEnabled: event.target.checked })} />
            Also show the guest&apos;s position below
          </label>
          {name.positionEnabled ? (
            <>
              <SelectRow
                label="Position font"
                value={name.positionFontId ? `font:${name.positionFontId}` : `builtin:${name.positionFont}`}
                options={fontOptions.map((font): [string, string] => [font.value, font.label])}
                onChange={(value) =>
                  setName(value.startsWith('font:') ? { ...name, positionFontId: value.slice(5) } : { ...name, positionFontId: null, positionFont: value.slice(8) })
                }
              />
              <div className="grid grid-cols-3 gap-2">
                <NumberRow label="Size" value={name.positionFontSize} min={6} max={400} onChange={(positionFontSize) => setName({ ...name, positionFontSize })} />
                <ColorRow label="Colour" value={name.positionColor} onChange={(positionColor) => setName({ ...name, positionColor })} />
                <NumberRow label="Gap" value={name.lineGap} min={0} max={400} onChange={(lineGap) => setName({ ...name, lineGap })} />
              </div>
            </>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection title="Preview with" hint="Each guest gets their own name image when the invitation is sent or downloaded. Long names shrink to fit.">
        <div className="grid gap-2.5">
          <TextRow label="Sample name" value={sample.name} onChange={(value) => setSample({ ...sample, name: value })} />
          {name.positionEnabled ? <TextRow label="Sample position" value={sample.position} onChange={(value) => setSample({ ...sample, position: value })} /> : null}
        </div>
      </PanelSection>
    </>
  )

  return (
    <DesignerShell
      title={title}
      subtitle="One-image invitation"
      backLabel={backLabel}
      backTo={backTo}
      switcher={switcher}
      history={history}
      zoom={{ value: zoom.value, fit: zoom.fit, set: zoom.set }}
      save={{ dirty, saving: saving || preparing !== null, onSave: save }}
      keys={{ onEscape: () => setSelected(null) }}
      left={
        <PanelTabs
          tabs={[
            { key: 'design', label: 'Design', content: designPanel },
            { key: 'layers', label: 'Layers', content: layersPanel },
          ]}
        />
      }
      right={right}
    >
      {preparing ? (
        <p role="status" className="shrink-0 border-b border-border bg-accent-soft px-4 py-1.5 text-xs text-accent">
          {preparing}
        </p>
      ) : null}
      {!source ? (
        <div className="min-h-0 flex-1 overflow-auto bg-[#1b1b19] p-6">
          <div className="grid gap-3">
            <UploadDrop uploading={uploading} onFile={(file) => void uploadSource(file)} />
            <div className="flex items-center justify-center gap-2 text-sm text-white/60">
              or <BrandImageButton label="Use a design from the brand kit" disabled={uploading} onFile={(file) => uploadSource(file)} />
            </div>
          </div>
        </div>
      ) : !image ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[#1b1b19] text-sm text-white/60">Loading design…</div>
      ) : (
        <SliceCanvas
          image={image}
          width={width}
          height={height}
          strips={strips}
          state={state}
          live={drag.live}
          end={drag.end}
          gridStep={gridStep}
          guides={guides}
          onGuidesChange={setGuides}
          selected={selected}
          onSelect={setSelected}
          zoom={zoom}
          sample={sample}
        />
      )}
    </DesignerShell>
  )
}

/* ------------------------------------------------------------------ */
/* Canvas (inside the shell, so it reads the shared snap / grid / ruler settings) */
/* ------------------------------------------------------------------ */

function SliceCanvas({
  image,
  width,
  height,
  strips,
  state,
  live,
  end,
  gridStep,
  guides,
  onGuidesChange,
  selected,
  onSelect,
  zoom,
  sample,
}: {
  image: HTMLImageElement
  width: number
  height: number
  strips: Strip[]
  state: SliceState
  live: (change: Partial<SliceState>) => void
  end: () => void
  gridStep: number
  guides: StageGuides
  onGuidesChange: (guides: StageGuides) => void
  selected: string | null
  onSelect: (key: string | null) => void
  zoom: { value: number | 'fit'; set: (value: number | 'fit') => void; setFit: (value: number) => void }
  sample: { name: string; position: string }
}) {
  const { settings } = useDesignerSettings()
  const scrollRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 900, height: 700 })
  const [shown, setShown] = useState<Guides>(null)
  const [draftGuide, setDraftGuide] = useState<{ axis: 'x' | 'y'; value: number } | null>(null)
  const { cuts, accept, decline, name } = state
  const rulers = settings.rulers ? RULER : 0

  useLayoutEffect(() => {
    const node = scrollRef.current
    if (!node) return
    // Ignore tiny size changes so a scrollbar appearing can't start a refit loop.
    const measure = () =>
      setViewport((current) =>
        Math.abs(current.width - node.clientWidth) < 2 && Math.abs(current.height - node.clientHeight) < 2 ? current : { width: node.clientWidth, height: node.clientHeight },
      )
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    measure()
    return () => observer.disconnect()
  }, [])

  // Fit the whole design on screen: width and height (the hint line under it takes ~40 px).
  const byWidth = (viewport.width - GUTTER - rulers - PAD * 2) / Math.max(1, width)
  const byHeight = (viewport.height - rulers - PAD * 2 - 40) / Math.max(1, height)
  const fit = Math.max(zoomLimits().min, Math.min(1, Math.floor(Math.min(byWidth, byHeight) * 1000) / 1000))
  const { setFit } = zoom
  useEffect(() => setFit(fit), [fit, setFit])
  const scale = zoom.value === 'fit' ? fit : zoom.value
  useLayoutEffect(() => {
    if (zoom.value === 'fit') scrollRef.current?.scrollTo({ left: 0, top: 0 })
  }, [zoom.value])

  // Ctrl + wheel zooms.
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const setZoom = zoom.set
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const next = scaleRef.current * (event.deltaY < 0 ? 1.1 : 1 / 1.1)
      setZoom(Math.max(zoomLimits().min, Math.min(zoomLimits().max, Math.round(next * 100) / 100)))
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => node.removeEventListener('wheel', wheel)
  }, [setZoom])

  const xLines = useMemo(() => [...(settings.grid ? centeredLines(width, gridStep) : []), width / 2, ...guides.vertical], [settings.grid, width, gridStep, guides.vertical])
  const yLines = useMemo(() => [...(settings.grid ? centeredLines(height, gridStep) : []), ...guides.horizontal], [settings.grid, height, gridStep, guides.horizontal])
  const threshold = SNAP_SCREEN_PX / scale

  /** Drags a cut line; it snaps and stays at least MIN_STRIP px from its neighbours. */
  function dragCut(index: number, event: ReactPointerEvent) {
    event.preventDefault()
    onSelect(strips[index + 1]?.label ?? null)
    const startY = event.clientY
    const startCuts = [...cuts]
    trackPointer(
      (moveEvent) => {
        let next = startCuts[index] + (moveEvent.clientY - startY) / scale
        let guide: number | null = null
        if (settings.snap && !moveEvent.altKey) {
          guide = nearest(next, yLines, threshold)
          if (guide !== null) next = guide
        }
        setShown(guide !== null ? { y: [guide] } : null)
        live({ cuts: withCut(startCuts, index, next, height) })
      },
      () => {
        setShown(null)
        end()
      },
    )
  }

  /** Drags a whole button area, or one of its edges, snapping to the grid, guides, the centre line and the other button. */
  function dragSpan(which: 'accept' | 'decline', mode: 'move' | 'left' | 'right', event: ReactPointerEvent) {
    event.preventDefault()
    event.stopPropagation()
    onSelect(which)
    const span = which === 'accept' ? accept : decline
    if (!span) return
    const other = which === 'accept' ? decline : accept
    const startX = event.clientX
    trackPointer(
      (moveEvent) => {
        const delta = (moveEvent.clientX - startX) / scale
        const snap = settings.snap && !moveEvent.altKey
        let { x1, x2 } = span
        let guide: number | null = null
        if (mode === 'move') {
          const size = x2 - x1
          let left = x1 + delta
          if (snap) {
            const options: { shift: number; guide: number }[] = []
            const consider = (current: number, targets: number[]) => {
              for (const target of targets) options.push({ shift: target - current, guide: target })
            }
            // Left edge, right edge and centre; the mirror of the other button keeps the pair symmetrical.
            consider(left, [...xLines, ...(other ? [width - other.x2] : [])])
            consider(left + size, [...xLines, ...(other ? [width - other.x1] : [])])
            consider(left + size / 2, [width / 2])
            const best = pickBest(options, threshold)
            if (best) {
              left += best.shift
              guide = best.guide
            }
          }
          x1 = clamp(left, 0, width - size)
          x2 = x1 + size
        } else if (mode === 'left') {
          let next = x1 + delta
          if (snap) {
            const targets = [...xLines, ...(other ? [width - other.x2, x2 - (other.x2 - other.x1)] : [])]
            const hit = nearest(next, targets, threshold)
            if (hit !== null) next = guide = hit
          }
          x1 = clamp(next, 0, x2 - MIN_STRIP)
        } else {
          let next = x2 + delta
          if (snap) {
            const targets = [...xLines, ...(other ? [width - other.x1, x1 + (other.x2 - other.x1)] : [])]
            const hit = nearest(next, targets, threshold)
            if (hit !== null) next = guide = hit
          }
          x2 = clamp(next, x1 + MIN_STRIP, width)
        }
        const next = { x1: Math.round(x1), x2: Math.round(x2) }
        if (other && overlaps(next, other)) return
        live(which === 'accept' ? { accept: next } : { decline: next })
        setShown(guide !== null ? { x: [guide] } : null)
      },
      () => {
        setShown(null)
        end()
      },
    )
  }

  /** Drags a guide out of a ruler (index null) or moves an existing one; dropping it outside removes it. */
  function dragGuide(axis: 'x' | 'y', index: number | null, event: ReactPointerEvent) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    let value: number | null = null
    let outside = false
    trackPointer(
      (moveEvent) => {
        const rect = imageRef.current?.getBoundingClientRect()
        if (!rect) return
        const raw = axis === 'x' ? (moveEvent.clientX - rect.left) / scale : (moveEvent.clientY - rect.top) / scale
        value = Math.round(raw)
        outside = raw < 0 || raw > (axis === 'x' ? width : height)
        setDraftGuide(outside ? null : { axis, value })
      },
      () => {
        setDraftGuide(null)
        const key = axis === 'x' ? 'vertical' : 'horizontal'
        const list = [...guides[key]]
        if (index !== null) list.splice(index, 1)
        if (value !== null && !outside) list.push(value)
        if (index !== null || (value !== null && !outside)) onGuidesChange({ ...guides, [key]: list.slice(0, 40) })
      },
    )
  }

  const gutter = GUTTER + rulers

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-[#1b1b19]" style={{ scrollbarGutter: 'stable' }} onPointerDown={(event) => event.target === event.currentTarget && onSelect(null)}>
      <div className="mx-auto" style={{ width: gutter + width * scale + PAD * 2, padding: PAD }}>
        {settings.rulers ? (
          <div className="flex">
            <div style={{ width: gutter }} />
            <div className="grid" style={{ width: width * scale, height: RULER }}>
              <Ruler axis="x" length={width * scale} origin={0} scale={scale} unit="px" highlight={null} onPointerDown={(event) => dragGuide('y', null, event)} />
            </div>
          </div>
        ) : null}
        <div className="flex">
          {/* Section names in the gutter, outside the design */}
          <div className="relative shrink-0" style={{ width: GUTTER, height: height * scale }} aria-hidden="true">
            {strips.map((strip) => (
              <div key={strip.label} className="absolute inset-x-0 flex items-center justify-end pr-4" style={{ top: strip.y * scale, height: strip.height * scale }}>
                <span className="absolute bottom-0.5 right-1.5 top-0.5 w-1 rounded-full" style={{ background: strip.tone }} />
                <span className="text-right leading-tight">
                  <span className="block text-xs font-semibold" style={{ color: strip.tone }}>
                    {strip.label}
                  </span>
                  <span className="block text-[10px] tabular-nums text-white/45">{strip.height}px</span>
                </span>
              </div>
            ))}
          </div>
          {settings.rulers ? (
            <div className="grid shrink-0" style={{ width: RULER, height: height * scale }}>
              <Ruler axis="y" length={height * scale} origin={0} scale={scale} unit="px" highlight={null} onPointerDown={(event) => dragGuide('x', null, event)} />
            </div>
          ) : null}

          <div ref={imageRef} className="relative shrink-0 select-none" style={{ width: width * scale, height: height * scale }}>
            <img src={image.src} alt="Invitation design" className="absolute inset-0 block h-full w-full" draggable={false} />

            {/* Name preview and section outlines */}
            {strips.map((strip, index) => (
              <div
                key={`strip-${strip.label}`}
                className="pointer-events-none absolute inset-x-0"
                style={{
                  top: strip.y * scale,
                  height: strip.height * scale,
                  boxShadow:
                    selected === strip.label ? `inset 0 0 0 2px #0ea5e9` : strip.role === 'image' ? undefined : `inset 0 0 0 2px ${strip.tone}`,
                }}
              >
                {index === 1 ? <NamePreview strip={strip} sourceWidth={width} image={image} scale={scale} name={name} sample={sample} /> : null}
              </div>
            ))}

            {settings.grid ? <GridOverlay width={width} height={height} scale={scale} xLines={centeredLines(width, gridStep)} yLines={centeredLines(height, gridStep)} /> : null}

            {/* Accept / Decline areas */}
            {(['accept', 'decline'] as const).map((which) => {
              const span = which === 'accept' ? accept : decline
              const strip = strips[BUTTONS_INDEX]
              if (!span || !strip) return null
              return (
                <div
                  key={which}
                  role="presentation"
                  className={cn(
                    'absolute z-20 cursor-move border-2',
                    which === 'accept' ? 'border-accent bg-accent/20' : 'border-danger bg-danger/20',
                    selected === which && 'outline outline-2 outline-offset-2 outline-sky-500',
                  )}
                  style={{ left: span.x1 * scale, width: (span.x2 - span.x1) * scale, top: strip.y * scale, height: strip.height * scale }}
                  onPointerDown={(event) => dragSpan(which, 'move', event)}
                >
                  <span
                    className={cn(
                      'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold',
                      which === 'accept' ? 'bg-accent text-accent-foreground' : 'bg-danger text-danger-foreground',
                    )}
                  >
                    {which === 'accept' ? 'Accept' : 'Decline'}
                  </span>
                  <span className="absolute inset-y-0 -left-1.5 w-3 cursor-ew-resize" onPointerDown={(event) => dragSpan(which, 'left', event)} />
                  <span className="absolute inset-y-0 -right-1.5 w-3 cursor-ew-resize" onPointerDown={(event) => dragSpan(which, 'right', event)} />
                </div>
              )
            })}

            {/* Guides */}
            {guides.vertical.map((value, index) => (
              <div
                key={`v${index}`}
                className="absolute inset-y-0 z-30 w-[7px] -translate-x-[3px] cursor-ew-resize"
                style={{ left: value * scale }}
                onPointerDown={(event) => dragGuide('x', index, event)}
                onDoubleClick={() => onGuidesChange({ ...guides, vertical: guides.vertical.filter((_, at) => at !== index) })}
                title="Guide — drag to move, drag off the design or double-click to remove"
              >
                <span className="absolute inset-y-0 left-[3px] w-px bg-cyan-400" />
              </div>
            ))}
            {guides.horizontal.map((value, index) => (
              <div
                key={`h${index}`}
                className="absolute inset-x-0 z-30 h-[7px] -translate-y-[3px] cursor-ns-resize"
                style={{ top: value * scale }}
                onPointerDown={(event) => dragGuide('y', index, event)}
                onDoubleClick={() => onGuidesChange({ ...guides, horizontal: guides.horizontal.filter((_, at) => at !== index) })}
                title="Guide — drag to move, drag off the design or double-click to remove"
              >
                <span className="absolute inset-x-0 top-[3px] h-px bg-cyan-400" />
              </div>
            ))}
            {draftGuide ? (
              draftGuide.axis === 'x' ? (
                <span className="pointer-events-none absolute inset-y-0 z-30 w-px bg-cyan-400" style={{ left: draftGuide.value * scale }} />
              ) : (
                <span className="pointer-events-none absolute inset-x-0 z-30 h-px bg-cyan-400" style={{ top: draftGuide.value * scale }} />
              )
            ) : null}

            {/* Snap lines */}
            {shown?.x?.map((x) => (
              <div key={`gx-${x}`} className="pointer-events-none absolute inset-y-0 z-40 w-px bg-fuchsia-500" style={{ left: x * scale }} />
            ))}
            {shown?.y?.map((y) => (
              <div key={`gy-${y}`} className="pointer-events-none absolute inset-x-0 z-40 h-px bg-fuchsia-500" style={{ top: y * scale }} />
            ))}

            {/* Cut lines, extended into the gutter so they can be grabbed there too */}
            {cuts.map((cut, index) => (
              <div
                key={`cut-${index}`}
                role="separator"
                aria-label={`Line between ${strips[index]?.label} and ${strips[index + 1]?.label}`}
                aria-valuenow={cut}
                className="group absolute right-0 z-[35] cursor-ns-resize"
                style={{ top: cut * scale - 6, height: 12, left: -gutter }}
                onPointerDown={(event) => dragCut(index, event)}
              >
                <div className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-sky-400 group-hover:border-sky-300" />
                <span className="absolute left-1 top-1/2 -translate-y-1/2 rounded bg-sky-500 px-1.5 text-[10px] font-semibold tabular-nums text-white">↕ {cut}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-white/55">
          Drag the blue lines to set each section. Drag the green and red boxes over your Accept and Decline buttons. Hold Alt to move without snapping.
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function GridOverlay({ width, height, scale, xLines, yLines }: { width: number; height: number; scale: number; xLines: number[]; yLines: number[] }) {
  const cx = width / 2
  return (
    <svg className="pointer-events-none absolute inset-0 z-10" width={width * scale} height={height * scale} aria-hidden="true" shapeRendering="crispEdges">
      {xLines.map((x) => (
        <line key={`x-${x}`} x1={x * scale} x2={x * scale} y1={0} y2={height * scale} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
      ))}
      {yLines.map((y) => (
        <line key={`y-${y}`} x1={0} x2={width * scale} y1={y * scale} y2={y * scale} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
      ))}
      <line x1={cx * scale} x2={cx * scale} y1={0} y2={height * scale} stroke="rgba(56,189,248,0.85)" strokeWidth={1} strokeDasharray="6 4" />
    </svg>
  )
}

function NamePreview({
  strip,
  sourceWidth,
  image,
  scale,
  name,
  sample,
}: {
  strip: { y: number; height: number }
  sourceWidth: number
  image: HTMLImageElement
  scale: number
  name: GuestNameImage
  sample: { name: string; position: string }
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fontsReady, setFontsReady] = useState(0)

  useEffect(() => {
    let alive = true
    void document.fonts.ready.then(() => alive && setFontsReady((count) => count + 1))
    const onLoad = () => alive && setFontsReady((count) => count + 1)
    document.fonts.addEventListener('loadingdone', onLoad)
    return () => {
      alive = false
      document.fonts.removeEventListener('loadingdone', onLoad)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || strip.height <= 0) return
    canvas.width = sourceWidth
    canvas.height = strip.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    // Same drawing rules as the server: fit to width, align, vertical position, optional position line.
    context.drawImage(image, 0, strip.y, sourceWidth, strip.height, 0, 0, sourceWidth, strip.height)
    const padding = Math.min(name.paddingX, Math.max(0, sourceWidth / 2 - 1))
    const available = Math.max(10, sourceWidth - padding * 2)
    const guestName = sample.name.trim() || 'Guest'
    const greeting = name.template.includes('{name}') ? name.template.replaceAll('{name}', guestName) : `${name.template} ${guestName}`
    const nameFont = fitFont(context, greeting, familyOf(name.fontId, name.font), name.fontSize, available)
    const showPosition = name.positionEnabled && sample.position.trim().length > 0
    const positionFont = showPosition ? fitFont(context, sample.position.trim(), familyOf(name.positionFontId, name.positionFont), name.positionFontSize, available) : null
    const gap = positionFont ? name.lineGap : 0
    const block = nameFont.height + gap + (positionFont?.height ?? 0)
    const top = (name.valign === 'middle' ? (strip.height - block) / 2 : name.valign === 'bottom' ? strip.height - block : 0) + name.offsetY
    drawLine(context, greeting, nameFont, name.color, name.align, padding, sourceWidth, top)
    if (positionFont) drawLine(context, sample.position.trim(), positionFont, name.positionColor, name.align, padding, sourceWidth, top + nameFont.height + gap)
  }, [image, strip.y, strip.height, sourceWidth, name, sample, fontsReady])

  return <canvas ref={canvasRef} aria-label="Guest name preview" className="absolute inset-x-0 top-0" style={{ width: sourceWidth * scale, height: strip.height * scale }} />
}

type FittedFont = { css: string; ascent: number; height: number }

function fitFont(context: CanvasRenderingContext2D, text: string, family: string, size: number, available: number): FittedFont {
  let px = Math.max(6, size)
  context.font = `${px}px ${family}`
  const measured = context.measureText(text).width
  if (measured > available && measured > 0) px = Math.max(6, (px * available) / measured)
  context.font = `${px}px ${family}`
  const metrics = context.measureText(text)
  const ascent = metrics.fontBoundingBoxAscent || px * 0.9
  const descent = metrics.fontBoundingBoxDescent || px * 0.25
  return { css: context.font, ascent, height: ascent + descent }
}

function drawLine(
  context: CanvasRenderingContext2D,
  text: string,
  font: FittedFont,
  color: string,
  align: GuestNameImage['align'],
  padding: number,
  width: number,
  top: number,
) {
  context.font = font.css
  context.fillStyle = color
  context.textBaseline = 'alphabetic'
  const textWidth = context.measureText(text).width
  const x = align === 'center' ? (width - textWidth) / 2 : align === 'right' ? width - padding - textWidth : padding
  context.fillText(text, x, top + font.ascent)
}

function familyFor(fontId: string) {
  return `ev-font-${fontId}`
}

function familyOf(fontId: string | null, builtIn: string) {
  return fontId ? `"${familyFor(fontId)}", Arial, sans-serif` : `"${builtIn}", Arial, sans-serif`
}

/* ------------------------------------------------------------------ */

function UploadDrop({ uploading, onFile }: { uploading: boolean; onFile: (file: File) => void }) {
  const [over, setOver] = useState(false)
  return (
    <label
      className={cn(
        'mx-auto flex max-w-xl cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 text-center text-white',
        over ? 'border-accent bg-accent/10' : 'border-white/25',
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        const file = event.dataTransfer.files?.[0]
        if (file) onFile(file)
      }}
    >
      {uploading ? <Loader2 className="size-8 animate-spin text-accent" aria-hidden="true" /> : <Upload className="size-8 text-accent" aria-hidden="true" />}
      <span className="text-base font-semibold">Upload the full invitation design</span>
      <span className="text-sm text-white/60">
        One PNG or JPG with the header, an empty guest name area, the details, the Accept / Decline buttons and an optional footer. You mark its sections next.
      </span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
    </label>
  )
}

function FontUpload({ uploading, onFile }: { uploading: boolean; onFile: (file: File) => void }) {
  return (
    <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-accent hover:underline">
      {uploading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Upload className="size-3.5" aria-hidden="true" />}
      {uploading ? 'Uploading font…' : 'Upload a font (.ttf or .otf)'}
      <input
        type="file"
        accept=".ttf,.otf,font/ttf,font/otf"
        className="sr-only"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
    </label>
  )
}

function FontList({ eventId, fonts }: { eventId: string; fonts: EventFont[] }) {
  const queryClient = useQueryClient()
  const removeMutation = useMutation({
    mutationFn: (fontId: string) => fontApi.remove(eventId, fontId),
    onSuccess: async () => {
      toast.success('Font deleted.')
      await queryClient.invalidateQueries({ queryKey: ['event-fonts', eventId] })
    },
    onError: (error) => toast.error(messageOf(error, 'The font could not be deleted.')),
  })
  if (fonts.length === 0) return null
  return (
    <ul className="grid gap-1 text-xs">
      {fonts.map((font) => (
        <li key={font.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
          <span className="truncate" style={{ fontFamily: `"${familyFor(font.id)}", sans-serif` }}>
            {font.name}
          </span>
          <button
            type="button"
            aria-label={`Delete font ${font.name}`}
            className="text-muted hover:text-danger"
            disabled={removeMutation.isPending}
            onClick={() => {
              if (window.confirm(`Delete the font ${font.name}?`)) removeMutation.mutate(font.id)
            }}
          >
            <Trash2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function TextRow({ label, value, hint, onChange }: { label: string; value: string; hint?: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="font-medium text-muted">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-border bg-background px-2.5 text-sm" />
      {hint ? <span className="text-muted">{hint}</span> : null}
    </label>
  )
}

function NumberRow({
  label,
  value,
  min,
  max,
  hint,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  hint?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="font-medium text-muted">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(clamp(Math.round(next), min, max))
        }}
        className="h-9 rounded-md border border-border bg-background px-2.5 text-sm tabular-nums"
      />
      {hint ? <span className="text-muted">{hint}</span> : null}
    </label>
  )
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1 text-xs">
      <span className="font-medium text-muted">{label}</span>
      <AlphaColorInput label={label} value={value} onChange={onChange} slider={false} />
    </div>
  )
}

function SelectRow({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="font-medium text-muted">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** Moves one cut line, keeping it at least MIN_STRIP px from its neighbours. */
function withCut(cuts: number[], index: number, value: number, height: number) {
  const min = (index === 0 ? 0 : cuts[index - 1]) + MIN_STRIP
  const max = (index === cuts.length - 1 ? height : cuts[index + 1]) - MIN_STRIP
  const next = clamp(Math.round(value), min, max)
  return cuts.map((cut, cutIndex) => (cutIndex === index ? next : cut))
}

/** A grid step that gives about 48 columns across the design. */
function autoStep(width: number) {
  return Math.max(8, Math.round(width / 48))
}

/** Grid lines centred on the middle of the length: centre, centre ± step, centre ± 2·step… */
function centeredLines(length: number, step: number) {
  if (length <= 0 || step <= 0) return []
  const center = length / 2
  const lines = [center]
  for (let offset = step; offset < center; offset += step) lines.push(center - offset, center + offset)
  return lines.sort((a, b) => a - b)
}

function nearest(value: number, targets: number[], threshold: number) {
  let best: number | null = null
  for (const target of targets) {
    if (Math.abs(target - value) <= threshold && (best === null || Math.abs(target - value) < Math.abs(best - value))) best = target
  }
  return best
}

function pickBest(options: { shift: number; guide: number }[], threshold: number) {
  let best: { shift: number; guide: number } | null = null
  for (const option of options) {
    if (Math.abs(option.shift) <= threshold && (!best || Math.abs(option.shift) < Math.abs(best.shift))) best = option
  }
  return best
}

function overlaps(a: Span, b: Span) {
  return a.x1 < b.x2 && a.x2 > b.x1
}

function mirror(span: Span, width: number): Span {
  return { x1: width - span.x2, x2: width - span.x1 }
}

function defaultAccept(width: number): Span {
  return { x1: Math.round(width * 0.14), x2: Math.round(width * 0.46) }
}

function defaultCuts(height: number, footer: boolean) {
  const parts = footer ? [0.3, 0.42, 0.8, 0.9] : [0.32, 0.45, 0.85]
  return parts.map((part) => Math.round(height * part))
}

function spanOf(slices: SliceDesign, kind: 'accept' | 'decline'): Span | null {
  const piece = slices.strips.find((strip) => strip.role === 'buttons')?.pieces?.find((item) => item.kind === kind)
  return piece ? { x1: piece.x, x2: piece.x + piece.width } : null
}

/** Reopens a saved design in the fixed layout; anything else starts from the default layout. */
function initialLayout(saved: SliceDesign | null) {
  if (!saved) return { cuts: [] as number[], footer: true, accept: null as Span | null, decline: null as Span | null }
  const roles = saved.strips.map((strip) => strip.role).join(',')
  const footer = roles === WITH_FOOTER
  const fits = footer || roles === WITHOUT_FOOTER
  const accept = spanOf(saved, 'accept') ?? defaultAccept(saved.sourceWidth)
  return {
    cuts: fits ? saved.strips.slice(1).map((strip) => strip.y) : defaultCuts(saved.sourceHeight, true),
    footer: fits ? footer : true,
    accept,
    decline: spanOf(saved, 'decline') ?? mirror(accept, saved.sourceWidth),
  }
}

/** The buttons slice as pieces left to right, covering the full width. */
function piecesFor(width: number, accept: Span, decline: Span) {
  const areas = [
    { kind: 'accept' as const, ...accept },
    { kind: 'decline' as const, ...decline },
  ].sort((a, b) => a.x1 - b.x1)
  const pieces: Omit<SlicePiece, 'assetId'>[] = []
  let cursor = 0
  for (const area of areas) {
    if (area.x1 > cursor) pieces.push({ kind: 'image', x: cursor, width: area.x1 - cursor })
    pieces.push({ kind: area.kind, x: area.x1, width: area.x2 - area.x1 })
    cursor = area.x2
  }
  if (cursor < width) pieces.push({ kind: 'image', x: cursor, width: width - cursor })
  return pieces
}

function validate(strips: { label: string; height: number }[], accept: Span | null, decline: Span | null) {
  const problems: string[] = []
  if (!accept || !decline) problems.push('Place the Accept and Decline areas.')
  if (accept && decline && overlaps(accept, decline)) problems.push('The Accept and Decline areas overlap.')
  for (const strip of strips) if (strip.height < 4) problems.push(`The ${strip.label} section is too thin. Drag the lines apart.`)
  return problems
}

/** Cuts one rectangle out of the design and uploads it as its own image. */
async function cutAndUpload(eventId: string, image: HTMLImageElement, type: string, x: number, y: number, width: number, height: number, label: string) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('The design could not be cut.')
  context.drawImage(image, x, y, width, height, 0, 0, width, height)
  // Keep JPG designs as JPG (much smaller); everything else as lossless PNG.
  const jpeg = type === 'image/jpeg'
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('The design could not be cut.'))), jpeg ? 'image/jpeg' : 'image/png', 0.92),
  )
  const file = new File([blob], `${label}.${jpeg ? 'jpg' : 'png'}`, { type: blob.type })
  const asset = await invitationApi.uploadAsset(eventId, file)
  return asset.id
}

/** Follows the pointer until release, handling at most one move per screen frame (smooth, fewer redraws). */
function trackPointer(move: (event: PointerEvent) => void, end?: () => void) {
  let pending: PointerEvent | null = null
  let frame: number | null = null
  const onMove = (event: PointerEvent) => {
    pending = event
    if (frame === null)
      frame = requestAnimationFrame(() => {
        frame = null
        if (pending) move(pending)
      })
  }
  const up = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    if (frame !== null) cancelAnimationFrame(frame)
    if (pending) move(pending)
    end?.()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

function messageOf(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback
  const field = error.errors ? Object.values(error.errors)[0]?.[0] : undefined
  return field || error.message || fallback
}
