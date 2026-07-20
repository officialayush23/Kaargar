import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './globals.css'
import './i18n/index.js'   // initialise i18next before first render
import App from './App'

// Apply saved theme before first render (prevents flash)
const savedStore = JSON.parse(localStorage.getItem('kaargar-app') || '{}')
const savedTheme = savedStore?.state?.theme || 'dark'
document.documentElement.setAttribute('data-theme', savedTheme)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
      <Toaster
        position="top-center"
        expand
        gap={12}
        toastOptions={{
          className: 'kaargar-toast',
          style: {
            background: 'var(--elevated)',
            border: '1px solid var(--g-border)',
            color: 'var(--text-primary)',
          },
        }}
      />
    </BrowserRouter>
  </QueryClientProvider>
)
