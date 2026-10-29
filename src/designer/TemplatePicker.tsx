import { Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'

export type DesignTemplate<T> = {
  id: string
  name: string
  description: string
  /** Builds the design (may copy brand images first). */
  build: () => T | Promise<T>
  /** Small preview of the result. */
  preview: ReactNode
}

/** "Start from a template": ready layouts filled with the event's brand kit. */
export function TemplatePicker<T>({
  open,
  onClose,
  templates,
  onPick,
  note,
}: {
  open: boolean
  onClose: () => void
  templates: DesignTemplate<T>[]
  onPick: (design: T) => void
  note?: string
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(template: DesignTemplate<T>) {
    setBusy(template.id)
    setError(null)
    try {
      onPick(await template.build())
      onClose()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The template could not be used.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="Start from a template"
      description={note ?? 'Uses the event’s brand kit: logo, colours and fonts. You can change everything afterwards. Undo brings back your current design.'}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            disabled={busy !== null}
            onClick={() => void choose(template)}
            className="relative flex flex-col overflow-hidden rounded-md border border-border text-left hover:border-accent disabled:opacity-60"
          >
            <span className="flex h-52 items-center justify-center overflow-hidden bg-hover/50 p-3">{template.preview}</span>
            <span className="border-t border-border px-3 py-2">
              <span className="block text-sm font-medium">{template.name}</span>
              <span className="block text-xs text-muted">{template.description}</span>
            </span>
            {busy === template.id ? (
              <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Modal>
  )
}
