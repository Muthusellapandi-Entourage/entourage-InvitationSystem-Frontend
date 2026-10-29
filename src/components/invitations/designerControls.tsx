import { ChevronDown, Info, Lightbulb, Trash2, Upload } from 'lucide-react'
import { useId, useRef, type ChangeEvent, type ReactNode } from 'react'
import { apiBaseUrl } from '@/api/client'
import { AlphaColorInput } from '@/components/ui/AlphaColorInput'
import { BrandImageButton } from '@/components/brand/BrandImageButton'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

export function FieldLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="text-sm font-medium">
      {children}
    </p>
  )
}

export function ChoiceCards<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = options.length,
}: {
  label: string
  value: T | null
  options: { value: T; label: string; description?: string; preview?: ReactNode; disabled?: boolean; title?: string }[]
  onChange: (value: T) => void
  columns?: number
}) {
  const labelId = useId()
  return (
    <div>
      <FieldLabel id={labelId}>{label}</FieldLabel>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="mt-2 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const checked = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={option.disabled}
              title={option.title}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-md border px-2 py-3 text-center transition-colors duration-150',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                checked ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-hover',
                option.disabled && 'cursor-not-allowed opacity-50 hover:bg-surface',
              )}
            >
              {option.preview}
              <span className="text-sm font-medium">{option.label}</span>
              {option.description ? <span className="text-xs text-muted">{option.description}</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function RadioRows<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string; description: string }[]
  onChange: (value: T) => void
}) {
  const labelId = useId()
  return (
    <div>
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors duration-150',
                checked ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-hover',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                  checked ? 'border-accent' : 'border-muted',
                )}
              >
                {checked ? <span className="size-2 rounded-full bg-accent" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-muted">{option.description}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
}: {
  label: string
  value: T | null
  options: { value: T; label: string; icon?: ReactNode; title?: string }[]
  onChange: (value: T) => void
  hideLabel?: boolean
}) {
  const labelId = useId()
  return (
    <div>
      <FieldLabel id={labelId}>
        <span className={hideLabel ? 'sr-only' : undefined}>{label}</span>
      </FieldLabel>
      <div role="group" aria-labelledby={labelId} className={cn('flex gap-2', hideLabel ? '' : 'mt-2')}>
        {options.map((option) => {
          const checked = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={checked}
              aria-label={option.title ?? option.label}
              title={option.title ?? option.label}
              className={cn(
                'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border px-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                checked
                  ? 'border-accent bg-accent font-medium text-accent-foreground'
                  : 'border-border bg-surface text-foreground hover:bg-hover',
              )}
              onClick={() => onChange(option.value)}
            >
              {option.icon ? <span className="shrink-0 [&>svg]:size-4" aria-hidden="true">{option.icon}</span> : null}
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Switch({
  checked,
  label,
  description,
  hideLabel = false,
  onChange,
}: {
  checked: boolean
  label: string
  description?: string
  hideLabel?: boolean
  onChange: (value: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-150',
          checked ? 'bg-accent' : 'bg-border',
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-surface shadow-sm transition-[left] duration-150',
            checked ? 'left-4' : 'left-0.5',
          )}
        />
      </button>
      {hideLabel ? null : (
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          <span className="block text-sm font-medium">{label}</span>
          {description ? <span className="block text-xs text-muted">{description}</span> : null}
        </label>
      )}
    </div>
  )
}

export function Disclosure({
  icon,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  icon?: ReactNode
  title: string
  summary?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const contentId = useId()
  return (
    <div className="rounded-md border border-border bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={onToggle}
        className="flex h-11 w-full items-center gap-3 px-3 text-left"
      >
        {icon ? <span className="text-muted">{icon}</span> : null}
        <span className="min-w-0 flex-1 text-sm font-medium">{title}</span>
        {summary ? <span className="truncate text-xs text-muted">{summary}</span> : null}
        <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform duration-150', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open ? (
        <div id={contentId} className="grid gap-4 border-t border-border px-3 py-4">
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function TipBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md bg-accent-soft px-3 py-2.5 text-sm text-foreground">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
      <p>
        <span className="font-medium">Tip:</span> {children}
      </p>
    </div>
  )
}

export function InfoNote({ children, tone = 'muted', icon }: { children: ReactNode; tone?: 'muted' | 'warning'; icon?: ReactNode }) {
  return (
    <div
      role={tone === 'warning' ? 'status' : undefined}
      className={cn('flex items-start gap-2 text-sm', tone === 'warning' ? 'rounded-md px-3 py-2.5 text-foreground' : 'text-muted')}
      style={tone === 'warning' ? { background: 'color-mix(in srgb, #d9a200 16%, var(--surface))' } : undefined}
    >
      <span className="shrink-0" style={tone === 'warning' ? { color: '#b07d00' } : undefined}>
        {icon ?? <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      </span>
      <span>{children}</span>
    </div>
  )
}

export function UploadCard({
  title,
  caption,
  hint,
  assetId,
  uploading,
  onUpload,
  onRemove,
}: {
  title: string
  caption?: string
  hint?: string
  assetId: string | null
  uploading: boolean
  onUpload: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onUpload(file)
  }

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="text-sm font-medium">{title}</p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/webp,image/png,image/jpeg"
        className="sr-only"
        onChange={choose}
      />
      {assetId ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <img
              src={`${apiBaseUrl}/api/public/assets/${assetId}`}
              alt=""
              className="h-20 w-full rounded-sm border border-border bg-background object-contain"
            />
            {caption ? <p className="mt-1.5 text-xs text-muted">{caption}</p> : null}
          </div>
          <Button variant="secondary" className="border-accent text-accent hover:bg-accent-soft" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? 'Uploading…' : 'Change image'}
          </Button>
          <BrandImageButton compact disabled={uploading} onFile={onUpload} />
          <button
            type="button"
            aria-label={`Remove ${title.toLowerCase()}`}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted hover:bg-hover hover:text-foreground disabled:opacity-50"
            disabled={uploading}
            onClick={onRemove}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="mt-3 flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-background text-sm text-muted hover:border-accent hover:text-foreground"
        >
          <Upload className="size-5" aria-hidden="true" />
          {uploading ? 'Uploading…' : 'Upload image'}
          <span className="text-xs">WEBP, PNG, or JPG</span>
        </button>
      )}
      {!assetId ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
          or <BrandImageButton disabled={uploading} onFile={onUpload} label="Choose from brand kit" />
        </div>
      ) : null}
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

export function ColorSwatchField({
  label,
  value,
  onChange,
  none = false,
  noneLabel = 'None',
  onNone,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  none?: boolean
  noneLabel?: string
  onNone?: () => void
}) {
  const id = useId()
  // "None" / "Mixed" (no single colour) uses the same picker, showing the label until a colour is chosen.
  if (none) {
    return (
      <div className="grid gap-1.5">
        <span id={id} className="text-sm font-medium">
          {label}
        </span>
        <AlphaColorInput label={label} value={null} emptyLabel={noneLabel} onChange={onChange} />
      </div>
    )
  }
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {onNone ? (
          <button type="button" className="text-xs whitespace-nowrap text-muted hover:text-foreground" onClick={onNone}>
            {noneLabel}
          </button>
        ) : null}
      </div>
      <AlphaColorInput label={label} value={value} onChange={onChange} />
    </div>
  )
}
