import { Loader2, Palette } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { BrandItem } from '@/api/brandApi'
import { apiBaseUrl } from '@/api/client'
import { useBrandKit } from '@/brand/useBrandKit'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'

/** Downloads a brand image as a File, so any existing upload handler can take it. */
export async function brandItemFile(item: BrandItem): Promise<File> {
  let response: Response
  try {
    // Skip the browser cache: the thumbnail <img> may have cached a copy scripts are not allowed to read.
    response = await fetch(`${apiBaseUrl}${item.url}`, { cache: 'no-store', mode: 'cors', credentials: 'omit' })
  } catch {
    throw new Error('The brand image could not be loaded. Check the connection and try again.')
  }
  if (!response.ok) throw new Error('The brand image could not be loaded.')
  const blob = await response.blob()
  const extension = blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg'
  const name = /\.(png|jpe?g|webp)$/i.test(item.name) ? item.name : `${item.name}${extension}`
  return new File([blob], name, { type: blob.type || 'image/png' })
}

/**
 * "Brand kit" button for image fields: opens the event's logos, backgrounds and custom image groups.
 * Picking one hands it on as a file (`onFile`), or as the brand item (`onPick`) when the caller can use it directly.
 */
export function BrandImageButton({
  onFile,
  onPick,
  label = 'Brand kit',
  className,
  compact = false,
  disabled,
}: {
  onFile?: (file: File) => void | Promise<void>
  onPick?: (item: BrandItem) => void | Promise<void>
  label?: string
  className?: string
  /** Icon-only button for tight toolbars. */
  compact?: boolean
  disabled?: boolean
}) {
  const { kit, scope } = useBrandKit()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const groups = kit.groups.filter((group) => group.items.length > 0)

  async function choose(item: BrandItem) {
    setBusy(item.assetId)
    setError(null)
    try {
      if (onPick) await onPick(item)
      else if (onFile) await onFile(await brandItemFile(item))
      setOpen(false)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The brand image could not be used.')
    } finally {
      setBusy(null)
    }
  }

  if (!scope) return null
  const kitLink = scope.kind === 'event' ? `/events/${scope.id}/brand` : null

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title="Use an image from the brand kit"
        aria-label={compact ? 'Use an image from the brand kit' : undefined}
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-surface text-xs font-medium hover:bg-hover disabled:opacity-50',
          compact ? 'size-9' : 'h-9 px-2.5',
          className,
        )}
      >
        <Palette className="size-3.5 text-accent" aria-hidden="true" />
        {compact ? null : label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} width="lg" title="Brand kit" description="Pick an image from the event's brand kit.">
        {groups.length === 0 ? (
          <p className="text-sm text-muted">
            No brand images yet.{' '}
            {kitLink ? (
              <Link to={kitLink} className="text-accent underline-offset-4 hover:underline">
                Add logos and backgrounds to the brand kit
              </Link>
            ) : (
              'Add them to the event’s brand kit.'
            )}
          </p>
        ) : (
          <div className="grid gap-5">
            {groups.map((group) => (
              <section key={group.id}>
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted">{group.name}</h3>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {group.items.map((item) => (
                    <button
                      key={item.assetId}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void choose(item)}
                      className="group relative flex flex-col overflow-hidden rounded-md border border-border text-left hover:border-accent disabled:opacity-60"
                    >
                      <span
                        className="flex h-24 items-center justify-center p-2"
                        style={{ background: 'repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 50% / 12px 12px' }}
                      >
                        <img src={`${apiBaseUrl}${item.url}`} alt="" crossOrigin="anonymous" className="max-h-full max-w-full object-contain" loading="lazy" />
                      </span>
                      <span className="truncate border-t border-border px-2 py-1 text-xs">{item.name}</span>
                      {busy === item.assetId ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
                          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </Modal>
    </>
  )
}
