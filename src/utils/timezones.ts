const PINNED = [
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Qatar',
  'Asia/Kuwait',
  'Asia/Bahrain',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
]

export function timezoneOptions() {
  const supported = Intl.supportedValuesOf('timeZone')
  const available = new Set(supported)
  const pinned = PINNED.filter((zone) => available.has(zone) || zone === 'UTC')
  const rest = supported.filter((zone) => !pinned.includes(zone)).sort((a, b) => a.localeCompare(b))
  return [...pinned, ...rest]
}
