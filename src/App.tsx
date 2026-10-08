import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
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
          boxShadow: 'var(--shadow)',
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
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          <AppToaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
