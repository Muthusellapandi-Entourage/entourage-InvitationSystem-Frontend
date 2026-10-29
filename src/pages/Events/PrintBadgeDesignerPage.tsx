import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Image as ImageIcon,
  Loader2,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Trash2,
  Type,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError, apiBaseUrl } from '@/api/client'
import { invitationApi } from '@/api/invitationApi'
import { printBadgeApi, type PrintBadgeDesign, type PrintBadgeElement, type PrintElementKind, type PrintGuest } from '@/api/printBadgeApi'
import { sampleQrDataUrl } from '@/badges/sampleQr'
import { LogoMark } from '@/components/brand/Logo'
import { AlphaColorInput } from '@/components/ui/AlphaColorInput'
import { BrandImageButton } from '@/components/brand/BrandImageButton'
import { useBrandFonts, useBrandKit } from '@/brand/useBrandKit'
import { Button } from '@/components/ui/Button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { cn } from '@/lib/cn'
import { paperPresets, printBadge } from '@/printing/printBadge'
import { elementLabels, PrintBadgeView, printFonts, PX_PER_MM, sampleGuest } from '@/printing/PrintBadgeView'

const assetOrigin = apiBaseUrl || window.location.origin
const addable: PrintElementKind[] = ['name', 'position', 'company', 'guestType', 'seat', 'text', 'qr', 'image']
const round = (value: number) => Math.round(value * 10) / 10

function newElement(kind: PrintElementKind, design: PrintBadgeDesign, assetId: string | null = null): PrintBadgeElement {
  const square = kind === 'qr' || kind === 'image'
  const width = square ? Math.min(25, design.widthMm * 0.3) : design.widthMm - 12
  const height = square ? width : kind === 'name' ? 14 : 8
  return {
    id: crypto.randomUUID().replaceAll('-', '').slice(0, 10),
    kind,
    x: round((design.widthMm - width) / 2),
    y: round((design.heightMm - height) / 2),
    width: round(width),
    height: round(height),
    fontSize: kind === 'name' ? 20 : 11,
    fontWeight: kind === 'name' ? 'bold' : 'regular',
    color: '#111111',
    align: 'center',
    valign: 'middle',
    uppercase: false,
    text: kind === 'text' ? 'Your text' : null,
    font: null,
    assetId,
  }
}

/**
 * Print badge designer (paper badge, separate from the E-Badge). Choose the paper size, drop in the
 * guest's name, position, company, type, seat, fixed text, QR code and pictures, then drag and resize.
 */
export function PrintBadgeDesignerPage() {
  const { eventId = '', guestTypeId = '' } = useParams()
  const event = useEvent(eventId).data
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['print-badge', eventId, guestTypeId], queryFn: () => printBadgeApi.get(eventId, guestTypeId) })
  useDocumentTitle(query.data ? `Printed badge · ${query.data.guestTypeName}` : 'Printed badge')

  const [design, setDesign] = useState<PrintBadgeDesign | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [guest, setGuest] = useState<PrintGuest>(sampleGuest)
  const [qr, setQr] = useState<string | null>(null)
  const [uploading, setUploading] = useState<'background' | 'image' | null>(null)
  const [printing, setPrinting] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const { kit: brandKit } = useBrandKit()
  useBrandFonts(brandKit.fonts)
  const brandFontNames = brandKit.fonts.map((font) => font.name)

  useEffect(() => {
    if (query.data && !design) setDesign(query.data.design)
  }, [query.data, design])
  useEffect(() => {
    void sampleQrDataUrl().then(setQr)
  }, [])
  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const observer = new ResizeObserver(() => setStageSize({ width: node.clientWidth, height: node.clientHeight }))
    observer.observe(node)
    return () => observer.disconnect()
  }, [design === null]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (value: PrintBadgeDesign) => printBadgeApi.save(eventId, guestTypeId, value),
    onSuccess: (saved) => {
      queryClient.setQueryData(['print-badge', eventId, guestTypeId], saved)
      void queryClient.invalidateQueries({ queryKey: ['guest-types', eventId] })
      setDesign(saved.design)
      toast.success('Printed badge saved.')
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'The printed badge could not be saved.'),
  })

  // Pixels per millimetre so the badge fills the stage with a margin.
  const scale = useMemo(() => {
    if (!design) return PX_PER_MM
    return Math.max(1, Math.min((stageSize.width - 80) / design.widthMm, (stageSize.height - 80) / design.heightMm))
  }, [design, stageSize])

  if (query.isLoading || !design || !query.data) {
    return <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted">Loading the printed badge…</div>
  }

  const saved = query.data.design
  const dirty = !query.data.configured || JSON.stringify(design) !== JSON.stringify(saved)
  const selected = design.elements.find((element) => element.id === selectedId) ?? null
  const setElement = (id: string, change: Partial<PrintBadgeElement>) =>
    setDesign({ ...design, elements: design.elements.map((element) => (element.id === id ? { ...element, ...change } : element)) })

  async function uploadImage(file: File, target: 'background' | 'image') {
    setUploading(target)
    try {
      const asset = await invitationApi.uploadAsset(eventId, file)
      if (target === 'background') setDesign((current) => (current ? { ...current, backgroundAssetId: asset.id } : current))
      else
        setDesign((current) => {
          if (!current) return current
          const element = newElement('image', current, asset.id)
          setSelectedId(element.id)
          return { ...current, elements: [...current.elements, element] }
        })
    } catch {
      toast.error('The image could not be uploaded. Use a PNG, JPG or WEBP up to 15 MB.')
    } finally {
      setUploading(null)
    }
  }

  function startDrag(event: ReactPointerEvent, element: PrintBadgeElement, mode: 'move' | 'resize') {
    event.stopPropagation()
    event.preventDefault()
    setSelectedId(element.id)
    const startX = event.clientX
    const startY = event.clientY
    const origin = { ...element }
    const centre = design!.widthMm / 2
    const move = (next: PointerEvent) => {
      const dx = (next.clientX - startX) / scale
      const dy = (next.clientY - startY) / scale
      if (mode === 'move') {
        let x = round(origin.x + dx)
        // Snap to the horizontal centre of the badge.
        if (Math.abs(x + origin.width / 2 - centre) < 1.2) x = round(centre - origin.width / 2)
        setElement(origin.id, { x, y: round(origin.y + dy) })
      } else {
        const square = origin.kind === 'qr'
        const width = Math.max(4, round(origin.width + dx))
        setElement(origin.id, { width, height: square ? width : Math.max(3, round(origin.height + dy)) })
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function nudge(key: string) {
    if (!selected) return
    const step = 0.5
    if (key === 'ArrowLeft') setElement(selected.id, { x: round(selected.x - step) })
    if (key === 'ArrowRight') setElement(selected.id, { x: round(selected.x + step) })
    if (key === 'ArrowUp') setElement(selected.id, { y: round(selected.y - step) })
    if (key === 'ArrowDown') setElement(selected.id, { y: round(selected.y + step) })
    if (key === 'Delete' || key === 'Backspace') {
      setDesign({ ...design!, elements: design!.elements.filter((element) => element.id !== selected.id) })
      setSelectedId(null)
    }
  }

  function layer(delta: number) {
    if (!selected) return
    const list = [...design!.elements]
    const index = list.findIndex((element) => element.id === selected.id)
    const target = index + delta
    if (target < 0 || target >= list.length) return
    ;[list[index], list[target]] = [list[target], list[index]]
    setDesign({ ...design!, elements: list })
  }

  async function testPrint() {
    setPrinting(true)
    try {
      await printBadge(design!, guest, assetOrigin)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Printing failed.')
    } finally {
      setPrinting(false)
    }
  }

  const preset = paperPresets.find((item) => Math.abs(item.widthMm - design.widthMm) < 0.2 && Math.abs(item.heightMm - design.heightMm) < 0.2)

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Link
          to={`/events/${eventId}/guest-types`}
          className="flex size-9 items-center justify-center rounded-md border border-border text-muted hover:bg-hover hover:text-foreground"
          aria-label="Back to guest categories"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <LogoMark className="size-6 text-accent" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Printed badge · {query.data.guestTypeName}</h1>
          <p className="truncate text-xs text-muted">
            {event?.name} · Paper badge for the printer (not the digital pass) · {round(design.widthMm)} × {round(design.heightMm)} mm
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {dirty ? <span className="hidden text-xs text-muted sm:inline">{query.data.configured ? 'Unsaved changes' : 'Not saved yet'}</span> : null}
          <Button variant="secondary" disabled={!query.data.configured || JSON.stringify(design) === JSON.stringify(saved)} onClick={() => setDesign(saved)}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Discard
          </Button>
          <Button variant="secondary" disabled={printing} onClick={() => void testPrint()}>
            {printing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Printer className="size-4" aria-hidden="true" />}
            Test print
          </Button>
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate(design)}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: paper, background, add elements */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-border bg-surface p-4">
          <Section title="Paper size" hint="Match the labels or cards in your badge printer.">
            <select
              aria-label="Paper size"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={preset?.label ?? 'custom'}
              onChange={(change) => {
                const next = paperPresets.find((item) => item.label === change.target.value)
                if (next) setDesign({ ...design, widthMm: next.widthMm, heightMm: next.heightMm })
              }}
            >
              {paperPresets.map((item) => (
                <option key={item.label} value={item.label}>
                  {item.label}
                </option>
              ))}
              <option value="custom">Custom size</option>
            </select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <MmInput label="Width" value={design.widthMm} onChange={(widthMm) => setDesign({ ...design, widthMm: Math.max(20, Math.min(300, widthMm)) })} />
              <MmInput label="Height" value={design.heightMm} onChange={(heightMm) => setDesign({ ...design, heightMm: Math.max(20, Math.min(300, heightMm)) })} />
            </div>
          </Section>

          <Section title="Background">
            <AlphaColorInput label="Background colour" value={design.backgroundColor} onChange={(backgroundColor) => setDesign({ ...design, backgroundColor })} />
            <div className="mt-2 flex items-center gap-2">
              <UploadButton label={design.backgroundAssetId ? 'Replace image' : 'Background image'} busy={uploading === 'background'} onFile={(file) => void uploadImage(file, 'background')} />
              <BrandImageButton compact disabled={uploading !== null} onFile={(file) => uploadImage(file, 'background')} />
              {design.backgroundAssetId ? (
                <button type="button" className="text-xs font-medium text-danger hover:underline" onClick={() => setDesign({ ...design, backgroundAssetId: null })}>
                  Remove
                </button>
              ) : null}
            </div>
            <p className="mt-1.5 text-xs text-muted">Pre-printed card stock? Leave the background white.</p>
          </Section>

          <Section title="Add to badge" hint="Guest details fill in automatically for each guest.">
            <div className="grid grid-cols-2 gap-2">
              {addable.map((kind) =>
                kind === 'image' ? (
                  <span key={kind} className="contents">
                    <UploadButton label="Image" busy={uploading === 'image'} onFile={(file) => void uploadImage(file, 'image')} />
                    <BrandImageButton label="Brand image" disabled={uploading !== null} onFile={(file) => uploadImage(file, 'image')} />
                  </span>
                ) : (
                  <button
                    key={kind}
                    type="button"
                    className="flex h-9 items-center gap-2 rounded-md border border-border px-2.5 text-left text-xs font-medium hover:bg-hover"
                    onClick={() => {
                      const element = newElement(kind, design)
                      setDesign({ ...design, elements: [...design.elements, element] })
                      setSelectedId(element.id)
                    }}
                  >
                    {kind === 'qr' ? <QrCode className="size-3.5 text-accent" aria-hidden="true" /> : <Plus className="size-3.5 text-accent" aria-hidden="true" />}
                    {elementLabels[kind]}
                  </button>
                ),
              )}
            </div>
          </Section>

          <Section title="Layers">
            {design.elements.length === 0 ? <p className="text-xs text-muted">Nothing on the badge yet.</p> : null}
            <ul className="grid gap-1">
              {[...design.elements].reverse().map((element) => (
                <li key={element.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs',
                      element.id === selectedId ? 'bg-accent-soft text-accent' : 'hover:bg-hover',
                    )}
                    onClick={() => setSelectedId(element.id)}
                  >
                    {element.kind === 'qr' ? <QrCode className="size-3.5" /> : element.kind === 'image' ? <ImageIcon className="size-3.5" /> : <Type className="size-3.5" />}
                    <span className="truncate">{elementLabels[element.kind]}{element.kind === 'text' && element.text ? `: ${element.text}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </aside>

        {/* Canvas */}
        <main
          ref={stageRef}
          tabIndex={0}
          className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-[repeating-conic-gradient(var(--hover)_0%_25%,var(--background)_0%_50%)] bg-[length:24px_24px] outline-none"
          onPointerDown={() => setSelectedId(null)}
          onKeyDown={(event) => {
            if (event.target instanceof HTMLInputElement) return
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Backspace'].includes(event.key)) {
              event.preventDefault()
              nudge(event.key)
            }
          }}
        >
          <div className="relative" style={{ width: design.widthMm * scale, height: design.heightMm * scale }}>
            <div className="absolute inset-0 outline outline-1 outline-border">
              <PrintBadgeView design={design} guest={guest} qrDataUrl={qr} assetOrigin={assetOrigin} scale={scale} />
            </div>
            {/* Centre guide */}
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-accent/30" aria-hidden="true" />
            {/* Interaction layer */}
            {design.elements.map((element) => (
              <div
                key={element.id}
                role="button"
                tabIndex={-1}
                aria-label={elementLabels[element.kind]}
                className={cn('absolute cursor-move', element.id === selectedId ? 'outline outline-2 outline-accent' : 'hover:outline hover:outline-1 hover:outline-accent/60')}
                style={{ left: element.x * scale, top: element.y * scale, width: element.width * scale, height: element.height * scale }}
                onPointerDown={(event) => startDrag(event, element, 'move')}
              >
                {element.id === selectedId ? (
                  <span
                    className="absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border-2 border-accent bg-surface"
                    onPointerDown={(event) => startDrag(event, element, 'resize')}
                  />
                ) : null}
              </div>
            ))}
          </div>
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-muted">Drag to move · corner to resize · arrow keys nudge · Delete removes</p>
        </main>

        {/* Right: properties + sample guest */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
          {selected ? (
            <Section title={elementLabels[selected.kind]} hint={selected.kind === 'qr' ? 'The guest’s check-in QR, the same code as the digital pass.' : undefined}>
              <div className="grid grid-cols-2 gap-2">
                <MmInput label="X" value={selected.x} onChange={(x) => setElement(selected.id, { x })} />
                <MmInput label="Y" value={selected.y} onChange={(y) => setElement(selected.id, { y })} />
                <MmInput label="Width" value={selected.width} onChange={(width) => setElement(selected.id, { width, ...(selected.kind === 'qr' ? { height: width } : {}) })} />
                <MmInput label="Height" value={selected.height} disabled={selected.kind === 'qr'} onChange={(height) => setElement(selected.id, { height })} />
              </div>
              <Button
                variant="secondary"
                className="mt-2 h-9 w-full"
                onClick={() => setElement(selected.id, { x: round((design.widthMm - selected.width) / 2) })}
              >
                Centre horizontally
              </Button>

              {selected.kind === 'text' ? (
                <label className="mt-4 grid gap-1.5 text-sm">
                  <span className="font-medium">Text</span>
                  <textarea
                    rows={2}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={selected.text ?? ''}
                    onChange={(change) => setElement(selected.id, { text: change.target.value })}
                  />
                </label>
              ) : null}

              {selected.kind !== 'qr' && selected.kind !== 'image' ? (
                <div className="mt-4 grid gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium">Font</span>
                      <select
                        className="h-10 rounded-md border border-border bg-background px-2 text-sm"
                        value={selected.font ?? 'Inter'}
                        onChange={(change) => setElement(selected.id, { font: change.target.value === 'Inter' ? null : change.target.value })}
                      >
                        {[...printFonts, ...brandFontNames.filter((font) => !printFonts.includes(font))].map((font) => (
                          <option key={font}>{font}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium">Size (pt)</span>
                      <input
                        type="number"
                        min={4}
                        max={120}
                        className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                        value={selected.fontSize}
                        onChange={(change) => setElement(selected.id, { fontSize: Math.max(4, Math.min(120, Number(change.target.value) || 4)) })}
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium">Weight</span>
                      <select
                        className="h-10 rounded-md border border-border bg-background px-2 text-sm"
                        value={selected.fontWeight}
                        onChange={(change) => setElement(selected.id, { fontWeight: change.target.value as PrintBadgeElement['fontWeight'] })}
                      >
                        <option value="regular">Regular</option>
                        <option value="semibold">Semibold</option>
                        <option value="bold">Bold</option>
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium">Vertical</span>
                      <select
                        className="h-10 rounded-md border border-border bg-background px-2 text-sm"
                        value={selected.valign}
                        onChange={(change) => setElement(selected.id, { valign: change.target.value as PrintBadgeElement['valign'] })}
                      >
                        <option value="top">Top</option>
                        <option value="middle">Middle</option>
                        <option value="bottom">Bottom</option>
                      </select>
                    </label>
                  </div>
                  <div>
                    <span className="mb-1.5 block text-sm font-medium">Align</span>
                    <div className="flex rounded-md border border-border p-0.5">
                      {(
                        [
                          ['left', AlignLeft],
                          ['center', AlignCenter],
                          ['right', AlignRight],
                        ] as const
                      ).map(([value, Icon]) => (
                        <button
                          key={value}
                          type="button"
                          aria-label={`Align ${value}`}
                          aria-pressed={selected.align === value}
                          className={cn('flex h-8 flex-1 items-center justify-center rounded-sm', selected.align === value ? 'bg-accent-soft text-accent' : 'text-muted hover:text-foreground')}
                          onClick={() => setElement(selected.id, { align: value })}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="mb-1.5 block text-sm font-medium">Colour</span>
                    <AlphaColorInput label="Text colour" value={selected.color} onChange={(color) => setElement(selected.id, { color })} />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={selected.uppercase}
                      onChange={(change) => setElement(selected.id, { uppercase: change.target.checked })}
                    />
                    UPPERCASE
                  </label>
                </div>
              ) : null}

              <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
                <Button variant="secondary" className="h-9 px-3" aria-label="Bring forward" onClick={() => layer(1)}>
                  <ArrowUp className="size-4" aria-hidden="true" />
                </Button>
                <Button variant="secondary" className="h-9 px-3" aria-label="Send backward" onClick={() => layer(-1)}>
                  <ArrowDown className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="danger"
                  className="ml-auto h-9 px-3"
                  onClick={() => {
                    setDesign({ ...design, elements: design.elements.filter((element) => element.id !== selected.id) })
                    setSelectedId(null)
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Remove
                </Button>
              </div>
            </Section>
          ) : (
            <p className="mb-6 rounded-md border border-border bg-background p-3 text-sm text-muted">Select something on the badge to change it.</p>
          )}

          <Section title="Test guest" hint="Try long names to check they fit. Nothing here is saved.">
            {(['name', 'position', 'company', 'guestType', 'seat'] as const).map((key) => (
              <label key={key} className="mb-2 grid gap-1 text-xs">
                <span className="font-medium text-muted">{elementLabels[key]}</span>
                <input
                  className="h-9 rounded-md border border-border bg-background px-2.5 text-sm"
                  value={guest[key] ?? ''}
                  onChange={(change) => setGuest({ ...guest, [key]: change.target.value })}
                />
              </label>
            ))}
          </Section>
        </aside>
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted">{title}</h2>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function MmInput({ label, value, onChange, disabled }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label className="grid gap-1 text-xs">
      <span className="font-medium text-muted">{label} (mm)</span>
      <input
        inputMode="decimal"
        disabled={disabled}
        className="h-9 rounded-md border border-border bg-background px-2.5 text-sm tabular-nums disabled:opacity-50"
        value={draft ?? String(round(value))}
        onChange={(change) => {
          setDraft(change.target.value)
          const next = Number(change.target.value)
          if (change.target.value.trim() !== '' && Number.isFinite(next)) onChange(round(next))
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}

function UploadButton({ label, busy, onFile }: { label: string; busy: boolean; onFile: (file: File) => void }) {
  return (
    <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-hover">
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Upload className="size-3.5 text-accent" aria-hidden="true" />}
      {label}
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
  )
}
