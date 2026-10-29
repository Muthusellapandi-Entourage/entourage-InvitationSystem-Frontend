import { createContext, useCallback, useContext, useState } from 'react'

/** Per-person designer preferences, remembered in this browser. */
export type DesignerSettings = {
  /** Show exact position, size and the finer options. */
  advanced: boolean
  snap: boolean
  grid: boolean
  rulers: boolean
}

const KEY = 'entourage.designer.settings'
const defaults: DesignerSettings = { advanced: false, snap: true, grid: false, rulers: true }

function read(): DesignerSettings {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DesignerSettings>
    return { ...defaults, ...value }
  } catch {
    return defaults
  }
}

export function useDesignerSettingsState() {
  const [settings, setSettings] = useState<DesignerSettings>(read)
  const update = useCallback((patch: Partial<DesignerSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Not remembered; fine.
      }
      return next
    })
  }, [])
  return { settings, update }
}

export const DesignerSettingsContext = createContext<ReturnType<typeof useDesignerSettingsState> | null>(null)

/** Designer preferences from the surrounding DesignerShell (defaults outside one). */
export function useDesignerSettings() {
  return useContext(DesignerSettingsContext) ?? { settings: defaults, update: () => undefined }
}
