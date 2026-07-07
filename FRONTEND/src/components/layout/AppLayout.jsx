import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Background } from '@/components/glass/Background'
import { MobileBottomNav } from '@/components/glass/GlassNavbar'
import { OnboardingWalkthrough, useOnboarding } from '@/components/kaargar/OnboardingWalkthrough'
import { PhonePrompt } from '@/components/kaargar/PhonePrompt'
import { useAuthStore } from '@/stores/auth'

// Routes where the bottom nav should be hidden (full-screen experiences)
const HIDE_NAV_PATTERNS = [/^\/chat\/\w/]
const PHONE_PROMPT_DISMISSED_KEY = 'kaargar_phone_prompt_dismissed'

export function AppLayout() {
  const [showOnboarding, dismissOnboarding] = useOnboarding()
  const { pathname } = useLocation()
  const hideNav = HIDE_NAV_PATTERNS.some(re => re.test(pathname))
  const { user } = useAuthStore()

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
        className={hideNav ? 'max-w-3xl mx-auto' : 'pb-28 max-w-3xl mx-auto'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <Outlet />
      </motion.main>

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
