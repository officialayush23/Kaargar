import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const BASE_URL = import.meta.env.VITE_API_URL || '/v1'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Inject JWT token from Zustand/localStorage
api.interceptors.request.use((config) => {
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

    if (err.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/refresh') {
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