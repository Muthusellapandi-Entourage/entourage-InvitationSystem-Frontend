import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Printer } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError, apiBaseUrl } from '@/api/client'
import { printBadgeApi, type PrintBadgeDesign, type PrintGuest } from '@/api/printBadgeApi'
import { Button } from '@/components/ui/Button'
import { EventDesignerSwitcher } from '@/designer/DesignerSwitcher'
import { ElementBadgeDesigner } from '@/designer/ElementBadgeDesigner'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { paperPresets, printBadge } from '@/printing/printBadge'

const assetOrigin = apiBaseUrl || window.location.origin

/** Printed badge designer (paper badge, in mm) for one guest category. */
export function PrintBadgeDesignerPage() {
  const { eventId = '', guestTypeId = '' } = useParams()
  const event = useEvent(eventId).data
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['print-badge', eventId, guestTypeId], queryFn: () => printBadgeApi.get(eventId, guestTypeId) })
  const [saving, setSaving] = useState(false)
  useDocumentTitle(query.data ? `Printed badge · ${query.data.guestTypeName}` : 'Printed badge')

  if (query.isLoading || !query.data) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted">
        {query.isError ? 'The printed badge could not be loaded.' : 'Loading the printed badge…'}
      </div>
    )
  }

  const template = query.data
  return (
    <ElementBadgeDesigner
      key={guestTypeId}
      unit="mm"
      title={`Printed badge · ${template.guestTypeName}`}
      backLabel="Designs"
      backTo={`/events/${eventId}/designs`}
      switcher={<EventDesignerSwitcher eventId={eventId} kind="printed" guestTypeId={guestTypeId} guestTypeName={template.guestTypeName} />}
      eventId={eventId}
      initial={template.design}
      configured={template.configured}
      sizePresets={paperPresets.map((item) => ({ label: item.label, width: item.widthMm, height: item.heightMm }))}
      limits={{ minWidth: 20, maxWidth: 300, minHeight: 20, maxHeight: 300 }}
      saving={saving}
      hint={`Paper badge for the badge printer (not the digital pass)${event ? ` · ${event.name}` : ''}. Match the size to the cards or labels in your printer.`}
      onSave={async (design: PrintBadgeDesign) => {
        setSaving(true)
        try {
          const saved = await printBadgeApi.save(eventId, guestTypeId, design)
          queryClient.setQueryData(['print-badge', eventId, guestTypeId], saved)
          void queryClient.invalidateQueries({ queryKey: ['guest-types', eventId] })
          toast.success('Printed badge saved.')
          return saved.design
        } catch (error) {
          toast.error(error instanceof ApiError ? error.message : 'The printed badge could not be saved.')
          return null
        } finally {
          setSaving(false)
        }
      }}
      actions={(design, guest) => <TestPrint design={design} guest={guest} />}
    />
  )
}

function TestPrint({ design, guest }: { design: PrintBadgeDesign; guest: PrintGuest }) {
  const [printing, setPrinting] = useState(false)
  return (
    <Button
      variant="secondary"
      className="h-9"
      disabled={printing}
      onClick={async () => {
        setPrinting(true)
        try {
          await printBadge(design, guest, assetOrigin)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Printing failed.')
        } finally {
          setPrinting(false)
        }
      }}
    >
      {printing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Printer className="size-4" aria-hidden="true" />}
      Test print
    </Button>
  )
}
