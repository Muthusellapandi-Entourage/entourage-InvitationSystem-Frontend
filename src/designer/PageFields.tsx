import { Image as ImageIcon, Loader2, Upload } from 'lucide-react'
import { apiBaseUrl } from '@/api/client'
import { BrandImageButton } from '@/components/brand/BrandImageButton'
import { AlphaColorInput } from '@/components/ui/AlphaColorInput'
import { cn } from '@/lib/cn'

/* Small form fields shared by the page designers (self-registration, self check-in screen). */

const assetOrigin = apiBaseUrl || window.location.origin

export function TextField({ label, value, onChange, area, placeholder }: { label: string; value: string; onChange: (value: string) => void; area?: boolean; placeholder?: string }) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="font-medium text-muted">{label}</span>
      {area ? (
        <textarea rows={3} placeholder={placeholder} className="resize-y rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground" value={value} onChange={(change) => onChange(change.target.value)} />
      ) : (
        <input placeholder={placeholder} className="h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground" value={value} onChange={(change) => onChange(change.target.value)} />
      )}
    </label>
  )
}

export function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid min-w-0 gap-1 text-xs">
      <span className="truncate font-medium text-muted">{label}</span>
      <AlphaColorInput label={label} value={value} onChange={onChange} />
    </div>
  )
}

export function ImageField({
  label,
  assetId,
  busy,
  contain,
  onFile,
  onClear,
}: {
  label: string
  assetId: string | null
  busy: boolean
  contain?: boolean
  onFile: (file: File) => void
  onClear: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn('flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border', contain ? 'bg-background' : 'bg-hover')}>
        {assetId ? (
          <img src={`${assetOrigin}/api/public/assets/${assetId}`} alt="" className={cn('size-full', contain ? 'object-contain p-1' : 'object-cover')} />
        ) : (
          <ImageIcon className="size-5 text-muted" aria-hidden="true" />
        )}
      </div>
      <div className="grid min-w-0 gap-1.5">
        <span className="text-xs font-medium text-muted">{label}</span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-hover">
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Upload className="size-3.5" aria-hidden="true" />}
            {assetId ? 'Replace' : 'Upload'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(change) => {
                const file = change.target.files?.[0]
                change.target.value = ''
                if (file) onFile(file)
              }}
            />
          </label>
          <BrandImageButton compact disabled={busy} onFile={onFile} />
          {assetId ? (
            <button type="button" className="text-xs font-medium text-danger hover:underline" onClick={onClear}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Segmented choice used in the preview toolbars. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="flex rounded-md border border-border p-0.5" role="group" aria-label={label}>
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          className={cn('h-7 rounded-sm px-2.5 text-xs font-medium', value === option ? 'bg-accent-soft text-accent' : 'text-muted hover:text-foreground')}
          onClick={() => onChange(option)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
