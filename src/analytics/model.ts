import type { AnalyticsActivity, AnalyticsGuest } from '@/api/analyticsApi'

export type RsvpStatus = 'Accepted' | 'Declined' | 'Pending'
export type FunnelStage = 'invited' | 'emailed' | 'responded' | 'accepted' | 'seated' | 'arrived'

/**
 * Every slicer and cross-filter on the dashboard. Clicking a chart adds to these; each visual is drawn
 * from the guests that pass every filter except its own, so its own selection stays highlighted.
 */
export type Filters = {
  types: string[]
  groups: string[]
  rsvp: RsvpStatus[]
  tables: string[]
  reasons: string[]
  invitation: 'sent' | 'notSent' | null
  seating: 'seated' | 'unseated' | null
  arrival: 'arrived' | 'notArrived' | null
  stage: FunnelStage | null
  /** Reply date range as day keys (YYYY-MM-DD, event time zone), inclusive. */
  replyRange: { from: string; to: string } | null
  /** First check-in between these instants (ms). */
  arrivalRange: { from: number; to: number } | null
  search: string
}

export type FilterKey = keyof Filters

export const emptyFilters: Filters = {
  types: [],
  groups: [],
  rsvp: [],
  tables: [],
  reasons: [],
  invitation: null,
  seating: null,
  arrival: null,
  stage: null,
  replyRange: null,
  arrivalRange: null,
  search: '',
}

export const NO_TABLE = 'No table'
export const NO_REASON = 'No reason given'

export const tableOf = (guest: AnalyticsGuest) => guest.table ?? NO_TABLE
export const reasonOf = (guest: AnalyticsGuest) => guest.declineReason?.trim() || NO_REASON

export const stageLabels: Record<FunnelStage, string> = {
  invited: 'Invited',
  emailed: 'Emailed',
  responded: 'Responded',
  accepted: 'Accepted',
  seated: 'Seated',
  arrived: 'Checked in',
}

export function inStage(guest: AnalyticsGuest, stage: FunnelStage) {
  switch (stage) {
    case 'invited':
      return guest.invitationCount > 0
    case 'emailed':
      return guest.emailCount + guest.reminderCount > 0
    case 'responded':
      return guest.rsvp !== 'Pending'
    case 'accepted':
      return guest.rsvp === 'Accepted'
    case 'seated':
      return Boolean(guest.table)
    case 'arrived':
      return guest.checkInCount > 0
  }
}

/** Guests passing every filter, except the ones listed in `except` (a visual ignores its own filter). */
export function applyFilters(guests: AnalyticsGuest[], filters: Filters, timezone: string, except: FilterKey[] = []) {
  const skip = new Set<FilterKey>(except)
  const term = filters.search.trim().toLowerCase()
  return guests.filter((guest) => {
    if (!skip.has('types') && filters.types.length && !filters.types.includes(guest.guestType)) return false
    if (!skip.has('groups') && filters.groups.length && !filters.groups.includes(guest.group)) return false
    if (!skip.has('rsvp') && filters.rsvp.length && !filters.rsvp.includes(guest.rsvp)) return false
    if (!skip.has('tables') && filters.tables.length && !filters.tables.includes(tableOf(guest))) return false
    if (!skip.has('reasons') && filters.reasons.length && !(guest.rsvp === 'Declined' && filters.reasons.includes(reasonOf(guest)))) return false
    if (!skip.has('invitation') && filters.invitation) {
      const sent = guest.invitationCount > 0
      if ((filters.invitation === 'sent') !== sent) return false
    }
    if (!skip.has('seating') && filters.seating) {
      if ((filters.seating === 'seated') !== Boolean(guest.table)) return false
    }
    if (!skip.has('arrival') && filters.arrival) {
      if ((filters.arrival === 'arrived') !== guest.checkInCount > 0) return false
    }
    if (!skip.has('stage') && filters.stage && !inStage(guest, filters.stage)) return false
    if (!skip.has('replyRange') && filters.replyRange) {
      if (!guest.rsvpOn || guest.rsvp === 'Pending') return false
      const day = dayKey(guest.rsvpOn, timezone)
      if (day < filters.replyRange.from || day > filters.replyRange.to) return false
    }
    if (!skip.has('arrivalRange') && filters.arrivalRange) {
      if (!guest.firstCheckInOn) return false
      const at = Date.parse(guest.firstCheckInOn)
      if (at < filters.arrivalRange.from || at >= filters.arrivalRange.to) return false
    }
    if (!skip.has('search') && term) {
      const haystack = [guest.name, guest.position, guest.guestType, guest.group, guest.table, guest.declineReason].join(' ').toLowerCase()
      if (!haystack.includes(term)) return false
    }
    return true
  })
}

/** Click = select only this item (or clear if it was the only one); Ctrl/⌘/Shift-click = add or remove it. */
export function toggle<T>(list: T[], value: T, additive: boolean): T[] {
  if (additive) return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
  return list.length === 1 && list[0] === value ? [] : [value]
}

export function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  return counts
}

export function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

/* ---------------- time ---------------- */

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

function dayFormatter(timezone: string) {
  let formatter = dayFormatters.get(timezone)
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' })
    } catch {
      formatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
    }
    dayFormatters.set(timezone, formatter)
  }
  return formatter
}

/** "2026-10-28" for an instant, in the event's time zone. */
export function dayKey(iso: string, timezone: string) {
  return dayFormatter(timezone).format(new Date(iso))
}

/** Every day key from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string) {
  const days: string[] = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cursor <= end && days.length < 1000) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

export function shortDay(key: string) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function formatTime(ms: number, timezone: string) {
  try {
    return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone || undefined })
  } catch {
    return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
}

export function formatWhen(iso: string | null, timezone: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: timezone || undefined })
  } catch {
    return new Date(iso).toLocaleString()
  }
}

/* ---------------- series ---------------- */

export type DailySeries = { days: string[]; invited: number[]; emailed: number[]; accepted: number[]; declined: number[] }

/** Per-day counts for the timeline: first invitations, emails sent, acceptances and declines. */
export function dailySeries(guests: AnalyticsGuest[], activities: AnalyticsActivity[], timezone: string): DailySeries {
  const ids = new Set(guests.map((guest) => guest.id))
  const invited = new Map<string, number>()
  const emailed = new Map<string, number>()
  const accepted = new Map<string, number>()
  const declined = new Map<string, number>()
  const bump = (map: Map<string, number>, iso: string | null) => {
    if (!iso) return
    const key = dayKey(iso, timezone)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  for (const guest of guests) {
    bump(invited, guest.firstInvitedOn)
    if (guest.rsvp === 'Accepted') bump(accepted, guest.rsvpOn)
    if (guest.rsvp === 'Declined') bump(declined, guest.rsvpOn)
  }
  for (const activity of activities) {
    if (!ids.has(activity.guestId)) continue
    if (activity.kind === 'Invitation emailed' || activity.kind === 'Reminder emailed') bump(emailed, activity.on)
  }
  const keys = [...invited.keys(), ...emailed.keys(), ...accepted.keys(), ...declined.keys()].sort()
  if (keys.length === 0) return { days: [], invited: [], emailed: [], accepted: [], declined: [] }
  const days = daysBetween(keys[0], keys[keys.length - 1])
  const pick = (map: Map<string, number>) => days.map((day) => map.get(day) ?? 0)
  return { days, invited: pick(invited), emailed: pick(emailed), accepted: pick(accepted), declined: pick(declined) }
}

export function cumulative(values: number[]) {
  let sum = 0
  return values.map((value) => (sum += value))
}

export type ArrivalBin = { start: number; end: number; value: number }

/** First check-ins grouped into 15-minute windows, from the first arrival to the last. */
export function arrivalBins(guests: AnalyticsGuest[], minutes = 15): ArrivalBin[] {
  const size = minutes * 60_000
  const times = guests.flatMap((guest) => (guest.firstCheckInOn ? [Date.parse(guest.firstCheckInOn)] : [])).sort((a, b) => a - b)
  if (times.length === 0) return []
  const first = Math.floor(times[0] / size) * size
  const last = Math.floor(times[times.length - 1] / size) * size
  const bins: ArrivalBin[] = []
  for (let start = first; start <= last && bins.length < 400; start += size) bins.push({ start, end: start + size, value: 0 })
  for (const time of times) {
    const index = Math.floor((time - first) / size)
    if (bins[index]) bins[index].value += 1
  }
  return bins
}

/* ---------------- export ---------------- */

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

/** The filtered guests as a spreadsheet (opens in Excel, Arabic names included). */
export function analyticsCsv(guests: AnalyticsGuest[], timezone: string) {
  const header = [
    'Name', 'Position', 'Guest category', 'Group', 'RSVP', 'Replied', 'Decline reason', 'Invitations', 'First invited',
    'Emails', 'Reminders', 'Email failures', 'Digital passes', 'Table', 'Seat', 'Check-ins', 'First check-in', 'Seated at',
  ]
  const rows = guests.map((guest) => [
    guest.name,
    guest.position,
    guest.guestType,
    guest.group,
    guest.rsvp,
    guest.rsvpOn ? formatWhen(guest.rsvpOn, timezone) : '',
    guest.rsvp === 'Declined' ? guest.declineReason : '',
    guest.invitationCount,
    guest.firstInvitedOn ? formatWhen(guest.firstInvitedOn, timezone) : '',
    guest.emailCount,
    guest.reminderCount,
    guest.emailFailures,
    guest.badgeCount,
    guest.table,
    guest.seat,
    guest.checkInCount,
    guest.firstCheckInOn ? formatWhen(guest.firstCheckInOn, timezone) : '',
    guest.seatedOn ? formatWhen(guest.seatedOn, timezone) : '',
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}
