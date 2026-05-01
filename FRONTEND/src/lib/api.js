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

// Attach token to every request
api.interceptors.request.use((config) => {
  if (config.url && typeof config.url === 'string' && !/^https?:\/\//i.test(config.url) && config.url.startsWith('/')) {
    config.url = config.url.replace(/^\/+/, '')
  }
  const token = localStorage.getItem('kaargar_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error)
    else prom.resolve(token)
  })
  failedQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config

    if (err.response?.status === 401 && !originalRequest._retry && originalRequest.url !== 'auth/refresh') {
      // Don't try to refresh if we have no refresh token — just soft-logout
      const rt = localStorage.getItem('kaargar_refresh')
      if (!rt) {
        useAuthStore.getState().logout()
        // Use React Router-compatible soft navigation — no full page reload
        if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/admin/login')) {
          window.dispatchEvent(new CustomEvent('kaargar:unauthorized'))
        }
        return Promise.reject(err)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(token => {
          originalRequest.headers['Authorization'] = 'Bearer ' + token
          return api(originalRequest)
        }).catch(err => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const newToken = await useAuthStore.getState().refresh()
        processQueue(null, newToken)
        originalRequest.headers['Authorization'] = 'Bearer ' + newToken
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        useAuthStore.getState().logout()
        // Soft navigation — zustand isAuthenticated→false triggers RequireAuth redirect
        if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/admin/login')) {
          window.dispatchEvent(new CustomEvent('kaargar:unauthorized'))
        }
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)
