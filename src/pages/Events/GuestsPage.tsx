import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError, apiBaseUrl } from '@/api/client'
import { guestApi, type Guest, type GuestWrite, type ImportResult } from '@/api/guestApi'
import { guestTypeApi } from '@/api/guestTypeApi'
import { downloadBadgePng, renderGuestBadge } from '@/badges/renderBadge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { SelectField } from '@/components/ui/SelectField'
import { TextField } from '@/components/ui/TextField'
import { readSheet } from '@/guests/spreadsheet'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { usePageBreadcrumbs } from '@/stores/breadcrumbStore'

type Draft = {
  name: string
  email: string
  position: string
  guestTypeId: string
}

const emptyDraft: Draft = { name: '', email: '', position: '', guestTypeId: '' }

export function GuestsPage() {
  const { eventId = '' } = useParams()
  const eventQuery = useEvent(eventId)
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editing, setEditing] = useState<Guest | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [assignTypeId, setAssignTypeId] = useState('')
  const [pendingTypeChange, setPendingTypeChange] = useState<GuestWrite | null>(null)
  const [pendingBulk, setPendingBulk] = useState(false)
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([])
  const [sheetRows, setSheetRows] = useState<string[][]>([])
  const [columns, setColumns] = useState({ name: '', email: '', position: '', guestType: '' })
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [createUnmatched, setCreateUnmatched] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  useDocumentTitle(eventQuery.data ? `${eventQuery.data.name} guests` : 'Guests')
  usePageBreadcrumbs([
    { label: 'Dashboard', to: '/' },
    { label: 'Events', to: '/events' },
    { label: eventQuery.data?.name ?? 'Event', to: `/events/${eventId}` },
    { label: 'Guests' },
  ])

  const typesQuery = useQuery({
    queryKey: ['guest-types', eventId],
    queryFn: () => guestTypeApi.list(eventId),
    enabled: Boolean(eventId),
  })
  const guestsQuery = useQuery({
    queryKey: ['guests', eventId, filter],
    queryFn: () =>
      guestApi.list(
        eventId,
        filter === 'unassigned' ? { unassigned: true } : filter ? { guestTypeId: filter } : undefined,
      ),
    enabled: Boolean(eventId),
  })

  const types = typesQuery.data ?? []
  const enabledTypes = types.filter((type) => type.isEnabled)
  const guests = guestsQuery.data ?? []
  const typeOptions = [
    { value: '', label: 'No guest type' },
    ...types.map((type) => ({
      value: type.id,
      label: type.isEnabled ? type.name : `${type.name} (Disabled)`,
    })),
  ]

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['guests', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['guest-types', eventId] })
  }

  function writeFromDraft(source: Draft, acknowledgeTypeChange: boolean): GuestWrite {
    return {
      name: source.name.trim(),
      email: source.email.trim() || null,
      position: source.position.trim() || null,
      guestTypeId: source.guestTypeId || null,
      acknowledgeTypeChange,
    }
  }

  const saveMutation = useMutation({
    mutationFn: (body: GuestWrite) =>
      editing ? guestApi.update(eventId, editing.id, body) : guestApi.create(eventId, body),
    onSuccess: async () => {
      toast.success(editing ? 'Guest saved.' : 'Guest added.')
      setDraft(emptyDraft)
      setEditing(null)
      setPendingTypeChange(null)
      await refresh()
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setPendingTypeChange(writeFromDraft(draft, true))
        return
      }
      toast.error(messageFrom(error, 'The guest could not be saved.'))
    },
  })

  const reassignMutation = useMutation({
    mutationFn: (acknowledgeTypeChange: boolean) => guestApi.reassign(eventId, selected, assignTypeId, acknowledgeTypeChange),
    onSuccess: async (result) => {
      toast.success(result.message)
      setPendingBulk(false)
      setSelected([])
      await refresh()
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setPendingBulk(true)
        return
      }
      toast.error(messageFrom(error, 'The guests could not be reassigned.'))
    },
  })

  const importMutation = useMutation({
    mutationFn: (commit: boolean) => guestApi.import(eventId, importRows(), importMappings(), commit),
    onSuccess: async (result, commit) => {
      setImportResult(result)
      if (commit && result.complete) {
        toast.success(result.message)
        setSheetRows([])
        setSheetHeaders([])
        setImportResult(null)
        await refresh()
      }
    },
    onError: (error) => toast.error(messageFrom(error, 'The import could not be checked.')),
  })

  const sendMutation = useMutation({
    mutationFn: (ids: string[]) => guestApi.issueInvitations(eventId, ids),
    onSuccess: async (result) => {
      if (result.complete) toast.success(result.message)
      else toast.error(result.message)
      if (result.blocked.length) setNotice(result.blocked.map((item) => `${item.name}: ${item.reason}`).join('\n'))
      await refresh()
    },
    onError: (error) => toast.error(messageFrom(error, 'The invitation could not be recorded.')),
  })

  function importRows() {
    const typeColumn = columns.guestType
    return sheetRows.map((row, index) => ({
      row: index + 2,
      name: cell(row, columns.name),
      email: cell(row, columns.email),
      position: cell(row, columns.position),
      guestType: typeColumn ? (cell(row, typeColumn) ?? '') : null,
    }))
  }

  function importMappings() {
    return Object.entries(createUnmatched).map(([value, choice]) => ({
      value,
      guestTypeId: choice.startsWith('type:') ? choice.slice(5) : null,
      create: choice === 'create',
    }))
  }

  const selectedGuests = guests.filter((guest) => selected.includes(guest.id))
  const columnOptions = useMemo(
    () => [{ value: '', label: 'Not mapped' }, ...sheetHeaders.map((header, index) => ({ value: String(index), label: header }))],
    [sheetHeaders],
  )

  async function onFile(file: File) {
    try {
      const sheet = await readSheet(file)
      setSheetHeaders(sheet.headers)
      setSheetRows(sheet.rows)
      setImportResult(null)
      setCreateUnmatched({})
      const guess = (labels: string[]) => {
        const index = sheet.headers.findIndex((header) => labels.includes(header.trim().toLowerCase()))
        return index >= 0 ? String(index) : ''
      }
      setColumns({
        name: guess(['name', 'guest', 'guest name']),
        email: guess(['email', 'e-mail']),
        position: guess(['position', 'title']),
        guestType: guess(['guest type', 'type', 'category']),
      })
    } catch {
      toast.error('That spreadsheet could not be read. Use CSV or Excel.')
    }
  }

  async function generate(ids: string[], regenerate: boolean) {
    try {
      const prepared = await guestApi.prepareBadges(eventId, ids)
      if (prepared.ready.length === 0) {
        toast.error(prepared.blocked[0]?.reason ?? prepared.message)
        setNotice(prepared.blocked.map((item) => `${item.name}: ${item.reason}`).join('\n'))
        return
      }
      if (prepared.blocked.length) {
        setNotice(prepared.blocked.map((item) => `${item.name}: ${item.reason}`).join('\n'))
      }
      if (ids.length === 1) {
        const item = prepared.ready[0]
        if (regenerate) {
          const confirmed = window.confirm(
            `Regenerate the badge using the ${item.guestTypeName} design? The check-in code stays ${item.qrPayload}.`,
          )
          if (!confirmed) return
        }
        const canvas = await renderGuestBadge(item.design, { name: item.name, qrPayload: item.qrPayload }, apiBaseUrl)
        if (canvas.width !== item.design.width || canvas.height !== item.design.height) {
          throw new Error('The badge could not be rendered at its design size.')
        }
        const safeName = item.name.replace(/[^\w.-]+/g, '-').toLowerCase()
        await downloadBadgePng(canvas, `badge-${safeName}.png`)
        const recorded = await guestApi.commitBadges(eventId, [item.guestId])
        if (!recorded.complete) toast.error(recorded.message)
        else toast.success(`Badge generated for ${item.name} with their own check-in code.`)
      } else {
        const proceed = window.confirm(
          `${prepared.message} Generate badges for the ready guests only? This does not download every file. Download a guest row afterwards. Blocked guests are skipped only after they are listed.`,
        )
        if (!proceed) return
        const recorded = await guestApi.commitBadges(eventId, prepared.ready.map((item) => item.guestId))
        if (recorded.complete) toast.success(recorded.message)
        else toast.error(recorded.message)
      }
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The badge could not be generated.')
    }
  }

  function requestSave() {
    const body = writeFromDraft(draft, false)
    if (!body.name) return
    const typeChanged = editing && (editing.guestTypeId ?? '') !== (body.guestTypeId ?? '')
    const hasHistory = editing && (editing.invitationCount > 0 || editing.badgeCount > 0)
    if (typeChanged && hasHistory) {
      setPendingTypeChange({ ...body, acknowledgeTypeChange: true })
      return
    }
    saveMutation.mutate(body)
  }

  return (
    <div>
      <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">Guests</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Assign each guest to a type on this event. Sending an invitation or generating a badge uses that type&apos;s design. Changing the type does not resend or rotate the check-in code.
      </p>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Outbound email is not connected, so Send records the invitation for that guest. The public RSVP link and check-in code stay the same.
      </p>

      <form
        className="mt-6 grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault()
          requestSave()
        }}
      >
        <TextField label={editing ? `Edit ${editing.name}` : 'Guest name'} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <TextField label="Email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
        <TextField label="Position" value={draft.position} onChange={(event) => setDraft({ ...draft, position: event.target.value })} />
        <SelectField
          label="Guest type"
          value={draft.guestTypeId}
          options={editing ? typeOptions : [{ value: '', label: 'No guest type' }, ...enabledTypes.map((type) => ({ value: type.id, label: type.name }))]}
          onChange={(event) => setDraft({ ...draft, guestTypeId: event.target.value })}
        />
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={!draft.name.trim() || saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : editing ? 'Save guest' : 'Add guest'}
          </Button>
          {editing ? (
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(null)
                setDraft(emptyDraft)
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </form>

      <section className="mt-6 rounded-md border border-border p-4">
        <h2 className="text-sm font-medium">Import CSV or Excel</h2>
        <p className="mt-1 text-sm text-muted">The first row should be column names. Map Guest Type if the file has one. Blank type cells are rejected. A missing type column leaves guests unassigned.</p>
        <input
          className="mt-3 block text-sm"
          type="file"
          accept=".csv,.txt,.xlsx,.xls,text/csv"
          aria-label="Guest spreadsheet"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void onFile(file)
          }}
        />
        {sheetHeaders.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <SelectField label="Name column" value={columns.name} options={columnOptions} onChange={(event) => setColumns({ ...columns, name: event.target.value })} />
            <SelectField label="Email column" value={columns.email} options={columnOptions} onChange={(event) => setColumns({ ...columns, email: event.target.value })} />
            <SelectField label="Position column" value={columns.position} options={columnOptions} onChange={(event) => setColumns({ ...columns, position: event.target.value })} />
            <SelectField label="Guest type column" value={columns.guestType} options={columnOptions} onChange={(event) => setColumns({ ...columns, guestType: event.target.value })} />
            <div className="flex gap-2 sm:col-span-2">
              <Button variant="secondary" disabled={!columns.name || importMutation.isPending} onClick={() => importMutation.mutate(false)}>
                Check import
              </Button>
              <Button disabled={!columns.name || !importResult?.complete || importMutation.isPending} onClick={() => importMutation.mutate(true)}>
                Import {importResult?.readyCount ?? 0} guests
              </Button>
            </div>
          </div>
        ) : null}
        {importResult && !importResult.complete ? (
          <div className="mt-3 text-sm">
            <p>{importResult.message}</p>
            <ul className="mt-2 list-disc pl-5">
              {importResult.errors.slice(0, 12).map((error) => (
                <li key={`${error.row}-${error.message}`}>{error.message}</li>
              ))}
            </ul>
            {importResult.unmatchedTypes.length > 0 ? (
              <div className="mt-3 grid gap-3">
                <p>Match unmatched values to a type on this event, or create a new type.</p>
                {importResult.unmatchedTypes.map((value) => (
                  <SelectField
                    key={value}
                    label={value}
                    value={createUnmatched[value] ?? ''}
                    options={[
                      { value: '', label: 'Choose' },
                      { value: 'create', label: `Create “${value}”` },
                      ...enabledTypes.map((type) => ({ value: `type:${type.id}`, label: type.name })),
                    ]}
                    onChange={(event) => setCreateUnmatched({ ...createUnmatched, [value]: event.target.value })}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <SelectField
            label="Filter by guest type"
            value={filter}
            options={[{ value: '', label: 'All guests' }, { value: 'unassigned', label: 'No guest type' }, ...types.map((type) => ({ value: type.id, label: type.name }))]}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        {selected.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-48">
              <SelectField
                label="Assign selected"
                value={assignTypeId}
                options={[{ value: '', label: 'Choose a type' }, ...enabledTypes.map((type) => ({ value: type.id, label: type.name }))]}
                onChange={(event) => setAssignTypeId(event.target.value)}
              />
            </div>
            <Button variant="secondary" disabled={!assignTypeId || reassignMutation.isPending} onClick={() => reassignMutation.mutate(false)}>
              Assign
            </Button>
            <Button variant="secondary" disabled={sendMutation.isPending} onClick={() => sendMutation.mutate(selected)}>
              Send invitations
            </Button>
            <Button variant="secondary" onClick={() => void generate(selected, false)}>
              Generate badges
            </Button>
          </div>
        ) : null}
      </div>

      {notice ? (
        <pre className="mt-4 whitespace-pre-wrap rounded-md border border-border p-3 text-sm">{notice}</pre>
      ) : null}

      <div className="mt-4">
        {guestsQuery.isLoading ? (
          <p className="text-sm text-muted">Loading guests</p>
        ) : guestsQuery.isError ? (
          <EmptyState title="Guests could not be loaded" description="Try again in a moment." />
        ) : guests.length === 0 ? (
          <EmptyState title="No guests" description="Add a guest or import a spreadsheet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="py-2 pr-3 font-medium">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="py-2 pr-3 font-medium">Guest</th>
                  <th className="py-2 pr-3 font-medium">Guest type</th>
                  <th className="py-2 pr-3 font-medium">Invitation</th>
                  <th className="py-2 pr-3 font-medium">Badge</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((guest) => (
                  <tr key={guest.id} className="border-b border-border align-top">
                    <td className="py-3 pr-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${guest.name}`}
                        checked={selected.includes(guest.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked ? [...current, guest.id] : current.filter((id) => id !== guest.id),
                          )
                        }
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <div className="font-medium">{guest.name}</div>
                      <div className="text-muted">{guest.position || guest.email || 'No position'}</div>
                    </td>
                    <td className="py-3 pr-3">{guest.guestTypeName ?? 'No guest type'}</td>
                    <td className="py-3 pr-3">
                      {guest.invitationCount > 0
                        ? `Sent · ${guest.lastInvitationTypeName ?? 'Recorded'}`
                        : 'Not sent'}
                    </td>
                    <td className="py-3 pr-3">{guest.badgeCount > 0 ? `Generated · ${guest.lastBadgeTypeName ?? 'Recorded'}` : 'Not generated'}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditing(guest)
                            setDraft({
                              name: guest.name,
                              email: guest.email ?? '',
                              position: guest.position ?? '',
                              guestTypeId: guest.guestTypeId ?? '',
                            })
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            const again = guest.invitationCount > 0
                            const ok = !again || window.confirm(`Resend using ${guest.guestTypeName ?? 'the current type'}? This records a new invitation and does not change the RSVP link or check-in code.`)
                            if (ok) sendMutation.mutate([guest.id])
                          }}
                        >
                          {guest.invitationCount > 0 ? 'Resend invitation' : 'Send invitation'}
                        </Button>
                        <Button variant="secondary" onClick={() => void generate([guest.id], guest.badgeCount > 0)}>
                          {guest.badgeCount > 0 ? 'Regenerate badge' : 'Generate badge'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingTypeChange !== null}
        title="Change guest type?"
        description="This updates the guest's current type only. It does not resend the invitation or regenerate the badge. The existing invitation, RSVP, and check-in code stay as they are. Send or generate again when you want the new design."
        confirmLabel="Change type"
        pendingLabel="Saving…"
        pending={saveMutation.isPending}
        onConfirm={() => {
          if (pendingTypeChange) saveMutation.mutate(pendingTypeChange)
        }}
        onClose={() => setPendingTypeChange(null)}
      />
      <ConfirmDialog
        open={pendingBulk}
        title="Change guest types?"
        description={`This assigns ${selectedGuests.length} guests to a new type. It does not resend invitations or regenerate badges, and it does not change check-in codes.`}
        confirmLabel="Assign type"
        pendingLabel="Assigning…"
        pending={reassignMutation.isPending}
        onConfirm={() => reassignMutation.mutate(true)}
        onClose={() => setPendingBulk(false)}
      />
    </div>
  )
}

function cell(row: string[], index: string) {
  if (!index) return null
  return row[Number(index)] ?? ''
}

function messageFrom(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback
  const field = error.errors ? Object.values(error.errors)[0]?.[0] : undefined
  return field || error.message || fallback
}
