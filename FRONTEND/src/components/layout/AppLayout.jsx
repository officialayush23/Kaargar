import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Background } from '@/components/glass/Background'
import { MobileBottomNav } from '@/components/glass/GlassNavbar'
import { OnboardingWalkthrough, useOnboarding } from '@/components/kaargar/OnboardingWalkthrough'
import { PhonePrompt } from '@/components/kaargar/PhonePrompt'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useGeoLocation } from '@/hooks/useGeoLocation'

// Routes where the bottom nav should be hidden (full-screen experiences)
const HIDE_NAV_PATTERNS = [/^\/chat\/\w/]
const PHONE_PROMPT_DISMISSED_KEY = 'kaargar_phone_prompt_dismissed'
// How long a cached GPS fix is trusted before silently refreshing it in the
// background. Any page needing location (job creation, Discovery's
// "Nearest" sort, the searching map) reads currentLocation from the store
// instead of independently prompting/fetching GPS every time it mounts —
// this was the actual source of the "app feels slow" / repeated location
// permission prompts / disconnected map pin on the searching page.
const LOCATION_MAX_AGE_MS = 30 * 60 * 1000 // 30 min

export function AppLayout() {
  const [showOnboarding, dismissOnboarding] = useOnboarding()
  const { pathname } = useLocation()
  const hideNav = HIDE_NAV_PATTERNS.some(re => re.test(pathname))
  const { user } = useAuthStore()
  const { currentLocation, locationFetchedAt, setCurrentLocation } = useAppStore()
  const { getLocation } = useGeoLocation()

  // Fetch location once (at login / first load of the customer app) and
  // persist it — not on every page that happens to need it. A silent
  // background refresh kicks in once the cache is stale; this never blocks
  // the UI and never overrides a location the user explicitly picked via
  // AddressModal within the last 30 min.
  useEffect(() => {
    const stale = !locationFetchedAt || (Date.now() - locationFetchedAt > LOCATION_MAX_AGE_MS)
    if (!stale) return
    let cancelled = false
    getLocation().then(loc => {
      if (loc && !cancelled) setCurrentLocation(loc)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show phone prompt once per session if user has no phone
  const [showPhonePrompt, setShowPhonePrompt] = useState(false)
  useEffect(() => {
    if (!user?.phone && !sessionStorage.getItem(PHONE_PROMPT_DISMISSED_KEY)) {
      const t = setTimeout(() => setShowPhonePrompt(true), 1500)
      return () => clearTimeout(t)
    }
  }, [user?.phone])

  function dismissPhonePrompt() {
    sessionStorage.setItem(PHONE_PROMPT_DISMISSED_KEY, '1')
    setShowPhonePrompt(false)
  }

  return (
    <div className="min-h-screen">
      <Background />

      <motion.main
        className={hideNav ? 'max-w-3xl mx-auto' : 'pb-28 sm:pb-36 max-w-3xl mx-auto'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <Outlet />
      </motion.main>

      {/* Active-job indicator now lives inline inside MobileBottomNav itself
          (between its regular links) instead of floating as a separate
          pill above it — see GlassNavbar.jsx's MobileBottomNav. */}
      {!hideNav && <MobileBottomNav />}

      <AnimatePresence>
        {showOnboarding && (
          <OnboardingWalkthrough onDone={dismissOnboarding} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPhonePrompt && !showOnboarding && (
          <PhonePrompt onClose={dismissPhonePrompt} />
        )}
      </AnimatePresence>
    </div>
  )
}
