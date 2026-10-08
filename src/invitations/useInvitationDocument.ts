import grapesjs, { type Editor } from 'grapesjs'
import { useEffect, useRef } from 'react'

export function useInvitationDocument(tableHtml: string) {
  const editorRef = useRef<Editor | null>(null)

  useEffect(() => {
    const editor = grapesjs.init({
      headless: true,
      storageManager: false,
      noticeOnUnload: false,
    })
    editorRef.current = editor
    return () => {
      editor.destroy()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.setComponents(tableHtml)
  }, [tableHtml])
}
