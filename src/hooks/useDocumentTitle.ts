import { useEffect } from 'react'

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title === 'Entourage' ? title : `${title} · Entourage`
  }, [title])
}
