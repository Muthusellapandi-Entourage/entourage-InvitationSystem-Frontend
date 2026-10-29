import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Copy,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Lock,
  QrCode,
  Square,
  Trash2,
  Type,
  Unlock,
  Upload,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { apiBaseUrl } from '@/api/client'
import type { PrintBadgeDesign, PrintBadgeElement, PrintElementKind, PrintGuest } from '@/api/printBadgeApi'
import { invitationApi } from '@/api/invitationApi'
import { sampleQrDataUrl } from '@/badges/sampleQr'
import { useBrandFonts, useBrandKit } from '@/brand/useBrandKit'
import { BrandImageButton } from '@/components/brand/BrandImageButton'
import { AlphaColorInput } from '@/components/ui/AlphaColorInput'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { Advanced, DesignerShell, PanelSection, PanelTabs, UnitInput, useZoom } from '@/designer/DesignerShell'
import { buildFromLayout, elementLayouts } from '@/designer/elementTemplates'
import { LayersPanel } from '@/designer/LayersPanel'
import { emptyGuides, Stage, withLive, type StageGuides, type StageItem } from '@/designer/Stage'
import { TemplatePicker, type DesignTemplate } from '@/designer/TemplatePicker'
import { fitInside, naturalSize } from '@/designer/imageSize'
import { useHistory } from '@/designer/useHistory'
import { elementLabels, PrintBadgeView, printFonts, PX_PER_MM, sampleGuest } from '@/printing/PrintBadgeView'

/*
 * The element designer shared by printed badges (mm, font sizes in points) and digital passes
 * (px, font sizes in pixels): same panels, same canvas, same keys.
 */

const assetOrigin = apiBaseUrl || window.location.origin

export type SizePreset = { label: string; width: number; height: number }

const newId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 10)

/** The rectangle the picture really covers inside its box (drawn whole and centred). */
function hugImage(element: { x: number; y: number; width: number; height: number }, natural: { width: number; height: number }, round: (value: number) => number) {
  const scale = Math.min(element.width / natural.width, element.height / natural.height)
  const width = natural.width * scale
  const height = natural.height * scale
  return {
    x: round(element.x + (element.width - width) / 2),
    y: round(element.y + (element.height - height) / 2),
    width: round(width),
    height: round(height),
  }
}

const kindIcon = (kind: PrintElementKind) =>
  kind === 'qr' ? <QrCode /> : kind === 'image' ? <ImageIcon /> : kind === 'rect' ? <Square /> : kind === 'text' ? <Type /> : <UserRound />

export function ElementBadgeDesigner({
  unit,
  title,
  backLabel,
  backTo,
  switcher,
  eventId,
  initial,
  configured,
  sizePresets,
  limits,
  saving,
  onSave,
  actions,
  hint,
}: {
  unit: 'mm' | 'px'
  title: string
  backLabel: string
  backTo: string
  switcher: ReactNode
  eventId: string
  initial: PrintBadgeDesign
  /** False when nothing was saved yet: the template picker opens first. */
  configured: boolean
  sizePresets: SizePreset[]
  limits: { minWidth: number; maxWidth: number; minHeight: number; maxHeight: number }
  saving: boolean
  onSave: (design: PrintBadgeDesign) => Promise<PrintBadgeDesign | null>
  /** Extra top-bar buttons (Test print, Download sample…); gets the current design and test guest. */
  actions?: (design: PrintBadgeDesign, guest: PrintGuest) => ReactNode
  hint?: string
}) {
  const history = useHistory<PrintBadgeDesign>(initial)
  const design = history.present
  const [saved, setSaved] = useState<PrintBadgeDesign>(initial)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [guides, setGuides] = useState<StageGuides>(emptyGuides)
  const [guest, setGuest] = useState<PrintGuest>(sampleGuest)
  const [qr, setQr] = useState<string | null>(null)
  const [uploading, setUploading] = useState<'background' | 'image' | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(!configured)
  const zoom = useZoom()
  const { kit } = useBrandKit()
  useBrandFonts(kit.fonts)

  useEffect(() => {
    void sampleQrDataUrl().then(setQr)
  }, [])

  const dirty = !configured && JSON.stringify(saved) === JSON.stringify(initial) ? true : JSON.stringify(design) !== JSON.stringify(saved)
  const selected = design.elements.find((element) => element.id === selectedId) ?? null
  const fonts = useMemo(() => [...printFonts, ...kit.fonts.map((font) => font.name).filter((name) => !printFonts.includes(name))], [kit.fonts])
  const round = (value: number) => (unit === 'mm' ? Math.round(value * 10) / 10 : Math.round(value))
  const unitPx = unit === 'mm' ? PX_PER_MM : 1
  const fontUnit = unit === 'mm' ? 'pt' : 'px'

  /* ---------- editing helpers ---------- */
  const setElement = (id: string, change: Partial<PrintBadgeElement>) =>
    history.commit((current) => ({ ...current, elements: current.elements.map((element) => (element.id === id ? { ...element, ...change } : element)) }))

  function newElement(kind: PrintElementKind, assetId: string | null = null): PrintBadgeElement {
    const square = kind === 'qr'
    const width = square ? Math.min(design.widthMm, design.heightMm) * 0.28 : kind === 'image' ? design.widthMm * 0.4 : kind === 'rect' ? design.widthMm : design.widthMm * 0.85
    const height = square ? width : kind === 'image' ? design.heightMm * 0.16 : kind === 'rect' ? design.heightMm * 0.12 : design.heightMm * (kind === 'name' ? 0.14 : 0.07)
    const base = unit === 'mm' ? design.widthMm * (72 / 25.4) : design.widthMm
    return {
      id: newId(),
      kind,
      x: round((design.widthMm - width) / 2),
      y: round((design.heightMm - height) / 2),
      width: round(width),
      height: round(height),
      fontSize: round(base * (kind === 'name' ? 0.07 : 0.035)),
      fontWeight: kind === 'name' ? 'bold' : 'regular',
      color: '#111111',
      align: 'center',
      valign: 'middle',
      uppercase: false,
      text: kind === 'text' ? 'Your text' : null,
      font: kit.fonts[0]?.name ?? null,
      assetId,
      fill: kind === 'rect' ? (kit.colors[0]?.hex ?? '#38B8A2') : null,
      radius: 0,
      hidden: false,
      locked: false,
      name: null,
    }
  }

  function add(kind: PrintElementKind, assetId: string | null = null) {
    const element = newElement(kind, assetId)
    history.commit((current) => ({ ...current, elements: [...current.elements, element] }))
    setSelectedId(element.id)
  }

  /** Places an image with a box of the image's own proportions (so the selection box hugs the picture). */
  async function addImage(assetId: string) {
    const element = newElement('image', assetId)
    const natural = await naturalSize(`${assetOrigin}/api/public/assets/${assetId}`)
    if (natural) {
      const box = fitInside(natural, design.widthMm * 0.6, design.heightMm * 0.4)
      element.width = round(box.w)
      element.height = round(box.h)
      element.x = round((design.widthMm - box.w) / 2)
      element.y = round((design.heightMm - box.h) / 2)
    }
    history.commit((current) => ({ ...current, elements: [...current.elements, element] }))
    setSelectedId(element.id)
  }

  /** Shrinks an image's box to the picture as it is drawn (centred, whole picture), so nothing moves on the badge. */
  async function fitBoxToImage(id: string, assetId: string | null = null) {
    const element = history.current().elements.find((item) => item.id === id)
    const source = assetId ?? element?.assetId
    if (!element || !source) return
    const natural = await naturalSize(`${assetOrigin}/api/public/assets/${source}`)
    if (!natural) return
    setElement(id, { ...(assetId ? { assetId } : {}), ...hugImage(element, natural, round) })
  }

  // Older designs: images sat in boxes larger than the picture. Tighten them once on open (looks the same).
  useEffect(() => {
    let cancelled = false
    const images = initial.elements.filter((element) => element.kind === 'image' && element.assetId)
    if (images.length === 0) return
    void Promise.all(images.map((element) => naturalSize(`${assetOrigin}/api/public/assets/${element.assetId}`))).then((sizes) => {
      if (cancelled) return
      const changes = new Map<string, Partial<PrintBadgeElement>>()
      images.forEach((element, index) => {
        const natural = sizes[index]
        if (!natural) return
        const box = hugImage(element, natural, round)
        if (Math.abs(box.width - element.width) > 0.2 || Math.abs(box.height - element.height) > 0.2) changes.set(element.id, box)
      })
      if (changes.size === 0) return
      const fix = (value: PrintBadgeDesign) => ({ ...value, elements: value.elements.map((element) => (changes.has(element.id) ? { ...element, ...changes.get(element.id) } : element)) })
      const unchanged = JSON.stringify(history.current()) === JSON.stringify(initial)
      if (unchanged) {
        const fixed = fix(initial)
        history.reset(fixed)
        setSaved(fixed)
      } else {
        history.live(fix)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function upload(file: File, target: 'background' | 'image') {
    setUploading(target)
    try {
      const asset = await invitationApi.uploadAsset(eventId, file)
      if (target === 'background') history.commit((current) => ({ ...current, backgroundAssetId: asset.id }))
      else await addImage(asset.id)
    } catch {
      toast.error('The image could not be uploaded. Use a PNG, JPG or WEBP up to 15 MB.')
    } finally {
      setUploading(null)
    }
  }

  function remove(id: string) {
    history.commit((current) => ({ ...current, elements: current.elements.filter((element) => element.id !== id) }))
    setSelectedId(null)
  }

  function duplicate(id: string) {
    const element = design.elements.find((item) => item.id === id)
    if (!element) return
    const offset = unit === 'mm' ? 3 : 12
    const copy = { ...element, id: newId(), x: round(element.x + offset), y: round(element.y + offset), locked: false, name: element.name ? `${element.name} copy` : null }
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

  async function save() {
    const result = await onSave(design)
    if (!result) return false
    setSaved(result)
    history.reset(result)
    return true
  }

  /* ---------- stage items ---------- */
  const items: StageItem[] = design.elements.map((element) => ({
    id: element.id,
    label: element.name || elementLabels[element.kind],
    x: element.x,
    y: element.y,
    w: element.width,
    h: element.height,
    hidden: element.hidden,
    locked: element.locked,
    square: element.kind === 'qr',
    keepRatio: element.kind === 'image',
  }))

  const templates: DesignTemplate<PrintBadgeDesign>[] = elementLayouts.map((layout) => {
    const logo = kit.groups.find((group) => group.kind === 'logos')?.items[0]?.assetId ?? null
    const build = () => ({
      ...buildFromLayout(layout, { width: design.widthMm, height: design.heightMm }, unit, kit, logo),
      backgroundColor: design.backgroundColor,
    })
    const preview = build()
    const previewScale = Math.min(150 / (preview.widthMm * unitPx), 180 / (preview.heightMm * unitPx)) * unitPx
    return {
      id: layout.id,
      name: layout.name,
      description: layout.description,
      build,
      preview: (
        <span className="outline outline-1 outline-border">
          <PrintBadgeView design={preview} guest={sampleGuest} qrDataUrl={qr} assetOrigin={assetOrigin} scale={previewScale} unit={unit} />
        </span>
      ),
    }
  })

  const nudgeStep = unit === 'mm' ? 0.5 : 1

  /* ---------- panels ---------- */
  const addPanel = (
    <>
      <PanelSection title="Guest details" hint="Filled in for each guest.">
        <div className="grid grid-cols-2 gap-2">
          {(['name', 'position', 'company', 'guestType', 'seat'] as const).map((kind) => (
            <AddButton key={kind} icon={kindIcon(kind)} label={elementLabels[kind]} onClick={() => add(kind)} />
          ))}
          <AddButton icon={<QrCode />} label="QR code" onClick={() => add('qr')} />
        </div>
      </PanelSection>
      <PanelSection title="Design">
        <div className="grid grid-cols-2 gap-2">
          <AddButton icon={<Type />} label="Text" onClick={() => add('text')} />
          <AddButton icon={<Square />} label="Shape" onClick={() => add('rect')} />
          <UploadTile label="Image" busy={uploading === 'image'} onFile={(file) => void upload(file, 'image')} />
          <BrandImageButton label="Brand image" className="h-9 justify-start" disabled={uploading !== null} onPick={(item) => addImage(item.assetId)} />
        </div>
      </PanelSection>
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
        label: element.name || (element.kind === 'text' && element.text ? `Text: ${element.text}` : elementLabels[element.kind]),
        icon: kindIcon(element.kind),
        hidden: element.hidden,
        locked: element.locked,
      }))}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onReorder={(ids) =>
        history.commit((current) => ({ ...current, elements: ids.map((id) => current.elements.find((element) => element.id === id)!).filter(Boolean) }))
      }
      onToggleHidden={(id) => setElement(id, { hidden: !design.elements.find((element) => element.id === id)?.hidden })}
      onToggleLocked={(id) => setElement(id, { locked: !design.elements.find((element) => element.id === id)?.locked })}
      onRename={(id, name) => setElement(id, { name: name || null })}
    />
  )

  const right = selected ? (
    <ElementProperties
      element={selected}
      unit={unit}
      fontUnit={fontUnit}
      fonts={fonts}
      onChange={(change) => setElement(selected.id, change)}
      onCentre={() => setElement(selected.id, { x: round((design.widthMm - selected.width) / 2) })}
      onDuplicate={() => duplicate(selected.id)}
      onDelete={() => remove(selected.id)}
      onLayer={(delta) => layer(selected.id, delta)}
      onReplaceImage={(assetId) => void fitBoxToImage(selected.id, assetId)}
      onFitImage={() => void fitBoxToImage(selected.id)}
      uploadImage={async (file) => {
        const asset = await invitationApi.uploadAsset(eventId, file)
        await fitBoxToImage(selected.id, asset.id)
      }}
    />
  ) : (
    <>
      {hint ? <p className="mb-5 rounded-md border border-border bg-background p-3 text-xs text-muted">{hint}</p> : null}
      <PanelSection title="Size">
        <select
          aria-label="Size"
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={sizePresets.find((item) => Math.abs(item.width - design.widthMm) < 0.2 && Math.abs(item.height - design.heightMm) < 0.2)?.label ?? 'custom'}
          onChange={(change) => {
            const next = sizePresets.find((item) => item.label === change.target.value)
            if (next) history.commit((current) => ({ ...current, widthMm: next.width, heightMm: next.height }))
          }}
        >
          {sizePresets.map((item) => (
            <option key={item.label} value={item.label}>
              {item.label}
            </option>
          ))}
          <option value="custom">Custom size</option>
        </select>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <UnitInput
            label="Width"
            unit={unit}
            value={design.widthMm}
            onChange={(value) => history.commit((current) => ({ ...current, widthMm: Math.max(limits.minWidth, Math.min(limits.maxWidth, round(value))) }))}
          />
          <UnitInput
            label="Height"
            unit={unit}
            value={design.heightMm}
            onChange={(value) => history.commit((current) => ({ ...current, heightMm: Math.max(limits.minHeight, Math.min(limits.maxHeight, round(value))) }))}
          />
        </div>
      </PanelSection>
      <PanelSection title="Background">
        <AlphaColorInput label="Background colour" value={design.backgroundColor} onChange={(backgroundColor) => history.commit((current) => ({ ...current, backgroundColor }))} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <UploadTile label={design.backgroundAssetId ? 'Replace image' : 'Background image'} busy={uploading === 'background'} onFile={(file) => void upload(file, 'background')} />
          <BrandImageButton compact disabled={uploading !== null} onPick={(item) => history.commit((current) => ({ ...current, backgroundAssetId: item.assetId }))} />
          {design.backgroundAssetId ? (
            <button type="button" className="text-xs font-medium text-danger hover:underline" onClick={() => history.commit((current) => ({ ...current, backgroundAssetId: null }))}>
              Remove
            </button>
          ) : null}
        </div>
      </PanelSection>
      <PanelSection title="Test guest" hint="Try long names to check they fit. Not saved.">
        {(['name', 'position', 'company', 'guestType', 'seat'] as const).map((key) => (
          <label key={key} className="mb-2 grid gap-1 text-xs">
            <span className="font-medium text-muted">{elementLabels[key]}</span>
            <input className="h-9 rounded-md border border-border bg-background px-2.5 text-sm" value={guest[key] ?? ''} onChange={(change) => setGuest({ ...guest, [key]: change.target.value })} />
          </label>
        ))}
      </PanelSection>
    </>
  )

  return (
    <>
      <DesignerShell
        title={title}
        backLabel={backLabel}
        backTo={backTo}
        switcher={switcher}
        history={history}
        zoom={{ value: zoom.value, fit: zoom.fit, set: zoom.set }}
        save={{ dirty, saving, onSave: save }}
        actions={
          <>
            <Button variant="secondary" className="hidden h-9 xl:inline-flex" onClick={() => setTemplatesOpen(true)}>
              <LayoutTemplate className="size-4" aria-hidden="true" />
              Templates
            </Button>
            {actions?.(design, guest)}
          </>
        }
        keys={{
          onDelete: selected ? () => remove(selected.id) : undefined,
          onDuplicate: selected ? () => duplicate(selected.id) : undefined,
          onEscape: () => setSelectedId(null),
          onNudge: selected && !selected.locked
            ? (dx, dy, big) => setElement(selected.id, { x: round(selected.x + dx * nudgeStep * (big ? 10 : 1)), y: round(selected.y + dy * nudgeStep * (big ? 10 : 1)) })
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
          unit={unit}
          unitPx={unitPx}
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
              elements: current.elements.map((element) => (element.id === id ? { ...element, x: box.x, y: box.y, width: box.w, height: box.h } : element)),
            }))
          }}
          guides={guides}
          onGuidesChange={setGuides}
          render={(scale, live) => (
            <PrintBadgeView
              design={live ? { ...design, elements: withLive(design.elements, live, (element, box) => ({ ...element, x: box.x, y: box.y, width: box.w, height: box.h })) } : design}
              guest={guest}
              qrDataUrl={qr}
              assetOrigin={assetOrigin}
              scale={scale}
              unit={unit}
            />
          )}
        />
      </DesignerShell>
      <TemplatePicker open={templatesOpen} onClose={() => setTemplatesOpen(false)} templates={templates} onPick={(next) => history.commit(next)} />
    </>
  )
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

const isTextKind = (kind: PrintElementKind) => kind !== 'qr' && kind !== 'image' && kind !== 'rect'

function ElementProperties({
  element,
  unit,
  fontUnit,
  fonts,
  onChange,
  onCentre,
  onDuplicate,
  onDelete,
  onLayer,
  onReplaceImage,
  onFitImage,
  uploadImage,
}: {
  onFitImage: () => void
  element: PrintBadgeElement
  unit: 'mm' | 'px'
  fontUnit: string
  fonts: string[]
  onChange: (change: Partial<PrintBadgeElement>) => void
  onCentre: () => void
  onDuplicate: () => void
  onDelete: () => void
  onLayer: (delta: number) => void
  onReplaceImage: (assetId: string) => void
  uploadImage: (file: File) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <PanelSection
      title={element.name || elementLabels[element.kind]}
      hint={element.kind === 'qr' ? 'The guest’s own check-in QR code.' : isTextKind(element.kind) && element.kind !== 'text' ? 'Filled in with each guest’s details.' : undefined}
    >
      <div className="grid gap-3">
        {element.kind === 'text' ? (
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Text</span>
            <textarea rows={2} className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={element.text ?? ''} onChange={(change) => onChange({ text: change.target.value })} />
          </label>
        ) : null}

        {element.kind === 'image' ? (
          <div className="flex flex-wrap gap-2">
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-hover">
              {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Upload className="size-3.5 text-accent" aria-hidden="true" />}
              Replace image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={async (change) => {
                  const file = change.target.files?.[0]
                  change.target.value = ''
                  if (!file) return
                  setBusy(true)
                  try {
                    await uploadImage(file)
                  } catch {
                    toast.error('The image could not be uploaded.')
                  } finally {
                    setBusy(false)
                  }
                }}
              />
            </label>
            <BrandImageButton label="From brand kit" onPick={(item) => onReplaceImage(item.assetId)} />
            <Button variant="secondary" className="h-9 px-2.5 text-xs" title="Make the box the same shape as the picture" onClick={onFitImage}>
              Fit box to image
            </Button>
          </div>
        ) : null}

        {isTextKind(element.kind) ? (
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
                <span className="font-medium">Size ({fontUnit})</span>
                <input
                  type="number"
                  min={4}
                  max={unit === 'mm' ? 120 : 400}
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={element.fontSize}
                  onChange={(change) => onChange({ fontSize: Math.max(4, Math.min(unit === 'mm' ? 120 : 400, Number(change.target.value) || 4)) })}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Weight">
                {(['regular', 'bold'] as const).map((weight) => (
                  <button
                    key={weight}
                    type="button"
                    aria-pressed={element.fontWeight === weight || (weight === 'bold' && element.fontWeight === 'semibold')}
                    className={cn(
                      'flex h-8 flex-1 items-center justify-center rounded-sm text-xs',
                      element.fontWeight === weight || (weight === 'bold' && element.fontWeight === 'semibold') ? 'bg-accent-soft font-semibold text-accent' : 'text-muted',
                    )}
                    onClick={() => onChange({ fontWeight: weight })}
                  >
                    {weight === 'bold' ? 'Bold' : 'Regular'}
                  </button>
                ))}
              </div>
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
              <span className="mb-1.5 block text-sm font-medium">Text colour</span>
              <AlphaColorInput label="Text colour" value={element.color} onChange={(color) => onChange({ color })} />
            </div>
          </>
        ) : null}

        {element.kind === 'rect' || isTextKind(element.kind) ? (
          <div>
            <span className="mb-1.5 block text-sm font-medium">{element.kind === 'rect' ? 'Colour' : 'Box colour'}</span>
            <AlphaColorInput
              label={element.kind === 'rect' ? 'Shape colour' : 'Box colour'}
              value={element.fill ?? null}
              onChange={(fill) => onChange({ fill })}
              onClear={element.kind === 'rect' ? undefined : () => onChange({ fill: null })}
            />
          </div>
        ) : null}

        <Advanced>
          <div className="grid gap-3 rounded-md border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <UnitInput label="X" unit={unit} value={element.x} onChange={(x) => onChange({ x })} />
              <UnitInput label="Y" unit={unit} value={element.y} onChange={(y) => onChange({ y })} />
              <UnitInput label="Width" unit={unit} value={element.width} onChange={(width) => onChange({ width, ...(element.kind === 'qr' ? { height: width } : {}) })} />
              <UnitInput label="Height" unit={unit} value={element.height} disabled={element.kind === 'qr'} onChange={(height) => onChange({ height })} />
            </div>
            <Button variant="secondary" className="h-9 w-full" onClick={onCentre}>
              Centre horizontally
            </Button>
            {element.kind !== 'qr' ? <UnitInput label="Corner radius" unit={unit} value={element.radius ?? 0} onChange={(radius) => onChange({ radius: Math.max(0, radius) })} /> : null}
            {isTextKind(element.kind) ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1.5 text-xs">
                  <span className="font-medium text-muted">Vertical</span>
                  <select
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                    value={element.valign}
                    onChange={(change) => onChange({ valign: change.target.value as PrintBadgeElement['valign'] })}
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
                placeholder={elementLabels[element.kind]}
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
