import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Paintbrush, Plus, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { accApi, type AccBadgeTemplate } from '@/api/accreditationApi'
import { AccBadgeView, badgeQrDataUrl, loadImages, samplePerson } from '@/components/accreditation/AccBadgeView'
import { badgePaperPresets } from '@/components/accreditation/printBadges'
import { errorMessage, useAccRole } from '@/components/accreditation/shared'
import { Button, buttonClassName } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/StatusBadge'
import { TextField } from '@/components/ui/TextField'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAccSetup } from '@/pages/Accreditation/AccEventLayout'

/** Badge templates: which layout each applicant type gets. */
export function AccBadgesPage() {
  const { accEventId = '' } = useParams()
  const { canManage } = useAccRole()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setup = useAccSetup(accEventId).data
  const query = useQuery({ queryKey: ['acc', 'badge-templates', accEventId], queryFn: () => accApi.badgeTemplates(accEventId) })
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<AccBadgeTemplate | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [images, setImages] = useState<Record<string, string>>({})
  useDocumentTitle('Badges')

  useEffect(() => {
    void badgeQrDataUrl('ACC-SAMPLE-CODE').then(setQr)
  }, [])
  const templates = query.data ?? []
  const fileKey = templates
    .flatMap((template) => [template.design.backgroundFileId, ...template.design.elements.map((element) => (element.kind === 'image' ? element.fileId : null))])
    .filter(Boolean)
    .join(',')
  useEffect(() => {
    if (!fileKey) return
    void loadImages(fileKey.split(','), (id) => accApi.fileBlob(accEventId, id)).then(setImages)
  }, [fileKey, accEventId])

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['acc', 'badge-templates', accEventId] })
    void queryClient.invalidateQueries({ queryKey: ['acc', 'print-queue', accEventId] })
  }
  const update = useMutation({
    mutationFn: ({ template, patch }: { template: AccBadgeTemplate; patch: Partial<Pick<AccBadgeTemplate, 'applicantTypeIds' | 'isDefault' | 'name'>> }) =>
      accApi.updateBadgeTemplate(accEventId, template.id, {
        name: patch.name ?? template.name,
        design: template.design,
        applicantTypeIds: patch.applicantTypeIds ?? template.applicantTypeIds,
        isDefault: patch.isDefault ?? template.isDefault,
      }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error, 'Could not save.')),
  })
  const remove = useMutation({
    mutationFn: (id: string) => accApi.deleteBadgeTemplate(accEventId, id),
    onSuccess: () => {
      refresh()
      setDeleting(null)
      toast.success('Template removed.')
    },
  })

  const types = setup?.types ?? []
  const eventName = setup?.event.name ?? ''

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Badge templates</h2>
          <p className="mt-1 text-sm text-muted">
            Physical badge layouts. Give each applicant category its own template; everyone else gets the default.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New template
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        {query.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : query.isError ? (
          <p role="alert" className="text-sm text-danger">{errorMessage(query.error, 'Badge templates could not be loaded.')}</p>
        ) : templates.length === 0 ? (
          <EmptyState
            title="No badge templates yet"
            description="Create one to start printing. It comes with photo, name, company, zone boxes and QR already placed."
            action={canManage ? <Button onClick={() => setCreating(true)}>New template</Button> : undefined}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => {
              const scale = Math.min(200 / template.design.widthMm, 240 / template.design.heightMm)
              const taken = new Set(templates.filter((other) => other.id !== template.id).flatMap((other) => other.applicantTypeIds))
              return (
                <article key={template.id} className="flex flex-col rounded-lg border border-border bg-surface">
                  <div className="flex h-72 items-center justify-center border-b border-border bg-hover/40 p-4">
                    <div className="outline outline-1 outline-border">
                      <AccBadgeView design={template.design} person={samplePerson} eventName={eventName} images={images} qrDataUrl={qr} scale={scale} />
                    </div>
                  </div>
                  <div className="grid gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{template.name}</h3>
                        <p className="text-xs text-muted">
                          {template.design.widthMm} × {template.design.heightMm} mm
                        </p>
                      </div>
                      {template.isDefault ? <Badge tone="teal">Default</Badge> : null}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted">Used for</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {types.map((type) => {
                          const on = template.applicantTypeIds.includes(type.id ?? '')
                          return (
                            <button
                              key={type.id}
                              type="button"
                              disabled={!canManage || update.isPending}
                              aria-pressed={on}
                              title={!on && taken.has(type.id ?? '') ? 'Moves this type from its current template' : undefined}
                              className={
                                on
                                  ? 'h-7 rounded-sm border border-accent bg-accent-soft px-2 text-xs font-medium text-accent'
                                  : 'h-7 rounded-sm border border-border px-2 text-xs text-muted hover:text-foreground disabled:hover:text-muted'
                              }
                              onClick={() =>
                                update.mutate({
                                  template,
                                  patch: { applicantTypeIds: on ? template.applicantTypeIds.filter((id) => id !== type.id) : [...template.applicantTypeIds, type.id ?? ''] },
                                })
                              }
                            >
                              {type.name}
                            </button>
                          )
                        })}
                        {types.length === 0 ? <span className="text-xs text-muted">No applicant categories.</span> : null}
                      </div>
                    </div>
                    {canManage ? (
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Link to={`/accreditation/${accEventId}/badges/${template.id}`} className={buttonClassName('primary', 'h-9')}>
                          <Paintbrush className="size-4" aria-hidden="true" />
                          Design
                        </Link>
                        {!template.isDefault ? (
                          <Button variant="secondary" className="h-9" disabled={update.isPending} onClick={() => update.mutate({ template, patch: { isDefault: true } })}>
                            <Star className="size-4" aria-hidden="true" />
                            Make default
                          </Button>
                        ) : null}
                        <Button variant="ghost" className="ml-auto h-9 text-danger" onClick={() => setDeleting(template)} aria-label={`Remove ${template.name}`}>
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      <CreateTemplateDialog
        open={creating}
        onClose={() => setCreating(false)}
        eventId={accEventId}
        onCreated={(template) => {
          refresh()
          setCreating(false)
          navigate(`/accreditation/${accEventId}/badges/${template.id}`)
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Remove ${deleting?.name ?? ''}?`}
        description="Its applicant categories fall back to the default template. Printed badges are not affected."
        confirmLabel="Remove"
        pendingLabel="Removing…"
        pending={remove.isPending}
        error={remove.error ? errorMessage(remove.error, 'Could not remove it.') : null}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => {
          remove.reset()
          setDeleting(null)
        }}
      />
    </div>
  )
}

function CreateTemplateDialog({ open, onClose, eventId, onCreated }: { open: boolean; onClose: () => void; eventId: string; onCreated: (template: AccBadgeTemplate) => void }) {
  const [name, setName] = useState('Standard badge')
  const [size, setSize] = useState<string>(badgePaperPresets[0].label)
  const mutation = useMutation({
    mutationFn: async () => {
      const created = await accApi.createBadgeTemplate(eventId, { name, design: null, applicantTypeIds: [], isDefault: false })
      const preset = badgePaperPresets.find((item) => item.label === size)
      if (!preset || (preset.widthMm === created.design.widthMm && preset.heightMm === created.design.heightMm)) return created
      // Scale the starter layout to the chosen card size.
      const sx = preset.widthMm / created.design.widthMm
      const sy = preset.heightMm / created.design.heightMm
      const s = Math.min(sx, sy)
      const design = {
        ...created.design,
        widthMm: preset.widthMm,
        heightMm: preset.heightMm,
        elements: created.design.elements.map((element) => ({
          ...element,
          x: Math.round(element.x * sx * 10) / 10,
          y: Math.round(element.y * sy * 10) / 10,
          width: Math.round(element.width * (element.kind === 'qr' || element.kind === 'photo' ? s : sx) * 10) / 10,
          height: Math.round(element.height * (element.kind === 'qr' || element.kind === 'photo' ? s : sy) * 10) / 10,
          fontSize: Math.round(element.fontSize * s * 10) / 10,
        })),
      }
      return accApi.updateBadgeTemplate(eventId, created.id, { name: created.name, design, applicantTypeIds: [], isDefault: created.isDefault })
    },
    onSuccess: onCreated,
  })

  return (
    <Modal open={open} onClose={onClose} title="New badge template" width="sm">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Card size</span>
          <select className="h-10 rounded-md border border-border bg-surface px-3 text-sm" value={size} onChange={(event) => setSize(event.target.value)}>
            {badgePaperPresets.map((item) => (
              <option key={item.label} value={item.label}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {mutation.error ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(mutation.error, 'The template could not be created.')}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Create and design
          </Button>
        </div>
      </form>
    </Modal>
  )
}
