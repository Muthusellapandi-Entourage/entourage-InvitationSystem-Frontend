import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { zoomLimits } from '@/designer/Stage'

const PAD = 32

/**
 * The middle of a page designer (forms, screens): a toolbar strip and the page drawn at its real size,
 * scaled to fit. Same zoom as the canvas designers (top-bar zoom, Ctrl + wheel), no editing on the page.
 */
export function PreviewStage({
  width,
  height,
  zoom,
  onZoom,
  onFitChange,
  toolbar,
  note,
  children,
}: {
  /** Size of the page in CSS pixels at 100 %. */
  width: number
  height: number
  zoom: number | 'fit'
  onZoom: (zoom: number | 'fit') => void
  onFitChange: (fit: number) => void
  toolbar?: ReactNode
  note?: ReactNode
  children: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 800, height: 600 })

  // Reserved scrollbar space and ignoring tiny size changes keep "fit" from shaking.
  useLayoutEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const measure = () =>
      setViewport((current) => {
        const next = { width: node.clientWidth, height: node.clientHeight }
        return Math.abs(current.width - next.width) < 2 && Math.abs(current.height - next.height) < 2 ? current : next
      })
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    measure()
    return () => observer.disconnect()
  }, [])

  const fit = useMemo(() => {
    const value = Math.min((viewport.width - PAD * 2) / width, (viewport.height - PAD * 2) / height, 1)
    return Math.max(zoomLimits().min, Math.floor(value * 1000) / 1000)
  }, [viewport, width, height])
  useEffect(() => onFitChange(fit), [fit, onFitChange])
  const scale = zoom === 'fit' ? fit : zoom

  const scaleRef = useRef(scale)
  scaleRef.current = scale
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const next = scaleRef.current * (event.deltaY < 0 ? 1.1 : 1 / 1.1)
      onZoom(Math.max(zoomLimits().min, Math.min(zoomLimits().max, Math.round(next * 100) / 100)))
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => node.removeEventListener('wheel', wheel)
  }, [onZoom])

  const shownWidth = Math.floor(width * scale)
  const shownHeight = Math.floor(height * scale)

  return (
    <>
      {toolbar ? <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface px-3 py-2">{toolbar}</div> : null}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-[#e9e7e2] dark:bg-[#141413]" style={{ scrollbarGutter: 'stable' }}>
        <div className="flex min-h-full min-w-full flex-col items-center justify-center" style={{ padding: PAD, width: Math.max(viewport.width, shownWidth + PAD * 2) }}>
          <div className="relative shrink-0 overflow-hidden outline outline-1 outline-black/10 dark:outline-white/10" style={{ width: shownWidth, height: shownHeight }}>
            <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: '0 0' }}>{children}</div>
          </div>
          {note ? <div className="mt-3 max-w-xl text-center text-xs text-muted">{note}</div> : null}
        </div>
      </div>
    </>
  )
}
