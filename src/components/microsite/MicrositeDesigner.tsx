import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Eye, Loader2, Minus, Monitor, Plus, Redo2, Save, Smartphone, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { apiBaseUrl } from '@/api/client'
import { fontApi } from '@/api/fontApi'
import { invitationApi } from '@/api/invitationApi'
import { micrositeApi } from '@/api/micrositeApi'
import { Button } from '@/components/ui/Button'
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
  type PageKey,
  uploadedFontFamily,
  widthOf,
  withFrame,
  type Frame,
  type Layout,
  type MicrositeDesign,
  type MicrositeElement,
  type Preset,
  type ShowRule,
} from '@/microsite/design'
import { MicrositeElementView, textStyle, type Sample } from './MicrositeElementView'
import { ElementPanel, InsertPanel, PagePanel, type FontOption } from './MicrositePanels'

type ViewAs = 'pending' | 'accepted' | 'declined' | 'public'
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type Guides = { x: number[]; y: number[] }

const SNAP_PX = 6
const registered = new Set<string>()

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
 * The microsite designer: a free canvas with a desktop (1200 px) and a phone (390 px) layout. Drag to move,
 * handles to resize (they snap to the centre and to other elements), double-click text to edit it,
 * and arrow keys to nudge. Each element keeps its own position in each layout.
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
  onBack,
}: {
  eventId: string
  eventName: string
  initial: MicrositeDesign
  initialPublished: boolean
  initialPublic: boolean
  publicUrl: string | null
  saving: boolean
  onSave: (design: MicrositeDesign, published: boolean, publicEnabled: boolean) => Promise<boolean>
  onBack: (dirty: boolean) => void
}) {
  const [history, setHistory] = useState({ past: [] as MicrositeDesign[], present: initial, future: [] as MicrositeDesign[] })
  const [pageKey, setPageKey] = useState<PageKey>('home')
  /** The whole site (home + reply pages) as saved; `design` is the page being edited, in the home page's shape. */
  const site = history.present
  const design = useMemo(() => pageView(site, pageKey), [site, pageKey])
  const [saved, setSaved] = useState({ design: initial, published: initialPublished, publicEnabled: initialPublic })
  const [published, setPublished] = useState(initialPublished)
  const [publicEnabled, setPublicEnabled] = useState(initialPublic)
  const [layout, setLayout] = useState<Layout>('desktop')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewAs, setViewAs] = useState<ViewAs>('pending')
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [guides, setGuides] = useState<Guides | null>(null)
  const [stageWidth, setStageWidth] = useState(1000)
  const [uploading, setUploading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const width = widthOf(layout)
  const height = layout === 'desktop' ? design.desktopHeight : design.mobileHeight
  const fitScale = Math.min(layout === 'desktop' ? 1 : 1.4, Math.max(0.1, (stageWidth - 64) / width))
  const scale = zoom === 'fit' ? fitScale : zoom
  const selected = design.elements.find((element) => element.id === selectedId) ?? null
  const dirty =
    published !== saved.published || publicEnabled !== saved.publicEnabled || JSON.stringify(site) !== JSON.stringify(saved.design)
  // Reply pages show the guest at that step; the home page follows "View as".
  const effectiveView: ViewAs =
    pageKey === 'thanks' ? 'accepted' : pageKey === 'declined' ? 'declined' : pageKey === 'home' ? viewAs : 'pending'
  const sample: Sample = useMemo(() => ({ name: 'Salman K Juma', position: 'Director, Finance', company: 'Sample Company', event: eventName }), [eventName])

  /* ---------------- history ---------------- */
  /** Saves an edit of the current page into the site and the undo history. */
  const commit = useCallback(
    (next: MicrositeDesign) => {
      setHistory((current) => ({ past: [...current.past.slice(-80), current.present], present: mergePage(current.present, pageKey, next), future: [] }))
    },
    [pageKey],
  )
  /** Updates the current page while dragging, without adding undo steps. */
  const live = useCallback(
    (next: MicrositeDesign) => setHistory((current) => ({ ...current, present: mergePage(current.present, pageKey, next) })),
    [pageKey],
  )
  const undo = useCallback(
    () =>
      setHistory((current) =>
        current.past.length === 0
          ? current
          : { past: current.past.slice(0, -1), present: current.past[current.past.length - 1], future: [current.present, ...current.future] },
      ),
    [],
  )
  const redo = useCallback(
    () =>
      setHistory((current) =>
        current.future.length === 0 ? current : { past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1) },
      ),
    [],
  )

  const update = useCallback(
    (id: string, change: (element: MicrositeElement) => MicrositeElement) =>
      commit({ ...design, elements: design.elements.map((element) => (element.id === id ? change(element) : element)) }),
    [commit, design],
  )

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

  /* ---------------- stage size ---------------- */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(() => setStageWidth(stage.clientWidth))
    observer.observe(stage)
    setStageWidth(stage.clientWidth)
    return () => observer.disconnect()
  }, [])

  /* ---------------- leave warning ---------------- */
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.closest('input, textarea, select, [contenteditable="true"]') || editingId)) return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
        return
      }
      if (!selected) return
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        const copy = duplicate(selected)
        commit({ ...design, elements: [...design.elements, copy] })
        setSelectedId(copy.id)
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        commit({ ...design, elements: design.elements.filter((element) => element.id !== selected.id) })
        setSelectedId(null)
        return
      }
      if (event.key === 'Escape') {
        setSelectedId(null)
        return
      }
      const step = event.shiftKey ? 10 : 1
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
      const delta = arrows[event.key]
      if (delta) {
        event.preventDefault()
        const frame = frameOf(selected, layout)
        update(selected.id, (element) => withFrame(element, layout, { ...frame, x: frame.x + delta[0], y: frame.y + delta[1] }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ---------------- drag and resize ---------------- */
  function snapLines(exclude: string) {
    const xs = [0, width / 2, width]
    const ys = [0, height / 2]
    for (const element of design.elements) {
      if (element.id === exclude) continue
      const frame = frameOf(element, layout)
      if (frame.hidden) continue
      xs.push(frame.x, frame.x + frame.w / 2, frame.x + frame.w)
      ys.push(frame.y, frame.y + frame.h / 2, frame.y + frame.h)
    }
    return { xs, ys }
  }

  function nearest(values: number[], lines: number[], threshold: number) {
    let best: { shift: number; line: number } | null = null
    for (const value of values) {
      for (const line of lines) {
        const shift = line - value
        if (Math.abs(shift) <= threshold && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, line }
      }
    }
    return best
  }

  function startDrag(element: MicrositeElement, event: ReactPointerEvent, handle: Handle | null) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(element.id)
    if (editingId && editingId !== element.id) setEditingId(null)
    const before = design
    const beforeSite = site
    const start = frameOf(element, layout)
    const startX = event.clientX
    const startY = event.clientY
    const lines = snapLines(element.id)
    const threshold = SNAP_PX / scale
    const keepRatio = element.kind === 'image' && handle !== null && handle.length === 2
    let moved = false

    const move = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / scale
      const dy = (moveEvent.clientY - startY) / scale
      if (!moved && Math.abs(dx) + Math.abs(dy) < 2 / scale) return
      moved = true
      const snap = !moveEvent.altKey
      let next: Frame = { ...start }
      const shown: Guides = { x: [], y: [] }
      if (!handle) {
        next.x = start.x + dx
        next.y = start.y + dy
        if (snap) {
          const sx = nearest([next.x, next.x + next.w / 2, next.x + next.w], lines.xs, threshold)
          const sy = nearest([next.y, next.y + next.h / 2, next.y + next.h], lines.ys, threshold)
          if (sx) {
            next.x += sx.shift
            shown.x.push(sx.line)
          }
          if (sy) {
            next.y += sy.shift
            shown.y.push(sy.line)
          }
        }
      } else {
        let { x, y, w, h } = start
        if (handle.includes('e')) w = start.w + dx
        if (handle.includes('s')) h = start.h + dy
        if (handle.includes('w')) {
          w = start.w - dx
          x = start.x + dx
        }
        if (handle.includes('n')) {
          h = start.h - dy
          y = start.y + dy
        }
        if (snap) {
          if (handle.includes('e')) {
            const s = nearest([x + w], lines.xs, threshold)
            if (s) {
              w += s.shift
              shown.x.push(s.line)
            }
          }
          if (handle.includes('w')) {
            const s = nearest([x], lines.xs, threshold)
            if (s) {
              x += s.shift
              w -= s.shift
              shown.x.push(s.line)
            }
          }
          if (handle.includes('s')) {
            const s = nearest([y + h], lines.ys, threshold)
            if (s) {
              h += s.shift
              shown.y.push(s.line)
            }
          }
          if (handle.includes('n')) {
            const s = nearest([y], lines.ys, threshold)
            if (s) {
              y += s.shift
              h -= s.shift
              shown.y.push(s.line)
            }
          }
        }
        w = Math.max(8, w)
        h = Math.max(2, h)
        if (keepRatio && start.w > 0) {
          h = Math.round((w * start.h) / start.w)
          if (handle.includes('n')) y = start.y + start.h - h
        }
        if (handle.includes('w')) x = Math.min(x, start.x + start.w - 8)
        next = { ...start, x, y, w, h }
      }
      next = { ...next, x: Math.round(next.x), y: Math.round(next.y), w: Math.round(next.w), h: Math.round(next.h) }
      setGuides(shown.x.length || shown.y.length ? shown : null)
      live({ ...before, elements: before.elements.map((item) => (item.id === element.id ? withFrame(item, layout, next) : item)) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setGuides(null)
      if (moved) {
        setHistory((current) => ({ past: [...current.past.slice(-80), beforeSite], present: current.present, future: [] }))
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startPageResize(event: ReactPointerEvent) {
    event.preventDefault()
    const before = design
    const beforeSite = site
    const startY = event.clientY
    const startHeight = height
    const move = (moveEvent: PointerEvent) => {
      const next = Math.max(200, Math.min(20000, Math.round(startHeight + (moveEvent.clientY - startY) / scale)))
      live(layout === 'desktop' ? { ...before, desktopHeight: next } : { ...before, mobileHeight: next })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setHistory((current) => ({ past: [...current.past.slice(-80), beforeSite], present: current.present, future: [] }))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /* ---------------- adding ---------------- */
  function visibleTop() {
    const scroller = scrollRef.current
    return scroller ? Math.max(0, (scroller.scrollTop - 32) / scale) : 0
  }

  function add(preset: Preset) {
    const element = createElement(preset, design, layout === 'desktop' ? visibleTop() : 0)
    commit({ ...design, elements: [...design.elements, element] })
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
        const element = createImage(asset.id, natural, design, layout === 'desktop' ? visibleTop() : 0)
        commit({ ...design, elements: [...design.elements, element] })
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
      commit({ ...design, backgroundAssetId: null })
      return
    }
    setUploading(true)
    try {
      const asset = await invitationApi.uploadAsset(eventId, file)
      commit({ ...design, backgroundAssetId: asset.id })
    } catch {
      toast.error('The background image could not be uploaded.')
    } finally {
      setUploading(false)
    }
  }

  function reorder(id: string, direction: 1 | -1) {
    const index = design.elements.findIndex((element) => element.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= design.elements.length) return
    const elements = [...design.elements]
    ;[elements[index], elements[target]] = [elements[target], elements[index]]
    commit({ ...design, elements })
  }

  /* ---------------- save / preview ---------------- */
  async function save() {
    const ok = await onSave(site, published, publicEnabled)
    if (ok) setSaved({ design: site, published, publicEnabled })
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

  const backgroundUrl = design.backgroundAssetId ? `${apiBaseUrl}/api/public/assets/${design.backgroundAssetId}` : null

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-hover hover:text-foreground" onClick={() => onBack(dirty)}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </button>
        <span className="h-5 w-px bg-border" aria-hidden="true" />
        <h1 className="truncate text-sm font-semibold">Microsite · {eventName}</h1>

        <div className="mx-auto flex items-center gap-1 rounded-lg border border-border p-0.5" role="group" aria-label="Layout">
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
              onClick={() => {
                setLayout(value)
                setZoom('fit')
                setEditingId(null)
              }}
              className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm', layout === value ? 'bg-accent text-accent-foreground' : 'text-muted hover:text-foreground')}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-muted">
          Page
          <select
            value={pageKey}
            onChange={(event) => {
              setPageKey(event.target.value as PageKey)
              setSelectedId(null)
              setEditingId(null)
              setZoom('fit')
            }}
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
          <label className="hidden items-center gap-1.5 text-xs text-muted xl:flex">
            View as
            <select value={viewAs} onChange={(event) => setViewAs(event.target.value as ViewAs)} className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground">
              <option value="pending">Guest · not replied</option>
              <option value="accepted">Guest · accepted</option>
              <option value="declined">Guest · declined</option>
              <option value="public">Public page</option>
            </select>
          </label>
        ) : null}

        <div className="flex items-center gap-0.5">
          <IconButton label="Zoom out" onClick={() => setZoom(Math.max(0.1, Math.round((scale - 0.1) * 10) / 10))}>
            <Minus className="size-4" />
          </IconButton>
          <button type="button" className="h-8 min-w-14 rounded-md px-2 text-xs tabular-nums text-muted hover:bg-hover" onClick={() => setZoom('fit')} title="Fit to screen">
            {Math.round(scale * 100)}%
          </button>
          <IconButton label="Zoom in" onClick={() => setZoom(Math.min(3, Math.round((scale + 0.1) * 10) / 10))}>
            <Plus className="size-4" />
          </IconButton>
          <IconButton label="Undo" disabled={history.past.length === 0} onClick={undo}>
            <Undo2 className="size-4" />
          </IconButton>
          <IconButton label="Redo" disabled={history.future.length === 0} onClick={redo}>
            <Redo2 className="size-4" />
          </IconButton>
        </div>

        <Button variant="secondary" className="h-9" disabled={previewing} onClick={() => void preview(viewAs !== 'public')}>
          {previewing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          Preview
        </Button>
        <Button className="h-9" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <InsertPanel
          design={design}
          pageKey={pageKey}
          layout={layout}
          selectedId={selectedId}
          uploading={uploading}
          onAdd={add}
          onImage={(file) => void addImage(file)}
          onSelect={(id) => {
            setSelectedId(id)
            setEditingId(null)
          }}
          onToggleHidden={(id) => {
            const element = design.elements.find((item) => item.id === id)
            if (!element) return
            const frame = frameOf(element, layout)
            update(id, (item) => withFrame(item, layout, { ...frame, hidden: !frame.hidden }))
          }}
          onReorder={reorder}
        />

        {/* Canvas */}
        <main
          ref={stageRef}
          className="relative min-w-0 flex-1 bg-[#e9e7e2] dark:bg-[#141413]"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget || (event.target as HTMLElement).dataset.stage === 'true') {
              setSelectedId(null)
              setEditingId(null)
            }
          }}
        >
          <div ref={scrollRef} className="absolute inset-0 overflow-auto" data-stage="true">
            <div className="mx-auto py-8" style={{ width: width * scale + 64 }} data-stage="true">
              <div className="relative mx-auto" style={{ width: width * scale, height: height * scale + 24 }} data-stage="true">
                <div
                  className="absolute left-0 top-0 origin-top-left shadow-[0_10px_40px_rgba(0,0,0,0.15)]"
                  style={{
                    width,
                    height,
                    transform: `scale(${scale})`,
                    background: design.background,
                    backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
                    backgroundSize: '100% auto',
                    backgroundRepeat: 'no-repeat',
                    overflow: 'hidden',
                  }}
                  onPointerDown={(event) => {
                    if (event.target === event.currentTarget) {
                      setSelectedId(null)
                      setEditingId(null)
                    }
                  }}
                >
                  {design.elements.map((element) => {
                    const frame = frameOf(element, layout)
                    if (frame.hidden) return null
                    const isSelected = element.id === selectedId
                    const dimmed = !visibleFor(element, effectiveView)
                    const editing = editingId === element.id
                    return (
                      <div
                        key={element.id}
                        role="button"
                        tabIndex={-1}
                        aria-label={`${element.kind} element`}
                        className={cn('absolute select-none', !editing && 'cursor-move', !isSelected && 'hover:outline hover:outline-1 hover:outline-sky-400')}
                        style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h, opacity: dimmed ? 0.25 : 1 }}
                        onPointerDown={(event) => (editing ? event.stopPropagation() : startDrag(element, event, null))}
                        onDoubleClick={() => {
                          if (element.kind === 'text' || element.kind === 'guestName' || element.kind === 'button') setEditingId(element.id)
                        }}
                      >
                        {editing ? (
                          <InlineEditor
                            element={element}
                            frame={frame}
                            onDone={(value) => {
                              setEditingId(null)
                              if (element.kind === 'button') {
                                if (value !== (element.label ?? '')) update(element.id, (item) => ({ ...item, label: value }))
                              } else if (value !== (element.text ?? '')) {
                                update(element.id, (item) => ({ ...item, text: value }))
                              }
                            }}
                          />
                        ) : (
                          <MicrositeElementView element={element} frame={frame} sample={sample} />
                        )}
                      </div>
                    )
                  })}

                  {/* Selection box and handles, drawn above everything */}
                  {selected && !frameOf(selected, layout).hidden && editingId !== selected.id ? (
                    <SelectionBox frame={frameOf(selected, layout)} scale={scale} onHandle={(handle, event) => startDrag(selected, event, handle)} />
                  ) : null}

                  {guides?.x.map((x) => (
                    <div key={`gx-${x}`} className="pointer-events-none absolute inset-y-0 bg-fuchsia-500" style={{ left: x, width: 1 / scale }} />
                  ))}
                  {guides?.y.map((y) => (
                    <div key={`gy-${y}`} className="pointer-events-none absolute inset-x-0 bg-fuchsia-500" style={{ top: y, height: 1 / scale }} />
                  ))}
                </div>

                {/* Page height handle */}
                <button
                  type="button"
                  aria-label="Drag to change the page height"
                  title="Drag to change the page height"
                  className="absolute left-1/2 flex h-5 w-24 -translate-x-1/2 cursor-ns-resize items-center justify-center rounded-full border border-border bg-surface text-[10px] tabular-nums text-muted shadow"
                  style={{ top: height * scale + 2 }}
                  onPointerDown={startPageResize}
                >
                  {height}px
                </button>
              </div>
            </div>
          </div>
        </main>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-surface">
          {selected ? (
            <ElementPanel
              element={selected}
              layout={layout}
              fonts={fonts}
              uploading={uploading}
              onChange={(next) => update(selected.id, () => next)}
              onReplaceImage={(file) => void addImage(file, selected.id)}
              onDuplicate={() => {
                const copy = duplicate(selected)
                commit({ ...design, elements: [...design.elements, copy] })
                setSelectedId(copy.id)
              }}
              onDelete={() => {
                commit({ ...design, elements: design.elements.filter((element) => element.id !== selected.id) })
                setSelectedId(null)
              }}
              onReorder={(direction) => reorder(selected.id, direction)}
            />
          ) : (
            <PagePanel
              design={design}
              pageKey={pageKey}
              onCopyHome={() => {
                if (pageKey === 'home') return
                if (design.elements.length > 0 && !window.confirm('Replace this page with a copy of the home page?')) return
                setHistory((current) => ({ past: [...current.past.slice(-80), current.present], present: copyHomeLook(current.present, pageKey), future: [] }))
              }}
              layout={layout}
              published={published}
              publicEnabled={publicEnabled}
              publicUrl={publicUrl}
              uploading={uploading}
              onChange={commit}
              onBackgroundImage={(file) => void setBackgroundImage(file)}
              onPublished={setPublished}
              onPublicEnabled={setPublicEnabled}
            />
          )}
        </aside>
      </div>
    </div>
  )
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  )
}

const handles: { handle: Handle; style: CSSProperties; cursor: string }[] = [
  { handle: 'nw', style: { left: 0, top: 0 }, cursor: 'nwse-resize' },
  { handle: 'n', style: { left: '50%', top: 0 }, cursor: 'ns-resize' },
  { handle: 'ne', style: { left: '100%', top: 0 }, cursor: 'nesw-resize' },
  { handle: 'e', style: { left: '100%', top: '50%' }, cursor: 'ew-resize' },
  { handle: 'se', style: { left: '100%', top: '100%' }, cursor: 'nwse-resize' },
  { handle: 's', style: { left: '50%', top: '100%' }, cursor: 'ns-resize' },
  { handle: 'sw', style: { left: 0, top: '100%' }, cursor: 'nesw-resize' },
  { handle: 'w', style: { left: 0, top: '50%' }, cursor: 'ew-resize' },
]

function SelectionBox({ frame, scale, onHandle }: { frame: Frame; scale: number; onHandle: (handle: Handle, event: ReactPointerEvent) => void }) {
  const size = 10 / scale
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h, outline: `${1.5 / scale}px solid #0ea5e9` }}
    >
      {handles.map(({ handle, style, cursor }) => (
        <span
          key={handle}
          className="pointer-events-auto absolute rounded-[2px] border border-sky-500 bg-white"
          style={{ ...style, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, cursor, borderWidth: 1 / scale }}
          onPointerDown={(event) => onHandle(handle, event)}
        />
      ))}
    </div>
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
