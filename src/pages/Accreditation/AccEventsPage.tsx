import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Loader2, Plus, ShieldCheck, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { accApi, type AccEventStatus, type AccEventSummary, type AccEventWrite } from '@/api/accreditationApi'
import { errorMessage, fieldErrors, formatDate, useAccRole } from '@/components/accreditation/shared'
import { Button, buttonClassName } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge, type BadgeTone } from '@/components/ui/StatusBadge'
import { TextField } from '@/components/ui/TextField'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePageBreadcrumbs } from '@/stores/breadcrumbStore'

export const accStatusTone: Record<AccEventStatus, BadgeTone> = {
  Draft: 'amber',
  Open: 'teal',
  Closed: 'gray',
  Archived: 'gray',
}

export const accStatusHelp: Record<AccEventStatus, string> = {
  Draft: 'Set-up only. Portals and the public link are closed.',
  Open: 'Taking applications from portals and the public link.',
  Closed: 'No new applications; vetting continues.',
  Archived: 'Read-only record. Portal sign-in is closed.',
}

function toSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)
}

export function AccEventsPage() {
  useDocumentTitle('Accreditation')
  usePageBreadcrumbs([{ label: 'Accreditation' }])
  const { canManage } = useAccRole()
  const query = useQuery({ queryKey: ['acc', 'events'], queryFn: accApi.list })
  const [creating, setCreating] = useState(false)
  const [cloning, setCloning] = useState<AccEventSummary | null>(null)
  const events = query.data ?? []

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[1.75rem] font-semibold tracking-[-0.02em]">
            <ShieldCheck className="size-6 text-accent" aria-hidden="true" />
            Accreditation
          </h1>
          <p className="mt-2 text-sm text-muted">Vetting and access for workforce, media, vendors and talent. Separate from invitations.</p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Link to="/accreditation/team" className={buttonClassName('secondary')}>
              <Users className="size-4" aria-hidden="true" />
              Team
            </Link>
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Accreditation-only event
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-8">
        {query.isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : query.isError ? (
          <div role="alert" className="py-10">
            <p className="text-sm">{errorMessage(query.error, 'Accreditation events could not be loaded.')}</p>
            <Button variant="secondary" className="mt-4" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            title="No accreditation events yet"
            description="Create one to set up zones, applicant types and organisations."
            action={canManage ? <Button onClick={() => setCreating(true)}>New accreditation event</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-border bg-hover/50 text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Dates</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Applicants</th>
                  <th className="px-4 py-3 text-right font-medium">Pending</th>
                  <th className="px-4 py-3 text-right font-medium">Approved</th>
                  <th className="px-4 py-3 text-right font-medium">Organisations</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-hover/40">
                    <td className="px-4 py-3">
                      <Link to={`/accreditation/${event.id}`} className="font-medium hover:text-accent">
                        {event.name}
                      </Link>
                      <p className="text-xs text-muted">
                        {[event.eventId ? 'Part of an event' : 'Accreditation only', event.venue].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {formatDate(event.startDate)} – {formatDate(event.endDate)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={accStatusTone[event.status]}>{event.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{event.applicants}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-warning">{event.pending}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-accent">{event.approved}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{event.organizations}</td>
                    <td className="px-4 py-3 text-right">
                      {canManage ? (
                        <button
                          type="button"
                          title="Clone set-up into a new event"
                          aria-label={`Clone ${event.name}`}
                          className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground"
                          onClick={() => setCloning(event)}
                        >
                          <Copy className="size-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AccEventDialog open={creating} onClose={() => setCreating(false)} />
      <CloneDialog source={cloning} onClose={() => setCloning(null)} />
    </div>
  )
}

const emptyEvent: AccEventWrite = {
  name: '',
  slug: '',
  venue: null,
  startDate: null,
  endDate: null,
  timezone: 'Asia/Dubai',
  status: 'Draft',
  publicApplyEnabled: false,
}

/** Create a new accreditation event (also used to edit one, with `initial`). */
export function AccEventDialog({ open, onClose, initial, eventId }: { open: boolean; onClose: () => void; initial?: AccEventWrite; eventId?: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState<AccEventWrite>(initial ?? emptyEvent)
  const [slugTouched, setSlugTouched] = useState(Boolean(initial))
  const [lastOpen, setLastOpen] = useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setForm(initial ?? emptyEvent)
      setSlugTouched(Boolean(initial))
    }
  }

  const mutation = useMutation({
    mutationFn: () => (eventId ? accApi.update(eventId, form) : accApi.create(form)),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['acc'] })
      toast.success(eventId ? 'Event saved.' : 'Accreditation event created.')
      onClose()
      if (!eventId) navigate(`/accreditation/${saved.id}/setup`)
    },
  })
  const errors = fieldErrors(mutation.error)
  const set = (patch: Partial<AccEventWrite>) => setForm((current) => ({ ...current, ...patch }))

  return (
    <Modal open={open} onClose={onClose} title={eventId ? 'Edit accreditation event' : 'New accreditation event'}>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <TextField
          label="Event name"
          value={form.name}
          error={errors.name}
          onChange={(event) => set({ name: event.target.value, slug: slugTouched ? form.slug : toSlug(event.target.value) })}
          required
        />
        <TextField
          label="Link name"
          value={form.slug}
          error={errors.slug}
          hint={`Public application link: /apply/${form.slug || 'link-name'}`}
          onChange={(event) => {
            setSlugTouched(true)
            set({ slug: toSlug(event.target.value) })
          }}
        />
        <TextField label="Venue" value={form.venue ?? ''} onChange={(event) => set({ venue: event.target.value || null })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Start date" type="date" value={form.startDate ?? ''} error={errors.startDate} onChange={(event) => set({ startDate: event.target.value || null })} />
          <TextField label="End date" type="date" value={form.endDate ?? ''} error={errors.endDate} onChange={(event) => set({ endDate: event.target.value || null })} />
        </div>
        <TextField label="Time zone" value={form.timezone} error={errors.timezone} hint="IANA name, e.g. Asia/Dubai" onChange={(event) => set({ timezone: event.target.value })} />
        {eventId ? (
          <>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Status</span>
              <div className="inline-flex w-fit flex-wrap rounded-md border border-border p-0.5" role="group" aria-label="Status">
                {(['Draft', 'Open', 'Closed', 'Archived'] as AccEventStatus[]).map((status) => (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={form.status === status}
                    className={
                      form.status === status
                        ? 'h-8 rounded-[4px] bg-selected px-3 text-sm font-medium'
                        : 'h-8 rounded-[4px] px-3 text-sm text-muted hover:text-foreground'
                    }
                    onClick={() => set({ status })}
                  >
                    {status}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">{accStatusHelp[form.status]}</p>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--accent)]"
                checked={form.publicApplyEnabled}
                onChange={(event) => set({ publicApplyEnabled: event.target.checked })}
              />
              <span>
                <span className="font-medium">Public application link</span>
                <span className="block text-xs text-muted">Anyone with the link can apply individually while the event is Open.</span>
              </span>
            </label>
          </>
        ) : null}
        {mutation.error && !Object.keys(errors).length ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(mutation.error, 'The event could not be saved.')}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {eventId ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function CloneDialog({ source, onClose }: { source: AccEventSummary | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [lastSource, setLastSource] = useState<AccEventSummary | null>(null)
  if (source !== lastSource) {
    setLastSource(source)
    if (source) {
      setName(`${source.name} (copy)`)
      setSlug(toSlug(`${source.slug}-copy`))
      setStartDate(source.startDate)
      setEndDate(source.endDate)
    }
  }

  const mutation = useMutation({
    mutationFn: () => accApi.clone(source!.id, { name, slug, startDate: startDate || null, endDate: endDate || null }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['acc'] })
      toast.success('Event cloned with its set-up and organisations.')
      onClose()
      navigate(`/accreditation/${saved.id}/setup`)
    },
  })
  const errors = fieldErrors(mutation.error)

  return (
    <Modal
      open={Boolean(source)}
      onClose={onClose}
      title="Clone accreditation event"
      description="Copies zones, access profiles, applicant types, stages, emails and organisations. People are not copied."
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <TextField label="New event name" value={name} error={errors.name} onChange={(event) => setName(event.target.value)} />
        <TextField label="Link name" value={slug} error={errors.slug} onChange={(event) => setSlug(toSlug(event.target.value))} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Start date" type="date" value={startDate} error={errors.startDate} onChange={(event) => setStartDate(event.target.value)} />
          <TextField label="End date" type="date" value={endDate} error={errors.endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
        {mutation.error && !Object.keys(errors).length ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(mutation.error, 'The event could not be cloned.')}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Clone
          </Button>
        </div>
      </form>
    </Modal>
  )
}
