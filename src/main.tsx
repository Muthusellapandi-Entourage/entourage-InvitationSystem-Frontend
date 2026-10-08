import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import '@fontsource/geist-sans/400.css'
import '@fontsource/geist-sans/500.css'
import '@fontsource/geist-sans/600.css'
import '@/index.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element was not found.')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
