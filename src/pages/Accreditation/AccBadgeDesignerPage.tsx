import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Square,
  Trash2,
  Type,
  Upload,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { accApi, type AccBadgeDesign, type AccBadgeElement, type AccBadgeKind } from '@/api/accreditationApi'
import {
  AccBadgeView,
  badgeFonts,
  badgeKindLabels,
  badgeQrDataUrl,
  loadImages,
  PX_PER_MM,
  samplePerson,
  type BadgePerson,
} from '@/components/accreditation/AccBadgeView'
import { badgePaperPresets, printBadgeBatch } from '@/components/accreditation/printBadges'
import { errorMessage } from '@/components/accreditation/shared'
import { AlphaColorInput } from '@/components/ui/AlphaColorInput'
import { brandApi, type BrandItem } from '@/api/brandApi'
import { apiBaseUrl } from '@/api/client'
import { useBrandFonts, useBrandKit } from '@/brand/useBrandKit'
import { BrandImageButton } from '@/components/brand/BrandImageButton'
import { Button } from '@/components/ui/Button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'

const round = (value: number) => Math.round(value * 10) / 10
const textKinds: AccBadgeKind[] = ['fullName', 'firstName', 'lastName', 'organization', 'jobTitle', 'applicantType', 'badgeNumber', 'nationality', 'accessProfile', 'eventName', 'text']
const isText = (kind: AccBadgeKind) => textKinds.includes(kind) || kind === 'profileBand'

function newElement(kind: AccBadgeKind, design: AccBadgeDesign, fileId: string | null = null): AccBadgeElement {
  const square = kind === 'qr' || kind === 'image'
  const width = kind === 'photo' ? Math.min(28, design.widthMm * 0.45) : square ? Math.min(20, design.widthMm * 0.3) : kind === 'profileBand' || kind === 'rect' ? design.widthMm : design.widthMm - 6
  const height = kind === 'photo' ? round(width * 1.25) : square ? width : kind === 'zones' ? 14 : kind === 'fullName' ? 9 : kind === 'profileBand' ? 9 : kind === 'rect' ? 10 : 5
  return {
    id: crypto.randomUUID().replaceAll('-', '').slice(0, 10),
    kind,
    x: round((design.widthMm - width) / 2),
    y: round((design.heightMm - height) / 2),
    width: round(width),
    height: round(height),
    fontSize: kind === 'fullName' ? 14 : kind === 'zones' ? 16 : 8,
    fontWeight: kind === 'fullName' || kind === 'zones' || kind === 'profileBand' ? 'bold' : 'regular',
    color: kind === 'zones' || kind === 'profileBand' ? '#FFFFFF' : '#111111',
    fill: kind === 'rect' ? '#38B8A2' : null,
    radius: kind === 'zones' ? 1 : 0,
    align: 'center',
    valign: 'middle',
    uppercase: kind === 'profileBand',
    text: kind === 'text' ? 'Your text' : kind === 'badgeNumber' ? 'No. ' : kind === 'profileBand' ? 'ACCESS' : null,
    font: null,
    fileId,
  }
}

const groups: { title: string; kinds: AccBadgeKind[] }[] = [
  { title: 'Person', kinds: ['photo', 'fullName', 'firstName', 'lastName', 'organization', 'jobTitle', 'nationality', 'applicantType', 'badgeNumber'] },
  { title: 'Access', kinds: ['zones', 'profileBand', 'accessProfile', 'qr'] },
  { title: 'Decoration', kinds: ['eventName', 'text', 'rect', 'image'] },
]

/** Accreditation badge designer: one template, drag-and-drop, live data fields. */
export function AccBadgeDesignerPage() {
  const { accEventId = '', templateId = '' } = useParams()
  const queryClient = useQueryClient()
  const templates = useQuery({ queryKey: ['acc', 'badge-templates', accEventId], queryFn: () => accApi.badgeTemplates(accEventId) })
  const setup = useQuery({ queryKey: ['acc', 'setup', accEventId], queryFn: () => accApi.setup(accEventId) })
  const template = templates.data?.find((item) => item.id === templateId)
  useDocumentTitle(template ? `Badge · ${template.name}` : 'Badge designer')

  const [design, setDesign] = useState<AccBadgeDesign | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [person, setPerson] = useState<BadgePerson>(samplePerson)
  const [qr, setQr] = useState<string | null>(null)
  const [images, setImages] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState<'background' | 'image' | null>(null)
  const [printing, setPrinting] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const { kit: brandKit } = useBrandKit()
  useBrandFonts(brandKit.fonts)
  const brandFontNames = brandKit.fonts.map((font) => font.name)

  useEffect(() => {
    if (template && !design) setDesign(template.design)
  }, [template, design])
  useEffect(() => {
    void badgeQrDataUrl('ACC-SAMPLE-CODE').then(setQr)
  }, [])
  // Load the logos / background used by the design.
  const fileIds = useMemo(() => {
    if (!design) return [] as string[]
    const ids = design.elements.filter((element) => element.kind === 'image' && element.fileId).map((element) => element.fileId!)
    if (design.backgroundFileId) ids.push(design.backgroundFileId)
    return ids
  }, [design])
  const requested = useRef(new Set<string>())
  useEffect(() => {
    const missing = fileIds.filter((id) => !images[id] && !requested.current.has(id))
    if (missing.length === 0) return
    missing.forEach((id) => requested.current.add(id))
    void loadImages(missing, (id) => accApi.fileBlob(accEventId, id)).then((loaded) => setImages((current) => ({ ...loaded, ...current })))
  }, [fileIds, images, accEventId])
  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const observer = new ResizeObserver(() => setStageSize({ width: node.clientWidth, height: node.clientHeight }))
    observer.observe(node)
    return () => observer.disconnect()
  }, [design === null]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (value: AccBadgeDesign) =>
      accApi.updateBadgeTemplate(accEventId, templateId, {
        name: template!.name,
        design: value,
        applicantTypeIds: template!.applicantTypeIds,
        isDefault: template!.isDefault,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['acc', 'badge-templates', accEventId], (current: typeof templates.data) =>
        current?.map((item) => (item.id === saved.id ? saved : item)),
      )
      void queryClient.invalidateQueries({ queryKey: ['acc', 'print-queue', accEventId] })
      setDesign(saved.design)
      toast.success('Badge saved.')
    },
    onError: (error) => toast.error(errorMessage(error, 'The badge could not be saved.')),
  })

  const scale = useMemo(() => {
    if (!design) return PX_PER_MM
    return Math.max(1, Math.min((stageSize.width - 80) / design.widthMm, (stageSize.height - 80) / design.heightMm))
  }, [design, stageSize])

  if (templates.isLoading || setup.isLoading) {
    return <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted">Loading the badge…</div>
  }
  if (!template || !design) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background text-sm text-foreground">
        <p>{templates.isError ? errorMessage(templates.error, 'The badge could not be loaded.') : 'Badge template not found.'}</p>
        <Link to={`/accreditation/${accEventId}/badges`} className="text-accent hover:underline">
          Back to badges
        </Link>
      </div>
    )
  }

  const eventName = setup.data?.event.name ?? 'Event name'
  const dirty = JSON.stringify(design) !== JSON.stringify(template.design)
  const selected = design.elements.find((element) => element.id === selectedId) ?? null
  const setElement = (id: string, change: Partial<AccBadgeElement>) =>
    setDesign((current) => (current ? { ...current, elements: current.elements.map((element) => (element.id === id ? { ...element, ...change } : element)) } : current))

  async function uploadImage(file: File, target: 'background' | 'image') {
    setUploading(target)
    try {
      const saved = await accApi.upload(accEventId, file)
      if (!saved.contentType.startsWith('image/')) throw new Error('Use a PNG, JPG or WEBP image.')
      setImages((current) => ({ ...current, [saved.id]: URL.createObjectURL(file) }))
      if (target === 'background') setDesign((current) => (current ? { ...current, backgroundFileId: saved.id } : current))
      else
        setDesign((current) => {
          if (!current) return current
          const element = newElement('image', current, saved.id)
          setSelectedId(element.id)
          return { ...current, elements: [...current.elements, element] }
        })
    } catch (error) {
      toast.error(errorMessage(error, 'The image could not be uploaded.'))
    } finally {
      setUploading(null)
    }
  }

  /** A brand kit image: copied into accreditation storage, then placed like an upload. */
  async function placeBrandImage(item: BrandItem, target: 'background' | 'image') {
    setUploading(target)
    try {
      const saved = await brandApi.importToAccreditation(accEventId, item.assetId)
      setImages((current) => ({ ...current, [saved.id]: `${apiBaseUrl}${item.url}` }))
      if (target === 'background') setDesign((current) => (current ? { ...current, backgroundFileId: saved.id } : current))
      else
        setDesign((current) => {
          if (!current) return current
          const element = newElement('image', current, saved.id)
          setSelectedId(element.id)
          return { ...current, elements: [...current.elements, element] }
        })
    } finally {
      setUploading(null)
    }
  }

  function startDrag(event: ReactPointerEvent, element: AccBadgeElement, mode: 'move' | 'resize') {
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
        if (Math.abs(x + origin.width / 2 - centre) < 1.2) x = round(centre - origin.width / 2)
        setElement(origin.id, { x, y: round(origin.y + dy) })
      } else {
        const square = origin.kind === 'qr'
        const width = Math.max(3, round(origin.width + dx))
        setElement(origin.id, { width, height: square ? width : Math.max(2, round(origin.height + dy)) })
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
      await printBadgeBatch([{ key: 'test', design: design!, person }], eventName, images)
    } catch (error) {
      toast.error(errorMessage(error, 'Printing failed.'))
    } finally {
      setPrinting(false)
    }
  }

  const preset = badgePaperPresets.find((item) => Math.abs(item.widthMm - design.widthMm) < 0.2 && Math.abs(item.heightMm - design.heightMm) < 0.2)
  const zoneOptions = setup.data?.zones ?? []

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Link
          to={`/accreditation/${accEventId}/badges`}
          className="flex size-9 items-center justify-center rounded-md border border-border text-muted hover:bg-hover hover:text-foreground"
          aria-label="Back to badges"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Accreditation badge · {template.name}</h1>
          <p className="truncate text-xs text-muted">
            {eventName} · {round(design.widthMm)} × {round(design.heightMm)} mm
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {dirty ? <span className="hidden text-xs text-muted sm:inline">Unsaved changes</span> : null}
          <Button variant="secondary" disabled={!dirty} onClick={() => setDesign(template.design)}>
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
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-border bg-surface p-4">
          <Section title="Card size" hint="Match the cards or labels in your badge printer.">
            <select
              aria-label="Card size"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={preset?.label ?? 'custom'}
              onChange={(change) => {
                const next = badgePaperPresets.find((item) => item.label === change.target.value)
                if (next) setDesign({ ...design, widthMm: next.widthMm, heightMm: next.heightMm })
              }}
            >
              {badgePaperPresets.map((item) => (
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
              <UploadButton label={design.backgroundFileId ? 'Replace image' : 'Background image'} busy={uploading === 'background'} onFile={(file) => void uploadImage(file, 'background')} />
              <BrandImageButton compact disabled={uploading !== null} onPick={(item) => placeBrandImage(item, 'background')} />
              {design.backgroundFileId ? (
                <button type="button" className="text-xs font-medium text-danger hover:underline" onClick={() => setDesign({ ...design, backgroundFileId: null })}>
                  Remove
                </button>
              ) : null}
            </div>
          </Section>

          {groups.map((group) => (
            <Section key={group.title} title={`Add · ${group.title}`}>
              <div className="grid grid-cols-2 gap-2">
                {group.kinds.map((kind) =>
                  kind === 'image' ? (
                    <span key={kind} className="contents">
                      <UploadButton label="Image / logo" busy={uploading === 'image'} onFile={(file) => void uploadImage(file, 'image')} />
                      <BrandImageButton label="Brand image" disabled={uploading !== null} onPick={(item) => placeBrandImage(item, 'image')} />
                    </span>
                  ) : (
                    <button
                      key={kind}
                      type="button"
                      className="flex min-h-9 items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-xs font-medium hover:bg-hover"
                      onClick={() => {
                        const element = newElement(kind, design)
                        setDesign({ ...design, elements: [...design.elements, element] })
                        setSelectedId(element.id)
                      }}
                    >
                      <KindIcon kind={kind} />
                      {badgeKindLabels[kind]}
                    </button>
                  ),
                )}
              </div>
            </Section>
          ))}

          <Section title="Layers">
            {design.elements.length === 0 ? <p className="text-xs text-muted">Nothing on the badge yet.</p> : null}
            <ul className="grid gap-1">
              {[...design.elements].reverse().map((element) => (
                <li key={element.id}>
                  <button
                    type="button"
                    className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs', element.id === selectedId ? 'bg-accent-soft text-accent' : 'hover:bg-hover')}
                    onClick={() => setSelectedId(element.id)}
                  >
                    <KindIcon kind={element.kind} />
                    <span className="truncate">
                      {badgeKindLabels[element.kind]}
                      {element.kind === 'text' && element.text ? `: ${element.text}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </aside>

        <main
          ref={stageRef}
          tabIndex={0}
          className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-[repeating-conic-gradient(var(--hover)_0%_25%,var(--background)_0%_50%)] bg-[length:24px_24px] outline-none"
          onPointerDown={() => setSelectedId(null)}
          onKeyDown={(event) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Backspace'].includes(event.key)) {
              event.preventDefault()
              nudge(event.key)
            }
          }}
        >
          <div className="relative" style={{ width: design.widthMm * scale, height: design.heightMm * scale }}>
            <div className="absolute inset-0 outline outline-1 outline-border">
              <AccBadgeView design={design} person={person} eventName={eventName} images={images} qrDataUrl={qr} scale={scale} />
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-accent/30" aria-hidden="true" />
            {design.elements.map((element) => (
              <div
                key={element.id}
                role="button"
                tabIndex={-1}
                aria-label={badgeKindLabels[element.kind]}
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

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
          {selected ? (
            <Section title={badgeKindLabels[selected.kind]} hint={hintFor(selected.kind)}>
              <div className="grid grid-cols-2 gap-2">
                <MmInput label="X" value={selected.x} onChange={(x) => setElement(selected.id, { x })} />
                <MmInput label="Y" value={selected.y} onChange={(y) => setElement(selected.id, { y })} />
                <MmInput label="Width" value={selected.width} onChange={(width) => setElement(selected.id, { width, ...(selected.kind === 'qr' ? { height: width } : {}) })} />
                <MmInput label="Height" value={selected.height} disabled={selected.kind === 'qr'} onChange={(height) => setElement(selected.id, { height })} />
              </div>
              <Button variant="secondary" className="mt-2 h-9 w-full" onClick={() => setElement(selected.id, { x: round((design.widthMm - selected.width) / 2) })}>
                Centre horizontally
              </Button>

              {selected.kind === 'text' || selected.kind === 'badgeNumber' || selected.kind === 'profileBand' ? (
                <label className="mt-4 grid gap-1.5 text-sm">
                  <span className="font-medium">{selected.kind === 'text' ? 'Text' : selected.kind === 'badgeNumber' ? 'Prefix' : 'Text when no profile'}</span>
                  <textarea
                    rows={selected.kind === 'text' ? 2 : 1}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={selected.text ?? ''}
                    onChange={(change) => setElement(selected.id, { text: change.target.value })}
                  />
                </label>
              ) : null}

              {selected.kind === 'rect' || (isText(selected.kind) && selected.kind !== 'profileBand') ? (
                <div className="mt-4">
                  <span className="mb-1.5 block text-sm font-medium">{selected.kind === 'rect' ? 'Fill' : 'Box fill'}</span>
                  <AlphaColorInput
                    label="Fill colour"
                    value={selected.fill}
                    onChange={(fill) => setElement(selected.id, { fill })}
                    onClear={selected.kind !== 'rect' ? () => setElement(selected.id, { fill: null }) : undefined}
                  />
                </div>
              ) : null}

              {selected.kind === 'rect' || selected.kind === 'zones' || selected.kind === 'photo' || selected.kind === 'profileBand' ? (
                <div className="mt-4">
                  <MmInput label="Corner radius" value={selected.radius ?? 0} onChange={(radius) => setElement(selected.id, { radius: Math.max(0, radius) })} />
                </div>
              ) : null}

              {isText(selected.kind) || selected.kind === 'zones' ? (
                <div className="mt-4 grid gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium">Font</span>
                      <select
                        className="h-10 rounded-md border border-border bg-background px-2 text-sm"
                        value={selected.font ?? 'Inter'}
                        onChange={(change) => setElement(selected.id, { font: change.target.value === 'Inter' ? null : change.target.value })}
                      >
                        {[...badgeFonts, ...brandFontNames.filter((font) => !badgeFonts.includes(font))].map((font) => (
                          <option key={font}>{font}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-medium">Size (pt)</span>
                      <input
                        type="number"
                        min={4}
                        max={160}
                        className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                        value={selected.fontSize}
                        onChange={(change) => setElement(selected.id, { fontSize: Math.max(4, Math.min(160, Number(change.target.value) || 4)) })}
                      />
                    </label>
                  </div>
                  {selected.kind !== 'zones' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1.5 text-sm">
                        <span className="font-medium">Weight</span>
                        <select
                          className="h-10 rounded-md border border-border bg-background px-2 text-sm"
                          value={selected.fontWeight}
                          onChange={(change) => setElement(selected.id, { fontWeight: change.target.value as AccBadgeElement['fontWeight'] })}
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
                          onChange={(change) => setElement(selected.id, { valign: change.target.value as AccBadgeElement['valign'] })}
                        >
                          <option value="top">Top</option>
                          <option value="middle">Middle</option>
                          <option value="bottom">Bottom</option>
                        </select>
                      </label>
                    </div>
                  ) : null}
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
                    <span className="mb-1.5 block text-sm font-medium">{selected.kind === 'zones' ? 'Code colour' : 'Text colour'}</span>
                    <AlphaColorInput label="Text colour" value={selected.color} onChange={(color) => setElement(selected.id, { color })} />
                  </div>
                  {selected.kind !== 'zones' ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="size-4" checked={selected.uppercase} onChange={(change) => setElement(selected.id, { uppercase: change.target.checked })} />
                      UPPERCASE
                    </label>
                  ) : null}
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

          <Section title="Test person" hint="Try long names and many zones. Nothing here is saved.">
            {(
              [
                ['firstName', 'First name'],
                ['lastName', 'Last name'],
                ['organization', 'Organisation'],
                ['jobTitle', 'Role / job title'],
                ['applicantType', 'Applicant category'],
                ['nationality', 'Nationality'],
                ['accessProfile', 'Access profile'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="mb-2 grid gap-1 text-xs">
                <span className="font-medium text-muted">{label}</span>
                <input
                  className="h-9 rounded-md border border-border bg-background px-2.5 text-sm"
                  value={person[key] ?? ''}
                  onChange={(change) => setPerson({ ...person, [key]: change.target.value })}
                />
              </label>
            ))}
            {zoneOptions.length ? (
              <fieldset className="mt-3">
                <legend className="mb-1.5 text-xs font-medium text-muted">Zones</legend>
                <div className="flex flex-wrap gap-1.5">
                  {zoneOptions.map((zone) => {
                    const on = person.zones.some((item) => item.code === zone.code)
                    return (
                      <button
                        key={zone.id}
                        type="button"
                        aria-pressed={on}
                        className={cn('h-7 rounded-sm border px-2 text-xs font-semibold', on ? 'text-white' : 'border-border text-muted')}
                        style={on ? { backgroundColor: zone.color, borderColor: zone.color } : undefined}
                        onClick={() =>
                          setPerson({
                            ...person,
                            zones: on ? person.zones.filter((item) => item.code !== zone.code) : [...person.zones, { code: zone.code, name: zone.name, color: zone.color }],
                          })
                        }
                      >
                        {zone.code}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ) : null}
          </Section>
        </aside>
      </div>
    </div>
  )
}

function hintFor(kind: AccBadgeKind) {
  switch (kind) {
    case 'zones':
      return 'One coloured box per zone the person may enter, using the zone colours from Set-up.'
    case 'profileBand':
      return 'A band in the access profile colour with its name — readable from a distance.'
    case 'qr':
      return 'The badge code the gate scanners read. It changes when a badge is cancelled.'
    case 'photo':
      return 'The applicant’s photo.'
    case 'badgeNumber':
      return 'Given on approval, e.g. 1042.'
    default:
      return undefined
  }
}

function KindIcon({ kind }: { kind: AccBadgeKind }) {
  const className = 'size-3.5 shrink-0 text-accent'
  if (kind === 'qr') return <QrCode className={className} aria-hidden="true" />
  if (kind === 'photo') return <UserRound className={className} aria-hidden="true" />
  if (kind === 'image') return <ImageIcon className={className} aria-hidden="true" />
  if (kind === 'zones') return <LayoutGrid className={className} aria-hidden="true" />
  if (kind === 'rect' || kind === 'profileBand') return <Square className={className} aria-hidden="true" />
  if (kind === 'text') return <Type className={className} aria-hidden="true" />
  return <Plus className={className} aria-hidden="true" />
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
