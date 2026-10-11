import { Magnet, Minus, Plus, Ruler as RulerIcon, SplitSquareHorizontal, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import {
  clampGuestBand,
  clampImagePlacement,
  snapAxis,
  type DesignGuides,
  type GuestBand,
  type ImagePlacement,
  type ImageSlot,
  type SnapEdge,
  type SnapTarget,
} from '@/invitations/design'
import { cn } from '@/lib/cn'

export type CanvasZoom = 'fit' | number

export const zoomStops = [0.5, 0.75, 1, 1.25, 1.5, 2]

export type ImageMetrics = {
  top: number
  height: number
  width: number
  canvasHeight: number
  naturalWidth: number
  naturalHeight: number
}

export type CanvasSelection = { kind: 'band' } | { kind: 'image'; slot: ImageSlot } | null

export const imageLabels: Record<ImageSlot, string> = {
  header: 'Invitation header',
  details: 'Event details',
  accept: 'Accept button',
  decline: 'Decline button',
}

type Box = { left: number; top: number; width: number; height: number }

type Axis = 'vertical' | 'horizontal'

type GuideRef = { axis: Axis; index: number }

type GuideDrag = {
  axis: Axis
  index: number | null
  position: number
  started: boolean
  pointerX: number
  pointerY: number
}

type BandDrag = {
  mode: 'move' | 'n' | 's'
  started: boolean
  pointerX: number
  pointerY: number
  originY: number
  originHeight: number
  originTop: number
  y: number
  height: number
}

type ImageDrag = {
  slot: ImageSlot
  mode: string
  started: boolean
  pointerX: number
  pointerY: number
  originX: number
  originY: number
  originWidth: number
  originHeight: number
  boxLeft: number
  boxTop: number
  ratio: number
  lock: boolean
  storedHeight: number | null
  x: number
  y: number
  width: number
  height: number
}

/** Pointer movement (screen px) before a press turns into a drag. */
const dragThreshold = 4

const mobileWidth = 390

const guideColor = '#2f80ed'

const snapColor = '#d6336c'

type InvitationCanvasProps = {
  html: string
  width: number
  height: number | null
  band: GuestBand
  bandVisible: boolean
  placements: Record<ImageSlot, ImagePlacement | null>
  selection: CanvasSelection
  editable: boolean
  onSelect: (selection: NonNullable<CanvasSelection>) => void
  onBandCommit: (patch: Partial<GuestBand>) => void
  onImageCommit: (slot: ImageSlot, placement: ImagePlacement) => void
  onImageMetrics: (metrics: ImageMetrics | null) => void
  zoom: CanvasZoom
  onZoomChange: (zoom: CanvasZoom) => void
  rulers: boolean
  onRulers: (value: boolean) => void
  guidesVisible: boolean
  onGuidesVisible: (value: boolean) => void
  snap: boolean
  onSnap: (value: boolean) => void
  guides: DesignGuides | null
  onGuidesChange: (guides: DesignGuides | null) => void
  onClearGuides: () => void
  mobile: boolean
  heading: string
  headingAside?: ReactNode
}

export function InvitationCanvas({
  html,
  width,
  height,
  band,
  bandVisible,
  placements,
  selection,
  editable,
  onSelect,
  onBandCommit,
  onImageCommit,
  onImageMetrics,
  zoom,
  onZoomChange,
  rulers,
  onRulers,
  guidesVisible,
  onGuidesVisible,
  snap,
  onSnap,
  guides,
  onGuidesChange,
  onClearGuides,
  mobile,
  heading,
  headingAside,
}: InvitationCanvasProps) {
  const paneRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const bandDragRef = useRef<BandDrag | null>(null)
  const imageDragRef = useRef<ImageDrag | null>(null)
  const guideDragRef = useRef<GuideDrag | null>(null)
  const [pane, setPane] = useState({ width: 640, height: 640 })
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const [bandBox, setBandBox] = useState<{ top: number; height: number } | null>(null)
  const [imageBoxes, setImageBoxes] = useState<Partial<Record<ImageSlot, Box>>>({})
  const [bandDraft, setBandDraft] = useState<{ top: number; height: number } | null>(null)
  const [imageDraft, setImageDraft] = useState<Box | null>(null)
  const [guideDrag, setGuideDrag] = useState<GuideDrag | null>(null)
  const [selectedGuide, setSelectedGuide] = useState<GuideRef | null>(null)
  const [snapMark, setSnapMark] = useState<{ x: SnapTarget | null; y: SnapTarget | null }>({ x: null, y: null })

  const selectedSlot = selection?.kind === 'image' ? selection.slot : null
  const bandSelected = selection?.kind === 'band'
  const showRulers = rulers && editable
  const showGuides = guidesVisible && editable

  const guidesRef = useRef(guides)
  guidesRef.current = guides
  const metricsRef = useRef(onImageMetrics)
  metricsRef.current = onImageMetrics

  useEffect(() => {
    const node = paneRef.current
    if (!node) return
    const measure = () => setPane({ width: node.clientWidth, height: node.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const gutter = showRulers ? 24 : 0
  const fitHeight = height ?? contentHeight
  const fit = Math.min(
    1,
    Math.max(0.1, (pane.width - 64 - gutter) / width),
    fitHeight ? Math.max(0.1, (pane.height - 32 - gutter) / fitHeight) : 1,
  )
  const scale = mobile ? Math.min(fit, mobileWidth / width) : zoom === 'fit' ? fit : zoom
  const frameHeight = height ?? contentHeight ?? Math.max(480, Math.round(pane.height / scale))
  const canvasHeight = height ?? contentHeight ?? frameHeight
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  useEffect(() => {
    const id = requestAnimationFrame(() => readFrame())
    return () => cancelAnimationFrame(id)
  }, [html, frameHeight, selectedSlot, bandVisible, editable])

  // Drop the guide selection when the guide it points at no longer exists.
  useEffect(() => {
    if (!selectedGuide) return
    const list = guides?.[selectedGuide.axis] ?? []
    if (selectedGuide.index >= list.length) setSelectedGuide(null)
  }, [guides, selectedGuide])

  useEffect(() => {
    if (!selectedGuide) return
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        removeSelectedGuide()
      }
      if (event.key === 'Escape') setSelectedGuide(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedGuide, guides])

  function frameDocument() {
    const doc = frameRef.current?.contentDocument
    const HtmlElement = doc?.defaultView?.HTMLElement
    const canvas = doc?.querySelector('[data-invitation-canvas]')
    if (!doc || !HtmlElement || !(canvas instanceof HtmlElement)) return null
    return { doc, HtmlElement, canvas }
  }

  function readFrame() {
    const frame = frameDocument()
    if (!frame) return
    const { doc, HtmlElement, canvas } = frame
    const measuredHeight = Math.ceil(canvas.offsetHeight)
    setContentHeight((current) => (current === measuredHeight ? current : measuredHeight))
    const row = doc.querySelector('[data-guest-band="true"]')
    setBandBox(bandVisible && row instanceof HtmlElement ? measureBand(row, canvas) : null)
    const boxes: Partial<Record<ImageSlot, Box>> = {}
    for (const image of doc.querySelectorAll('img[data-image-slot]')) {
      if (!(image instanceof HtmlElement)) continue
      const slot = image.getAttribute('data-image-slot') as ImageSlot | null
      if (slot) boxes[slot] = measureElement(image, canvas)
    }
    setImageBoxes(boxes)
    const selectedBox = selectedSlot ? boxes[selectedSlot] : undefined
    if (!selectedSlot || !selectedBox) {
      metricsRef.current(null)
      return
    }
    const image = doc.querySelector(`img[data-image-slot="${selectedSlot}"]`)
    const ImageElement = doc.defaultView?.HTMLImageElement
    const natural = ImageElement && image instanceof ImageElement ? image : null
    metricsRef.current({
      top: selectedBox.top,
      height: selectedBox.height,
      width: selectedBox.width,
      canvasHeight: measuredHeight,
      naturalWidth: natural?.naturalWidth ?? 0,
      naturalHeight: natural?.naturalHeight ?? 0,
    })
  }

  // ---------------------------------------------------------------------------
  // Snapping

  function snapTargets(axis: Axis, excludeSlot: ImageSlot | null, excludeBand: boolean): SnapTarget[] {
    const targets: SnapTarget[] =
      axis === 'vertical'
        ? [
            { value: 0, kind: 'edge' },
            { value: width / 2, kind: 'center' },
            { value: width, kind: 'edge' },
          ]
        : [
            { value: 0, kind: 'edge' },
            { value: canvasHeight / 2, kind: 'center' },
            { value: canvasHeight, kind: 'edge' },
          ]
    if (showGuides) {
      for (const value of guidesRef.current?.[axis] ?? []) targets.push({ value, kind: 'guide' })
    }
    const frame = frameDocument()
    if (!frame) return targets
    const { doc, HtmlElement, canvas } = frame
    if (axis === 'horizontal' && !excludeBand) {
      const row = doc.querySelector('[data-guest-band="true"]')
      if (row instanceof HtmlElement) {
        const measured = measureBand(row, canvas)
        targets.push(
          { value: measured.top, kind: 'element' },
          { value: measured.top + measured.height / 2, kind: 'element' },
          { value: measured.top + measured.height, kind: 'element' },
        )
      }
    }
    for (const image of doc.querySelectorAll('img[data-image-slot]')) {
      if (!(image instanceof HtmlElement)) continue
      if (image.getAttribute('data-image-slot') === excludeSlot) continue
      const measured = measureElement(image, canvas)
      if (axis === 'vertical') {
        targets.push(
          { value: measured.left, kind: 'element' },
          { value: measured.left + measured.width / 2, kind: 'element' },
          { value: measured.left + measured.width, kind: 'element' },
        )
      } else {
        targets.push(
          { value: measured.top, kind: 'element' },
          { value: measured.top + measured.height / 2, kind: 'element' },
          { value: measured.top + measured.height, kind: 'element' },
        )
      }
    }
    return targets
  }

  function passedThreshold(event: PointerEvent<HTMLElement>, pointerX: number, pointerY: number) {
    return Math.hypot(event.clientX - pointerX, event.clientY - pointerY) >= dragThreshold
  }

  // ---------------------------------------------------------------------------
  // Guest band

  function paintBand(y: number, bandHeight: number) {
    const frame = frameDocument()
    if (!frame) return
    const { doc, HtmlElement } = frame
    const spacer = doc.querySelector('[data-guest-band="spacer"] td')
    const cell = doc.querySelector('[data-guest-band-cell]')
    if (spacer instanceof HtmlElement) {
      spacer.setAttribute('height', String(y))
      spacer.style.height = `${y}px`
    }
    if (cell instanceof HtmlElement) {
      cell.setAttribute('height', String(bandHeight))
      cell.style.height = `${bandHeight}px`
    }
  }

  function beginBandDrag(event: PointerEvent<HTMLElement>, mode: 'move' | 'n' | 's') {
    if (!bandBox || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedGuide(null)
    bandDragRef.current = {
      mode,
      started: false,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originY: band.y,
      originHeight: band.height,
      originTop: bandBox.top,
      y: band.y,
      height: band.height,
    }
  }

  function moveBandDrag(event: PointerEvent<HTMLElement>) {
    const drag = bandDragRef.current
    if (!drag) return
    if (!drag.started) {
      if (!passedThreshold(event, drag.pointerX, drag.pointerY)) return
      drag.started = true
      setBandDraft({ top: drag.originTop, height: drag.originHeight })
    }
    const scaleNow = scaleRef.current || 1
    const dy = (event.clientY - drag.pointerY) / scaleNow
    let y = drag.originY
    let bandHeight = drag.originHeight
    if (drag.mode === 'move') y = drag.originY + dy
    if (drag.mode === 's') bandHeight = drag.originHeight + dy
    if (drag.mode === 'n') {
      y = drag.originY + dy
      bandHeight = drag.originHeight - dy
    }
    let mark: SnapTarget | null = null
    if (snap) {
      const threshold = 8 / scaleNow
      const targets = snapTargets('horizontal', null, true)
      if (drag.mode === 'move') {
        const visualTop = drag.originTop + (y - drag.originY)
        const snapped = snapAxis(visualTop, bandHeight, targets, threshold)
        y = drag.originY + (snapped.origin - drag.originTop)
        mark = snapped.target
      } else if (drag.mode === 's') {
        const snapped = snapAxis(drag.originTop, bandHeight, targets, threshold, ['end'])
        bandHeight = snapped.origin + bandHeight - drag.originTop
        mark = snapped.target
      } else {
        const fixedBottom = drag.originTop + drag.originHeight
        const visualTop = drag.originTop + (y - drag.originY)
        const snapped = snapAxis(visualTop, bandHeight, targets, threshold, ['start'])
        y = drag.originY + (snapped.origin - drag.originTop)
        bandHeight = fixedBottom - snapped.origin
        mark = snapped.target
      }
    }
    setSnapMark({ x: null, y: mark })
    const next = clampGuestBand({ ...band, y, height: bandHeight })
    drag.y = next.y
    drag.height = next.height
    setBandDraft({ top: drag.originTop + (next.y - drag.originY), height: next.height })
    paintBand(next.y, next.height)
  }

  function endBandDrag(event: PointerEvent<HTMLElement>) {
    const drag = bandDragRef.current
    if (!drag) return
    bandDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!drag.started) return
    setBandDraft(null)
    setSnapMark({ x: null, y: null })
    if (event.type === 'pointercancel') {
      paintBand(drag.originY, drag.originHeight)
      return
    }
    onBandCommit({ y: drag.y, height: drag.height })
  }

  // ---------------------------------------------------------------------------
  // Images

  function paintImage(slot: ImageSlot, frame: ImagePlacement) {
    const found = frameDocument()
    if (!found) return
    const { doc, HtmlElement } = found
    const xCell = doc.querySelector(`[data-image-x="${slot}"]`)
    const yCell = doc.querySelector(`[data-image-y="${slot}"]`)
    const pad = doc.querySelector(`[data-image-pad="${slot}"]`)
    const image = doc.querySelector(`img[data-image-slot="${slot}"]`)
    if (xCell instanceof HtmlElement) {
      xCell.setAttribute('width', String(frame.x))
      xCell.style.width = `${frame.x}px`
    }
    if (yCell instanceof HtmlElement) {
      yCell.setAttribute('height', String(frame.y))
      yCell.style.height = `${frame.y}px`
    }
    const reply = doc.querySelector(`[data-image-gap="${slot}"]`)
    if (pad instanceof HtmlElement && !(reply instanceof HtmlElement)) pad.style.padding = `${frame.y}px 0 0 ${frame.x}px`
    if (image instanceof HtmlElement) {
      image.setAttribute('data-canvas-x', String(frame.x))
      image.setAttribute('data-canvas-y', String(frame.y))
      image.setAttribute('width', String(frame.width))
      image.style.width = `${frame.width}px`
      image.style.maxWidth = 'none'
      if (frame.height) {
        image.setAttribute('height', String(frame.height))
        image.style.height = `${frame.height}px`
      } else {
        image.removeAttribute('height')
        image.style.height = 'auto'
      }
    }
    if (reply instanceof HtmlElement) layoutReplyRow(doc, HtmlElement)
  }

  function beginImageDrag(event: PointerEvent<HTMLElement>, mode: string) {
    const slot = selectedSlot
    const box = slot ? imageBoxes[slot] : undefined
    if (!slot || !box || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedGuide(null)
    const doc = frameRef.current?.contentDocument
    const ImageElement = doc?.defaultView?.HTMLImageElement
    const image = doc?.querySelector(`img[data-image-slot="${slot}"]`)
    const natural = ImageElement && image instanceof ImageElement ? image : null
    const ratio =
      natural && natural.naturalWidth > 0 && natural.naturalHeight > 0
        ? natural.naturalWidth / natural.naturalHeight
        : box.width / Math.max(1, box.height)
    const current = placements[slot] ?? { x: 0, y: 0, width: box.width, height: null, lockRatio: true }
    imageDragRef.current = {
      slot,
      mode,
      started: false,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: current.x,
      originY: current.y,
      originWidth: current.width,
      originHeight: current.height ?? box.height,
      boxLeft: box.left,
      boxTop: box.top,
      ratio,
      lock: current.lockRatio,
      storedHeight: current.height,
      x: current.x,
      y: current.y,
      width: current.width,
      height: current.height ?? box.height,
    }
  }

  function moveImageDrag(event: PointerEvent<HTMLElement>) {
    const drag = imageDragRef.current
    if (!drag) return
    if (!drag.started) {
      if (!passedThreshold(event, drag.pointerX, drag.pointerY)) return
      drag.started = true
    }
    const scaleNow = scaleRef.current || 1
    const dx = (event.clientX - drag.pointerX) / scaleNow
    const dy = (event.clientY - drag.pointerY) / scaleNow
    let x = drag.originX
    let y = drag.originY
    let nextWidth = drag.originWidth
    let nextHeight = drag.originHeight
    if (drag.mode === 'move') {
      x += dx
      y += dy
    } else {
      if (drag.mode.includes('e')) nextWidth += dx
      if (drag.mode.includes('w')) {
        nextWidth -= dx
        x += dx
      }
      if (drag.mode.includes('s')) nextHeight += dy
      if (drag.mode.includes('n')) {
        nextHeight -= dy
        y += dy
      }
      if (drag.lock) {
        if (drag.mode.includes('e') || drag.mode.includes('w')) {
          const scaledHeight = nextWidth / drag.ratio
          if (drag.mode.includes('n')) y += nextHeight - scaledHeight
          nextHeight = scaledHeight
        } else {
          const scaledWidth = nextHeight * drag.ratio
          if (drag.mode.includes('w')) x += nextWidth - scaledWidth
          nextWidth = scaledWidth
        }
      }
    }
    const reply = drag.slot === 'accept' || drag.slot === 'decline'
    let markX: SnapTarget | null = null
    let markY: SnapTarget | null = null
    if (snap) {
      const threshold = 8 / scaleNow
      const visualLeft = drag.boxLeft + (x - drag.originX)
      const visualTop = drag.boxTop + (y - drag.originY)
      const xEdges = snapEdges(drag.mode, 'x')
      const yEdges = snapEdges(drag.mode, 'y')
      if (xEdges) {
        const snapped = snapAxis(visualLeft, nextWidth, snapTargets('vertical', drag.slot, true), threshold, xEdges)
        x = drag.originX + (snapped.origin - drag.boxLeft)
        markX = snapped.target
      }
      if (yEdges) {
        const snapped = snapAxis(visualTop, nextHeight, snapTargets('horizontal', drag.slot, false), threshold, yEdges)
        y = drag.originY + (snapped.origin - drag.boxTop)
        markY = snapped.target
      }
    }
    if (reply && drag.mode === 'move') {
      const separated = separateReply(drag.slot, x, nextWidth, drag.originX)
      if (separated !== x) markX = null
      x = separated
    }
    setSnapMark({ x: markX, y: markY })
    const clamped = clampImagePlacement({ x, y, width: nextWidth, height: Math.round(nextHeight), lockRatio: drag.lock }, width)
    drag.x = clamped.x
    drag.y = clamped.y
    drag.width = clamped.width
    drag.height = clamped.height ?? Math.round(nextHeight)
    setImageDraft({
      left: drag.boxLeft + (drag.x - drag.originX),
      top: drag.boxTop + (drag.y - drag.originY),
      width: drag.width,
      height: drag.height,
    })
    paintImage(drag.slot, { x: drag.x, y: drag.y, width: drag.width, height: drag.height, lockRatio: drag.lock })
  }

  function endImageDrag(event: PointerEvent<HTMLElement>) {
    const drag = imageDragRef.current
    if (!drag) return
    imageDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    // A press without movement is a selection, never a change.
    if (!drag.started) return
    setImageDraft(null)
    setSnapMark({ x: null, y: null })
    const resized = drag.mode !== 'move'
    const committed: ImagePlacement = {
      x: drag.x,
      y: drag.y,
      width: drag.width,
      height: drag.lock || (!resized && drag.storedHeight == null) ? null : drag.height,
      lockRatio: drag.lock,
    }
    if (event.type === 'pointercancel') {
      const original = placements[drag.slot] ?? { x: drag.originX, y: drag.originY, width: drag.originWidth, height: drag.storedHeight, lockRatio: drag.lock }
      paintImage(drag.slot, original)
      return
    }
    // Leave the document exactly as the committed placement renders it, so no
    // temporary drag styling survives when the regenerated HTML is identical.
    paintImage(drag.slot, committed)
    onImageCommit(drag.slot, committed)
  }

  function layoutReplyRow(doc: Document, HtmlElement: typeof window.HTMLElement) {
    const row = doc.querySelector('[data-rsvp-row]')
    if (!(row instanceof HtmlElement)) return
    const items = (['accept', 'decline'] as const)
      .flatMap((name) => {
        const image = doc.querySelector(`img[data-image-slot="${name}"]`)
        const gap = doc.querySelector(`[data-image-gap="${name}"]`)
        const pad = doc.querySelector(`[data-image-pad="${name}"]`)
        if (!(image instanceof HtmlElement) || !(gap instanceof HtmlElement) || !(pad instanceof HtmlElement)) return []
        return [
          {
            x: Number(image.getAttribute('data-canvas-x') || 0),
            y: Number(image.getAttribute('data-canvas-y') || 0),
            width: Number(image.getAttribute('width') || 0),
            gap,
            pad,
          },
        ]
      })
      .sort((left, right) => left.x - right.x)
    const tail = row.lastElementChild
    let cursor = 0
    for (const item of items) {
      const gap = Math.max(0, item.x - cursor)
      item.gap.setAttribute('width', String(gap))
      item.gap.style.width = `${gap}px`
      item.pad.setAttribute('width', String(item.width))
      item.pad.style.width = `${item.width}px`
      item.pad.style.padding = `${item.y}px 0 0 0`
      if (tail) {
        row.insertBefore(item.gap, tail)
        row.insertBefore(item.pad, tail)
      }
      cursor += gap + item.width
    }
  }

  function separateReply(slot: ImageSlot, x: number, nextWidth: number, originX: number) {
    const doc = frameRef.current?.contentDocument
    const HtmlElement = doc?.defaultView?.HTMLElement
    const otherName = slot === 'accept' ? 'decline' : 'accept'
    const other = doc?.querySelector(`img[data-image-slot="${otherName}"]`)
    if (!HtmlElement || !(other instanceof HtmlElement)) return x
    const otherX = Number(other.getAttribute('data-canvas-x') || 0)
    const otherWidth = Number(other.getAttribute('width') || 0)
    const startedOnLeft = originX <= otherX
    const movingCenter = x + nextWidth / 2
    const otherCenter = otherX + otherWidth / 2
    if (startedOnLeft) {
      return movingCenter < otherCenter ? Math.min(x, otherX - nextWidth) : Math.max(x, otherX + otherWidth)
    }
    return movingCenter > otherCenter ? Math.max(x, otherX + otherWidth) : Math.min(x, otherX - nextWidth)
  }

  // ---------------------------------------------------------------------------
  // Guides: their own state, their own layer, their own pointer handling.

  function canvasPoint(event: PointerEvent<HTMLElement>, axis: Axis) {
    const canvas = frameRef.current?.parentElement
    if (!canvas) return 0
    const rect = canvas.getBoundingClientRect()
    const scaleNow = scaleRef.current || 1
    const raw = axis === 'vertical' ? (event.clientX - rect.left) / scaleNow : (event.clientY - rect.top) / scaleNow
    return Math.round(raw)
  }

  function beginGuide(event: PointerEvent<HTMLElement>, axis: Axis, index: number | null = null) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const drag: GuideDrag = {
      axis,
      index,
      position: canvasPoint(event, axis),
      started: index === null,
      pointerX: event.clientX,
      pointerY: event.clientY,
    }
    guideDragRef.current = drag
    if (index !== null) setSelectedGuide({ axis, index })
    if (drag.started) setGuideDrag(drag)
  }

  function moveGuide(event: PointerEvent<HTMLElement>) {
    const drag = guideDragRef.current
    if (!drag) return
    if (!drag.started) {
      if (!passedThreshold(event, drag.pointerX, drag.pointerY)) return
      drag.started = true
    }
    const next = { ...drag, position: canvasPoint(event, drag.axis) }
    guideDragRef.current = next
    setGuideDrag(next)
  }

  function endGuide(event: PointerEvent<HTMLElement>) {
    const drag = guideDragRef.current
    if (!drag) return
    guideDragRef.current = null
    setGuideDrag(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!drag.started || event.type === 'pointercancel') return
    const position = canvasPoint(event, drag.axis)
    const limit = drag.axis === 'vertical' ? width : frameHeight
    const current = guidesRef.current ?? { vertical: [], horizontal: [] }
    const list = [...current[drag.axis]]
    let keep: number | null = null
    if (position < -8 / (scaleRef.current || 1)) {
      if (drag.index !== null) list.splice(drag.index, 1)
    } else {
      keep = Math.max(0, Math.min(limit, position))
      if (drag.index === null) list.push(keep)
      else list[drag.index] = keep
      onGuidesVisible(true)
    }
    const sorted = [...new Set(list)].sort((left, right) => left - right)
    const next: DesignGuides = {
      vertical: drag.axis === 'vertical' ? sorted : current.vertical,
      horizontal: drag.axis === 'horizontal' ? sorted : current.horizontal,
    }
    const result = next.vertical.length || next.horizontal.length ? next : null
    guidesRef.current = result
    setSelectedGuide(keep === null ? null : { axis: drag.axis, index: sorted.indexOf(keep) })
    onGuidesChange(result)
  }

  function removeSelectedGuide() {
    const target = selectedGuide
    const current = guidesRef.current
    if (!target || !current) return
    const list = current[target.axis].filter((_, index) => index !== target.index)
    const next: DesignGuides = {
      vertical: target.axis === 'vertical' ? list : current.vertical,
      horizontal: target.axis === 'horizontal' ? list : current.horizontal,
    }
    const result = next.vertical.length || next.horizontal.length ? next : null
    guidesRef.current = result
    setSelectedGuide(null)
    onGuidesChange(result)
  }

  function nudgeZoom(direction: -1 | 1) {
    const value = zoom === 'fit' ? scale : zoom
    const next =
      direction === 1
        ? zoomStops.find((stop) => stop > value + 0.001)
        : [...zoomStops].reverse().find((stop) => stop < value - 0.001)
    if (next !== undefined) onZoomChange(next)
  }

  // ---------------------------------------------------------------------------

  const bandShown = bandDraft ?? bandBox
  const selectedBox = selectedSlot ? (imageDraft ?? imageBoxes[selectedSlot] ?? null) : null
  const imageHandles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
  const guideCount = (guides?.vertical.length ?? 0) + (guides?.horizontal.length ?? 0)
  const zoomLabel = zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Invitation preview">
      <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
        <h2 className="text-base font-semibold">{heading}</h2>
        {headingAside}
      </div>
      <div ref={paneRef} className="min-h-0 flex-1 overflow-auto px-6 pb-4">
        <div className="flex min-h-full items-start justify-center">
          <div
            className="grid"
            style={{
              gridTemplateColumns: showRulers ? `${gutter}px auto` : 'auto',
              gridTemplateRows: showRulers ? `${gutter}px auto` : 'auto',
            }}
          >
            {showRulers ? <div className="bg-sidebar" /> : null}
            {showRulers ? (
              <Ruler axis="x" length={width} scale={scale} onPointerDown={(event) => beginGuide(event, 'horizontal')} onPointerMove={moveGuide} onPointerUp={endGuide} />
            ) : null}
            {showRulers ? (
              <Ruler axis="y" length={frameHeight} scale={scale} onPointerDown={(event) => beginGuide(event, 'vertical')} onPointerMove={moveGuide} onPointerUp={endGuide} />
            ) : null}
            <div
              className={cn('relative', mobile && 'rounded-[28px] ring-8 ring-foreground/90')}
              style={{ width: width * scale, height: frameHeight * scale, boxShadow: 'var(--shadow)' }}
              onPointerDown={() => setSelectedGuide(null)}
            >
              <iframe
                ref={frameRef}
                title="Invitation preview"
                sandbox="allow-same-origin"
                srcDoc={html}
                onLoad={readFrame}
                className={cn('pointer-events-none absolute top-0 left-0', mobile && 'rounded-[20px]')}
                style={{
                  width,
                  height: frameHeight,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  border: 0,
                  background: '#e8e8e4',
                }}
              />

              {/* Element layer: click to select, drag the selected element. */}
              {editable ? (
                <div className="absolute inset-0 z-10">
                  {(Object.keys(imageBoxes) as ImageSlot[]).map((slot) => {
                    const box = imageBoxes[slot]
                    if (!box || slot === selectedSlot) return null
                    return (
                      <button
                        key={slot}
                        type="button"
                        aria-label={`Select ${imageLabels[slot].toLowerCase()}`}
                        className="absolute appearance-none bg-transparent outline-offset-[-1px] hover:outline hover:outline-1 hover:outline-dashed hover:outline-accent/70 focus-visible:outline"
                        style={{ left: box.left * scale, top: box.top * scale, width: box.width * scale, height: box.height * scale }}
                        onPointerDown={(event) => {
                          event.stopPropagation()
                          setSelectedGuide(null)
                        }}
                        onClick={() => onSelect({ kind: 'image', slot })}
                      />
                    )
                  })}
                  {bandBox && !bandSelected ? (
                    <button
                      type="button"
                      aria-label="Select guest details"
                      className="absolute appearance-none bg-transparent outline-offset-[-1px] hover:outline hover:outline-1 hover:outline-dashed hover:outline-accent/70 focus-visible:outline"
                      style={{ left: 0, top: bandBox.top * scale, width: width * scale, height: bandBox.height * scale }}
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        setSelectedGuide(null)
                      }}
                      onClick={() => onSelect({ kind: 'band' })}
                    />
                  ) : null}
                  {bandSelected && bandShown ? (
                    <div
                      role="group"
                      aria-label="Guest details"
                      className="absolute touch-none"
                      style={{
                        left: 0,
                        top: bandShown.top * scale,
                        width: width * scale,
                        height: bandShown.height * scale,
                        outline: '2px solid var(--accent)',
                        cursor: 'move',
                      }}
                      onPointerDown={(event) => beginBandDrag(event, 'move')}
                      onPointerMove={moveBandDrag}
                      onPointerUp={endBandDrag}
                      onPointerCancel={endBandDrag}
                    >
                      <span className="pointer-events-none absolute -top-5 left-0 rounded-sm bg-accent px-1.5 text-[11px] leading-5 text-accent-foreground">
                        Guest details
                      </span>
                      {(['n', 's'] as const).map((edge) => (
                        <button
                          key={edge}
                          type="button"
                          aria-label={edge === 'n' ? 'Resize the guest band from the top' : 'Resize the guest band from the bottom'}
                          className="absolute left-1/2 h-2.5 w-8 border border-foreground bg-surface"
                          style={{ top: edge === 'n' ? 0 : '100%', transform: 'translate(-50%, -50%)', cursor: 'ns-resize' }}
                          onPointerDown={(event) => beginBandDrag(event, edge)}
                          onPointerMove={moveBandDrag}
                          onPointerUp={endBandDrag}
                          onPointerCancel={endBandDrag}
                        />
                      ))}
                    </div>
                  ) : null}
                  {selectedSlot && selectedBox ? (
                    <div
                      role="group"
                      aria-label={imageLabels[selectedSlot]}
                      className="absolute touch-none"
                      style={{
                        left: selectedBox.left * scale,
                        top: selectedBox.top * scale,
                        width: selectedBox.width * scale,
                        height: selectedBox.height * scale,
                        outline: '2px solid var(--accent)',
                        cursor: 'move',
                      }}
                      onPointerDown={(event) => beginImageDrag(event, 'move')}
                      onPointerMove={moveImageDrag}
                      onPointerUp={endImageDrag}
                      onPointerCancel={endImageDrag}
                    >
                      <span className="pointer-events-none absolute -top-5 left-0 rounded-sm bg-accent px-1.5 text-[11px] leading-5 text-accent-foreground">
                        {imageLabels[selectedSlot]}
                      </span>
                      {imageHandles.map((handle) => (
                        <button
                          key={handle}
                          type="button"
                          aria-label={`Resize ${imageLabels[selectedSlot].toLowerCase()} (${handle})`}
                          className="absolute size-2.5 border border-foreground bg-surface"
                          style={{
                            left: handle.includes('w') ? 0 : handle.includes('e') ? '100%' : '50%',
                            top: handle.includes('n') ? 0 : handle.includes('s') ? '100%' : '50%',
                            transform: 'translate(-50%, -50%)',
                            cursor: handleCursor(handle),
                          }}
                          onPointerDown={(event) => beginImageDrag(event, handle)}
                          onPointerMove={moveImageDrag}
                          onPointerUp={endImageDrag}
                          onPointerCancel={endImageDrag}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Guide layer: independent of elements, drawn from design px. */}
              {showGuides ? (
                <div className="pointer-events-none absolute inset-0 z-20" data-guide-layer>
                  {(['horizontal', 'vertical'] as const).map((axis) =>
                    (guides?.[axis] ?? []).map((position, index) =>
                      guideDrag?.axis === axis && guideDrag.index === index ? null : (
                        <GuideLine
                          key={`${axis}-${index}-${position}`}
                          axis={axis}
                          position={position}
                          scale={scale}
                          selected={selectedGuide?.axis === axis && selectedGuide.index === index}
                          interactive={editable}
                          onPointerDown={(event) => beginGuide(event, axis, index)}
                          onPointerMove={moveGuide}
                          onPointerUp={endGuide}
                        />
                      ),
                    ),
                  )}
                  {guideDrag && guideDrag.started && guideDrag.position >= 0 ? (
                    <GuideLine axis={guideDrag.axis} position={guideDrag.position} scale={scale} selected label />
                  ) : null}
                </div>
              ) : null}

              {/* Snap indicator: temporary, never persisted, visually distinct from guides. */}
              {snapMark.x ? (
                <div className="pointer-events-none absolute top-0 bottom-0 z-30" style={{ left: snapMark.x.value * scale }}>
                  <div className="absolute top-0 bottom-0 -left-px w-0 border-l border-dashed" style={{ borderColor: snapColor }} />
                  <span className="absolute -top-5 left-1 rounded-sm px-1 text-[10px] leading-4 text-white" style={{ background: snapColor }}>
                    {snapLabel(snapMark.x.kind)}
                  </span>
                </div>
              ) : null}
              {snapMark.y ? (
                <div className="pointer-events-none absolute right-0 left-0 z-30" style={{ top: snapMark.y.value * scale }}>
                  <div className="absolute right-0 -top-px left-0 h-0 border-t border-dashed" style={{ borderColor: snapColor }} />
                  <span className="absolute top-1 -left-px rounded-sm px-1 text-[10px] leading-4 text-white" style={{ background: snapColor }}>
                    {snapLabel(snapMark.y.kind)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-6 pb-4">
        <div className="flex flex-wrap items-center gap-1">
          {!editable ? null : (
            <>
              <ToolToggle icon={<RulerIcon className="size-3.5" aria-hidden="true" />} label="Rulers" pressed={rulers} onClick={() => onRulers(!rulers)} />
              <ToolToggle icon={<SplitSquareHorizontal className="size-3.5" aria-hidden="true" />} label="Guides" pressed={guidesVisible} onClick={() => onGuidesVisible(!guidesVisible)} />
              <ToolToggle icon={<Magnet className="size-3.5" aria-hidden="true" />} label="Snap" pressed={snap} onClick={() => onSnap(!snap)} />
              {selectedGuide ? (
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium hover:bg-hover"
                  onClick={removeSelectedGuide}
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Remove guide
                </button>
              ) : null}
              {guideCount > 0 ? (
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted hover:bg-hover hover:text-foreground"
                  onClick={onClearGuides}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Clear all guides
                </button>
              ) : null}
            </>
          )}
        </div>
        <div className="inline-flex h-9 items-center rounded-full border border-border bg-surface px-1 shadow-sm">
          <button
            type="button"
            aria-label="Zoom out"
            className="inline-flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-foreground disabled:opacity-40"
            disabled={mobile}
            onClick={() => nudgeZoom(-1)}
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Zoom ${zoomLabel}. Fit to screen`}
            className="min-w-12 px-1 text-center text-sm font-medium tabular-nums"
            disabled={mobile}
            onClick={() => onZoomChange('fit')}
          >
            {mobile ? 'Phone' : zoomLabel}
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            className="inline-flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-foreground disabled:opacity-40"
            disabled={mobile}
            onClick={() => nudgeZoom(1)}
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="text-right text-xs text-muted tabular-nums">
          {width} × {height ?? 'auto'} px
        </p>
      </div>
    </section>
  )
}

function ToolToggle({ icon, label, pressed, onClick }: { icon: ReactNode; label: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150',
        pressed ? 'bg-selected text-foreground' : 'text-muted hover:bg-hover hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function snapLabel(kind: SnapTarget['kind']) {
  if (kind === 'center') return 'Center'
  if (kind === 'guide') return 'Guide'
  if (kind === 'edge') return 'Edge'
  return 'Align'
}

function snapEdges(mode: string, axis: 'x' | 'y'): SnapEdge[] | null {
  if (mode === 'move') return ['start', 'center', 'end']
  if (axis === 'x') {
    if (mode.includes('w')) return ['start']
    if (mode.includes('e')) return ['end']
    return null
  }
  if (mode.includes('n')) return ['start']
  if (mode.includes('s')) return ['end']
  return null
}

function handleCursor(handle: string) {
  if (handle === 'n' || handle === 's') return 'ns-resize'
  if (handle === 'e' || handle === 'w') return 'ew-resize'
  if (handle === 'ne' || handle === 'sw') return 'nesw-resize'
  return 'nwse-resize'
}

function measureElement(element: HTMLElement, canvas: HTMLElement): Box {
  const HtmlElement = element.ownerDocument.defaultView?.HTMLElement
  let left = 0
  let top = 0
  let node: HTMLElement | null = element
  while (node && node !== canvas) {
    left += node.offsetLeft
    top += node.offsetTop
    const parent: Element | null = node.offsetParent
    if (!HtmlElement || !(parent instanceof HtmlElement)) break
    node = parent
  }
  return {
    left: Math.max(0, Math.round(left)),
    top: Math.max(0, Math.round(top)),
    width: Math.max(20, Math.round(element.offsetWidth)),
    height: Math.max(20, Math.round(element.offsetHeight)),
  }
}

function measureBand(row: HTMLElement, canvas: HTMLElement) {
  const HtmlElement = row.ownerDocument.defaultView?.HTMLElement
  let top = 0
  let node: HTMLElement | null = row
  while (node && node !== canvas) {
    top += node.offsetTop
    const parent: Element | null = node.offsetParent
    if (!HtmlElement || !(parent instanceof HtmlElement)) break
    node = parent
  }
  return { top: Math.max(0, Math.round(top)), height: Math.max(48, Math.round(row.offsetHeight)) }
}

function GuideLine({
  axis,
  position,
  scale,
  selected = false,
  interactive = false,
  label = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  axis: Axis
  position: number
  scale: number
  selected?: boolean
  interactive?: boolean
  label?: boolean
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onPointerMove?: (event: PointerEvent<HTMLElement>) => void
  onPointerUp?: (event: PointerEvent<HTMLElement>) => void
}) {
  const horizontal = axis === 'horizontal'
  const handlers = interactive
    ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }
    : {}
  return (
    <div
      role={interactive ? 'button' : undefined}
      aria-label={interactive ? `${horizontal ? 'Horizontal' : 'Vertical'} guide at ${position} px` : undefined}
      aria-pressed={interactive ? selected : undefined}
      data-guide={axis}
      data-position={position}
      className={cn('absolute', interactive ? 'pointer-events-auto' : 'pointer-events-none')}
      style={
        horizontal
          ? { top: position * scale - 4, left: 0, right: 0, height: 8, cursor: interactive ? 'ns-resize' : 'default' }
          : { left: position * scale - 4, top: 0, bottom: 0, width: 8, cursor: interactive ? 'ew-resize' : 'default' }
      }
      {...handlers}
    >
      <div
        className={cn('absolute', horizontal ? 'top-1/2 right-0 left-0 -translate-y-1/2' : 'top-0 bottom-0 left-1/2 -translate-x-1/2')}
        style={{
          [horizontal ? 'height' : 'width']: selected ? 2 : 1,
          background: selected ? 'var(--accent)' : guideColor,
          opacity: selected ? 1 : 0.85,
        }}
      />
      {label || selected ? (
        <span
          className="absolute rounded-sm px-1 text-[10px] leading-4 text-white tabular-nums"
          style={{
            background: selected ? 'var(--accent)' : guideColor,
            ...(horizontal ? { left: 4, top: 6 } : { top: 4, left: 6 }),
          }}
        >
          {position}
        </span>
      ) : null}
    </div>
  )
}

function Ruler({
  axis,
  length,
  scale,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  axis: 'x' | 'y'
  length: number
  scale: number
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
}) {
  const step = rulerStep(scale)
  const ticks: number[] = []
  for (let value = 0; value <= length; value += step) ticks.push(value)
  const size = Math.max(0, length * scale)
  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'horizontal' : 'vertical'}
      aria-label={axis === 'x' ? 'Drag down to add a horizontal guide' : 'Drag right to add a vertical guide'}
      className="relative cursor-crosshair overflow-hidden bg-sidebar text-[10px] text-muted select-none"
      style={axis === 'x' ? { width: size, height: 24 } : { width: 24, height: size }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {ticks.map((value) => (
        <span
          key={value}
          className="pointer-events-none absolute border-muted/60"
          style={
            axis === 'x'
              ? { left: value * scale, top: 8, borderLeftWidth: 1, height: 16, paddingLeft: 2 }
              : { top: value * scale, left: 8, borderTopWidth: 1, width: 16, paddingTop: 1 }
          }
        >
          {value}
        </span>
      ))}
    </div>
  )
}

function rulerStep(scale: number) {
  const raw = 72 / Math.max(scale, 0.1)
  const steps = [25, 50, 100, 200, 400, 800]
  return steps.find((step) => step >= raw) ?? 800
}
