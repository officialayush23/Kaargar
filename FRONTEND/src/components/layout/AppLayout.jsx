import { Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Background } from '@/components/glass/Background'
import { MobileBottomNav } from '@/components/glass/GlassNavbar'
import { OnboardingWalkthrough, useOnboarding } from '@/components/kaargar/OnboardingWalkthrough'

// Routes where the bottom nav should be hidden (full-screen experiences)
const HIDE_NAV_PATTERNS = [/^\/chat\/\w/]

export function AppLayout() {
  const [showOnboarding, dismissOnboarding] = useOnboarding()
  const { pathname } = useLocation()
  const hideNav = HIDE_NAV_PATTERNS.some(re => re.test(pathname))

  return (
    <div className="min-h-screen">
      <Background />

      <motion.main
        className={hideNav ? 'max-w-3xl mx-auto' : 'pb-28 max-w-3xl mx-auto'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <Outlet />
      </motion.main>

      {!hideNav && <MobileBottomNav />}

      {/* First-time onboarding walkthrough — shown once per user */}
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingWalkthrough onDone={dismissOnboarding} />
        )}
      </AnimatePresence>
    </div>
  )
}
