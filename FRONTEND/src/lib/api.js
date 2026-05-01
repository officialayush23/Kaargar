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

// Fix Axios URL joining: convert absolute paths to relative so baseURL is preserved
api.interceptors.request.use((config) => {
  // If URL is not already absolute and starts with /, remove leading slashes
  // This ensures '/jobs' becomes 'jobs' and joins with baseURL correctly
  if (config.url && typeof config.url === 'string' && !/^https?:\/\//i.test(config.url) && config.url.startsWith('/')) {
    config.url = config.url.replace(/^\/+/, '')
  }
  
  const token = localStorage.getItem('kaargar_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Queue for holding requests while token is refreshing
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error)
    else prom.resolve(token)
  })
  failedQueue = []
}

// Handle 401 globally with Refresh Token rotation
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config

    if (err.response?.status === 401 && !originalRequest._retry && originalRequest.url !== 'auth/refresh') {
      if (isRefreshing) {
        return new Promise(function(resolve, reject) {
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
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)
