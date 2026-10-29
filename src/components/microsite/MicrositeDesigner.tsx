import { useQuery } from '@tanstack/react-query'
import { Eye, Loader2, Monitor, Smartphone } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { apiBaseUrl } from '@/api/client'
import { fontApi } from '@/api/fontApi'
import { invitationApi } from '@/api/invitationApi'
import { micrositeApi } from '@/api/micrositeApi'
import { Button } from '@/components/ui/Button'
import { DesignerShell, PanelTabs, useZoom } from '@/designer/DesignerShell'
import { EventDesignerSwitcher } from '@/designer/DesignerSwitcher'
import { LayersPanel } from '@/designer/LayersPanel'
import { emptyGuides, Stage, type StageGuides, type StageItem } from '@/designer/Stage'
import { useHistory } from '@/designer/useHistory'
import { cn } from '@/lib/cn'
import {
  copyHomeLook,
  createElement,
  createImage,
  duplicate,
  frameOf,
  mergePage,
  pageInfo,
  pageView,
  uploadedFontFamily,
  widthOf,
  withFrame,
  type Frame,
  type Layout,
  type MicrositeDesign,
  type MicrositeElement,
  type PageKey,
  type Preset,
  type ShowRule,
} from '@/microsite/design'
import { MicrositeElementView, textStyle, type Sample } from './MicrositeElementView'
import { ElementPanel, InsertPanel, layerIcon, layerLabel, PagePanel, type FontOption } from './MicrositePanels'

type ViewAs = 'pending' | 'accepted' | 'declined' | 'public'

const registered = new Set<string>()
/** Space above the artboard inside the stage's scroll area (Stage PAD). */
const STAGE_PAD = 48

/** Whether an element shows for the chosen "view as" (the same rules the server applies). */
function visibleFor(element: MicrositeElement, viewAs: ViewAs) {
  const isGuest = viewAs !== 'public'
  const action = element.kind === 'button' ? (element.action ?? '') : ''
  const guestOnly =
    element.kind === 'guestName' ||
    element.kind === 'qr' ||
    element.kind === 'reasonBox' ||
    ['accept', 'decline', 'badge', 'invitation', 'confirm', 'download', 'wallet', 'home'].includes(action)
  if (!isGuest && guestOnly) return false
  const show: ShowRule = element.show ?? 'always'
  if (show === 'public') return !isGuest
  if (show === 'pending') return viewAs === 'pending'
  if (show === 'accepted') return viewAs === 'accepted'
  if (show === 'declined') return viewAs === 'declined'
  const acceptedOnly = element.kind === 'qr' || ['badge', 'download', 'wallet'].includes(action)
  return !acceptedOnly || viewAs === 'accepted'
}

/**
 * The microsite designer on the shared designer frame: a desktop (1200 px) and a phone (390 px) layout,
 * rulers, guides, snapping, layers, undo, zoom and pan. Each element keeps its own place in each layout.
 */
export function MicrositeDesigner({
  eventId,
  eventName,
  initial,
  initialPublished,
  initialPublic,
  publicUrl,
  saving,
  onSave,
}: {
  eventId: string
  eventName: string
  initial: MicrositeDesign
  initialPublished: boolean
  initialPublic: boolean
  publicUrl: string | null
  saving: boolean
  onSave: (design: MicrositeDesign, published: boolean, publicEnabled: boolean) => Promise<boolean>
}) {
  const history = useHistory<MicrositeDesign>(initial)
  const site = history.present
  const [pageKey, setPageKey] = useState<PageKey>('home')
  /** The page being edited, in the home page's shape. */
  const design = useMemo(() => pageView(site, pageKey), [site, pageKey])
  const [saved, setSaved] = useState({ design: initial, published: initialPublished, publicEnabled: initialPublic })
  const [published, setPublished] = useState(initialPublished)
  const [publicEnabled, setPublicEnabled] = useState(initialPublic)
  const [layout, setLayout] = useState<Layout>('desktop')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewAs, setViewAs] = useState<ViewAs>('pending')
  const [guides, setGuides] = useState<Record<Layout, StageGuides>>({ desktop: emptyGuides, mobile: emptyGuides })
  const [uploading, setUploading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const zoom = useZoom()
  const stageWrap = useRef<HTMLDivElement>(null)
  const dragStart = useRef<MicrositeDesign | null>(null)

  const width = widthOf(layout)
  const height = layout === 'desktop' ? design.desktopHeight : design.mobileHeight
  const selected = design.elements.find((element) => element.id === selectedId) ?? null
  const dirty = published !== saved.published || publicEnabled !== saved.publicEnabled || JSON.stringify(site) !== JSON.stringify(saved.design)
  // Reply pages show the guest at that step; the home page follows "View as".
  const effectiveView: ViewAs = pageKey === 'thanks' ? 'accepted' : pageKey === 'declined' ? 'declined' : pageKey === 'home' ? viewAs : 'pending'
  const sample: Sample = useMemo(() => ({ name: 'Salman K Juma', position: 'Director, Finance', company: 'Sample Company', event: eventName }), [eventName])

  /* ---------------- editing ---------------- */
  /** Edits the current page as one undo step. */
  const editPage = (change: (page: MicrositeDesign) => MicrositeDesign) => history.commit((current) => mergePage(current, pageKey, change(pageView(current, pageKey))))
  const update = (id: string, change: (element: MicrositeElement) => MicrositeElement) =>
    editPage((page) => ({ ...page, elements: page.elements.map((element) => (element.id === id ? change(element) : element)) }))
  const remove = (id: string) => {
    editPage((page) => ({ ...page, elements: page.elements.filter((element) => element.id !== id) }))
    setSelectedId(null)
  }
  const copy = (element: MicrositeElement) => {
    const next = { ...duplicate(element), locked: false, name: element.name ? `${element.name} copy` : null }
    editPage((page) => ({ ...page, elements: [...page.elements, next] }))
    setSelectedId(next.id)
  }
  function reorder(id: string, direction: 1 | -1) {
    editPage((page) => {
      const index = page.elements.findIndex((element) => element.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= page.elements.length) return page
      const elements = [...page.elements]
      ;[elements[index], elements[target]] = [elements[target], elements[index]]
      return { ...page, elements }
    })
  }

  /* ---------------- fonts ---------------- */
  const fontsQuery = useQuery({ queryKey: ['event-fonts', eventId], queryFn: () => fontApi.list(eventId) })
  const fonts: FontOption[] = useMemo(() => (fontsQuery.data ?? []).map((font) => ({ value: `font:${font.id}`, label: font.name })), [fontsQuery.data])
  useEffect(() => {
    for (const font of fontsQuery.data ?? []) {
      const family = uploadedFontFamily(font.id)
      if (registered.has(family)) continue
      registered.add(family)
      const face = new FontFace(family, `url(${fontApi.fileUrl(font)})`)
      document.fonts.add(face)
      face.load().catch(() => registered.delete(family))
    }
  }, [fontsQuery.data])

  /* ---------------- adding ---------------- */
  /** Top of the visible part of a long desktop page, so new things land where the user is looking. */
  function visibleTop() {
    if (layout !== 'desktop') return 0
    const scroller = stageWrap.current?.querySelector('[data-stage-empty="true"]')?.parentElement
    const factor = zoom.value === 'fit' ? zoom.fit : zoom.value
    return scroller ? Math.max(0, (scroller.scrollTop - STAGE_PAD) / factor) : 0
  }

  function add(preset: Preset) {
    const element = createElement(preset, design, visibleTop())
    editPage((page) => ({ ...page, elements: [...page.elements, element] }))
    setSelectedId(element.id)
  }

  async function addImage(file: File, replaceId?: string) {
    setUploading(true)
    try {
      const asset = await invitationApi.uploadAsset(eventId, file)
      const url = URL.createObjectURL(file)
      const image = new Image()
      image.src = url
      await image.decode()
      const natural = { width: image.naturalWidth, height: image.naturalHeight }
      URL.revokeObjectURL(url)
      if (replaceId) {
        update(replaceId, (element) => ({ ...element, assetId: asset.id }))
      } else {
        const element = createImage(asset.id, natural, design, visibleTop())
        editPage((page) => ({ ...page, elements: [...page.elements, element] }))
        setSelectedId(element.id)
      }
    } catch {
      toast.error('The image could not be uploaded. Use a PNG, JPG or WEBP up to 15 MB.')
    } finally {
      setUploading(false)
    }
  }

  async function setBackgroundImage(file: File | null) {
    if (!file) {
      editPage((page) => ({ ...page, backgroundAssetId: null }))
      return
    }
    setUploading(true)
    try {
      const asset = await invitationApi.uploadAsset(eventId, file)
      editPage((page) => ({ ...page, backgroundAssetId: asset.id }))
    } catch {
      toast.error('The background image could not be uploaded.')
    } finally {
      setUploading(false)
    }
  }

  /* ---------------- save / preview ---------------- */
  async function save() {
    const ok = await onSave(site, published, publicEnabled)
    if (ok) setSaved({ design: site, published, publicEnabled })
    return ok
  }

  async function preview(asGuest: boolean) {
    const tab = window.open('', '_blank')
    setPreviewing(true)
    try {
      const html = await micrositeApi.preview(eventId, site, asGuest, pageKey)
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      if (tab) tab.location.href = url
      else window.open(url, '_blank')
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      tab?.close()
      toast.error('The preview could not be opened.')
    } finally {
      setPreviewing(false)
    }
  }

  function switchTo(next: { layout?: Layout; page?: PageKey }) {
    if (next.layout) setLayout(next.layout)
    if (next.page) {
      setPageKey(next.page)
      setSelectedId(null)
    }
    setEditingId(null)
    zoom.set('fit')
  }

  /* ---------------- stage ---------------- */
  const items: StageItem[] = design.elements.map((element) => {
    const frame = frameOf(element, layout)
    return {
      id: element.id,
      label: layerLabel(element),
      x: frame.x,
      y: frame.y,
      w: frame.w,
      h: frame.h,
      hidden: frame.hidden === true,
      locked: element.locked === true,
      // Cropped images (cover / stretch) resize freely; whole-picture images keep their shape.
      keepRatio: element.kind === 'image' && element.fit === 'contain',
      square: element.kind === 'qr',
    }
  })

  const backgroundUrl = design.backgroundAssetId ? `${apiBaseUrl}/api/public/assets/${design.backgroundAssetId}` : null

  const layersPanel = (
    <>
      <p className="mb-3 text-xs text-muted">{layout === 'desktop' ? 'Desktop' : 'Phone'} layout · eye hides on this layout only.</p>
      <LayersPanel
        rows={design.elements.map((element) => ({
          id: element.id,
          label: layerLabel(element),
          icon: layerIcon(element),
          hidden: frameOf(element, layout).hidden === true,
          locked: element.locked === true,
        }))}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id)
          setEditingId(null)
        }}
        onReorder={(ids) => editPage((page) => ({ ...page, elements: ids.map((id) => page.elements.find((element) => element.id === id)!).filter(Boolean) }))}
        onToggleHidden={(id) => update(id, (element) => withFrame(element, layout, { ...frameOf(element, layout), hidden: !frameOf(element, layout).hidden }))}
        onToggleLocked={(id) => update(id, (element) => ({ ...element, locked: !element.locked }))}
        onRename={(id, name) => update(id, (element) => ({ ...element, name: name || null }))}
        empty="Nothing on the page yet. Add a heading, text, image or buttons."
      />
    </>
  )

  return (
    <DesignerShell
      title="Microsite"
      subtitle={`${eventName} · ${pageInfo[pageKey].label} · ${layout === 'desktop' ? 'Desktop' : 'Phone'}`}
      backLabel="Designs"
      backTo={`/events/${eventId}/designs`}
      switcher={<EventDesignerSwitcher eventId={eventId} kind="microsite" />}
      history={history}
      zoom={{ value: zoom.value, fit: zoom.fit, set: zoom.set }}
      save={{ dirty, saving, onSave: save }}
      actions={
        <Button variant="secondary" className="h-9" disabled={previewing} onClick={() => void preview(viewAs !== 'public')}>
          {previewing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          <span className="hidden xl:inline">Preview</span>
        </Button>
      }
      keys={{
        onDelete: selected && !editingId ? () => remove(selected.id) : undefined,
        onDuplicate: selected ? () => copy(selected) : undefined,
        onEscape: () => {
          setSelectedId(null)
          setEditingId(null)
        },
        onNudge:
          selected && !selected.locked && !editingId
            ? (dx, dy, big) => {
                const step = big ? 10 : 1
                update(selected.id, (element) => {
                  const frame = frameOf(element, layout)
                  return withFrame(element, layout, { ...frame, x: frame.x + dx * step, y: frame.y + dy * step })
                })
              }
            : undefined,
      }}
      left={
        <PanelTabs
          tabs={[
            { key: 'add', label: 'Add', content: <InsertPanel pageKey={pageKey} uploading={uploading} onAdd={add} onImage={(file) => void addImage(file)} /> },
            { key: 'layers', label: `Layers (${design.elements.length})`, content: layersPanel },
          ]}
        />
      }
      right={
        <div className="-m-4">
          {selected ? (
            <ElementPanel
              element={selected}
              layout={layout}
              fonts={fonts}
              uploading={uploading}
              onChange={(next) => update(selected.id, () => next)}
              onReplaceImage={(file) => void addImage(file, selected.id)}
              onDuplicate={() => copy(selected)}
              onDelete={() => remove(selected.id)}
              onReorder={(direction) => reorder(selected.id, direction)}
            />
          ) : (
            <PagePanel
              design={design}
              pageKey={pageKey}
              onCopyHome={() => {
                if (pageKey === 'home') return
                if (design.elements.length > 0 && !window.confirm('Replace this page with a copy of the home page?')) return
                history.commit((current) => copyHomeLook(current, pageKey))
              }}
              layout={layout}
              published={published}
              publicEnabled={publicEnabled}
              publicUrl={publicUrl}
              uploading={uploading}
              onChange={(next) => editPage(() => next)}
              onBackgroundImage={(file) => void setBackgroundImage(file)}
              onPublished={setPublished}
              onPublicEnabled={setPublicEnabled}
            />
          )}
        </div>
      }
    >
      {/* Layout, page and "view as" */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5" role="group" aria-label="Layout">
          {(
            [
              ['desktop', Monitor, 'Desktop'],
              ['mobile', Smartphone, 'Phone'],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={layout === value}
              onClick={() => switchTo({ layout: value })}
              className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs', layout === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground')}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Page
          <select
            value={pageKey}
            onChange={(event) => switchTo({ page: event.target.value as PageKey })}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            {(Object.keys(pageInfo) as PageKey[]).map((key) => (
              <option key={key} value={key}>
                {pageInfo[key].label}
                {key !== 'home' && !(site.pages ?? []).some((page) => page.key === key && page.elements.length > 0) ? ' (built-in)' : ''}
              </option>
            ))}
          </select>
        </label>
        {pageKey === 'home' ? (
          <label className="flex items-center gap-1.5 text-xs text-muted">
            View as
            <select value={viewAs} onChange={(event) => setViewAs(event.target.value as ViewAs)} className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground">
              <option value="pending">Guest · not replied</option>
              <option value="accepted">Guest · accepted</option>
              <option value="declined">Guest · declined</option>
              <option value="public">Public page</option>
            </select>
          </label>
        ) : null}
        <span className="ml-auto hidden text-xs text-muted lg:inline">Double-click text to edit it</span>
      </div>

      <div ref={stageWrap} className="flex min-h-0 flex-1 flex-col">
        <Stage
          width={width}
          height={height}
          unit="px"
          unitPx={1}
          zoom={zoom.value}
          onZoom={zoom.set}
          onFitChange={zoom.setFit}
          fitMode="width"
          items={items}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id)
            if (id !== editingId) setEditingId(null)
          }}
          onItemChange={(id, box, phase) => {
            // The canvas moves the item itself while dragging; the site changes once, at the end (one undo step).
            if (phase !== 'end') return
            history.commit((current) => {
              const page = pageView(current, pageKey)
              return mergePage(current, pageKey, {
                ...page,
                elements: page.elements.map((element) =>
                  element.id === id ? withFrame(element, layout, { ...frameOf(element, layout), x: box.x, y: box.y, w: box.w, h: box.h }) : element,
                ),
              })
            })
          }}
          guides={guides[layout]}
          onGuidesChange={(next) => setGuides((current) => ({ ...current, [layout]: next }))}
          editingId={editingId}
          onItemDoubleClick={(id) => {
            const element = design.elements.find((item) => item.id === id)
            if (element && (element.kind === 'text' || element.kind === 'guestName' || element.kind === 'button')) setEditingId(id)
          }}
          renderEditor={(item, scale) => {
            const element = design.elements.find((entry) => entry.id === item.id)
            if (!element) return null
            const frame = frameOf(element, layout)
            return (
              <div style={{ width: frame.w, height: frame.h, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
                <InlineEditor
                  element={element}
                  frame={frame}
                  onDone={(value) => {
                    setEditingId(null)
                    if (element.kind === 'button') {
                      if (value !== (element.label ?? '')) update(element.id, (entry) => ({ ...entry, label: value }))
                    } else if (value !== (element.text ?? '')) {
                      update(element.id, (entry) => ({ ...entry, text: value }))
                    }
                  }}
                />
              </div>
            )
          }}
          pageHeight={{
            min: 200,
            max: 20000,
            onLive: (next) => {
              if (!dragStart.current) dragStart.current = history.current()
              history.live((current) => {
                const page = pageView(current, pageKey)
                return mergePage(current, pageKey, layout === 'desktop' ? { ...page, desktopHeight: next } : { ...page, mobileHeight: next })
              })
            },
            onEnd: () => {
              if (dragStart.current) history.settle(dragStart.current)
              dragStart.current = null
            },
          }}
          artboardStyle={{
            background: design.background,
            backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
            backgroundSize: '100% auto',
            backgroundRepeat: 'no-repeat',
          }}
          render={(scale, live) => (
            <div style={{ position: 'relative', width, height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
              {design.elements.map((element) => {
                const frame = live?.id === element.id ? { ...frameOf(element, layout), x: live.box.x, y: live.box.y, w: live.box.w, h: live.box.h } : frameOf(element, layout)
                if (frame.hidden || element.id === editingId) return null
                return (
                  <div
                    key={element.id}
                    style={{ position: 'absolute', left: frame.x, top: frame.y, width: frame.w, height: frame.h, opacity: visibleFor(element, effectiveView) ? 1 : 0.25 }}
                  >
                    <MicrositeElementView element={element} frame={frame} sample={sample} />
                  </div>
                )
              })}
            </div>
          )}
        />
      </div>
    </DesignerShell>
  )
}

function InlineEditor({ element, frame, onDone }: { element: MicrositeElement; frame: Frame; onDone: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(element.kind === 'button' ? (element.label ?? '') : (element.text ?? ''))
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <textarea
      ref={ref}
      value={value}
      aria-label="Edit text"
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onDone(value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDone(element.kind === 'button' ? (element.label ?? '') : (element.text ?? ''))
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey || element.kind === 'button')) {
          event.preventDefault()
          onDone(value)
        }
      }}
      className="block size-full resize-none border-0 bg-white/80 p-0 outline outline-2 outline-sky-500"
      style={{ ...textStyle(element, frame), whiteSpace: 'pre-wrap' }}
    />
  )
}
