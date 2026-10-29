import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChartColumn,
  ChevronDown,
  ChevronUp,
  FileDown,
  FileText,
  ImageDown,
  Mail,
  BadgeCheck,
  Eye,
  MonitorCheck,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Settings,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ApiError, apiBaseUrl } from '@/api/client'
import { guestApi, type BulkEmailResult, type Guest, type GuestWrite, type ImportResult } from '@/api/guestApi'
import { guestGroupApi, type GuestGroup } from '@/api/guestGroupApi'
import { guestTypeApi } from '@/api/guestTypeApi'
import { invitationApi } from '@/api/invitationApi'
import { mailApi } from '@/api/mailApi'
import { downloadBadgePng, renderGuestBadge } from '@/badges/renderBadge'
import { BulkEmailDialog } from '@/components/guests/BulkEmailDialog'
import { DeleteGroupDialog } from '@/components/guests/DeleteGroupDialog'
import { GuestDetailsDialog } from '@/components/guests/GuestDetailsDialog'
import { CardButton, GroupCardHeader, SortHeader, type GroupDownload } from '@/components/guests/GroupCard'
import { MailSettingsDialog } from '@/components/guests/MailSettingsDialog'
import { ProgressDialog } from '@/components/guests/ProgressDialog'
import { Button, buttonClassName } from '@/components/ui/Button'
import { FrontDeskLinkDialog } from '@/components/guests/FrontDeskLinkDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/StatusBadge'
import { SelectField } from '@/components/ui/SelectField'
import { TextField } from '@/components/ui/TextField'
import {
  downloadGuestReport,
  ExportCancelled,
  exportBadges,
  exportGuestBadge,
  exportInvitations,
  fileBaseFor,
  guestFileBase,
  type ExportOutcome,
} from '@/guests/bulkExport'
import { nextSort, sortGuests, type GuestSort, type GuestSortColumn } from '@/guests/guestSort'
import { readSheet } from '@/guests/spreadsheet'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { cn } from '@/lib/cn'
import { usePageBreadcrumbs } from '@/stores/breadcrumbStore'

/** Section key for guests without a group. */
const NO_GROUP = '__no-group__'

type Draft = {
  name: string
  email: string
  position: string
  guestTypeId: string
  guestGroupId: string
}

const emptyDraft: Draft = { name: '', email: '', position: '', guestTypeId: '', guestGroupId: '' }

type Section = { key: string; groupId: string | null; name: string; createdOn: string | null; guests: Guest[] }

export function GuestsPage() {
  const { eventId = '' } = useParams()
  const eventQuery = useEvent(eventId)
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [guestFormOpen, setGuestFormOpen] = useState(false)
  const [editing, setEditing] = useState<Guest | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [assignTypeId, setAssignTypeId] = useState('')
  const [moveGroupId, setMoveGroupId] = useState('')
  const [pendingTypeChange, setPendingTypeChange] = useState<GuestWrite | null>(null)
  const [pendingBulk, setPendingBulk] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([])
  const [sheetRows, setSheetRows] = useState<string[][]>([])
  const [importFileName, setImportFileName] = useState('')
  const [frontDeskOpen, setFrontDeskOpen] = useState(false)
  const [columns, setColumns] = useState({ name: '', email: '', position: '', guestType: '', group: '' })
  const [importGroupId, setImportGroupId] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [createUnmatched, setCreateUnmatched] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [groupForm, setGroupForm] = useState<{ mode: 'create' } | { mode: 'rename'; group: GuestGroup } | null>(null)
  const [groupName, setGroupName] = useState('')
  const [deletingGroup, setDeletingGroup] = useState<GuestGroup | null>(null)
  const [deleteGroupError, setDeleteGroupError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Guest[] | null>(null)
  const [progress, setProgress] = useState<{ title: string; done: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [emailTargets, setEmailTargets] = useState<{ label: string; guests: Guest[]; reminder?: boolean } | null>(null)
  // Guest whose "More" panel is open. Kept as an id so the panel always shows the latest data.
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [emailResult, setEmailResult] = useState<BulkEmailResult | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [mailSettingsOpen, setMailSettingsOpen] = useState(false)
  // Groups the user has closed. Empty = every group open.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  /** Sort chosen per group card (key = section key). */
  const [sortBy, setSortBy] = useState<Record<string, GuestSort>>({})
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
  const groupsQuery = useQuery({
    queryKey: ['guest-groups', eventId],
    queryFn: () => guestGroupApi.list(eventId),
    enabled: Boolean(eventId),
  })
  const mailQuery = useQuery({ queryKey: ['mail-settings'], queryFn: mailApi.get })
  const guestsQuery = useQuery({
    queryKey: ['guests', eventId, filter],
    queryFn: () =>
      guestApi.list(eventId, {
        unassigned: filter === 'unassigned',
        guestTypeId: filter && filter !== 'unassigned' ? filter : undefined,
      }),
    enabled: Boolean(eventId),
  })

  const types = typesQuery.data ?? []
  const groups = groupsQuery.data ?? []
  const enabledTypes = types.filter((type) => type.isEnabled)
  const guests = guestsQuery.data ?? []
  const typeOptions = [
    { value: '', label: 'No guest category' },
    ...types.map((type) => ({
      value: type.id,
      label: type.isEnabled ? type.name : `${type.name} (Disabled)`,
    })),
  ]
  const groupOptions = [{ value: '', label: 'No group' }, ...groups.map((group) => ({ value: group.id, label: group.name }))]

  // One card per group (A–Z), every group shown even when empty; "No group" last, only if it has guests.
  // With a guest-type filter, groups without a matching guest are hidden.
  const sections = useMemo<Section[]>(() => {
    const byGroup = new Map<string, Guest[]>()
    for (const guest of guests) {
      const key = guest.guestGroupId ?? NO_GROUP
      byGroup.set(key, [...(byGroup.get(key) ?? []), guest])
    }
    const list: Section[] = [...groups]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((group) => ({ key: group.id, groupId: group.id, name: group.name, createdOn: group.createdOn, guests: byGroup.get(group.id) ?? [] }))
      .filter((section) => !filter || section.guests.length > 0)
    const ungrouped = byGroup.get(NO_GROUP) ?? []
    // Guests whose group was just deleted elsewhere also land here until the lists refresh.
    const orphans = guests.filter((guest) => guest.guestGroupId && !groups.some((group) => group.id === guest.guestGroupId))
    if (ungrouped.length + orphans.length > 0) {
      list.push({ key: NO_GROUP, groupId: null, name: 'No group', createdOn: null, guests: [...ungrouped, ...orphans] })
    }
    return list
  }, [groups, guests, filter])

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['guests', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['guest-types', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['guest-groups', eventId] })
    // Deleting guests can free seats.
    await queryClient.invalidateQueries({ queryKey: ['seating', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['guest-activity', eventId] })
  }

  function writeFromDraft(source: Draft, acknowledgeTypeChange: boolean): GuestWrite {
    return {
      name: source.name.trim(),
      email: source.email.trim() || null,
      position: source.position.trim() || null,
      guestTypeId: source.guestTypeId || null,
      acknowledgeTypeChange,
      guestGroupId: source.guestGroupId || null,
    }
  }

  function openAddGuest(groupId: string | null) {
    setEditing(null)
    setDraft({ ...emptyDraft, guestGroupId: groupId ?? '' })
    setGuestFormOpen(true)
  }

  function openEditGuest(guest: Guest) {
    setEditing(guest)
    setDraft({
      name: guest.name,
      email: guest.email ?? '',
      position: guest.position ?? '',
      guestTypeId: guest.guestTypeId ?? '',
      guestGroupId: guest.guestGroupId ?? '',
    })
    setGuestFormOpen(true)
  }

  function closeGuestForm() {
    setGuestFormOpen(false)
    setEditing(null)
    setDraft(emptyDraft)
  }

  const saveMutation = useMutation({
    mutationFn: (body: GuestWrite) =>
      editing ? guestApi.update(eventId, editing.id, body) : guestApi.create(eventId, body),
    onSuccess: async (_saved, body) => {
      toast.success(editing ? 'Guest saved.' : 'Guest added.')
      setPendingTypeChange(null)
      if (editing) {
        closeGuestForm()
      } else {
        // Keep the form open on the same group so several guests can be added in a row.
        setDraft({ ...emptyDraft, guestGroupId: body.guestGroupId ?? '', guestTypeId: body.guestTypeId ?? '' })
        window.setTimeout(() => document.getElementById('guest-name-input')?.focus(), 0)
      }
      if (body.guestGroupId) setCollapsed((current) => withoutKey(current, body.guestGroupId!))
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
      setAssignTypeId('')
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

  const saveGroupMutation = useMutation({
    mutationFn: (name: string) =>
      groupForm?.mode === 'rename' ? guestGroupApi.rename(eventId, groupForm.group.id, name) : guestGroupApi.create(eventId, name),
    onSuccess: async (group) => {
      toast.success(groupForm?.mode === 'rename' ? `Renamed to “${group.name}”.` : `Group “${group.name}” created.`)
      setGroupForm(null)
      setGroupName('')
      setCollapsed((current) => withoutKey(current, group.id))
      await refresh()
    },
    onError: (error) => toast.error(messageFrom(error, 'The group could not be saved.')),
  })

  const deleteGroupMutation = useMutation({
    mutationFn: ({ id, deleteGuests }: { id: string; deleteGuests: boolean }) => guestGroupApi.remove(eventId, id, deleteGuests),
    onSuccess: async (result) => {
      toast.success(result.message)
      setDeletingGroup(null)
      setDeleteGroupError(null)
      setSelected([])
      await refresh()
    },
    onError: (error) => setDeleteGroupError(messageFrom(error, 'The group could not be deleted.')),
  })

  const moveMutation = useMutation({
    mutationFn: (groupId: string | null) => guestGroupApi.move(eventId, selected, groupId),
    onSuccess: async (moved, groupId) => {
      const name = groups.find((group) => group.id === groupId)?.name
      toast.success(groupId ? `Moved ${moved} ${moved === 1 ? 'guest' : 'guests'} to ${name ?? 'the group'}.` : `Removed ${moved} from their group.`)
      setSelected([])
      setMoveGroupId('')
      await refresh()
    },
    onError: (error) => toast.error(messageFrom(error, 'The guests could not be moved.')),
  })

  const deleteGuestsMutation = useMutation({
    mutationFn: (ids: string[]) => (ids.length === 1 ? guestApi.remove(eventId, ids[0]) : guestApi.removeMany(eventId, ids)),
    onSuccess: async (result, ids) => {
      toast.success(result.seatsCleared > 0 ? `${result.message} ${result.seatsCleared} seat${result.seatsCleared === 1 ? '' : 's'} freed.` : result.message)
      setPendingDelete(null)
      setSelected((current) => current.filter((id) => !ids.includes(id)))
      await refresh()
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 404 && /requested resource was not found/i.test(error.message)) {
        toast.error('The server is out of date. Restart the backend (dotnet run) and try again.')
      } else {
        toast.error(messageFrom(error, 'The guests could not be deleted.'))
      }
      setPendingDelete(null)
      await refresh()
    },
  })

  const emailMutation = useMutation({
    mutationFn: ({ ids, reminder }: { ids: string[]; reminder: boolean }) => guestApi.email(eventId, ids, reminder),
    onSuccess: async (result) => {
      setEmailResult(result)
      setEmailError(null)
      if (result.complete) toast.success(result.message)
      await refresh()
    },
    onError: (error) => setEmailError(messageFrom(error, 'The invitations could not be emailed.')),
  })

  // Rows the server rejected because the email is already a guest here, or appears earlier in the file.
  const duplicateCount =
    importResult?.errors.filter((error) => /is already used by|is a duplicate of row/.test(error.message)).length ?? 0

  const importMutation = useMutation({
    mutationFn: (commit: boolean) => guestApi.import(eventId, importRows(), importMappings(), commit, importGroupId || null),
    onSuccess: async (result, commit) => {
      setImportResult(result)
      const duplicates = result.errors.filter((error) => /is already used by|is a duplicate of row/.test(error.message)).length
      if (duplicates > 0) {
        toast.error(`${duplicates} ${duplicates === 1 ? 'row has' : 'rows have'} a duplicate email. Nothing was imported.`)
      }
      if (commit && result.complete) {
        toast.success(result.message)
        setSheetRows([])
        setSheetHeaders([])
        setImportResult(null)
        setImportOpen(false)
        if (importGroupId) setCollapsed((current) => withoutKey(current, importGroupId))
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
      group: columns.group ? cell(row, columns.group)?.trim() || null : null,
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
      setImportFileName(file.name)
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
        guestType: guess(['guest type', 'guest category', 'type', 'category']),
        group: guess(['group', 'guest group', 'company', 'organisation', 'organization']),
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
            `Make the digital pass again using the ${item.guestTypeName} design? The check-in code stays ${item.qrPayload}.`,
          )
          if (!confirmed) return
        }
        const canvas = await renderGuestBadge(item.design, { name: item.name, qrPayload: item.qrPayload }, apiBaseUrl)
        if (canvas.width !== item.design.width || canvas.height !== item.design.height) {
          throw new Error('The digital pass could not be drawn at its design size.')
        }
        await downloadBadgePng(canvas, `${guestFileBase(eventQuery.data?.name ?? 'event', item.name)}.png`)
        const recorded = await guestApi.commitBadges(eventId, [item.guestId])
        if (!recorded.complete) toast.error(recorded.message)
        else toast.success(`Digital pass made for ${item.name} with their own check-in code.`)
      } else {
        const proceed = window.confirm(
          `${prepared.message} Make digital passes for the ready guests only? This records them; use Download for the files. Blocked guests are listed below.`,
        )
        if (!proceed) return
        const recorded = await guestApi.commitBadges(eventId, prepared.ready.map((item) => item.guestId))
        if (recorded.complete) toast.success(recorded.message)
        else toast.error(recorded.message)
      }
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The digital pass could not be made.')
    }
  }

  /** Bulk download for a set of guests: invitations as one PDF, badges as one PDF or a ZIP of images. */
  async function download(kind: GroupDownload, targets: Guest[], label: string): Promise<boolean> {
    const event = eventQuery.data
    if (!event || targets.length === 0) return false
    const controller = new AbortController()
    abortRef.current = controller
    const titles: Record<GroupDownload, string> = {
      invitations: `Preparing invitations for ${label}`,
      'badges-pdf': `Preparing digital passes (PDF) for ${label}`,
      'badges-png': `Preparing digital passes (images) for ${label}`,
    }
    setProgress({ title: titles[kind], done: 0, total: 0 })
    const onProgress = (done: number, total: number) => setProgress((current) => (current ? { ...current, done, total } : current))
    const base = fileBaseFor(event.name, label === 'all guests' ? null : label)
    try {
      let outcome: ExportOutcome
      if (kind === 'invitations') {
        outcome = await exportInvitations(eventId, event.name, event.slug, targets, base, onProgress, controller.signal)
      } else {
        outcome = await exportBadges(eventId, event.name, targets, kind === 'badges-png' ? 'png' : 'pdf', base, onProgress, controller.signal)
        await refresh()
      }
      const noun = kind === 'invitations' ? 'invitation' : 'digital pass'
      const nouns = kind === 'invitations' ? 'invitations' : 'digital passes'
      if (outcome.count === 1) toast.success(`Downloaded 1 ${noun}.`)
      else if (outcome.count > 1) toast.success(`Downloaded ${outcome.count} ${nouns} as separate files in one ZIP.`)
      else toast.error(`No ${nouns} could be produced for ${label}.`)
      setNotice(
        outcome.skipped.length
          ? `Skipped ${outcome.skipped.length}:\n${outcome.skipped.map((item) => `${item.name}: ${item.reason}`).join('\n')}`
          : null,
      )
      return outcome.count > 0
    } catch (error) {
      if (error instanceof ExportCancelled) toast.message('Download cancelled.')
      else toast.error(messageFrom(error, error instanceof Error ? error.message : 'The download failed.'))
      return false
    } finally {
      abortRef.current = null
      setProgress(null)
    }
  }

  /** CSV of guests with invitation, RSVP and badge status (opens in Excel). */
  async function rsvpReport(targets: Guest[], label: string) {
    const event = eventQuery.data
    if (!event || targets.length === 0) return
    try {
      const responses = await invitationApi.responses(eventId).catch(() => [])
      downloadGuestReport(targets, responses, `${fileBaseFor(event.name, label === 'all guests' ? null : label)}-rsvp-report.csv`)
      toast.success(`RSVP report for ${label} downloaded.`)
    } catch (error) {
      toast.error(messageFrom(error, 'The report could not be created.'))
    }
  }

  /** One guest's file from the "More" panel; the download is also written to the guest's history. */
  async function downloadForGuest(guest: Guest, kind: GroupDownload): Promise<string | null> {
    if (kind === 'invitations') {
      const ok = await download(kind, [guest], guest.name)
      if (!ok) return 'The invite-card could not be produced. See the message on the Guests page.'
    } else {
      // E-badges for one guest are drawn on the server: no background-image loading in the browser.
      try {
        await exportGuestBadge(eventId, eventQuery.data?.name ?? 'event', guest, kind === 'badges-png' ? 'png' : 'pdf')
        await refresh()
        toast.success('Downloaded 1 digital pass.')
      } catch (error) {
        return messageFrom(error, error instanceof Error ? error.message : 'The digital pass could not be downloaded.')
      }
    }
    const label = kind === 'invitations' ? 'Invite-card PDF' : kind === 'badges-pdf' ? 'Digital pass PDF' : 'Digital pass image'
    await guestApi.logDownload(eventId, guest.id, `${label} (${guest.guestTypeName ?? 'no category'})`).catch(() => undefined)
    return null
  }

  function recordInvitation(guest: Guest) {
    const again = guest.invitationCount > 0
    const ok =
      !again ||
      window.confirm(`Record the invitation again using ${guest.guestTypeName ?? 'the current category'}? This does not change the RSVP link or check-in code.`)
    if (ok) sendMutation.mutate([guest.id])
  }

  function openEmail(targets: Guest[], label: string, reminder = false) {
    if (targets.length === 0) {
      toast.message('Everyone here has already been invited.')
      return
    }
    setEmailTargets({ label, guests: targets, reminder })
    setEmailResult(null)
    setEmailError(null)
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

  function toggleSection(key: string) {
    setCollapsed((current) => (current.has(key) ? withoutKey(current, key) : new Set([...current, key])))
  }

  const busy = progress !== null
  const totalGuests = guests.length
  const groupCount = groups.length

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[2rem] font-semibold tracking-[-0.02em]">Guest management</h1>
          <p className="mt-1 text-base text-muted tabular-nums">
            {groupCount} {groupCount === 1 ? 'group' : 'groups'} · {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}
            {filter ? ' (filtered)' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="h-11 px-4" onClick={() => setFrontDeskOpen(true)}>
            <MonitorCheck className="size-4" aria-hidden="true" />
            Front desk screen
          </Button>
          <Button
            variant="secondary"
            className="h-11 border-accent bg-accent-soft px-4 text-accent hover:bg-accent-soft hover:brightness-110"
            onClick={() => {
              setImportGroupId('')
              setImportOpen(true)
            }}
          >
            <Upload className="size-4" aria-hidden="true" />
            Import
          </Button>
          <Button className="h-11 px-5 text-base" onClick={() => openAddGuest(null)}>
            <Plus className="size-5" aria-hidden="true" />
            Add guest
          </Button>
        </div>
      </div>

      {/* Event-wide actions */}
      <div className="mt-6 flex flex-wrap gap-2.5">
        <CardButton
          onClick={() => {
            setGroupName('')
            setGroupForm({ mode: 'create' })
          }}
        >
          <Users className="size-4" aria-hidden="true" />
          New group
        </CardButton>
        <CardButton disabled={busy || guests.length === 0} title="Every guest's invitation as one PDF" onClick={() => void download('invitations', guests, 'all guests')}>
          <FileDown className="size-4" aria-hidden="true" />
          Invitations PDF
        </CardButton>
        <CardButton disabled={busy || guests.length === 0} title="Every guest's digital pass as one PDF" onClick={() => void download('badges-pdf', guests, 'all guests')}>
          <FileDown className="size-4" aria-hidden="true" />
          Digital passes PDF
        </CardButton>
        <CardButton disabled={busy || guests.length === 0} title="Every guest's digital pass as an image, in one ZIP" onClick={() => void download('badges-png', guests, 'all guests')}>
          <ImageDown className="size-4" aria-hidden="true" />
          Digital passes ZIP
        </CardButton>
        <CardButton disabled={guests.length === 0} onClick={() => void rsvpReport(guests, 'all guests')}>
          <ChartColumn className="size-4" aria-hidden="true" />
          RSVP report for everyone
        </CardButton>
        <CardButton
          disabled={busy || guests.every((guest) => guest.invitationCount > 0)}
          onClick={() => openEmail(guests.filter((guest) => guest.invitationCount === 0), 'everyone not yet invited')}
        >
          <Mail className="size-4" aria-hidden="true" />
          Email everyone not yet invited
        </CardButton>
        <CardButton onClick={() => setMailSettingsOpen(true)}>
          <Settings className="size-4" aria-hidden="true" />
          Email settings
          {mailQuery.data && !mailQuery.data.configured ? <span className="rounded bg-danger-soft px-1.5 text-xs text-danger">Not set up</span> : null}
        </CardButton>
      </div>

      {/* Filter row */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <label className="flex items-center gap-4 text-base">
          <span className="text-muted">Guest category</span>
          <select
            aria-label="Filter by guest category"
            className="h-11 min-w-56 rounded-md border border-border bg-surface px-3 text-base"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="">All guest categories</option>
            <option value="unassigned">No guest category</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
        {sections.length > 0 ? (
          <div className="flex items-center gap-2 text-base">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-foreground/90 hover:bg-hover hover:text-foreground"
              onClick={() => setCollapsed(new Set())}
            >
              <ChevronUp className="size-4" aria-hidden="true" />
              Expand all
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-foreground/90 hover:bg-hover hover:text-foreground"
              onClick={() => setCollapsed(new Set(sections.map((section) => section.key)))}
            >
              <ChevronDown className="size-4" aria-hidden="true" />
              Collapse all
            </button>
          </div>
        ) : null}
      </div>

      {notice ? (
        <div className="mt-4 rounded-md border border-border p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <pre className="min-w-0 flex-1 whitespace-pre-wrap font-sans">{notice}</pre>
            <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setNotice(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {/* Group cards */}
      <div className="mt-6 grid gap-5">
        {guestsQuery.isLoading || groupsQuery.isLoading ? (
          <p className="text-sm text-muted">Loading guests</p>
        ) : guestsQuery.isError ? (
          <EmptyState title="Guests could not be loaded" description="Try again in a moment." />
        ) : sections.length === 0 ? (
          <EmptyState
            title={filter ? 'No guests in this category' : 'No guests yet'}
            description={filter ? 'Choose another guest category, or All guest categories.' : 'Create a group, then add guests or import a spreadsheet.'}
            action={
              filter ? undefined : (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setGroupName('')
                      setGroupForm({ mode: 'create' })
                    }}
                  >
                    New group
                  </Button>
                  <Button onClick={() => openAddGuest(null)}>Add guest</Button>
                </div>
              )
            }
          />
        ) : (
          sections.map((section) => {
            const open = !collapsed.has(section.key)
            const ids = section.guests.map((guest) => guest.id)
            const picked = ids.filter((id) => selected.includes(id)).length
            const group = section.groupId ? groups.find((item) => item.id === section.groupId) ?? null : null
            const sort = sortBy[section.key] ?? null
            const rows = sortGuests(section.guests, sort)
            const onSort = (column: GuestSortColumn) => setSortBy((current) => ({ ...current, [section.key]: nextSort(current[section.key] ?? null, column) }))
            return (
              <section key={section.key} className="overflow-hidden rounded-xl border border-border bg-surface">
                <GroupCardHeader
                  name={section.name}
                  open={open}
                  createdOn={section.createdOn}
                  total={section.guests.length}
                  notInvited={section.guests.filter((guest) => guest.invitationCount === 0).length}
                  busy={busy}
                  manageable={Boolean(group)}
                  onToggle={() => toggleSection(section.key)}
                  onDownload={(kind) => void download(kind, section.guests, section.name)}
                  onReport={() => void rsvpReport(section.guests, section.name)}
                  onSendUnsent={() => openEmail(section.guests.filter((guest) => guest.invitationCount === 0), `${section.name} (not yet invited)`)}
                  onAddGuest={() => openAddGuest(section.groupId)}
                  onRename={() => {
                    if (!group) return
                    setGroupName(group.name)
                    setGroupForm({ mode: 'rename', group })
                  }}
                  onDelete={() => {
                    if (!group) return
                    setDeleteGroupError(null)
                    setDeletingGroup(group)
                  }}
                />
                {open ? (
                  section.guests.length === 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-5 text-sm text-muted">
                      <span>No guests in this group yet.</span>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setImportGroupId(section.groupId ?? '')
                            setImportOpen(true)
                          }}
                        >
                          Import into this group
                        </Button>
                        <Button variant="secondary" onClick={() => openAddGuest(section.groupId)}>
                          <Plus className="size-4" aria-hidden="true" />
                          Add guest
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full min-w-[880px] text-left text-sm [&_th]:whitespace-nowrap">
                        <thead>
                          <tr className="border-b border-border text-muted">
                            <th className="w-14 py-3 pl-5 pr-2 font-normal">
                              <input
                                type="checkbox"
                                className="size-4"
                                aria-label={`Select every guest in ${section.name}`}
                                checked={picked > 0 && picked === ids.length}
                                ref={(input) => {
                                  if (input) input.indeterminate = picked > 0 && picked < ids.length
                                }}
                                onChange={(event) =>
                                  setSelected((current) =>
                                    event.target.checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)),
                                  )
                                }
                              />
                            </th>
                            <SortHeader label="Guest" column="guest" sort={sort} onSort={onSort} />
                            <SortHeader label="Guest category" column="type" sort={sort} onSort={onSort} />
                            <SortHeader label="Status" column="status" sort={sort} onSort={onSort} />
                            <SortHeader label="Invitation" column="invitation" sort={sort} onSort={onSort} />
                            <th className="py-3 pr-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {rows.map((guest) => (
                            <GuestRow
                              key={guest.id}
                              guest={guest}
                              checked={selected.includes(guest.id)}
                              busy={busy}
                              onCheck={(checked) =>
                                setSelected((current) => (checked ? [...current, guest.id] : current.filter((id) => id !== guest.id)))
                              }
                              onMore={() => setDetailsId(guest.id)}
                              onEdit={() => openEditGuest(guest)}
                              onGenerate={() => void generate([guest.id], false)}
                              onDelete={() => setPendingDelete([guest])}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : null}
              </section>
            )
          })
        )}
      </div>

      {/* Selection bar */}
      {selected.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface">
          <div className="mx-auto flex max-w-full items-center gap-2 overflow-x-auto px-6 py-3">
            <span className="whitespace-nowrap pr-2 text-sm font-medium tabular-nums">{selected.length} selected</span>
            <select
              aria-label="Assign guest category"
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
              value={assignTypeId}
              onChange={(event) => setAssignTypeId(event.target.value)}
            >
              <option value="">Guest category…</option>
              {enabledTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            <Button variant="secondary" disabled={!assignTypeId || reassignMutation.isPending} onClick={() => reassignMutation.mutate(false)}>
              Assign
            </Button>
            <select
              aria-label="Move to group"
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm"
              value={moveGroupId}
              onChange={(event) => setMoveGroupId(event.target.value)}
            >
              <option value="">Group…</option>
              <option value="none">No group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <Button variant="secondary" disabled={!moveGroupId || moveMutation.isPending} onClick={() => moveMutation.mutate(moveGroupId === 'none' ? null : moveGroupId)}>
              Move
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => openEmail(selectedGuests, 'selected guests')}>
              Email
            </Button>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
            <Button variant="secondary" disabled={busy} onClick={() => void download('invitations', selectedGuests, 'selected guests')}>
              Invitations PDF
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void download('badges-pdf', selectedGuests, 'selected guests')}>
              Digital passes PDF
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void download('badges-png', selectedGuests, 'selected guests')}>
              Digital passes images
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void rsvpReport(selectedGuests, 'selected guests')}>
              RSVP report
            </Button>
            <Button variant="secondary" onClick={() => void generate(selected, false)}>
              Make digital passes
            </Button>
            <Button variant="danger" onClick={() => setPendingDelete(selectedGuests)}>
              Delete
            </Button>
            <Button variant="ghost" aria-label="Clear selection" className="px-2" onClick={() => setSelected([])}>
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Add / edit guest */}
      <Modal
        open={guestFormOpen}
        title={editing ? `Edit ${editing.name}` : 'Add guest'}
        description={editing ? undefined : 'The form stays open after saving so you can add several guests in a row.'}
        onClose={closeGuestForm}
      >
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            requestSave()
          }}
        >
          <TextField id="guest-name-input" label="Name" autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <TextField label="Email" inputMode="email" autoComplete="off" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
          <TextField label="Position" value={draft.position} onChange={(event) => setDraft({ ...draft, position: event.target.value })} />
          <SelectField
            label="Guest category"
            value={draft.guestTypeId}
            options={editing ? typeOptions : [{ value: '', label: 'No guest category' }, ...enabledTypes.map((type) => ({ value: type.id, label: type.name }))]}
            onChange={(event) => setDraft({ ...draft, guestTypeId: event.target.value })}
          />
          <div className="sm:col-span-2">
            <SelectField label="Group" value={draft.guestGroupId} options={groupOptions} onChange={(event) => setDraft({ ...draft, guestGroupId: event.target.value })} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" onClick={closeGuestForm}>
              {editing ? 'Cancel' : 'Done'}
            </Button>
            <Button type="submit" disabled={!draft.name.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save guest' : 'Add guest'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* New group / rename group */}
      <Modal open={groupForm !== null} width="sm" title={groupForm?.mode === 'rename' ? 'Rename group' : 'New group'} onClose={() => setGroupForm(null)}>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (groupName.trim()) saveGroupMutation.mutate(groupName.trim())
          }}
        >
          <TextField label="Group name" placeholder="e.g. Ministry of Finance" autoFocus value={groupName} onChange={(event) => setGroupName(event.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGroupForm(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!groupName.trim() || saveGroupMutation.isPending}>
              {groupForm?.mode === 'rename' ? 'Rename' : 'Create group'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Import */}
      <Modal
        open={importOpen}
        width="lg"
        title="Import guests"
        description="Upload your file, choose a group, and match your columns."
        onClose={() => setImportOpen(false)}
      >
        <ImportStep number={1} title="File" hint="CSV or Excel · Column names must be in the first row.">
          {importFileName ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3">
              <FileText className="size-5 shrink-0 text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{importFileName}</span>
                <span className="block text-xs text-muted tabular-nums">
                  {sheetRows.length} {sheetRows.length === 1 ? 'row' : 'rows'} · {sheetHeaders.length} {sheetHeaders.length === 1 ? 'column' : 'columns'}
                </span>
              </span>
              <label className={buttonClassName('secondary', 'h-9 cursor-pointer')}>
                Change file
                <ImportFileInput onFile={(file) => void onFile(file)} />
              </label>
            </div>
          ) : (
            <label
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-8 text-center hover:border-accent hover:bg-accent-soft"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const file = event.dataTransfer.files?.[0]
                if (file) void onFile(file)
              }}
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Upload className="size-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium">Choose a file or drop it here</span>
              <span className="text-xs text-muted">.csv, .xlsx or .xls</span>
              <ImportFileInput onFile={(file) => void onFile(file)} />
            </label>
          )}
        </ImportStep>

        {sheetHeaders.length > 0 ? (
          <>
            <ImportStep number={2} title="Group assignment">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Import into group"
                  value={importGroupId}
                  options={groupOptions}
                  onChange={(event) => {
                    setImportGroupId(event.target.value)
                    setImportResult(null)
                  }}
                />
                <SelectField
                  label="Group column"
                  value={columns.group}
                  options={columnOptions}
                  onChange={(event) => {
                    setColumns({ ...columns, group: event.target.value })
                    setImportResult(null)
                  }}
                />
              </div>
              <p className="mt-2 text-sm text-muted">
                {columns.group
                  ? 'Rows with a value in the Group column use that group instead. New group names create new groups.'
                  : 'Map a Group column to place each row in its own group.'}
              </p>
            </ImportStep>

            <ImportStep number={3} title="Column mapping" last>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['name', 'Name column'],
                    ['email', 'Email column'],
                    ['position', 'Position column'],
                    ['guestType', 'Guest category column'],
                  ] as const
                ).map(([key, label]) => (
                  <SelectField
                    key={key}
                    label={label}
                    value={columns[key]}
                    options={columnOptions}
                    onChange={(event) => {
                      setColumns({ ...columns, [key]: event.target.value })
                      setImportResult(null)
                    }}
                  />
                ))}
              </div>
            </ImportStep>
          </>
        ) : null}

        {importResult?.complete ? (
          <p role="status" className="mt-4 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm text-accent">
            {importResult.message}
          </p>
        ) : null}
        {importResult && !importResult.complete ? (
          <div className="mt-4 text-sm">
            <div role="alert" className="rounded-md border border-danger bg-danger-soft p-3">
              <p className="font-medium text-danger">{importResult.message}</p>
              {duplicateCount > 0 ? (
                <p className="mt-1 text-danger">
                  {duplicateCount} {duplicateCount === 1 ? 'row uses an email' : 'rows use emails'} that {duplicateCount === 1 ? 'is' : 'are'} already
                  taken. Each email can belong to one guest only — remove or change those rows, then check again.
                </p>
              ) : null}
              <ul className="mt-2 max-h-56 list-disc overflow-y-auto pl-5">
                {importResult.errors.map((error) => (
                  <li key={`${error.row}-${error.message}`}>{error.message}</li>
                ))}
              </ul>
            </div>
            {importResult.unmatchedTypes.length > 0 ? (
              <div className="mt-3 grid gap-3">
                <p>Match unmatched values to a guest category on this event, or create a new category.</p>
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

        {sheetHeaders.length > 0 ? (
          <div className="sticky -bottom-5 -mx-5 -mb-5 mt-6 flex flex-wrap items-center gap-3 border-t border-border bg-surface px-5 py-4">
            <p className="mr-auto text-sm text-muted">
              {!columns.name
                ? 'Map the Name column to continue.'
                : importResult?.complete
                  ? `${importResult.readyCount} ${importResult.readyCount === 1 ? 'guest is' : 'guests are'} ready to import.`
                  : 'Check your import before adding guests.'}
            </p>
            {/* The next step is always the coloured button: Check first, then Import. */}
            <Button
              variant={importResult?.complete ? 'secondary' : 'primary'}
              className="h-10 px-5"
              disabled={!columns.name || importMutation.isPending}
              onClick={() => importMutation.mutate(false)}
            >
              {importMutation.isPending && !importResult?.complete ? 'Checking…' : 'Check import'}
            </Button>
            <Button
              className="h-10 px-5"
              disabled={!columns.name || !importResult?.complete || importMutation.isPending}
              onClick={() => importMutation.mutate(true)}
            >
              <Upload className="size-4" aria-hidden="true" />
              Import {importResult?.readyCount ?? 0} {importResult?.readyCount === 1 ? 'guest' : 'guests'}
              {importGroupId ? ` into ${groups.find((group) => group.id === importGroupId)?.name ?? 'group'}` : ''}
            </Button>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={pendingTypeChange !== null}
        title="Change guest category?"
        description="This updates the guest's current category only. It does not resend the invitation or remake the digital pass. The existing invitation, RSVP, and check-in code stay as they are. Send or make the pass again when you want the new design."
        confirmLabel="Change category"
        pendingLabel="Saving…"
        pending={saveMutation.isPending}
        onConfirm={() => {
          if (pendingTypeChange) saveMutation.mutate(pendingTypeChange)
        }}
        onClose={() => setPendingTypeChange(null)}
      />
      <ConfirmDialog
        open={pendingBulk}
        title="Change guest categories?"
        description={`This assigns ${selectedGuests.length} guests to a new category. It does not resend invitations or remake digital passes, and it does not change check-in codes.`}
        confirmLabel="Assign category"
        pendingLabel="Assigning…"
        pending={reassignMutation.isPending}
        onConfirm={() => reassignMutation.mutate(true)}
        onClose={() => setPendingBulk(false)}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.length === 1 ? `Delete ${pendingDelete[0].name}?` : `Delete ${pendingDelete?.length ?? 0} guests?`}
        description={`${
          pendingDelete?.length === 1 ? 'This guest is' : 'These guests are'
        } removed from the event with their invitation and digital pass history, and any seat they have is freed. Their check-in ${
          pendingDelete?.length === 1 ? 'code stops' : 'codes stop'
        } working. This cannot be undone.`}
        confirmLabel={pendingDelete?.length === 1 ? 'Delete guest' : `Delete ${pendingDelete?.length ?? 0} guests`}
        pendingLabel="Deleting…"
        pending={deleteGuestsMutation.isPending}
        onConfirm={() => {
          // Ignore a second click while the first delete is still running.
          if (pendingDelete && !deleteGuestsMutation.isPending) deleteGuestsMutation.mutate(pendingDelete.map((guest) => guest.id))
        }}
        onClose={() => setPendingDelete(null)}
      />
      <DeleteGroupDialog
        group={deletingGroup}
        pending={deleteGroupMutation.isPending}
        error={deleteGroupError}
        onConfirm={(deleteGuests) => {
          if (deletingGroup) deleteGroupMutation.mutate({ id: deletingGroup.id, deleteGuests })
        }}
        onClose={() => {
          if (!deleteGroupMutation.isPending) setDeletingGroup(null)
        }}
      />
      <FrontDeskLinkDialog eventId={eventId} live={eventQuery.data?.status === 'Active'} open={frontDeskOpen} onClose={() => setFrontDeskOpen(false)} />
      <GuestDetailsDialog
        guest={guests.find((guest) => guest.id === detailsId) ?? null}
        eventId={eventId}
        eventSlug={eventQuery.data?.slug ?? ''}
        eventLive={eventQuery.data?.status === 'Active'}
        timezone={eventQuery.data?.timezone ?? null}
        busy={busy}
        onClose={() => setDetailsId(null)}
        onEdit={(guest) => {
          setDetailsId(null)
          openEditGuest(guest)
        }}
        onDelete={(guest) => {
          setDetailsId(null)
          setPendingDelete([guest])
        }}
        onEmail={(guest, reminder) => openEmail([guest], guest.name, reminder)}
        onRecord={recordInvitation}
        onDownload={downloadForGuest}
      />
      <BulkEmailDialog
        open={emailTargets !== null}
        scopeLabel={emailTargets?.label ?? ''}
        guests={emailTargets?.guests ?? []}
        configured={Boolean(mailQuery.data?.configured)}
        pending={emailMutation.isPending}
        result={emailResult}
        error={emailError}
        reminder={Boolean(emailTargets?.reminder)}
        onSend={() => {
          if (emailTargets) emailMutation.mutate({ ids: emailTargets.guests.map((guest) => guest.id), reminder: Boolean(emailTargets.reminder) })
        }}
        onOpenSettings={() => {
          setEmailTargets(null)
          setMailSettingsOpen(true)
        }}
        onClose={() => {
          if (emailMutation.isPending) return
          setEmailTargets(null)
          setEmailResult(null)
          setEmailError(null)
        }}
      />
      <MailSettingsDialog
        open={mailSettingsOpen}
        onClose={() => {
          setMailSettingsOpen(false)
          void queryClient.invalidateQueries({ queryKey: ['mail-settings'] })
        }}
      />
      <ProgressDialog
        open={progress !== null}
        title={progress?.title ?? ''}
        done={progress?.done ?? 0}
        total={progress?.total ?? 0}
        onCancel={() => abortRef.current?.abort()}
      />
    </div>
  )
}

/** One guest row: checkbox, name with position and email, type, invitation and badge status, actions. */
function GuestRow({
  guest,
  checked,
  busy,
  onCheck,
  onMore,
  onEdit,
  onGenerate,
  onDelete,
}: {
  guest: Guest
  checked: boolean
  busy: boolean
  onCheck: (checked: boolean) => void
  /** Opens the guest panel: status, invitation link, email, guest pass, history. */
  onMore: () => void
  onEdit: () => void
  onGenerate: () => void
  onDelete: () => void
}) {
  const rsvp = guest.rsvpStatus ?? 'Pending'
  const invited = guest.invitationCount > 0
  return (
    <tr className={cn('transition-colors hover:bg-hover/60', checked && 'bg-accent-soft/40')}>
      <td className="py-4 pl-5 pr-2 align-middle">
        <input type="checkbox" className="size-4" aria-label={`Select ${guest.name}`} checked={checked} onChange={(event) => onCheck(event.target.checked)} />
      </td>
      <td className="py-4 pr-3 align-middle">
        <div className="text-base font-semibold">{guest.name}</div>
        <div className="text-muted">{[guest.position, guest.email].filter(Boolean).join(' · ') || 'No position or email'}</div>
      </td>
      <td className="py-4 pr-3 align-middle">{guest.guestTypeName ?? <span className="text-muted">No guest category</span>}</td>
      <td className="py-4 pr-3 align-middle">
        <Badge tone={rsvp === 'Accepted' ? 'teal' : rsvp === 'Declined' ? 'rose' : 'amber'}>{rsvp}</Badge>
      </td>
      <td className="py-4 pr-3 align-middle">
        {invited ? (
          <Badge tone="teal">Sent · {guest.lastInvitationTypeName ?? 'Recorded'}</Badge>
        ) : (
          <Badge tone="gray">Not sent</Badge>
        )}
      </td>
      <td className="py-3 pr-5 align-middle">
        <div className="flex justify-end">
          <Menu>
            <MenuTrigger asChild>
              <IconButton aria-label={`Actions for ${guest.name}`} className="size-9 border border-border" disabled={busy}>
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </IconButton>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={onMore}>
                <Eye className="mr-2 size-4" aria-hidden="true" />
                Details
              </MenuItem>
              <MenuItem onSelect={onEdit}>
                <Pencil className="mr-2 size-4" aria-hidden="true" />
                Edit
              </MenuItem>
              <MenuItem disabled={!guest.guestTypeId} onSelect={onGenerate}>
                <BadgeCheck className="mr-2 size-4" aria-hidden="true" />
                {guest.badgeCount > 0 ? 'Remake digital pass' : 'Make digital pass'}
              </MenuItem>
              <MenuSeparator />
              <MenuItem className="text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger" onSelect={onDelete}>
                <Trash2 className="mr-2 size-4" aria-hidden="true" />
                Delete
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </td>
    </tr>
  )
}

/** One numbered step of the import dialog. */
function ImportStep({ number, title, hint, last, children }: { number: number; title: string; hint?: string; last?: boolean; children: ReactNode }) {
  return (
    <section className={cn('py-5 first:pt-0', !last && 'border-b border-border')}>
      <div className="mb-3 flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground tabular-nums">
          {number}
        </span>
        <div>
          <h3 className="text-base font-semibold leading-7">{title}</h3>
          {hint ? <p className="text-sm text-muted">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function ImportFileInput({ onFile }: { onFile: (file: File) => void }) {
  return (
    <input
      className="sr-only"
      type="file"
      accept=".csv,.txt,.xlsx,.xls,text/csv"
      aria-label="Guest spreadsheet"
      onChange={(event) => {
        const file = event.target.files?.[0]
        // Clear so choosing the same file again still triggers a reload.
        event.target.value = ''
        if (file) onFile(file)
      }}
    />
  )
}

function withoutKey(set: Set<string>, key: string) {
  if (!set.has(key)) return set
  const next = new Set(set)
  next.delete(key)
  return next
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
