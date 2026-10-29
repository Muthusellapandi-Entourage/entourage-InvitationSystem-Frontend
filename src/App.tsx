import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppRoutes } from '@/routes/router'
import { AuthProvider } from '@/stores/authStore'
import { ThemeProvider, useTheme } from '@/stores/themeStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
})

/**
 * A data router (instead of <BrowserRouter>) so pages can block navigation with useBlocker,
 * e.g. the seating plan asking to save before you leave. All routes still live in <AppRoutes>.
 */
const router = createBrowserRouter([{ path: '*', element: <AppRoutes /> }])

function AppToaster() {
  const { resolved } = useTheme()
  return (
    <Toaster
      position="bottom-right"
      theme={resolved}
      closeButton
      toastOptions={{
        duration: 3500,
        style: {
          background: 'var(--surface)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          boxShadow: 'none',
          borderRadius: '6px',
        },
      }}
    />
  )
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <AppToaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
