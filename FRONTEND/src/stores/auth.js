import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '@/lib/api'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      setAuth: (token, user) => {
        localStorage.setItem('kaargar_token', token)
        set({ token, user, isAuthenticated: true })
      },

      updateUser: (updates) => set((s) => ({ user: { ...s.user, ...updates } })),

      logout: () => {
        localStorage.removeItem('kaargar_token')
        set({ token: null, user: null, isAuthenticated: false })
      },

      isWorker: () => {
        const user = get().user
        return user?.role === 'worker' || user?.workerProfile != null
      },

      isAdmin: () => get().user?.role === 'admin',
    }),
    {
      name: 'kaargar-auth',
      partialize: (s) => ({ token: s.token, user: s.user, isAuthenticated: s.isAuthenticated }),
    }
  )
)
