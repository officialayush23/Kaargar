import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || '/v1'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Inject JWT token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('kaargar_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('kaargar_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)
