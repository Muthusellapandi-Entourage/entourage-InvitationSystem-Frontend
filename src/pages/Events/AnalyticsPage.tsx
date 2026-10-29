import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Download, RefreshCw, RotateCcw, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { analyticsApi, type AnalyticsGuest } from '@/api/analyticsApi'
import {
  analyticsCsv,
  applyFilters,
  arrivalBins,
  countBy,
  cumulative,
  dailySeries,
  dayKey,
  emptyFilters,
  formatTime,
  formatWhen,
  inStage,
  pct,
  reasonOf,
  shortDay,
  stageLabels,
  tableOf,
  toggle,
  type FilterKey,
  type Filters,
  type FunnelStage,
  type RsvpStatus,
} from '@/analytics/model'
import { BarList, Donut, Funnel, Histogram, KpiCard, Panel, Segmented, StackedBars, TimeSeries, type StackRow } from '@/components/analytics/charts'
import { ChoiceSlicer, MultiSlicer } from '@/components/analytics/Slicers'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/StatusBadge'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useEvent } from '@/hooks/useEvents'
import { downloadBlob } from '@/guests/bulkExport'
import { cn } from '@/lib/cn'

type Dimension = 'type' | 'group' | 'table'
type ActionList = 'chase' | 'notInvited' | 'unseated' | 'declinedSeated' | 'noShow' | 'email'
type SortKey = 'name' | 'guestType' | 'group' | 'rsvp' | 'rsvpOn' | 'invitationCount' | 'emails' | 'table' | 'checkIn'

const dimensionKey: Record<Dimension, FilterKey> = { type: 'types', group: 'groups', table: 'tables' }
const PAGE = 25

/**
 * Interactive event analytics (Power BI style): slicers, KPI cards and charts that cross-filter
 * each other. Click any bar, slice or stage to filter everything else; Ctrl/⌘-click to pick several.
 */
export function AnalyticsPage() {
  const { eventId = '' } = useParams()
  const event = useEvent(eventId).data
  useDocumentTitle(event ? `Analytics · ${event.name}` : 'Analytics')
  const [auto, setAuto] = useState<boolean | null>(null)
  const live = auto ?? event?.status === 'Active'
  const query = useQuery({
    queryKey: ['analytics', eventId],
    queryFn: () => analyticsApi.get(eventId),
    enabled: Boolean(eventId),
    refetchInterval: live ? 30_000 : false,
  })

  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [cumulativeView, setCumulativeView] = useState(false)
  const [dimension, setDimension] = useState<Dimension>('type')
  const [actionList, setActionList] = useState<ActionList>('chase')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'name', desc: false })
  const [page, setPage] = useState(0)

  const data = query.data
  const timezone = data?.timezone || event?.timezone || ''
  const all = useMemo(() => data?.guests ?? [], [data])
  const set = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setPage(0)
  }
  const view = (except: FilterKey[] = []) => applyFilters(all, filters, timezone, except)

  // Fully filtered rows drive the KPI cards, action lists and the detail table.
  const rows = useMemo(() => applyFilters(all, filters, timezone), [all, filters, timezone])

  const eventStarted = useMemo(() => {
    if (!data) return false
    return dayKey(new Date().toISOString(), timezone) >= data.startDate
  }, [data, timezone])

  // ---------------- KPI numbers ----------------
  const kpi = useMemo(() => {
    const invited = rows.filter((guest) => guest.invitationCount > 0).length
    const responded = rows.filter((guest) => guest.rsvp !== 'Pending').length
    const accepted = rows.filter((guest) => guest.rsvp === 'Accepted')
    const declined = rows.filter((guest) => guest.rsvp === 'Declined').length
    const pending = rows.filter((guest) => guest.rsvp === 'Pending').length
    const seated = accepted.filter((guest) => guest.table).length
    const arrived = rows.filter((guest) => guest.checkInCount > 0).length
    const arrivedAccepted = accepted.filter((guest) => guest.checkInCount > 0).length
    return { invited, responded, accepted: accepted.length, declined, pending, seated, arrived, noShows: accepted.length - arrivedAccepted }
  }, [rows])

  // ---------------- visuals (each ignores its own filter) ----------------
  const funnelRows = useMemo(() => view(['stage']), [all, filters, timezone]) // eslint-disable-line react-hooks/exhaustive-deps
  const stages: FunnelStage[] = ['invited', 'emailed', 'responded', 'accepted', 'seated', 'arrived']

  const donutRows = useMemo(() => view(['rsvp']), [all, filters, timezone]) // eslint-disable-line react-hooks/exhaustive-deps
  const statusCounts = countBy(donutRows, (guest) => guest.rsvp)

  const timelineRows = useMemo(() => view(['replyRange']), [all, filters, timezone]) // eslint-disable-line react-hooks/exhaustive-deps
  const series = useMemo(() => dailySeries(timelineRows, data?.activities ?? [], timezone), [timelineRows, data, timezone])
  const shape = (values: number[]) => (cumulativeView ? cumulative(values) : values)
  const replyRangeIndex: [number, number] | null = filters.replyRange
    ? [Math.max(0, series.days.indexOf(filters.replyRange.from)), Math.max(0, series.days.indexOf(filters.replyRange.to))]
    : null

  const breakdownRows = useMemo(() => view([dimensionKey[dimension]]), [all, filters, timezone, dimension]) // eslint-disable-line react-hooks/exhaustive-deps
  const breakdown: StackRow[] = useMemo(() => {
    const key = (guest: AnalyticsGuest) => (dimension === 'type' ? guest.guestType : dimension === 'group' ? guest.group : tableOf(guest))
    const buckets = new Map<string, AnalyticsGuest[]>()
    for (const guest of breakdownRows) buckets.set(key(guest), [...(buckets.get(key(guest)) ?? []), guest])
    return [...buckets.entries()]
      .map(([name, guests]) => ({
        key: name,
        label: name,
        segments: [
          { key: 'Accepted', label: 'Accepted', value: guests.filter((guest) => guest.rsvp === 'Accepted').length, swatch: 'bg-accent' },
          { key: 'Declined', label: 'Declined', value: guests.filter((guest) => guest.rsvp === 'Declined').length, swatch: 'bg-danger' },
          { key: 'Pending', label: 'Pending', value: guests.filter((guest) => guest.rsvp === 'Pending').length, swatch: 'bg-warning' },
        ],
      }))
      .sort((a, b) => b.segments.reduce((sum, item) => sum + item.value, 0) - a.segments.reduce((sum, item) => sum + item.value, 0))
  }, [breakdownRows, dimension])
  const dimensionSelected = dimension === 'type' ? filters.types : dimension === 'group' ? filters.groups : filters.tables

  const reasonRows = useMemo(() => view(['reasons']).filter((guest) => guest.rsvp === 'Declined'), [all, filters, timezone]) // eslint-disable-line react-hooks/exhaustive-deps
  const reasons = [...countBy(reasonRows, reasonOf).entries()]
    .map(([reason, count]) => ({ key: reason, label: reason, value: count, display: `${count} · ${pct(count, reasonRows.length)}%` }))
    .sort((a, b) => b.value - a.value)

  const arrivalRows = useMemo(() => view(['arrivalRange']), [all, filters, timezone]) // eslint-disable-line react-hooks/exhaustive-deps
  const bins = useMemo(() => arrivalBins(arrivalRows), [arrivalRows])
  const arrivalIndex: [number, number] | null =
    filters.arrivalRange && bins.length
      ? [
          Math.max(0, bins.findIndex((bin) => bin.start >= filters.arrivalRange!.from)),
          Math.max(0, bins.reduce((last, bin, index) => (bin.end <= filters.arrivalRange!.to ? index : last), -1)),
        ]
      : null

  const tableRows = (data?.tables ?? [])
    .filter((table) => table.capacity > 0)
    .map((table) => ({
      key: table.name,
      label: table.name,
      value: table.assigned,
      max: table.capacity,
      detail: 'Seats assigned',
      display: `${table.assigned}/${table.capacity}`,
    }))
  const capacity = (data?.tables ?? []).reduce((sum, table) => sum + table.capacity, 0)
  const assignedSeats = (data?.tables ?? []).reduce((sum, table) => sum + table.assigned, 0)

  // ---------------- action lists ----------------
  const lists = useMemo(() => {
    const threeDays = Date.now() - 3 * 86_400_000
    return {
      chase: rows.filter((guest) => guest.rsvp === 'Pending' && guest.firstInvitedOn && Date.parse(guest.firstInvitedOn) < threeDays),
      notInvited: rows.filter((guest) => guest.invitationCount === 0),
      unseated: rows.filter((guest) => guest.rsvp === 'Accepted' && !guest.table),
      declinedSeated: rows.filter((guest) => guest.rsvp === 'Declined' && guest.table),
      noShow: eventStarted ? rows.filter((guest) => guest.rsvp === 'Accepted' && guest.checkInCount === 0) : [],
      email: rows.filter((guest) => guest.emailFailures > 0 || !guest.hasEmail),
    } satisfies Record<ActionList, AnalyticsGuest[]>
  }, [rows, eventStarted])
  const listMeta: Record<ActionList, { label: string; hint: string; info: (guest: AnalyticsGuest) => string }> = {
    chase: { label: 'Chase replies', hint: 'Invited over 3 days ago and still pending.', info: (guest) => `Invited ${formatWhen(guest.firstInvitedOn, timezone)}` },
    notInvited: { label: 'Not invited', hint: 'No invitation recorded or sent yet.', info: (guest) => (guest.hasEmail ? 'Has email' : 'No email address') },
    unseated: { label: 'Accepted, no seat', hint: 'Coming, but not on the seating plan.', info: (guest) => `Accepted ${formatWhen(guest.rsvpOn, timezone)}` },
    declinedSeated: { label: 'Declined, still seated', hint: 'Free these seats for others.', info: (guest) => `${guest.table} · Seat ${guest.seat ?? '—'}` },
    noShow: { label: 'No-shows', hint: eventStarted ? 'Accepted but not checked in.' : 'Shown once the event has started.', info: (guest) => (guest.table ? `${guest.table} · Seat ${guest.seat ?? '—'}` : 'No seat') },
    email: { label: 'Email problems', hint: 'Failed emails or no email address.', info: (guest) => (guest.hasEmail ? `${guest.emailFailures} failed` : 'No email address') },
  }

  // ---------------- detail table ----------------
  const sorted = useMemo(() => {
    const value = (guest: AnalyticsGuest): string | number => {
      switch (sort.key) {
        case 'name':
          return guest.name.toLowerCase()
        case 'guestType':
          return guest.guestType.toLowerCase()
        case 'group':
          return guest.group.toLowerCase()
        case 'rsvp':
          return guest.rsvp
        case 'rsvpOn':
          return guest.rsvpOn ? Date.parse(guest.rsvpOn) : 0
        case 'invitationCount':
          return guest.invitationCount
        case 'emails':
          return guest.emailCount + guest.reminderCount
        case 'table':
          return `${guest.table ?? '~'} ${guest.seat ?? ''}`.toLowerCase()
        case 'checkIn':
          return guest.firstCheckInOn ? Date.parse(guest.firstCheckInOn) : 0
      }
    }
    return [...rows].sort((a, b) => {
      const left = value(a)
      const right = value(b)
      const order = left < right ? -1 : left > right ? 1 : 0
      return sort.desc ? -order : order
    })
  }, [rows, sort])
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE))
  const pageRows = sorted.slice(page * PAGE, page * PAGE + PAGE)

  // ---------------- active filter chips ----------------
  const chips: { key: string; label: string; clear: Partial<Filters> }[] = [
    ...filters.types.map((value) => ({ key: `t:${value}`, label: `Type: ${value}`, clear: { types: filters.types.filter((item) => item !== value) } })),
    ...filters.groups.map((value) => ({ key: `g:${value}`, label: `Group: ${value}`, clear: { groups: filters.groups.filter((item) => item !== value) } })),
    ...filters.rsvp.map((value) => ({ key: `r:${value}`, label: `RSVP: ${value}`, clear: { rsvp: filters.rsvp.filter((item) => item !== value) } })),
    ...filters.tables.map((value) => ({ key: `tb:${value}`, label: `Table: ${value}`, clear: { tables: filters.tables.filter((item) => item !== value) } })),
    ...filters.reasons.map((value) => ({ key: `rs:${value}`, label: `Reason: ${value}`, clear: { reasons: filters.reasons.filter((item) => item !== value) } })),
    ...(filters.invitation ? [{ key: 'inv', label: filters.invitation === 'sent' ? 'Invited' : 'Not invited', clear: { invitation: null } }] : []),
    ...(filters.seating ? [{ key: 'seat', label: filters.seating === 'seated' ? 'Seated' : 'Not seated', clear: { seating: null } }] : []),
    ...(filters.arrival ? [{ key: 'arr', label: filters.arrival === 'arrived' ? 'Checked in' : 'Not checked in', clear: { arrival: null } }] : []),
    ...(filters.stage ? [{ key: 'stage', label: `Funnel: ${stageLabels[filters.stage]}`, clear: { stage: null } }] : []),
    ...(filters.replyRange
      ? [{
          key: 'reply',
          label: `Replied ${filters.replyRange.from === filters.replyRange.to ? shortDay(filters.replyRange.from) : `${shortDay(filters.replyRange.from)} – ${shortDay(filters.replyRange.to)}`}`,
          clear: { replyRange: null },
        }]
      : []),
    ...(filters.arrivalRange
      ? [{ key: 'arrival', label: `Arrived ${formatTime(filters.arrivalRange.from, timezone)} – ${formatTime(filters.arrivalRange.to, timezone)}`, clear: { arrivalRange: null } }]
      : []),
  ]

  if (!event) return null
  if (query.isLoading) return <p className="text-sm text-muted">Loading analytics…</p>
  if (!data) return <p className="text-sm text-danger">Analytics could not be loaded. Try again in a moment.</p>

  const total = all.length
  const options = (key: 'guestType' | 'group', except: FilterKey) =>
    [...countBy(view([except]), (guest) => guest[key]).entries()]
      .concat([...new Set(all.map((guest) => guest[key]))].filter((value) => !view([except]).some((guest) => guest[key] === value)).map((value) => [value, 0] as [string, number]))
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Analytics</h2>
          <p className="text-sm text-muted tabular-nums">
            {rows.length === total ? `${total} guests` : `${rows.length} of ${total} guests match the filters`} · Updated {formatTime(Date.parse(data.generatedOn), timezone)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setAuto(!live)} title="Refresh every 30 seconds">
            <RefreshCw className={cn('size-4', live && 'text-accent')} aria-hidden="true" />
            Auto-refresh {live ? 'on' : 'off'}
          </Button>
          <Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>
            {query.isFetching ? 'Refreshing…' : 'Refresh now'}
          </Button>
          <Button variant="secondary" disabled={chips.length === 0 && !filters.search} onClick={() => { setFilters(emptyFilters); setPage(0) }}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Reset filters
          </Button>
          <Button
            onClick={() => {
              const csv = analyticsCsv(sorted, timezone)
              downloadBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), `${event.slug || 'event'}-analytics.csv`)
            }}
          >
            <Download className="size-4" aria-hidden="true" />
            Export {rows.length === total ? 'all' : rows.length}
          </Button>
        </div>
      </div>

      {/* Slicers */}
      <div className="flex flex-wrap items-center gap-2 border-y border-border py-4">
        <label className="relative">
          <span className="sr-only">Search guests</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            className="h-10 w-60 rounded-md border border-border bg-surface pl-9 pr-3 text-sm"
            placeholder="Search name, table, reason…"
            value={filters.search}
            onChange={(change) => set({ search: change.target.value })}
          />
        </label>
        <MultiSlicer label="Guest type" options={options('guestType', 'types')} selected={filters.types} onChange={(types) => set({ types })} />
        <MultiSlicer label="Group" options={options('group', 'groups')} selected={filters.groups} onChange={(groups) => set({ groups })} />
        <MultiSlicer
          label="RSVP"
          options={(['Accepted', 'Declined', 'Pending'] as RsvpStatus[]).map((value) => ({ value, count: statusCounts.get(value) ?? 0 }))}
          selected={filters.rsvp}
          onChange={(values) => set({ rsvp: values as RsvpStatus[] })}
        />
        <ChoiceSlicer label="Invitation" value={filters.invitation} options={[{ value: 'sent', label: 'Invited' }, { value: 'notSent', label: 'Not invited' }]} onChange={(invitation) => set({ invitation })} />
        <ChoiceSlicer label="Seat" value={filters.seating} options={[{ value: 'seated', label: 'Seated' }, { value: 'unseated', label: 'Not seated' }]} onChange={(seating) => set({ seating })} />
        <ChoiceSlicer label="Check-in" value={filters.arrival} options={[{ value: 'arrived', label: 'Checked in' }, { value: 'notArrived', label: 'Not checked in' }]} onChange={(arrival) => set({ arrival })} />
      </div>

      {chips.length > 0 ? (
        <div className="-mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Filtered by</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-accent/50 bg-accent-soft px-2 text-xs font-medium text-accent hover:border-accent"
              onClick={() => set(chip.clear)}
              title="Remove this filter"
            >
              {chip.label}
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KpiCard label="Guests" value={rows.length} detail={rows.length === total ? 'All guests' : `of ${total}`} />
        <KpiCard
          label="Invited"
          value={kpi.invited}
          progress={pct(kpi.invited, rows.length)}
          detail={`${pct(kpi.invited, rows.length)}% of guests`}
          active={filters.invitation === 'sent'}
          onClick={() => set({ invitation: filters.invitation === 'sent' ? null : 'sent' })}
        />
        <KpiCard
          label="Response rate"
          value={`${pct(kpi.responded, kpi.invited)}%`}
          progress={pct(kpi.responded, kpi.invited)}
          detail={`${kpi.responded} of ${kpi.invited} invited`}
          active={filters.stage === 'responded'}
          onClick={() => set({ stage: filters.stage === 'responded' ? null : 'responded' })}
        />
        <KpiCard
          label="Accepted"
          tone="accent"
          value={kpi.accepted}
          progress={pct(kpi.accepted, rows.length)}
          detail={`${pct(kpi.accepted, kpi.responded)}% of replies`}
          active={filters.rsvp.length === 1 && filters.rsvp[0] === 'Accepted'}
          onClick={() => set({ rsvp: toggle(filters.rsvp, 'Accepted', false) })}
        />
        <KpiCard
          label="Declined"
          tone="danger"
          value={kpi.declined}
          progress={pct(kpi.declined, rows.length)}
          detail={`${pct(kpi.declined, kpi.responded)}% of replies`}
          active={filters.rsvp.length === 1 && filters.rsvp[0] === 'Declined'}
          onClick={() => set({ rsvp: toggle(filters.rsvp, 'Declined', false) })}
        />
        <KpiCard
          label="Pending"
          tone="warning"
          value={kpi.pending}
          progress={pct(kpi.pending, rows.length)}
          detail={`${pct(kpi.pending, rows.length)}% of guests`}
          active={filters.rsvp.length === 1 && filters.rsvp[0] === 'Pending'}
          onClick={() => set({ rsvp: toggle(filters.rsvp, 'Pending', false) })}
        />
        <KpiCard
          label="Seated"
          value={`${kpi.seated}/${kpi.accepted}`}
          progress={pct(kpi.seated, kpi.accepted)}
          detail={`${pct(kpi.seated, kpi.accepted)}% of accepted`}
          active={filters.seating === 'seated'}
          onClick={() => set({ seating: filters.seating === 'seated' ? null : 'seated' })}
        />
        <KpiCard
          label="Checked in"
          tone="accent"
          value={kpi.arrived}
          progress={pct(kpi.arrived, kpi.accepted)}
          detail={eventStarted ? `${kpi.noShows} no-shows so far` : `${pct(kpi.arrived, kpi.accepted)}% of accepted`}
          active={filters.arrival === 'arrived'}
          onClick={() => set({ arrival: filters.arrival === 'arrived' ? null : 'arrived' })}
        />
      </div>

      {/* Funnel + RSVP split */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          title="Guest journey"
          subtitle="From invitation to the door. Click a stage to see only those guests."
          filtered={Boolean(filters.stage)}
          onClear={() => set({ stage: null })}
        >
          <Funnel
            total={funnelRows.length}
            stages={stages.map((stage) => ({ key: stage, label: stageLabels[stage], value: funnelRows.filter((guest) => inStage(guest, stage)).length }))}
            selected={filters.stage}
            onSelect={(stage) => set({ stage: filters.stage === stage ? null : (stage as FunnelStage) })}
          />
        </Panel>
        <Panel className="lg:col-span-5" title="RSVP split" subtitle="Click a slice; Ctrl-click to pick several." filtered={filters.rsvp.length > 0} onClear={() => set({ rsvp: [] })}>
          <Donut
            centerValue={`${pct((statusCounts.get('Accepted') ?? 0) + (statusCounts.get('Declined') ?? 0), donutRows.length)}%`}
            centerLabel="responded"
            selected={filters.rsvp}
            onSelect={(key, add) => set({ rsvp: toggle(filters.rsvp, key as RsvpStatus, add) })}
            slices={[
              { key: 'Accepted', label: 'Accepted', value: statusCounts.get('Accepted') ?? 0, fill: 'stroke-accent', swatch: 'bg-accent' },
              { key: 'Declined', label: 'Declined', value: statusCounts.get('Declined') ?? 0, fill: 'stroke-danger', swatch: 'bg-danger' },
              { key: 'Pending', label: 'Pending', value: statusCounts.get('Pending') ?? 0, fill: 'stroke-warning', swatch: 'bg-warning' },
            ]}
          />
        </Panel>
      </div>

      {/* Timeline */}
      <Panel
        title="Activity over time"
        subtitle="Invitations, emails and replies per day (event time zone)."
        filtered={Boolean(filters.replyRange)}
        onClear={() => set({ replyRange: null })}
        actions={
          <Segmented
            value={cumulativeView ? 'total' : 'daily'}
            options={[{ value: 'daily', label: 'Daily' }, { value: 'total', label: 'Running total' }]}
            onChange={(value) => setCumulativeView(value === 'total')}
          />
        }
      >
        <TimeSeries
          labels={series.days.map(shortDay)}
          range={replyRangeIndex}
          onRange={(range) => set({ replyRange: range ? { from: series.days[range[0]], to: series.days[range[1]] } : null })}
          series={[
            { key: 'invited', label: 'Invited', values: shape(series.invited), stroke: 'stroke-muted', swatch: 'bg-muted', dot: 'fill-muted' },
            { key: 'emailed', label: 'Emails sent', values: shape(series.emailed), stroke: 'stroke-warning', swatch: 'bg-warning', dot: 'fill-warning' },
            { key: 'accepted', label: 'Accepted', values: shape(series.accepted), stroke: 'stroke-accent', swatch: 'bg-accent', dot: 'fill-accent' },
            { key: 'declined', label: 'Declined', values: shape(series.declined), stroke: 'stroke-danger', swatch: 'bg-danger', dot: 'fill-danger' },
          ]}
        />
      </Panel>

      {/* Breakdown + decline reasons */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          title="Breakdown"
          subtitle="Accepted, declined and pending per category. Click a bar to filter."
          filtered={dimensionSelected.length > 0}
          onClear={() => set({ [dimensionKey[dimension]]: [] } as Partial<Filters>)}
          actions={
            <Segmented
              value={dimension}
              options={[{ value: 'type', label: 'Guest type' }, { value: 'group', label: 'Group' }, { value: 'table', label: 'Table' }]}
              onChange={setDimension}
            />
          }
        >
          <StackedBars
            rows={breakdown}
            selected={dimensionSelected}
            onSelect={(key, add) => set({ [dimensionKey[dimension]]: toggle(dimensionSelected, key, add) } as Partial<Filters>)}
          />
          <div className="mt-3 flex gap-4 text-xs text-muted">
            {[['bg-accent', 'Accepted'], ['bg-danger', 'Declined'], ['bg-warning', 'Pending']].map(([swatch, label]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={cn('size-2.5 rounded-sm', swatch)} aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>
        </Panel>
        <Panel
          className="lg:col-span-5"
          title="Decline reasons"
          subtitle={`${reasonRows.length} declined guests. Click a reason to filter.`}
          filtered={filters.reasons.length > 0}
          onClear={() => set({ reasons: [] })}
        >
          <BarList
            rows={reasons}
            selected={filters.reasons}
            swatch="bg-danger"
            emptyText="No declines in this selection."
            onSelect={(key, add) => set({ reasons: toggle(filters.reasons, key, add) })}
          />
        </Panel>
      </div>

      {/* Arrivals + table fill */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          title="Arrivals"
          subtitle="First check-ins per 15 minutes."
          filtered={Boolean(filters.arrivalRange)}
          onClear={() => set({ arrivalRange: null })}
        >
          <Histogram
            bins={bins.map((bin) => ({ label: formatTime(bin.start, timezone), value: bin.value }))}
            range={arrivalIndex}
            emptyText="No check-ins yet. Arrivals appear here once guests are scanned at the door."
            onRange={(range) => set({ arrivalRange: range ? { from: bins[range[0]].start, to: bins[range[1]].end } : null })}
          />
        </Panel>
        <Panel
          className="lg:col-span-5"
          title="Seating"
          subtitle={capacity ? `${assignedSeats} of ${capacity} chairs assigned (${pct(assignedSeats, capacity)}%). Click a table to filter.` : 'No seating plan yet.'}
          filtered={filters.tables.length > 0}
          onClear={() => set({ tables: [] })}
        >
          <BarList
            rows={tableRows}
            selected={filters.tables}
            emptyText="Add tables in Seating to see how full they are."
            onSelect={(key, add) => set({ tables: toggle(filters.tables, key, add) })}
          />
        </Panel>
      </div>

      {/* Action lists */}
      <Panel title="Needs attention" subtitle={listMeta[actionList].hint}>
        <div className="mb-4 flex flex-wrap gap-2">
          {(Object.keys(listMeta) as ActionList[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={actionList === key}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm',
                actionList === key ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-border text-muted hover:text-foreground',
              )}
              onClick={() => setActionList(key)}
            >
              {listMeta[key].label}
              <span className={cn('rounded-sm px-1.5 text-xs tabular-nums', lists[key].length ? 'bg-warning-soft text-warning' : 'bg-hover text-muted')}>{lists[key].length}</span>
            </button>
          ))}
        </div>
        {lists[actionList].length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Nothing needs attention here.</p>
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
            {lists[actionList].slice(0, 60).map((guest) => (
              <li key={guest.id} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{guest.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {guest.guestType} · {guest.group}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-muted">{listMeta[actionList].info(guest)}</span>
              </li>
            ))}
          </ul>
        )}
        {lists[actionList].length > 60 ? (
          <p className="mt-3 text-xs text-muted">Showing 60 of {lists[actionList].length}. Use Export for the full list.</p>
        ) : null}
      </Panel>

      {/* Detail table */}
      <Panel title="Guest details" subtitle={`${sorted.length} guests · click a column to sort`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {(
                  [
                    ['name', 'Guest'],
                    ['guestType', 'Type'],
                    ['group', 'Group'],
                    ['rsvp', 'RSVP'],
                    ['rsvpOn', 'Replied'],
                    ['invitationCount', 'Invites'],
                    ['emails', 'Emails'],
                    ['table', 'Seat'],
                    ['checkIn', 'Checked in'],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th key={key} className="py-2.5 pr-3" aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                    <button
                      type="button"
                      className={cn('inline-flex items-center gap-1 uppercase tracking-[0.06em]', sort.key === key ? 'text-accent' : 'hover:text-foreground')}
                      onClick={() => setSort((current) => ({ key, desc: current.key === key ? !current.desc : false }))}
                    >
                      {label}
                      {sort.key === key ? sort.desc ? <ArrowDown className="size-3" aria-hidden="true" /> : <ArrowUp className="size-3" aria-hidden="true" /> : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pageRows.map((guest) => (
                <tr key={guest.id} className="hover:bg-hover/60">
                  <td className="py-2.5 pr-3">
                    <span className="block font-medium">{guest.name}</span>
                    {guest.position ? <span className="block text-xs text-muted">{guest.position}</span> : null}
                  </td>
                  <td className="py-2.5 pr-3">{guest.guestType}</td>
                  <td className="py-2.5 pr-3">{guest.group}</td>
                  <td className="py-2.5 pr-3">
                    <Badge tone={guest.rsvp === 'Accepted' ? 'teal' : guest.rsvp === 'Declined' ? 'rose' : 'amber'}>{guest.rsvp}</Badge>
                    {guest.rsvp === 'Declined' && guest.declineReason ? (
                      <span className="mt-1 block max-w-[14rem] truncate text-xs text-muted" title={guest.declineReason}>
                        “{guest.declineReason}”
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-3 text-muted">{guest.rsvp === 'Pending' ? '—' : formatWhen(guest.rsvpOn, timezone)}</td>
                  <td className="py-2.5 pr-3">{guest.invitationCount}</td>
                  <td className="py-2.5 pr-3">
                    {guest.emailCount + guest.reminderCount}
                    {guest.emailFailures ? <span className="ml-1.5 text-xs text-danger">{guest.emailFailures} failed</span> : null}
                  </td>
                  <td className="py-2.5 pr-3">{guest.table ? `${guest.table} · ${guest.seat ?? '—'}` : <span className="text-muted">—</span>}</td>
                  <td className="py-2.5 pr-3">
                    {guest.checkInCount ? (
                      <span className="text-accent">
                        {formatWhen(guest.firstCheckInOn, timezone)}
                        {guest.checkInCount > 1 ? <span className="ml-1 text-xs text-muted">×{guest.checkInCount}</span> : null}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted">
                    No guests match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {pages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted tabular-nums">
              {page * PAGE + 1}–{Math.min(sorted.length, (page + 1) * PAGE)} of {sorted.length}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button variant="secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}
