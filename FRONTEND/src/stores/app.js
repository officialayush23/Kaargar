import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAppStore = create(
  persist(
    (set) => ({
      mode: 'instant', // 'instant' | 'discovery'
      selectedArea: 'Baner',
      notifCount: 0,
      theme: 'dark', // 'dark' | 'light'

      // Location state
      currentLocation: null,     // { lat, lon, address, label }
      locationFetchedAt: null,   // epoch ms — used to silently refresh a stale cache
      savedAddresses: [],        // [{ id, label, address, lat, lon, type }]
      activeAddressId: null,

      setMode: (mode) => set({ mode }),
      setArea: (area) => set({ selectedArea: area }),
      setNotifCount: (n) => set({ notifCount: n }),
      incrementNotif: () => set((s) => ({ notifCount: s.notifCount + 1 })),
      clearNotif: () => set({ notifCount: 0 }),

      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme)
        set({ theme })
      },

      toggleTheme: () =>
        set((s) => {
          const next = s.theme === 'dark' ? 'light' : 'dark'
          document.documentElement.setAttribute('data-theme', next)
          return { theme: next }
        }),

      setCurrentLocation: (loc) => set({ currentLocation: loc, locationFetchedAt: Date.now() }),

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
        theme: s.theme,
        selectedArea: s.selectedArea,
        savedAddresses: s.savedAddresses,
        activeAddressId: s.activeAddressId,
        // Persisted so the app doesn't re-prompt for / re-fetch GPS on every
        // page load and every page (NewJobPage, Discovery's "Nearest" sort,
        // SearchingPage's map, etc.) — fetched once (see AppLayout) and
        // reused until explicitly changed via AddressModal or until stale
        // (see LOCATION_MAX_AGE_MS in AppLayout).
        currentLocation: s.currentLocation,
        locationFetchedAt: s.locationFetchedAt,
      }),
    }
  )
)
