import { ArrowLeft, Grid3x3, Loader2, Magnet, Maximize, Minus, Plus, Redo2, Ruler, Save, SlidersHorizontal, Undo2 } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import { DesignerSettingsContext, useDesignerSettings, useDesignerSettingsState, type DesignerSettings } from '@/designer/settings'
import { zoomLimits } from '@/designer/Stage'

/* The frame every designer shares: same top bar, same panels, same keys. */

type LeaveGuard = (to: string) => void
const LeaveContext = createContext<LeaveGuard | null>(null)

/** Navigates away from the designer, asking about unsaved changes first. */
export function useDesignerLeave() {
  const guard = useContext(LeaveContext)
  const navigate = useNavigate()
  return guard ?? ((to: string) => navigate(to))
}

export type DesignerKeys = {
  onDelete?: () => void
  onDuplicate?: () => void
  /** Arrow keys; `big` with Shift. */
  onNudge?: (dx: number, dy: number, big: boolean) => void
  onEscape?: () => void
}

export function DesignerShell({
  title,
  subtitle,
  backLabel,
  backTo,
  switcher,
  history,
  zoom,
  actions,
  save,
  left,
  right,
  keys,
  canvasTools = true,
  children,
}: {
  /** False for page designers (forms, screens): hides snap / grid / ruler toggles. */
  canvasTools?: boolean
  title: string
  subtitle?: string
  backLabel: string
  backTo: string
  /** The "switch designer" control. */
  switcher?: ReactNode
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void }
  zoom: { value: number | 'fit'; fit: number; set: (zoom: number | 'fit') => void }
  /** Extra buttons in the top bar (Preview, Test print, Templates…). */
  actions?: ReactNode
  save: { dirty: boolean; saving: boolean; onSave: () => Promise<boolean> | boolean | void; label?: string }
  left: ReactNode
  right: ReactNode
  keys?: DesignerKeys
  children: ReactNode
}) {
  const settingsState = useDesignerSettingsState()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState<string | null>(null)
  const [savingToLeave, setSavingToLeave] = useState(false)

  const guard = useCallback<LeaveGuard>(
    (to) => {
      if (save.dirty) setLeaving(to)
      else navigate(to)
    },
    [save.dirty, navigate],
  )

  // Warn before closing the tab with unsaved work.
  useEffect(() => {
    if (!save.dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [save.dirty])

  // Keyboard: Ctrl+Z / Ctrl+Y / Ctrl+S everywhere; the rest when not typing.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'))
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (mod && key === 's') {
        event.preventDefault()
        if (save.dirty && !save.saving) void save.onSave()
        return
      }
      if (typing) return
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) history.redo()
        else history.undo()
        return
      }
      if (mod && key === 'y') {
        event.preventDefault()
        history.redo()
        return
      }
      if (mod && key === 'd' && keys?.onDuplicate) {
        event.preventDefault()
        keys.onDuplicate()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && keys?.onDelete) {
        event.preventDefault()
        keys.onDelete()
        return
      }
      if (event.key === 'Escape') {
        keys?.onEscape?.()
        return
      }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      const delta = arrows[event.key]
      if (delta && keys?.onNudge) {
        event.preventDefault()
        keys.onNudge(delta[0], delta[1], event.shiftKey)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const effective = zoom.value === 'fit' ? zoom.fit : zoom.value
  const setZoom = (next: number) => zoom.set(Math.max(zoomLimits().min, Math.min(zoomLimits().max, Math.round(next * 100) / 100)))

  return (
    <DesignerSettingsContext.Provider value={settingsState}>
      <LeaveContext.Provider value={guard}>
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-hover hover:text-foreground"
              onClick={() => guard(backTo)}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span className="hidden lg:inline">{backLabel}</span>
            </button>
            <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
            <div className="min-w-0 shrink">
              {switcher ?? <h1 className="truncate text-sm font-semibold">{title}</h1>}
              {subtitle ? <p className="truncate text-[11px] text-muted">{subtitle}</p> : null}
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <ToolButton label="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={history.undo}>
                <Undo2 className="size-4" />
              </ToolButton>
              <ToolButton label="Redo (Ctrl+Y)" disabled={!history.canRedo} onClick={history.redo}>
                <Redo2 className="size-4" />
              </ToolButton>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
              <ToolButton label="Zoom out" onClick={() => setZoom(effective / 1.2)}>
                <Minus className="size-4" />
              </ToolButton>
              <button
                type="button"
                className="h-8 min-w-12 rounded-md px-1.5 text-xs tabular-nums text-muted hover:bg-hover"
                title="Fit to screen"
                onClick={() => zoom.set('fit')}
              >
                {Math.round(effective * 100)}%
              </button>
              <ToolButton label="Zoom in" onClick={() => setZoom(effective * 1.2)}>
                <Plus className="size-4" />
              </ToolButton>
              <ToolButton label="Fit to screen" onClick={() => zoom.set('fit')}>
                <Maximize className="size-4" />
              </ToolButton>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
              <SettingsToggles canvasTools={canvasTools} />
            </div>

            <div className="flex shrink-0 items-center gap-2 pl-1">
              {actions}
              <Button className="h-9" disabled={!save.dirty || save.saving} onClick={() => void save.onSave()}>
                {save.saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
                {save.saving ? 'Saving…' : save.dirty ? (save.label ?? 'Save') : 'Saved'}
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <aside className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-border bg-surface">{left}</aside>
            <main className="flex min-w-0 flex-1 flex-col">{children}</main>
            <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-surface p-4">{right}</aside>
          </div>
        </div>

        <Modal
          open={leaving !== null}
          onClose={() => setLeaving(null)}
          width="sm"
          title="Save your changes?"
          description="This design has changes that are not saved yet."
        >
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setLeaving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const to = leaving
                setLeaving(null)
                if (to) navigate(to)
              }}
            >
              Don’t save
            </Button>
            <Button
              disabled={savingToLeave}
              onClick={async () => {
                const to = leaving
                setSavingToLeave(true)
                try {
                  const ok = await save.onSave()
                  if (ok !== false && to) {
                    setLeaving(null)
                    navigate(to)
                  }
                } finally {
                  setSavingToLeave(false)
                }
              }}
            >
              {savingToLeave ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Save and continue
            </Button>
          </div>
        </Modal>
      </LeaveContext.Provider>
    </DesignerSettingsContext.Provider>
  )
}

function SettingsToggles({ canvasTools }: { canvasTools: boolean }) {
  const { settings, update } = useDesignerSettings()
  const items = [
    { key: 'snap', label: 'Snap to edges, centres, grid and guides (hold Alt to skip)', icon: Magnet, canvas: true },
    { key: 'grid', label: 'Grid (runs out from the centre of the canvas)', icon: Grid3x3, canvas: true },
    { key: 'rulers', label: 'Rulers', icon: Ruler, canvas: true },
    { key: 'advanced', label: 'Advanced options (exact sizes, positions and more)', icon: SlidersHorizontal, canvas: false },
  ] as const
  return (
    <>
      {items
        .filter((item) => canvasTools || !item.canvas)
        .map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={settings[key]}
          onClick={() => update({ [key]: !settings[key] } as Partial<DesignerSettings>)}
          className={cn('flex size-8 items-center justify-center rounded-md', settings[key] ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-foreground')}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </>
  )
}

function ToolButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/* ---------------- side panel pieces (same look in every designer) ---------------- */

/** Tabs at the top of the left panel: Add · Layers (· more). */
export function PanelTabs({ tabs }: { tabs: { key: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.key)
  const current = tabs.find((tab) => tab.key === active) ?? tabs[0]
  return (
    <>
      <div className="flex shrink-0 border-b border-border" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === current?.key}
            onClick={() => setActive(tab.key)}
            className={cn(
              '-mb-px flex-1 border-b-2 px-3 py-2.5 text-xs font-medium',
              tab.key === current?.key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{current?.content}</div>
    </>
  )
}

export function PanelSection({ title, hint, children, actions }: { title: string; hint?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">{title}</h2>
        {actions}
      </div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** Shown only in Advanced mode. */
export function Advanced({ children }: { children: ReactNode }) {
  const { settings } = useDesignerSettings()
  return settings.advanced ? <>{children}</> : null
}

/** A numeric field with its unit, e.g. "X (mm)". Keeps what is typed until it is a number. */
export function UnitInput({
  label,
  unit,
  value,
  onChange,
  disabled,
  step = 1,
}: {
  label: string
  unit?: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  step?: number
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = Math.round(value * 10) / 10
  return (
    <label className="grid gap-1 text-xs">
      <span className="font-medium text-muted">
        {label}
        {unit ? ` (${unit})` : ''}
      </span>
      <input
        inputMode="decimal"
        disabled={disabled}
        step={step}
        className="h-9 rounded-md border border-border bg-background px-2.5 text-sm tabular-nums disabled:opacity-50"
        value={draft ?? String(shown)}
        onChange={(change) => {
          setDraft(change.target.value)
          const next = Number(change.target.value)
          if (change.target.value.trim() !== '' && Number.isFinite(next)) onChange(next)
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}

/** Hook for the zoom state shared by the top bar and the stage. */
export function useZoom() {
  const [value, set] = useState<number | 'fit'>('fit')
  const [fit, setFit] = useState(1)
  return { value, set, fit, setFit }
}
