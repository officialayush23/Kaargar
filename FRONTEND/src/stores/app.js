import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAppStore = create(
  persist(
    (set) => ({
      mode: 'instant', // 'instant' | 'discovery'
      selectedArea: 'Baner',
      notifCount: 0,

      setMode: (mode) => set({ mode }),
      setArea: (area) => set({ selectedArea: area }),
      setNotifCount: (n) => set({ notifCount: n }),
      incrementNotif: () => set((s) => ({ notifCount: s.notifCount + 1 })),
      clearNotif: () => set({ notifCount: 0 }),
    }),
    {
      name: 'kaargar-app',
      partialize: (s) => ({ mode: s.mode, selectedArea: s.selectedArea }),
    }
  )
)
