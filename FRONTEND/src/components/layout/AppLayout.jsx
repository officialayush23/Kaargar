import { Outlet } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Background } from '@/components/glass/Background'
import { MobileBottomNav } from '@/components/glass/GlassNavbar'
import { OnboardingWalkthrough, useOnboarding } from '@/components/kaargar/OnboardingWalkthrough'

export function AppLayout() {
  const [showOnboarding, dismissOnboarding] = useOnboarding()

  return (
    <div className="min-h-screen">
      <Background />

      <motion.main
        className="pb-28 max-w-3xl mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <Outlet />
      </motion.main>

      <MobileBottomNav />

      {/* First-time onboarding walkthrough — shown once per user */}
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingWalkthrough onDone={dismissOnboarding} />
        )}
      </AnimatePresence>
    </div>
  )
}
