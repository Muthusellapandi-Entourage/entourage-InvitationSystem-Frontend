function parseDateOnly(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

export function formatTableDate(isoDate: string) {
  return parseDateOnly(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function formatLongDate(isoDate: string) {
  return parseDateOnly(isoDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateRange(start: string, end: string) {
  if (start.slice(0, 10) === end.slice(0, 10)) {
    return formatLongDate(start)
  }

  return `${formatLongDate(start)} – ${formatLongDate(end)}`
}

export function formatTimestamp(value: string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
