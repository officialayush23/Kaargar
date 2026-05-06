/**
 * Auth store — syncs with Supabase session.
 *
 * Token lifecycle:
 *  - Supabase auto-refreshes the JWT before expiry.
 *  - App.jsx's SupabaseAuthSync component listens to onAuthStateChange
 *    and keeps 'kaargar_token' + this store in sync.
 *  - api.js reads 'kaargar_token' from localStorage on every request.
 *
 * Single source of truth for: is the user logged in? who are they?
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      /**
       * Called by SupabaseAuthSync whenever Supabase fires onAuthStateChange.
       * Keeps localStorage token in sync with Supabase's auto-refreshed JWT.
       */
      setSession: (session) => {
        const token = session?.access_token || null
        if (token) localStorage.setItem('kaargar_token', token)
        else localStorage.removeItem('kaargar_token')
        set({ token, isAuthenticated: !!token })
      },

      /** Set the DB user record (from /auth/provision or /auth/me). */
      setUser: (user) => set((s) => ({
        user,
        isAuthenticated: !!(s.token || user),
      })),

      /** Merge partial updates into the current user record. */
      updateUser: (updates) => set((s) => ({
        user: s.user ? { ...s.user, ...updates } : updates,
      })),

      /**
       * Sign out — clears store + localStorage.
       * Caller must also call supabase.auth.signOut() to invalidate the session.
       */
      logout: () => {
        localStorage.removeItem('kaargar_token')
        set({ token: null, user: null, isAuthenticated: false })
      },

      isWorker: () => get().user?.role === 'worker',
      isAdmin:  () => get().user?.role === 'admin',
      isUser:   () => get().user?.role === 'user',
    }),
    {
      name: 'kaargar-auth',
      partialize: (s) => ({
        token: s.token,
        user: s.user,
        isAuthenticated: s.isAuthenticated,
      }),
    }
  )
)
