/**
 * Axios instance for the Kaargar backend API.
 *
 * Token: read from localStorage 'kaargar_token' on every request.
 * That key is kept up to date by App.jsx's SupabaseAuthSync component
 * which listens to supabase.auth.onAuthStateChange — so Supabase's
 * automatic JWT refresh is transparent to all callers here.
 *
 * 401 handling: dispatch 'kaargar:unauthorized' -> App.jsx navigates to /login.
 * No manual refresh needed — Supabase handles token expiry automatically.
 */
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

function normalizeApiBaseUrl(rawUrl) {
  const url = (rawUrl || '').trim().replace(/\/+$/, '')
  if (!url) return '/v1'
  if (url === '/v1' || url.endsWith('/v1')) return url
  return `${url}/v1`
}

const BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL)

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach current JWT to every request
api.interceptors.request.use((config) => {
  if (config.url && typeof config.url === 'string' && !/^https?:\/\//i.test(config.url) && config.url.startsWith('/')) {
    config.url = config.url.replace(/^\/+/, '')
  }
  const token = localStorage.getItem('kaargar_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401, soft-logout and navigate to login — no manual refresh
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      const isAdminPath = window.location.pathname.startsWith('/admin')
      const isLoginPath = window.location.pathname.startsWith('/login') || window.location.pathname.startsWith('/admin/login')
      if (!isLoginPath) {
        window.dispatchEvent(new CustomEvent('kaargar:unauthorized', {
          detail: { adminPath: isAdminPath }
        }))
      }
    }
    return Promise.reject(err)
  }
)
