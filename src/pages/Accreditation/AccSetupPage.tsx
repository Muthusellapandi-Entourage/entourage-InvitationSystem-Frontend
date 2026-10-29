import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  accApi,
  type AccApplicantType,
  type AccDocumentRule,
  type AccField,
  type AccFieldType,
  type AccMailTemplate,
  type AccNotifications,
  type AccProfile,
  type AccSetup,
  type AccStage,
  type AccStageKind,
  type AccZone,
} from '@/api/accreditationApi'
import { errorMessage, Section, slugKey, useAccRole } from '@/components/accreditation/shared'
import { AlphaColorInput } from '@/components/ui/AlphaColorInput'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { cn } from '@/lib/cn'
import { useAccSetup } from '@/pages/Accreditation/AccEventLayout'

const input = 'h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm focus:border-accent disabled:opacity-60'
const iconButton = 'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground disabled:opacity-30'

function move<T>(list: T[], index: number, by: number) {
  const next = [...list]
  const target = index + by
  if (target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** Keeps a local draft of one setup list; resets when the saved version changes. */
function useDraft<T>(saved: T) {
  const [draft, setDraft] = useState(saved)
  const [base, setBase] = useState(saved)
  if (saved !== base) {
    setBase(saved)
    setDraft(saved)
  }
  return [draft, setDraft, JSON.stringify(draft) !== JSON.stringify(saved)] as const
}

function SaveBar({ dirty, pending, onSave, onReset }: { dirty: boolean; pending: boolean; onSave: () => void; onReset: () => void }) {
  if (!dirty) return null
  return (
    <>
      <Button variant="secondary" className="h-9" onClick={onReset} disabled={pending}>
        Discard
      </Button>
      <Button className="h-9" onClick={onSave} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Save
      </Button>
    </>
  )
}

function useSave<T>(eventId: string, save: (value: T) => Promise<AccSetup>, message: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: save,
    onSuccess: (setup) => {
      queryClient.setQueryData(['acc', 'setup', eventId], setup)
      void queryClient.invalidateQueries({ queryKey: ['acc', 'overview', eventId] })
      toast.success(message)
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save.')),
  })
}

export function AccSetupPage() {
  const { accEventId = '' } = useParams()
  const query = useAccSetup(accEventId)
  const { canManage } = useAccRole()
  useDocumentTitle('Accreditation set-up')
  if (!query.data) return <Skeleton className="h-96 w-full" />
  const setup = query.data
  return (
    <div className="grid gap-6">
      {!canManage ? <p className="text-sm text-muted">Only accreditation admins can change the set-up.</p> : null}
      <ZonesSection eventId={accEventId} setup={setup} editable={canManage} />
      <ProfilesSection eventId={accEventId} setup={setup} editable={canManage} />
      <TypesSection eventId={accEventId} setup={setup} editable={canManage} />
      <StagesSection eventId={accEventId} setup={setup} editable={canManage} />
      <NotificationsSection eventId={accEventId} setup={setup} editable={canManage} />
    </div>
  )
}

/* ---------------- Zones ---------------- */

function ZonesSection({ eventId, setup, editable }: { eventId: string; setup: AccSetup; editable: boolean }) {
  const [zones, setZones, dirty] = useDraft<AccZone[]>(setup.zones)
  const save = useSave(eventId, (value: AccZone[]) => accApi.saveZones(eventId, value), 'Zones saved.')
  const update = (index: number, patch: Partial<AccZone>) => setZones(zones.map((zone, at) => (at === index ? { ...zone, ...patch } : zone)))
  return (
    <Section
      title="Zones"
      description="Physical areas of the venue. The code and colour are what guards check on the badge."
      actions={editable ? <SaveBar dirty={dirty} pending={save.isPending} onSave={() => save.mutate(zones)} onReset={() => setZones(setup.zones)} /> : null}
    >
      <div className="grid gap-2">
        {zones.length ? (
          <div className="hidden grid-cols-[6rem_1fr_9rem_8rem_5.5rem] gap-2 px-1 text-xs text-muted md:grid">
            <span>Code</span>
            <span>Name</span>
            <span>Colour</span>
            <span>Capacity</span>
            <span />
          </div>
        ) : (
          <p className="text-sm text-muted">No zones yet. Examples: 1 · Field of play, 2 · Media centre, 3 · Backstage.</p>
        )}
        {zones.map((zone, index) => (
          <div key={zone.id ?? `new-${index}`} className="grid grid-cols-2 gap-2 md:grid-cols-[6rem_1fr_9rem_8rem_5.5rem] md:items-center">
            <input aria-label="Code" className={input} value={zone.code} disabled={!editable} maxLength={20} onChange={(event) => update(index, { code: event.target.value })} />
            <input aria-label="Name" className={input} value={zone.name} disabled={!editable} onChange={(event) => update(index, { name: event.target.value })} />
            <AlphaColorInput label={`Colour of ${zone.name || 'zone'}`} value={zone.color} disabled={!editable} onChange={(color) => update(index, { color })} />
            <input
              aria-label="Capacity"
              className={input}
              type="number"
              min={0}
              placeholder="No limit"
              value={zone.capacity ?? ''}
              disabled={!editable}
              onChange={(event) => update(index, { capacity: event.target.value === '' ? null : Number(event.target.value) })}
            />
            {editable ? (
              <span className="flex">
                <button type="button" className={iconButton} aria-label="Move up" disabled={index === 0} onClick={() => setZones(move(zones, index, -1))}>
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" className={cn(iconButton, 'hover:text-danger')} aria-label="Remove zone" onClick={() => setZones(zones.filter((_, at) => at !== index))}>
                  <Trash2 className="size-4" />
                </button>
              </span>
            ) : null}
          </div>
        ))}
        {editable ? (
          <div>
            <Button
              variant="ghost"
              className="h-9"
              onClick={() => setZones([...zones, { id: null, code: String(zones.length + 1), name: '', color: '#38B8A2', capacity: null }])}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add zone
            </Button>
          </div>
        ) : null}
      </div>
    </Section>
  )
}

/* ---------------- Access profiles ---------------- */

function ProfilesSection({ eventId, setup, editable }: { eventId: string; setup: AccSetup; editable: boolean }) {
  const [profiles, setProfiles, dirty] = useDraft<AccProfile[]>(setup.profiles)
  const save = useSave(eventId, (value: AccProfile[]) => accApi.saveProfiles(eventId, value), 'Access profiles saved.')
  const update = (index: number, patch: Partial<AccProfile>) => setProfiles(profiles.map((item, at) => (at === index ? { ...item, ...patch } : item)))
  const savedZones = setup.zones.filter((zone) => zone.id)
  return (
    <Section
      title="Access profiles"
      description="Bundles of zones given on approval, e.g. Media pass = Media centre + Press pit."
      actions={editable ? <SaveBar dirty={dirty} pending={save.isPending} onSave={() => save.mutate(profiles)} onReset={() => setProfiles(setup.profiles)} /> : null}
    >
      <div className="grid gap-3">
        {profiles.length === 0 ? <p className="text-sm text-muted">No access profiles yet.</p> : null}
        {savedZones.length === 0 && editable ? <p className="text-xs text-warning">Save some zones first, then pick them here.</p> : null}
        {profiles.map((profile, index) => (
          <div key={profile.id ?? `new-${index}`} className="grid gap-2 rounded-md border border-border p-3">
            <div className="grid grid-cols-[1fr_9rem_auto] items-center gap-2">
              <input aria-label="Profile name" placeholder="Profile name" className={input} value={profile.name} disabled={!editable} onChange={(event) => update(index, { name: event.target.value })} />
              <AlphaColorInput label="Profile colour" value={profile.color} disabled={!editable} onChange={(color) => update(index, { color })} />
              {editable ? (
                <button type="button" className={cn(iconButton, 'hover:text-danger')} aria-label="Remove profile" onClick={() => setProfiles(profiles.filter((_, at) => at !== index))}>
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {savedZones.map((zone) => {
                const on = profile.zoneIds.includes(zone.id!)
                return (
                  <button
                    key={zone.id}
                    type="button"
                    disabled={!editable}
                    aria-pressed={on}
                    onClick={() => update(index, { zoneIds: on ? profile.zoneIds.filter((id) => id !== zone.id) : [...profile.zoneIds, zone.id!] })}
                    className={cn('inline-flex h-7 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium', on ? 'text-white' : 'border-border text-muted hover:text-foreground')}
                    style={on ? { backgroundColor: zone.color, borderColor: zone.color } : undefined}
                  >
                    {zone.code} <span className="font-normal">{zone.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {editable ? (
          <div>
            <Button variant="ghost" className="h-9" onClick={() => setProfiles([...profiles, { id: null, name: '', color: '#38B8A2', zoneIds: [] }])}>
              <Plus className="size-4" aria-hidden="true" />
              Add access profile
            </Button>
          </div>
        ) : null}
      </div>
    </Section>
  )
}

/* ---------------- Applicant types ---------------- */

const fieldTypes: { value: AccFieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'select', label: 'Choice list' },
  { value: 'date', label: 'Date' },
  { value: 'url', label: 'Web address' },
]

function TypesSection({ eventId, setup, editable }: { eventId: string; setup: AccSetup; editable: boolean }) {
  const [types, setTypes, dirty] = useDraft<AccApplicantType[]>(setup.types)
  const save = useSave(eventId, (value: AccApplicantType[]) => accApi.saveTypes(eventId, value), 'Applicant types saved.')
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const update = (index: number, patch: Partial<AccApplicantType>) => setTypes(types.map((item, at) => (at === index ? { ...item, ...patch } : item)))

  return (
    <Section
      title="Applicant types"
      description="Each type has its own extra questions and required documents."
      actions={editable ? <SaveBar dirty={dirty} pending={save.isPending} onSave={() => save.mutate(types)} onReset={() => setTypes(setup.types)} /> : null}
    >
      <div className="grid gap-2">
        {types.map((type, index) => {
          const open = openIndex === index
          return (
            <div key={type.id ?? `new-${index}`} className="rounded-md border border-border">
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenIndex(open ? null : index)} aria-expanded={open}>
                  <span className="block truncate text-sm font-medium">{type.name || 'Untitled type'}</span>
                  <span className="block text-xs text-muted">
                    {type.fields.length} question(s) · {type.documents.length} document(s)
                    {type.defaultProfileId ? ` · ${setup.profiles.find((profile) => profile.id === type.defaultProfileId)?.name ?? ''}` : ''}
                  </span>
                </button>
                {editable ? (
                  <>
                    <button type="button" className={iconButton} aria-label="Move up" disabled={index === 0} onClick={() => setTypes(move(types, index, -1))}>
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" className={iconButton} aria-label="Move down" disabled={index === types.length - 1} onClick={() => setTypes(move(types, index, 1))}>
                      <ArrowDown className="size-4" />
                    </button>
                    <button type="button" className={cn(iconButton, 'hover:text-danger')} aria-label="Remove type" onClick={() => setTypes(types.filter((_, at) => at !== index))}>
                      <Trash2 className="size-4" />
                    </button>
                  </>
                ) : null}
              </div>
              {open ? (
                <div className="grid gap-4 border-t border-border p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Name</span>
                      <input className={input} value={type.name} disabled={!editable} onChange={(event) => update(index, { name: event.target.value })} />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Access profile when approved</span>
                      <select className={input} value={type.defaultProfileId ?? ''} disabled={!editable} onChange={(event) => update(index, { defaultProfileId: event.target.value || null })}>
                        <option value="">None</option>
                        {setup.profiles.map((profile) => (
                          <option key={profile.id} value={profile.id ?? ''}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <FieldsEditor fields={type.fields} editable={editable} onChange={(fields) => update(index, { fields })} />
                  <DocumentsEditor documents={type.documents} editable={editable} onChange={(documents) => update(index, { documents })} />
                </div>
              ) : null}
            </div>
          )
        })}
        {editable ? (
          <div>
            <Button
              variant="ghost"
              className="h-9"
              onClick={() => {
                setTypes([...types, { id: null, name: 'New type', fields: [], documents: [{ key: 'id', label: 'Passport or national ID', required: true, needsExpiry: true }], defaultProfileId: null }])
                setOpenIndex(types.length)
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add applicant type
            </Button>
          </div>
        ) : null}
      </div>
    </Section>
  )
}

function SubList({ title, children, onAdd, editable, addLabel }: { title: string; children: ReactNode; onAdd: () => void; editable: boolean; addLabel: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
        {editable ? (
          <button type="button" className="inline-flex items-center gap-1 text-sm text-accent hover:underline" onClick={onAdd}>
            <Plus className="size-3.5" aria-hidden="true" />
            {addLabel}
          </button>
        ) : null}
      </div>
      <div className="mt-2 grid gap-2">{children}</div>
    </div>
  )
}

function FieldsEditor({ fields, editable, onChange }: { fields: AccField[]; editable: boolean; onChange: (fields: AccField[]) => void }) {
  const update = (index: number, patch: Partial<AccField>) => onChange(fields.map((field, at) => (at === index ? { ...field, ...patch } : field)))
  return (
    <SubList
      title="Extra questions"
      addLabel="Add question"
      editable={editable}
      onAdd={() => onChange([...fields, { key: slugKey('', 'field'), label: '', type: 'text', required: false, options: null }])}
    >
      {fields.length === 0 ? <p className="text-sm text-muted">Only the standard details are asked.</p> : null}
      {fields.map((field, index) => (
        <div key={field.key} className="grid gap-2 rounded-md bg-hover/50 p-2">
          <div className="grid grid-cols-[1fr_9rem_auto_auto] items-center gap-2">
            <input aria-label="Question" placeholder="Question" className={input} value={field.label} disabled={!editable} onChange={(event) => update(index, { label: event.target.value })} />
            <select aria-label="Answer type" className={input} value={field.type} disabled={!editable} onChange={(event) => update(index, { type: event.target.value as AccFieldType, options: event.target.value === 'select' ? field.options ?? [] : null })}>
              {fieldTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" className="size-4" checked={field.required} disabled={!editable} onChange={(event) => update(index, { required: event.target.checked })} />
              Required
            </label>
            {editable ? (
              <button type="button" className={cn(iconButton, 'hover:text-danger')} aria-label="Remove question" onClick={() => onChange(fields.filter((_, at) => at !== index))}>
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </div>
          {field.type === 'select' ? (
            <input
              aria-label="Choices"
              placeholder="Choices, separated by commas"
              className={input}
              disabled={!editable}
              value={(field.options ?? []).join(', ')}
              onChange={(event) => update(index, { options: event.target.value.split(',').map((option) => option.trimStart()) })}
            />
          ) : null}
        </div>
      ))}
    </SubList>
  )
}

function DocumentsEditor({ documents, editable, onChange }: { documents: AccDocumentRule[]; editable: boolean; onChange: (documents: AccDocumentRule[]) => void }) {
  const update = (index: number, patch: Partial<AccDocumentRule>) => onChange(documents.map((document, at) => (at === index ? { ...document, ...patch } : document)))
  return (
    <SubList
      title="Documents"
      addLabel="Add document"
      editable={editable}
      onAdd={() => onChange([...documents, { key: slugKey('', 'document'), label: '', required: true, needsExpiry: false }])}
    >
      {documents.length === 0 ? <p className="text-sm text-muted">No uploads asked.</p> : null}
      {documents.map((document, index) => (
        <div key={document.key} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-md bg-hover/50 p-2">
          <input aria-label="Document" placeholder="e.g. Press card" className={input} value={document.label} disabled={!editable} onChange={(event) => update(index, { label: event.target.value })} />
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" className="size-4" checked={document.required} disabled={!editable} onChange={(event) => update(index, { required: event.target.checked })} />
            Required
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" className="size-4" checked={document.needsExpiry} disabled={!editable} onChange={(event) => update(index, { needsExpiry: event.target.checked })} />
            Expiry date
          </label>
          {editable ? (
            <button type="button" className={cn(iconButton, 'hover:text-danger')} aria-label="Remove document" onClick={() => onChange(documents.filter((_, at) => at !== index))}>
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
      ))}
    </SubList>
  )
}

/* ---------------- Stages ---------------- */

const kindLabels: Record<AccStageKind, string> = { open: 'In review', approved: 'Approved', rejected: 'Rejected' }

function StagesSection({ eventId, setup, editable }: { eventId: string; setup: AccSetup; editable: boolean }) {
  const [stages, setStages, dirty] = useDraft<AccStage[]>(setup.stages)
  const save = useSave(eventId, (value: AccStage[]) => accApi.saveStages(eventId, value), 'Stages saved.')
  const update = (index: number, patch: Partial<AccStage>) => setStages(stages.map((stage, at) => (at === index ? { ...stage, ...patch } : stage)))
  return (
    <Section
      title="Pipeline stages"
      description="New applications land in the first stage. Moving someone to an Approved stage gives them a badge number."
      actions={editable ? <SaveBar dirty={dirty} pending={save.isPending} onSave={() => save.mutate(stages)} onReset={() => setStages(setup.stages)} /> : null}
    >
      <ol className="grid gap-2">
        {stages.map((stage, index) => (
          <li key={stage.key} className="grid grid-cols-[1.5rem_1fr_9rem_9rem_auto] items-center gap-2">
            <span className="text-center text-xs tabular-nums text-muted">{index + 1}</span>
            <input aria-label="Stage name" className={input} value={stage.name} disabled={!editable} onChange={(event) => update(index, { name: event.target.value })} />
            <select aria-label="Stage kind" className={input} value={stage.kind} disabled={!editable} onChange={(event) => update(index, { kind: event.target.value as AccStageKind })}>
              {(Object.keys(kindLabels) as AccStageKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {kindLabels[kind]}
                </option>
              ))}
            </select>
            <AlphaColorInput label="Stage colour" value={stage.color} disabled={!editable} onChange={(color) => update(index, { color })} />
            {editable ? (
              <span className="flex">
                <button type="button" className={iconButton} aria-label="Move up" disabled={index === 0} onClick={() => setStages(move(stages, index, -1))}>
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" className={iconButton} aria-label="Move down" disabled={index === stages.length - 1} onClick={() => setStages(move(stages, index, 1))}>
                  <ArrowDown className="size-4" />
                </button>
                <button type="button" className={cn(iconButton, 'hover:text-danger')} aria-label="Remove stage" disabled={stages.length <= 3} onClick={() => setStages(stages.filter((_, at) => at !== index))}>
                  <Trash2 className="size-4" />
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {editable ? (
        <Button
          variant="ghost"
          className="mt-2 h-9"
          onClick={() => setStages([...stages.slice(0, 1), { key: slugKey('', 'stage'), name: 'New stage', kind: 'open', color: '#7A8EA8' }, ...stages.slice(1)])}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add stage
        </Button>
      ) : null}
    </Section>
  )
}

/* ---------------- Emails ---------------- */

const triggers: { key: keyof AccNotifications; title: string; when: string }[] = [
  { key: 'submitted', title: 'Application received', when: 'Sent when someone is submitted (portal, bulk, public or staff).' },
  { key: 'approved', title: 'Approved', when: 'Sent when moved to an Approved stage.' },
  { key: 'rejected', title: 'Rejected', when: 'Sent when moved to a Rejected stage, with the reason.' },
]

function NotificationsSection({ eventId, setup, editable }: { eventId: string; setup: AccSetup; editable: boolean }) {
  const [value, setValue, dirty] = useDraft<AccNotifications>(setup.notifications)
  const save = useSave(eventId, (next: AccNotifications) => accApi.saveNotifications(eventId, next), 'Emails saved.')
  const update = (key: keyof AccNotifications, patch: Partial<AccMailTemplate>) => setValue({ ...value, [key]: { ...value[key], ...patch } })
  return (
    <Section
      title="Emails"
      description="Uses the mail settings of the system. Placeholders: {{firstName}} {{lastName}} {{event}} {{organization}} {{badgeNumber}} {{reason}}. SMS comes later."
      actions={editable ? <SaveBar dirty={dirty} pending={save.isPending} onSave={() => save.mutate(value)} onReset={() => setValue(setup.notifications)} /> : null}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {triggers.map((trigger) => {
          const template = value[trigger.key]
          return (
            <div key={trigger.key} className="grid content-start gap-2 rounded-md border border-border p-3">
              <label className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{trigger.title}</span>
                <input type="checkbox" className="size-4" checked={template.enabled} disabled={!editable} onChange={(event) => update(trigger.key, { enabled: event.target.checked })} aria-label={`Send ${trigger.title} email`} />
              </label>
              <p className="text-xs text-muted">{trigger.when}</p>
              <input aria-label="Subject" className={input} value={template.subject} disabled={!editable || !template.enabled} onChange={(event) => update(trigger.key, { subject: event.target.value })} />
              <textarea
                aria-label="Message"
                className={cn(input, 'h-40 py-2')}
                value={template.body}
                disabled={!editable || !template.enabled}
                onChange={(event) => update(trigger.key, { body: event.target.value })}
              />
            </div>
          )
        })}
      </div>
    </Section>
  )
}
