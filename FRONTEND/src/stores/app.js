import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAppStore = create(
  persist(
    (set) => ({
      mode: 'instant', // 'instant' | 'discovery'
      selectedArea: 'Baner',
      notifCount: 0,

      // Location state
      currentLocation: null,   // { lat, lon, address, label }
      savedAddresses: [],       // [{ id, label, address, lat, lon, type }]
      activeAddressId: null,

      setMode: (mode) => set({ mode }),
      setArea: (area) => set({ selectedArea: area }),
      setNotifCount: (n) => set({ notifCount: n }),
      incrementNotif: () => set((s) => ({ notifCount: s.notifCount + 1 })),
      clearNotif: () => set({ notifCount: 0 }),

      setCurrentLocation: (loc) => set({ currentLocation: loc }),

      saveAddress: (addr) =>
        set((s) => ({
          savedAddresses: [
            ...s.savedAddresses.filter((a) => a.id !== addr.id),
            addr,
          ],
        })),

      removeAddress: (id) =>
        set((s) => ({
          savedAddresses: s.savedAddresses.filter((a) => a.id !== id),
          activeAddressId: s.activeAddressId === id ? null : s.activeAddressId,
        })),

      setActiveAddress: (id) => set({ activeAddressId: id }),
    }),
    {
      name: 'kaargar-app',
      partialize: (s) => ({
        mode: s.mode,
        selectedArea: s.selectedArea,
        savedAddresses: s.savedAddresses,
        activeAddressId: s.activeAddressId,
      }),
    }
  )
)
