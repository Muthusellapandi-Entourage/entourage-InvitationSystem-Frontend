import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Copy,
  Image as ImageIcon,
  LayoutGrid,
  LayoutTemplate,
  Loader2,
  Lock,
  Plus,
  Printer,
  QrCode,
  Square,
  Trash2,
  Type,
  Unlock,
  Upload,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { accApi, type AccBadgeDesign, type AccBadgeElement, type AccBadgeKind, type AccBadgeTemplate, type AccZone } from '@/api/accreditationApi'
import { brandApi, type BrandItem } from '@/api/brandApi'
import { apiBaseUrl } from '@/api/client'
import { useBrandFonts, useBrandKit } from '@/brand/useBrandKit'
import { AccBadgeView, badgeFonts, badgeKindLabels, badgeQrDataUrl, loadImages, PX_PER_MM, samplePerson, type BadgePerson } from '@/components/accreditation/AccBadgeView'
import { badgePaperPresets, printBadgeBatch } from '@/components/accreditation/printBadges'
import { errorMessage } from '@/components/accreditation/shared'
import { BrandImageButton } from '@/components/brand/BrandImageButton'
import { AlphaColorInput } from '@/components/ui/AlphaColorInput'
import { Button } from '@/components/ui/Button'
import { Advanced, DesignerShell, PanelSection, PanelTabs, UnitInput, useZoom } from '@/designer/DesignerShell'
import { AccDesignerSwitcher } from '@/designer/DesignerSwitcher'
import { LayersPanel } from '@/designer/LayersPanel'
import { emptyGuides, Stage, withLive, type StageGuides, type StageItem } from '@/designer/Stage'
import { TemplatePicker, type DesignTemplate } from '@/designer/TemplatePicker'
import { fitInside, naturalSize } from '@/designer/imageSize'
import { useHistory } from '@/designer/useHistory'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'

const round = (value: number) => Math.round(value * 10) / 10
const newId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 10)
const textKinds: AccBadgeKind[] = ['fullName', 'firstName', 'lastName', 'organization', 'jobTitle', 'applicantType', 'badgeNumber', 'nationality', 'accessProfile', 'eventName', 'text']
const isText = (kind: AccBadgeKind) => textKinds.includes(kind) || kind === 'profileBand'

function newElement(kind: AccBadgeKind, design: AccBadgeDesign, fileId: string | null = null, extra: Partial<AccBadgeElement> = {}): AccBadgeElement {
  const square = kind === 'qr' || kind === 'image'
  const width = kind === 'photo' ? Math.min(28, design.widthMm * 0.45) : square ? Math.min(20, design.widthMm * 0.3) : kind === 'profileBand' || kind === 'rect' ? design.widthMm : design.widthMm - 6
  const height = kind === 'photo' ? round(width * 1.25) : square ? width : kind === 'zones' ? 14 : kind === 'fullName' ? 9 : kind === 'profileBand' ? 9 : kind === 'rect' ? 10 : 5
  return {
    id: newId(),
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
    hidden: false,
    locked: false,
    name: null,
    ...extra,
  }
}

const groups: { title: string; hint?: string; kinds: AccBadgeKind[] }[] = [
  { title: 'Person', hint: 'Filled in for each applicant.', kinds: ['photo', 'fullName', 'firstName', 'lastName', 'organization', 'jobTitle', 'nationality', 'applicantType', 'badgeNumber'] },
  { title: 'Access', kinds: ['zones', 'profileBand', 'accessProfile', 'qr'] },
  { title: 'Design', kinds: ['eventName', 'text', 'rect'] },
]

/* ---------- starting layouts ---------- */

type Layout = { id: string; name: string; description: string; build: (size: { widthMm: number; heightMm: number }, brand: { primary: string | null; font: string | null }) => AccBadgeElement[] }

const layouts: Layout[] = [
  {
    id: 'classic',
    name: 'Photo + zones',
    description: 'Access band on top, photo, name, organisation, zones and QR.',
    build: ({ widthMm: w, heightMm: h }, brand) => {
      const base = { widthMm: w, heightMm: h, backgroundColor: '#FFFFFF', backgroundFileId: null, elements: [] }
      const f = { font: brand.font }
      return [
        newElement('profileBand', base, null, { x: 0, y: 0, width: w, height: round(h * 0.1), ...f }),
        newElement('eventName', base, null, { x: 3, y: round(h * 0.11), width: w - 6, height: round(h * 0.06), fontSize: 7, fontWeight: 'semibold', color: '#333333', ...f }),
        newElement('photo', base, null, { x: round(w * 0.28), y: round(h * 0.18), width: round(w * 0.44), height: round(h * 0.35) }),
        newElement('fullName', base, null, { x: 3, y: round(h * 0.55), width: w - 6, height: round(h * 0.09), fontSize: 13, ...f }),
        newElement('organization', base, null, { x: 3, y: round(h * 0.64), width: w - 6, height: round(h * 0.05), fontWeight: 'semibold', color: '#333333', ...f }),
        newElement('zones', base, null, { x: 3, y: round(h * 0.76), width: round(w * 0.6), height: round(h * 0.2), ...f }),
        newElement('qr', base, null, { x: round(w * 0.68), y: round(h * 0.77), width: round(w * 0.27), height: round(w * 0.27) }),
      ]
    },
  },
  {
    id: 'band',
    name: 'Brand band',
    description: 'A coloured header band, large name and a centred QR. No photo.',
    build: ({ widthMm: w, heightMm: h }, brand) => {
      const base = { widthMm: w, heightMm: h, backgroundColor: '#FFFFFF', backgroundFileId: null, elements: [] }
      const f = { font: brand.font }
      const qr = round(Math.min(w, h) * 0.38)
      return [
        newElement('rect', base, null, { x: 0, y: 0, width: w, height: round(h * 0.22), fill: brand.primary ?? '#38B8A2', name: 'Header band' }),
        newElement('eventName', base, null, { x: 3, y: round(h * 0.05), width: w - 6, height: round(h * 0.12), fontSize: 10, fontWeight: 'bold', color: '#FFFFFF', ...f }),
        newElement('fullName', base, null, { x: 3, y: round(h * 0.27), width: w - 6, height: round(h * 0.12), fontSize: 15, ...f }),
        newElement('organization', base, null, { x: 3, y: round(h * 0.4), width: w - 6, height: round(h * 0.06), color: '#333333', ...f }),
        newElement('qr', base, null, { x: round((w - qr) / 2), y: round(h * 0.5), width: qr, height: qr }),
        newElement('profileBand', base, null, { x: 0, y: round(h * 0.9), width: w, height: round(h * 0.1), ...f }),
      ]
    },
  },
  { id: 'blank', name: 'Blank', description: 'Start with an empty card.', build: () => [] },
]

/** Accreditation badge designer on the shared designer frame (rulers, snap, layers, undo, zoom). */
export function AccBadgeDesignerPage() {
  const { accEventId = '', templateId = '' } = useParams()
  const templates = useQuery({ queryKey: ['acc', 'badge-templates', accEventId], queryFn: () => accApi.badgeTemplates(accEventId) })
  const setup = useQuery({ queryKey: ['acc', 'setup', accEventId], queryFn: () => accApi.setup(accEventId) })
  const template = templates.data?.find((item) => item.id === templateId)
  useDocumentTitle(template ? `Badge · ${template.name}` : 'Badge designer')

  if (templates.isLoading || setup.isLoading) {
    return <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted">Loading the badge…</div>
  }
  if (!template) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background text-sm text-foreground">
        <p>{templates.isError ? errorMessage(templates.error, 'The badge could not be loaded.') : 'Badge template not found.'}</p>
        <Link to={`/accreditation/${accEventId}/badges`} className="text-accent hover:underline">
          Back to badges
        </Link>
      </div>
    )
  }
  return <Designer key={template.id} accEventId={accEventId} template={template} eventName={setup.data?.event.name ?? 'Event name'} zones={setup.data?.zones ?? []} />
}

function Designer({
  accEventId,
  template,
  eventName,
  zones,
}: {
  accEventId: string
  template: AccBadgeTemplate
  eventName: string
  zones: AccZone[]
}) {
  const queryClient = useQueryClient()
  const history = useHistory<AccBadgeDesign>(template.design)
  const design = history.present
  const [saved, setSaved] = useState<AccBadgeDesign>(template.design)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [guides, setGuides] = useState<StageGuides>(emptyGuides)
  const [person, setPerson] = useState<BadgePerson>(samplePerson)
  const [qr, setQr] = useState<string | null>(null)
  const [images, setImages] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState<'background' | 'image' | null>(null)
  const [printing, setPrinting] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const zoom = useZoom()
  const { kit } = useBrandKit()
  useBrandFonts(kit.fonts)
  const fonts = useMemo(() => [...badgeFonts, ...kit.fonts.map((font) => font.name).filter((name) => !badgeFonts.includes(name))], [kit.fonts])

  useEffect(() => {
    void badgeQrDataUrl('ACC-SAMPLE-CODE').then(setQr)
  }, [])

  // Load the logos / background used by the design.
  const fileIds = useMemo(() => {
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

  const dirty = JSON.stringify(design) !== JSON.stringify(saved)
  const selected = design.elements.find((element) => element.id === selectedId) ?? null

  const setElement = (id: string, change: Partial<AccBadgeElement>) =>
    history.commit((current) => ({ ...current, elements: current.elements.map((element) => (element.id === id ? { ...element, ...change } : element)) }))

  function add(kind: AccBadgeKind, fileId: string | null = null) {
    const element = newElement(kind, history.current(), fileId, { font: kit.fonts[0]?.name ?? null, ...(kind === 'rect' && kit.colors[0] ? { fill: kit.colors[0].hex } : {}) })
    history.commit((current) => ({ ...current, elements: [...current.elements, element] }))
    setSelectedId(element.id)
  }

  function remove(id: string) {
    history.commit((current) => ({ ...current, elements: current.elements.filter((element) => element.id !== id) }))
    setSelectedId(null)
  }

  function duplicate(id: string) {
    const element = design.elements.find((item) => item.id === id)
    if (!element) return
    const copy = { ...element, id: newId(), x: round(element.x + 3), y: round(element.y + 3), locked: false, name: element.name ? `${element.name} copy` : null }
    history.commit((current) => ({ ...current, elements: [...current.elements, copy] }))
    setSelectedId(copy.id)
  }

  function layer(id: string, delta: number) {
    const list = [...design.elements]
    const index = list.findIndex((element) => element.id === id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= list.length) return
    ;[list[index], list[target]] = [list[target], list[index]]
    history.commit((current) => ({ ...current, elements: list }))
  }

  async function uploadImage(file: File, target: 'background' | 'image' | { replace: string }) {
    setUploading(target === 'background' ? 'background' : 'image')
    try {
      const stored = await accApi.upload(accEventId, file)
      if (!stored.contentType.startsWith('image/')) throw new Error('Use a PNG, JPG or WEBP image.')
      const url = URL.createObjectURL(file)
      setImages((current) => ({ ...current, [stored.id]: url }))
      await placeFile(stored.id, target, url)
    } catch (error) {
      toast.error(errorMessage(error, 'The image could not be uploaded.'))
    } finally {
      setUploading(null)
    }
  }

  /** A brand kit image: copied into accreditation storage, then placed like an upload. */
  async function placeBrandImage(item: BrandItem, target: 'background' | 'image' | { replace: string }) {
    setUploading(target === 'background' ? 'background' : 'image')
    try {
      const stored = await brandApi.importToAccreditation(accEventId, item.assetId)
      const url = `${apiBaseUrl}${item.url}`
      setImages((current) => ({ ...current, [stored.id]: url }))
      await placeFile(stored.id, target, url)
    } catch (error) {
      toast.error(errorMessage(error, 'The image could not be added.'))
    } finally {
      setUploading(null)
    }
  }

  /** Places a file; logo boxes take the picture's own shape so the selection hugs it. */
  async function placeFile(fileId: string, target: 'background' | 'image' | { replace: string }, url: string) {
    if (target === 'background') {
      history.commit((current) => ({ ...current, backgroundFileId: fileId }))
      return
    }
    const natural = await naturalSize(url)
    if (target === 'image') {
      const current = history.current()
      const element = newElement('image', current, fileId)
      if (natural) {
        const box = fitInside(natural, current.widthMm * 0.6, current.heightMm * 0.3)
        Object.assign(element, {
          width: round(box.w),
          height: round(box.h),
          x: round((current.widthMm - box.w) / 2),
          y: round((current.heightMm - box.h) / 2),
        })
      }
      history.commit((value) => ({ ...value, elements: [...value.elements, element] }))
      setSelectedId(element.id)
      return
    }
    const element = history.current().elements.find((item) => item.id === target.replace)
    if (!element) return
    if (!natural) {
      setElement(element.id, { fileId })
      return
    }
    // The new picture goes where the old one was, in its own shape.
    const box = fitInside(natural, element.width, element.height)
    setElement(element.id, {
      fileId,
      width: round(box.w),
      height: round(box.h),
      x: round(element.x + (element.width - box.w) / 2),
      y: round(element.y + (element.height - box.h) / 2),
    })
  }

  async function save() {
    setSaving(true)
    try {
      const result = await accApi.updateBadgeTemplate(accEventId, template.id, {
        name: template.name,
        design,
        applicantTypeIds: template.applicantTypeIds,
        isDefault: template.isDefault,
      })
      queryClient.setQueryData(['acc', 'badge-templates', accEventId], (current: AccBadgeTemplate[] | undefined) => current?.map((item) => (item.id === result.id ? result : item)))
      void queryClient.invalidateQueries({ queryKey: ['acc', 'print-queue', accEventId] })
      setSaved(result.design)
      history.reset(result.design)
      toast.success('Badge saved.')
      return true
    } catch (error) {
      toast.error(errorMessage(error, 'The badge could not be saved.'))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function testPrint() {
    setPrinting(true)
    try {
      await printBadgeBatch([{ key: 'test', design, person }], eventName, images)
    } catch (error) {
      toast.error(errorMessage(error, 'Printing failed.'))
    } finally {
      setPrinting(false)
    }
  }

  /* ---------- stage ---------- */
  const items: StageItem[] = design.elements.map((element) => ({
    id: element.id,
    label: element.name || badgeKindLabels[element.kind],
    x: element.x,
    y: element.y,
    w: element.width,
    h: element.height,
    hidden: element.hidden,
    locked: element.locked,
    square: element.kind === 'qr',
    keepRatio: element.kind === 'image',
  }))

  const brandFont = kit.fonts[0]?.name ?? null
  const brandPrimary = kit.colors[0]?.hex ?? null
  const pickerTemplates: DesignTemplate<AccBadgeDesign>[] = layouts.map((item) => {
    const build = () => ({ ...design, backgroundFileId: null, elements: item.build(design, { primary: brandPrimary, font: brandFont }) })
    const preview = build()
    const previewScale = Math.min(150 / preview.widthMm, 180 / preview.heightMm)
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      build,
      preview: (
        <span className="outline outline-1 outline-border">
          <AccBadgeView design={preview} person={samplePerson} eventName={eventName} images={images} qrDataUrl={qr} scale={previewScale} />
        </span>
      ),
    }
  })

  /* ---------- panels ---------- */
  const addPanel = (
    <>
      {groups.map((group) => (
        <PanelSection key={group.title} title={group.title} hint={group.hint}>
          <div className="grid grid-cols-2 gap-2">
            {group.kinds.map((kind) => (
              <AddButton key={kind} icon={<KindIcon kind={kind} />} label={badgeKindLabels[kind]} onClick={() => add(kind)} />
            ))}
            {group.title === 'Design' ? (
              <>
                <UploadTile label="Image / logo" busy={uploading === 'image'} onFile={(file) => void uploadImage(file, 'image')} />
                <BrandImageButton label="Brand image" className="h-9 justify-start" disabled={uploading !== null} onPick={(item) => placeBrandImage(item, 'image')} />
              </>
            ) : null}
          </div>
        </PanelSection>
      ))}
      <PanelSection title="Start again">
        <Button variant="secondary" className="h-9 w-full" onClick={() => setTemplatesOpen(true)}>
          <LayoutTemplate className="size-4" aria-hidden="true" />
          Templates
        </Button>
      </PanelSection>
    </>
  )

  const layersPanel = (
    <LayersPanel
      rows={design.elements.map((element) => ({
        id: element.id,
        label: element.name || (element.kind === 'text' && element.text ? `Text: ${element.text}` : badgeKindLabels[element.kind]),
        icon: <KindIcon kind={element.kind} />,
        hidden: element.hidden,
        locked: element.locked,
      }))}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onReorder={(ids) => history.commit((current) => ({ ...current, elements: ids.map((id) => current.elements.find((element) => element.id === id)!).filter(Boolean) }))}
      onToggleHidden={(id) => setElement(id, { hidden: !design.elements.find((element) => element.id === id)?.hidden })}
      onToggleLocked={(id) => setElement(id, { locked: !design.elements.find((element) => element.id === id)?.locked })}
      onRename={(id, name) => setElement(id, { name: name || null })}
    />
  )

  const preset = badgePaperPresets.find((item) => Math.abs(item.widthMm - design.widthMm) < 0.2 && Math.abs(item.heightMm - design.heightMm) < 0.2)

  const right = selected ? (
    <ElementProperties
      element={selected}
      fonts={fonts}
      busy={uploading !== null}
      onChange={(change) => setElement(selected.id, change)}
      onCentre={() => setElement(selected.id, { x: round((design.widthMm - selected.width) / 2) })}
      onDuplicate={() => duplicate(selected.id)}
      onDelete={() => remove(selected.id)}
      onLayer={(delta) => layer(selected.id, delta)}
      onUpload={(file) => void uploadImage(file, { replace: selected.id })}
      onBrand={(item) => placeBrandImage(item, { replace: selected.id })}
    />
  ) : (
    <>
      <PanelSection title="Card size" hint="Match the cards or labels in your badge printer.">
        <select
          aria-label="Card size"
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={preset?.label ?? 'custom'}
          onChange={(change) => {
            const next = badgePaperPresets.find((item) => item.label === change.target.value)
            if (next) history.commit((current) => ({ ...current, widthMm: next.widthMm, heightMm: next.heightMm }))
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
          <UnitInput label="Width" unit="mm" value={design.widthMm} onChange={(value) => history.commit((current) => ({ ...current, widthMm: Math.max(20, Math.min(300, round(value))) }))} />
          <UnitInput label="Height" unit="mm" value={design.heightMm} onChange={(value) => history.commit((current) => ({ ...current, heightMm: Math.max(20, Math.min(300, round(value))) }))} />
        </div>
      </PanelSection>
      <PanelSection title="Background">
        <AlphaColorInput label="Background colour" value={design.backgroundColor} onChange={(backgroundColor) => history.commit((current) => ({ ...current, backgroundColor }))} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <UploadTile label={design.backgroundFileId ? 'Replace image' : 'Background image'} busy={uploading === 'background'} onFile={(file) => void uploadImage(file, 'background')} />
          <BrandImageButton compact disabled={uploading !== null} onPick={(item) => placeBrandImage(item, 'background')} />
          {design.backgroundFileId ? (
            <button type="button" className="text-xs font-medium text-danger hover:underline" onClick={() => history.commit((current) => ({ ...current, backgroundFileId: null }))}>
              Remove
            </button>
          ) : null}
        </div>
      </PanelSection>
      <PanelSection title="Test person" hint="Try long names and many zones. Nothing here is saved.">
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
            <input className="h-9 rounded-md border border-border bg-background px-2.5 text-sm" value={person[key] ?? ''} onChange={(change) => setPerson({ ...person, [key]: change.target.value })} />
          </label>
        ))}
        {zones.length ? (
          <fieldset className="mt-3">
            <legend className="mb-1.5 text-xs font-medium text-muted">Zones</legend>
            <div className="flex flex-wrap gap-1.5">
              {zones.map((zone) => {
                const on = person.zones.some((item) => item.code === zone.code)
                return (
                  <button
                    key={zone.id ?? zone.code}
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
      </PanelSection>
    </>
  )

  return (
    <>
      <DesignerShell
        title={`Accreditation badge · ${template.name}`}
        subtitle={`${eventName} · ${round(design.widthMm)} × ${round(design.heightMm)} mm`}
        backLabel="Badge templates"
        backTo={`/accreditation/${accEventId}/badges`}
        switcher={<AccDesignerSwitcher accEventId={accEventId} templateId={template.id} templateName={template.name} />}
        history={history}
        zoom={{ value: zoom.value, fit: zoom.fit, set: zoom.set }}
        save={{ dirty, saving, onSave: save }}
        actions={
          <>
            <Button variant="secondary" className="hidden h-9 xl:inline-flex" onClick={() => setTemplatesOpen(true)}>
              <LayoutTemplate className="size-4" aria-hidden="true" />
              Templates
            </Button>
            <Button variant="secondary" className="h-9" disabled={printing} onClick={() => void testPrint()}>
              {printing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Printer className="size-4" aria-hidden="true" />}
              Test print
            </Button>
          </>
        }
        keys={{
          onDelete: selected ? () => remove(selected.id) : undefined,
          onDuplicate: selected ? () => duplicate(selected.id) : undefined,
          onEscape: () => setSelectedId(null),
          onNudge:
            selected && !selected.locked
              ? (dx, dy, big) => setElement(selected.id, { x: round(selected.x + dx * 0.5 * (big ? 10 : 1)), y: round(selected.y + dy * 0.5 * (big ? 10 : 1)) })
              : undefined,
        }}
        left={
          <PanelTabs
            tabs={[
              { key: 'add', label: 'Add', content: addPanel },
              { key: 'layers', label: `Layers (${design.elements.length})`, content: layersPanel },
            ]}
          />
        }
        right={right}
      >
        <Stage
          width={design.widthMm}
          height={design.heightMm}
          unit="mm"
          unitPx={PX_PER_MM}
          zoom={zoom.value}
          onZoom={zoom.set}
          onFitChange={zoom.setFit}
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onItemChange={(id, box, phase) => {
            // The canvas moves the item itself while dragging; the design changes once, at the end (one undo step).
            if (phase !== 'end') return
            history.commit((current) => ({
              ...current,
              elements: current.elements.map((element) => (element.id === id ? { ...element, x: round(box.x), y: round(box.y), width: round(box.w), height: round(box.h) } : element)),
            }))
          }}
          guides={guides}
          onGuidesChange={setGuides}
          render={(scale, live) => (
            <AccBadgeView
              design={live ? { ...design, elements: withLive(design.elements, live, (element, box) => ({ ...element, x: box.x, y: box.y, width: box.w, height: box.h })) } : design}
              person={person}
              eventName={eventName}
              images={images}
              qrDataUrl={qr}
              scale={scale}
            />
          )}
        />
      </DesignerShell>
      <TemplatePicker
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        templates={pickerTemplates}
        onPick={(next) => history.commit(next)}
        note="Replaces what is on the card now. You can undo it."
      />
    </>
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
      return isText(kind) && kind !== 'text' && kind !== 'eventName' ? 'Filled in for each applicant.' : undefined
  }
}

function KindIcon({ kind }: { kind: AccBadgeKind }) {
  if (kind === 'qr') return <QrCode />
  if (kind === 'photo') return <UserRound />
  if (kind === 'image') return <ImageIcon />
  if (kind === 'zones') return <LayoutGrid />
  if (kind === 'rect' || kind === 'profileBand') return <Square />
  if (kind === 'text') return <Type />
  return <Plus />
}

function AddButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-9 items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-xs font-medium hover:bg-hover [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-accent"
    >
      {icon}
      {label}
    </button>
  )
}

function UploadTile({ label, busy, onFile }: { label: string; busy: boolean; onFile: (file: File) => void }) {
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

function ElementProperties({
  element,
  fonts,
  busy,
  onChange,
  onCentre,
  onDuplicate,
  onDelete,
  onLayer,
  onUpload,
  onBrand,
}: {
  element: AccBadgeElement
  fonts: string[]
  busy: boolean
  onChange: (change: Partial<AccBadgeElement>) => void
  onCentre: () => void
  onDuplicate: () => void
  onDelete: () => void
  onLayer: (delta: number) => void
  onUpload: (file: File) => void
  onBrand: (item: BrandItem) => void
}) {
  const textual = isText(element.kind) || element.kind === 'zones'
  return (
    <PanelSection title={element.name || badgeKindLabels[element.kind]} hint={hintFor(element.kind)}>
      <div className="grid gap-3">
        {element.kind === 'text' || element.kind === 'badgeNumber' || element.kind === 'profileBand' ? (
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">{element.kind === 'text' ? 'Text' : element.kind === 'badgeNumber' ? 'Prefix' : 'Text when no profile'}</span>
            <textarea
              rows={element.kind === 'text' ? 2 : 1}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={element.text ?? ''}
              onChange={(change) => onChange({ text: change.target.value })}
            />
          </label>
        ) : null}

        {element.kind === 'image' ? (
          <div className="flex flex-wrap gap-2">
            <UploadTile label="Replace image" busy={busy} onFile={onUpload} />
            <BrandImageButton label="From brand kit" disabled={busy} onPick={onBrand} />
          </div>
        ) : null}

        {textual ? (
          <>
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Font</span>
                <select
                  className="h-10 rounded-md border border-border bg-background px-2 text-sm"
                  value={element.font ?? 'Inter'}
                  onChange={(change) => onChange({ font: change.target.value === 'Inter' ? null : change.target.value })}
                >
                  {fonts.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
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
                  value={element.fontSize}
                  onChange={(change) => onChange({ fontSize: Math.max(4, Math.min(160, Number(change.target.value) || 4)) })}
                />
              </label>
            </div>
            <div className={cn('grid gap-2', element.kind === 'zones' ? 'grid-cols-1' : 'grid-cols-2')}>
              {element.kind !== 'zones' ? (
                <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Weight">
                  {(['regular', 'bold'] as const).map((weight) => {
                    const on = element.fontWeight === weight || (weight === 'bold' && element.fontWeight === 'semibold')
                    return (
                      <button
                        key={weight}
                        type="button"
                        aria-pressed={on}
                        className={cn('flex h-8 flex-1 items-center justify-center rounded-sm text-xs', on ? 'bg-accent-soft font-semibold text-accent' : 'text-muted')}
                        onClick={() => onChange({ fontWeight: weight })}
                      >
                        {weight === 'bold' ? 'Bold' : 'Regular'}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Align">
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
                    aria-pressed={element.align === value}
                    className={cn('flex h-8 flex-1 items-center justify-center rounded-sm', element.align === value ? 'bg-accent-soft text-accent' : 'text-muted hover:text-foreground')}
                    onClick={() => onChange({ align: value })}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium">{element.kind === 'zones' ? 'Code colour' : 'Text colour'}</span>
              <AlphaColorInput label="Text colour" value={element.color} onChange={(color) => onChange({ color })} />
            </div>
          </>
        ) : null}

        {element.kind === 'rect' || (isText(element.kind) && element.kind !== 'profileBand') ? (
          <div>
            <span className="mb-1.5 block text-sm font-medium">{element.kind === 'rect' ? 'Colour' : 'Box colour'}</span>
            <AlphaColorInput
              label={element.kind === 'rect' ? 'Shape colour' : 'Box colour'}
              value={element.fill}
              onChange={(fill) => onChange({ fill })}
              onClear={element.kind !== 'rect' ? () => onChange({ fill: null }) : undefined}
            />
          </div>
        ) : null}

        <Advanced>
          <div className="grid gap-3 rounded-md border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <UnitInput label="X" unit="mm" value={element.x} onChange={(x) => onChange({ x: round(x) })} />
              <UnitInput label="Y" unit="mm" value={element.y} onChange={(y) => onChange({ y: round(y) })} />
              <UnitInput label="Width" unit="mm" value={element.width} onChange={(width) => onChange({ width: round(width), ...(element.kind === 'qr' ? { height: round(width) } : {}) })} />
              <UnitInput label="Height" unit="mm" value={element.height} disabled={element.kind === 'qr'} onChange={(height) => onChange({ height: round(height) })} />
            </div>
            <Button variant="secondary" className="h-9 w-full" onClick={onCentre}>
              Centre horizontally
            </Button>
            {element.kind === 'rect' || element.kind === 'zones' || element.kind === 'photo' || element.kind === 'profileBand' || element.kind === 'image' ? (
              <UnitInput label="Corner radius" unit="mm" value={element.radius ?? 0} onChange={(radius) => onChange({ radius: Math.max(0, round(radius)) })} />
            ) : null}
            {textual && element.kind !== 'zones' ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1.5 text-xs">
                  <span className="font-medium text-muted">Vertical</span>
                  <select
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    value={element.valign}
                    onChange={(change) => onChange({ valign: change.target.value as AccBadgeElement['valign'] })}
                  >
                    <option value="top">Top</option>
                    <option value="middle">Middle</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" className="size-4" checked={element.uppercase} onChange={(change) => onChange({ uppercase: change.target.checked })} />
                  UPPERCASE
                </label>
              </div>
            ) : null}
            <label className="grid gap-1 text-xs">
              <span className="font-medium text-muted">Layer name</span>
              <input
                className="h-9 rounded-md border border-border bg-background px-2.5 text-sm"
                value={element.name ?? ''}
                placeholder={badgeKindLabels[element.kind]}
                onChange={(change) => onChange({ name: change.target.value || null })}
              />
            </label>
          </div>
        </Advanced>

        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Button variant="secondary" className="h-9 px-3" aria-label="Bring forward" title="Bring forward" onClick={() => onLayer(1)}>
            <ArrowUp className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="secondary" className="h-9 px-3" aria-label="Send backward" title="Send backward" onClick={() => onLayer(-1)}>
            <ArrowDown className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="secondary" className="h-9 px-3" aria-label={element.locked ? 'Unlock' : 'Lock'} title={element.locked ? 'Unlock' : 'Lock'} onClick={() => onChange({ locked: !element.locked })}>
            {element.locked ? <Lock className="size-4" aria-hidden="true" /> : <Unlock className="size-4" aria-hidden="true" />}
          </Button>
          <Button variant="secondary" className="h-9 px-3" aria-label="Duplicate (Ctrl+D)" title="Duplicate (Ctrl+D)" onClick={onDuplicate}>
            <Copy className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="danger" className="ml-auto h-9 px-3" onClick={onDelete}>
            <Trash2 className="size-4" aria-hidden="true" />
            Remove
          </Button>
        </div>
      </div>
    </PanelSection>
  )
}
