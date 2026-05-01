import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'

// Pages where the bottom nav is hidden entirely
const HIDE_NAV_PREFIXES = [
  '/job/',
  '/login',
  '/onboard',
  '/admin',
]

function shouldHideNav(pathname) {
  return HIDE_NAV_PREFIXES.some((r) => pathname.startsWith(r))
}

/**
 * MobileBottomNav — liquid glass pill, ROLE-aware.
 *
 * Shows worker links when the logged-in user's role is 'worker'.
 * Shows user links for everyone else.
 *
 * Previously this was path-based (pathname.startsWith('/worker')),
 * which caused the worker nav to appear on the public worker profile
 * page (/worker/:workerId) viewed by regular users.
 */
export function MobileBottomNav() {
  const { pathname } = useLocation()
  const { user } = useAuthStore()

  if (shouldHideNav(pathname)) return null

  // Role determines which nav set to display — not the URL.
  // A user visiting /worker/:workerId (public profile) is still a user.
  const onWorkerSide = user?.role === 'worker'

  const userLinks = [
    { to: '/',         label: 'Home',     emoji: '🏠' },
    { to: '/bookings', label: 'Bookings', emoji: '📋' },
    { to: '/chat',     label: 'Chat',     emoji: '💬' },
    { to: '/discover', label: 'Discover', emoji: '🔍' },
  ]

  const workerLinks = [
    { to: '/worker',           label: 'Dashboard', emoji: '📊' },
    { to: '/worker/services',  label: 'Services',  emoji: '🛠️' },
    { to: '/worker/media',     label: 'Portfolio', emoji: '📸' },
    { to: '/worker/analytics', label: 'Earnings',  emoji: '💰' },
  ]

  const links = onWorkerSide ? workerLinks : userLinks

  return (
    <motion.nav
      className="fixed bottom-4 inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 26 }}
    >
      <div
        className="pointer-events-auto flex items-center gap-1 px-2 py-2"
        style={{
          borderRadius: '9999px',
          background: 'var(--g-bg-hi)',
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          border: '1.5px solid var(--g-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 var(--g-shine)',
        }}
      >
        {links.map((link) => {
          const active =
            pathname === link.to ||
            (link.to !== '/' && pathname.startsWith(link.to))

          return (
            <Link key={link.to} to={link.to}>
              <motion.div
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.92 }}
                className="relative flex flex-col items-center gap-0.5 px-4 py-1.5"
                style={{ borderRadius: '9999px' }}
              >
                {active && (
                  <motion.div
                    layoutId="bottom-nav-active"
                    className="absolute inset-0"
                    style={{
                      borderRadius: '9999px',
                      background: 'rgba(245,158,11,0.18)',
                      border: '1px solid rgba(245,158,11,0.35)',
                      boxShadow: '0 0 12px rgba(245,158,11,0.2)',
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  />
                )}
                <span className="text-base relative leading-none">{link.emoji}</span>
                <span
                  className={cn(
                    'text-[10px] font-medium relative leading-none',
                    active ? 'text-amber-400' : 'text-[var(--text-muted)]'
                  )}
                >
                  {link.label}
                </span>
              </motion.div>
            </Link>
          )
        })}
      </div>
    </motion.nav>
  )
}

/* Keep legacy export */
export function GlassNavbar() { return null }
