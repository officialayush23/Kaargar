import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import './globals.css'
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
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
        <Toaster
          position="top-center"
          toastOptions={{
            className: 'kaargar-toast',
            style: {
              background: savedTheme === 'light'
                ? 'rgba(255,255,255,0.96)'
                : 'rgba(13,17,23,0.95)',
              border: savedTheme === 'light'
                ? '1px solid rgba(0,0,0,0.1)'
                : '1px solid rgba(255,255,255,0.1)',
              color: savedTheme === 'light' ? '#111827' : '#F0F4FF',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
