export type GuestTypeOption = {
  id: string
  name: string
}

export function GuestTypeDesignSelect({
  value,
  types,
  onChange,
}: {
  value: string
  types: GuestTypeOption[]
  onChange: (guestTypeId: string) => void
}) {
  return (
    <label className="flex shrink-0 items-center gap-2 text-sm">
      <span className="shrink-0 text-muted">Guest type</span>
      <select
        aria-label="Guest type design to load"
        className="h-9 max-w-52 rounded-md border border-border bg-surface px-2 text-sm text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Event template</option>
        {types.map((type) => (
          <option key={type.id} value={type.id}>
            {type.name}
          </option>
        ))}
      </select>
    </label>
  )
}
