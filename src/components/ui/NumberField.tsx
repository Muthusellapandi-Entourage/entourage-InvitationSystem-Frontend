import { useState, type KeyboardEvent } from 'react'
import { TextField } from '@/components/ui/TextField'

type NumberFieldProps = {
  label: string
  value: number | null
  min: number
  max: number
  /** When true an empty field commits `null` (for example "Auto"). */
  allowEmpty?: boolean
  placeholder?: string
  hint?: string
  disabled?: boolean
  className?: string
  onChange: (value: number | null) => void
}

const integer = /^-?\d+$/

function parse(raw: string) {
  const trimmed = raw.trim()
  return integer.test(trimmed) ? Number(trimmed) : null
}

/**
 * Integer input that keeps the exact text the user is typing. The design model
 * only receives values that are valid for this property; everything else is
 * resolved when the field is committed (blur or Enter).
 */
export function NumberField({
  label,
  value,
  min,
  max,
  allowEmpty = false,
  placeholder,
  hint,
  disabled,
  className,
  onChange,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft !== null
  const shown = editing ? draft : value == null ? '' : String(value)
  const parsed = editing ? parse(draft) : null
  const draftEmpty = editing && draft.trim() === ''
  const invalid = editing && !(draftEmpty && allowEmpty) && (parsed === null || parsed < min || parsed > max)

  function commit() {
    if (!editing) return
    const next = parse(draft)
    if (draft.trim() === '' && allowEmpty) onChange(null)
    else if (next !== null) onChange(Math.min(max, Math.max(min, next)))
    // Anything else (empty when not allowed, or not a number) restores the last valid value.
    setDraft(null)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(null)
    }
  }

  return (
    <TextField
      label={label}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      value={shown}
      hint={hint}
      error={invalid ? (draftEmpty ? 'Enter a number' : `Between ${min} and ${max}`) : undefined}
      onFocus={() => setDraft(value == null ? '' : String(value))}
      onChange={(event) => {
        const raw = event.target.value
        setDraft(raw)
        const next = parse(raw)
        if (next !== null && next >= min && next <= max) onChange(next)
        else if (raw.trim() === '' && allowEmpty) onChange(null)
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  )
}
