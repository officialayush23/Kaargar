import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      // Expects an object containing the payload from /verify-otp
      setAuth: ({ access_token, refresh_token, user }) => {
        localStorage.setItem('kaargar_token', access_token)
        if (refresh_token) localStorage.setItem('kaargar_refresh', refresh_token)
        set({ token: access_token, refreshToken: refresh_token, user, isAuthenticated: true })
      },

      updateUser: (updates) => set((s) => ({ user: { ...s.user, ...updates } })),

      logout: async () => {
        try { await api.post('/auth/logout') } catch (e) {} // Tell backend to invalidate
        localStorage.removeItem('kaargar_token')
        localStorage.removeItem('kaargar_refresh')
        set({ token: null, refreshToken: null, user: null, isAuthenticated: false })
      },

      refresh: async () => {
        const rt = get().refreshToken || localStorage.getItem('kaargar_refresh')
        if (!rt) throw new Error("No refresh token available")
        
        const { data } = await api.post('/auth/refresh', { refresh_token: rt })
        localStorage.setItem('kaargar_token', data.access_token)
        set({ token: data.access_token, user: data.user })
        return data.access_token
      },

      isWorker: () => {
        const user = get().user
        return user?.role === 'worker' || user?.workerProfile != null
      },

      isAdmin: () => get().user?.role === 'admin',
    }),
    {
      name: 'kaargar-auth',
      partialize: (s) => ({ token: s.token, refreshToken: s.refreshToken, user: s.user, isAuthenticated: s.isAuthenticated }),
    }
  )
)