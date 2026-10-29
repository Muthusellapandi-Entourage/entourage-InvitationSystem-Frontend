import { ArrowLeft, Eye, ImageDown, FileDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { apiBaseUrl } from '@/api/client'
import { sampleGuestName, type BadgeDesign } from '@/badges/design'
import { buildBadgeHtml, downloadBadgePdf, downloadBadgePng, renderSampleBadge } from '@/badges/renderBadge'
import { sampleQrDataUrl } from '@/badges/sampleQr'
import { LogoMark } from '@/components/brand/Logo'
import { GuestTypeDesignSelect, type GuestTypeOption } from '@/components/events/GuestTypeDesignSelect'
import { InvitationCanvas, type CanvasSelection, type CanvasZoom, type ImageMetrics } from '@/components/invitations/InvitationCanvas'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { DesignGuides, GuestBand, ImagePlacement } from '@/invitations/design'
import { BadgeSidebar } from './BadgeSidebar'

const hiddenBand: GuestBand = { y: 0, height: 48, align: 'left', valign: 'middle', spacing: 0, inset: 0 }

type BadgeDesignerProps = {
  eventId: string
  design: BadgeDesign
  onChange: (design: BadgeDesign) => void
  uploading: boolean
  onUpload: (file: File) => void
  saving: boolean
  onSave: () => void
  backTo?: string
  backLabel?: string
  context?: string
  guestTypes?: GuestTypeOption[]
  guestTypeId?: string
  onGuestTypeChange?: (guestTypeId: string) => void
}

export function BadgeDesigner({
  eventId,
  design,
  onChange,
  uploading,
  onUpload,
  saving,
  onSave,
  backTo,
  backLabel = 'Back to event',
  context,
  guestTypes,
  guestTypeId = '',
  onGuestTypeChange,
}: BadgeDesignerProps) {
  const [selection, setSelection] = useState<CanvasSelection>(null)
  const [zoom, setZoom] = useState<CanvasZoom>('fit')
  const [rulers, setRulers] = useState(true)
  const [guidesVisible, setGuidesVisible] = useState(true)
  const [snap, setSnap] = useState(true)
  const [metrics, setMetrics] = useState<ImageMetrics | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'png' | 'pdf' | 'preview' | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    let live = true
    sampleQrDataUrl()
      .then((url) => {
        if (live) setQrUrl(url)
      })
      .catch(() => {
        if (live) toast.error('The sample QR code could not be created.')
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (selection?.kind !== 'image') return
      if (selection.slot === 'qr') {
        onChange({ ...design, qr: null })
        setSelection(null)
      }
      if (selection.slot === 'name') {
        onChange({ ...design, name: null })
        setSelection(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [design, onChange, selection])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const html = useMemo(
    () => buildBadgeHtml(design, { name: sampleGuestName, qrDataUrl: qrUrl, assetOrigin: apiBaseUrl, editor: true }),
    [design, qrUrl],
  )

  const placements: Record<string, ImagePlacement | null> = {
    background: design.backgroundAssetId ? design.background : null,
    qr: design.qr,
    name: design.name
      ? { x: design.name.x, y: design.name.y, width: design.name.width, height: design.name.height, lockRatio: false }
      : null,
  }

  function commitImage(slot: string, placement: ImagePlacement) {
    if (slot === 'background') {
      onChange({ ...design, background: placement })
      return
    }
    if (slot === 'qr') {
      const locked = placement.lockRatio !== false
      onChange({
        ...design,
        qr: {
          ...placement,
          height: locked ? placement.width : (placement.height ?? design.qr?.height ?? placement.width),
          lockRatio: locked,
        },
      })
      return
    }
    if (slot === 'name' && design.name) {
      onChange({
        ...design,
        name: {
          ...design.name,
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height ?? design.name.height,
        },
      })
    }
  }

  function updateGuides(guides: DesignGuides | null) {
    const next = guides && (guides.vertical.length > 0 || guides.horizontal.length > 0) ? guides : null
    onChange({ ...design, guides: next })
  }

  async function painted() {
    const qrDataUrl = qrUrl ?? (await sampleQrDataUrl())
    return renderSampleBadge(design, qrDataUrl, apiBaseUrl)
  }

  async function download(kind: 'png' | 'pdf') {
    if (exporting) return
    setExporting(kind)
    try {
      const canvas = await painted()
      if (canvas.width !== design.width || canvas.height !== design.height) {
        throw new Error('The digital pass could not be drawn.')
      }
      if (kind === 'png') await downloadBadgePng(canvas)
      else downloadBadgePdf(canvas)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The digital pass could not be downloaded.')
    } finally {
      setExporting(null)
    }
  }

  async function openPreview() {
    if (exporting) return
    setExporting('preview')
    try {
      const canvas = await painted()
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob || blob.size === 0) throw new Error('The digital pass could not be drawn.')
      const url = URL.createObjectURL(blob)
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return url
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The preview could not be created.')
    } finally {
      setExporting(null)
    }
  }

  function closePreview() {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-4 overflow-x-auto border-b border-border bg-surface px-5">
        <div className="flex shrink-0 items-center gap-2.5">
          <LogoMark className="size-6 text-accent" />
          <span className="whitespace-nowrap text-sm font-semibold">Digital pass designer</span>
        </div>
        <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        <Link to={backTo ?? `/events/${eventId}`} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm text-muted hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
        {guestTypes && onGuestTypeChange ? (
          <GuestTypeDesignSelect value={guestTypeId} types={guestTypes} onChange={onGuestTypeChange} />
        ) : null}
        {context ? <p className="sr-only">{context}</p> : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="secondary" className="whitespace-nowrap" onClick={() => void download('png')} disabled={exporting !== null || uploading}>
            <ImageDown className="size-4" aria-hidden="true" />
            {exporting === 'png' ? 'Preparing image…' : 'Download Preview as Image'}
          </Button>
          <Button variant="secondary" className="whitespace-nowrap" onClick={() => void download('pdf')} disabled={exporting !== null || uploading}>
            <FileDown className="size-4" aria-hidden="true" />
            {exporting === 'pdf' ? 'Preparing PDF…' : 'Download Preview as PDF'}
          </Button>
          <Button variant="secondary" className="whitespace-nowrap" onClick={() => void openPreview()} disabled={exporting !== null || uploading}>
            <Eye className="size-4" aria-hidden="true" />
            {exporting === 'preview' ? 'Preparing…' : 'Preview'}
          </Button>
          <Button className="whitespace-nowrap" onClick={onSave} disabled={saving || uploading || exporting !== null}>
            {saving ? 'Saving…' : 'Save design'}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 overflow-auto px-6 py-5 lg:grid-cols-[25rem_minmax(0,1fr)] lg:overflow-hidden">
        <BadgeSidebar
          design={design}
          selection={selection}
          metrics={selection?.kind === 'image' ? metrics : null}
          uploading={uploading}
          onChange={onChange}
          onSelect={setSelection}
          onUpload={onUpload}
        />
        <InvitationCanvas
          html={html}
          width={design.width}
          height={design.height}
          band={hiddenBand}
          bandVisible={false}
          placements={placements}
          selection={selection}
          editable
          onSelect={setSelection}
          onDeselect={() => setSelection(null)}
          onBandCommit={() => undefined}
          onImageCommit={commitImage}
          labels={{ background: 'Background', qr: 'QR code', name: 'Guest name' }}
          frameTitle="Digital pass preview"
          yMax={design.height}
          onImageMetrics={setMetrics}
          zoom={zoom}
          onZoomChange={setZoom}
          rulers={rulers}
          onRulers={setRulers}
          guidesVisible={guidesVisible}
          onGuidesVisible={setGuidesVisible}
          snap={snap}
          onSnap={setSnap}
          guides={design.guides}
          onGuidesChange={updateGuides}
          onClearGuides={() => setConfirmClear(true)}
          mobile={false}
          heading="Digital pass"
          headingAside={<span className="text-xs text-muted">{design.width} × {design.height} px</span>}
        />
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all guides?"
        description="This removes every guide on this digital pass. Snapping to the canvas center and edges keeps working."
        confirmLabel="Clear guides"
        pendingLabel="Clearing…"
        onConfirm={() => {
          updateGuides(null)
          setConfirmClear(false)
        }}
        onClose={() => setConfirmClear(false)}
      />

      {previewUrl ? (
        <dialog
          open
          aria-labelledby="badge-preview-title"
          className="w-[min(40rem,calc(100vw-2rem))]"
          onClick={(event) => {
            if (event.target === event.currentTarget) closePreview()
          }}
        >
          <div className="p-5">
            <h2 id="badge-preview-title" className="text-base font-semibold">
              Digital pass preview
            </h2>
            <p className="mt-1 text-sm text-muted">
              Sample guest “{sampleGuestName}”. This QR code is not a check-in credential.
            </p>
            <img
              src={previewUrl}
              alt="Digital pass preview with the sample guest name and a sample QR code"
              width={design.width}
              height={design.height}
              className="mt-4 max-h-[70vh] w-full border border-border bg-white object-contain"
            />
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={closePreview} autoFocus>
                Close
              </Button>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  )
}
