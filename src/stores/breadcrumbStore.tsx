import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type BreadcrumbItem = {
  label: string
  to?: string
}

type BreadcrumbContextValue = {
  items: BreadcrumbItem[]
  setItems: (items: BreadcrumbItem[]) => void
}

const defaultItems: BreadcrumbItem[] = [{ label: 'Dashboard' }]

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null)

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<BreadcrumbItem[]>(defaultItems)
  const value = useMemo(() => ({ items, setItems }), [items])
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>
}

export function useBreadcrumbs() {
  const context = useContext(BreadcrumbContext)
  if (!context) {
    throw new Error('useBreadcrumbs must be used within BreadcrumbProvider')
  }
  return context
}

export function usePageBreadcrumbs(items: BreadcrumbItem[]) {
  const { setItems } = useBreadcrumbs()
  const serialized = JSON.stringify(items)

  useEffect(() => {
    setItems(JSON.parse(serialized) as BreadcrumbItem[])
    return () => setItems(defaultItems)
  }, [serialized, setItems])
}
