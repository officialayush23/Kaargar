import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, ArrowRight } from 'lucide-react'
import { cn, JOB_STATUS_LABELS, JOB_STATUS_COLORS } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { useJobs } from '@/hooks/useJobs'

// Pages where the bottom nav is hidden entirely
const HIDE_NAV_PREFIXES = [
  '/job/',
  '/login',
  '/onboard',
  '/admin',
]

export function shouldHideNav(pathname) {
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
 *
 * Active-job indicator: this used to be a separate floating pill
 * (ActiveJobBar) docked above this nav. It's now one of the nav's own flex
 * items — sitting between the regular links rather than floating apart —
 * and tapping it expands a details panel that grows the whole nav pill
 * upward (rounded-full -> rounded-3xl, height animates) instead of opening
 * a second floating element. The active-job data fetch that used to live
 * in ActiveJobBar now lives here, since this component owns the layout it
 * renders into.
 */
export function MobileBottomNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [jobExpanded, setJobExpanded] = useState(false)

  const hideNav = shouldHideNav(pathname)

  // Role determines which nav set to display — not the URL.
  // A user visiting /worker/:workerId (public profile) is still a user.
  const onWorkerSide = user?.role === 'worker'

  const { data: jobs = [] } = useJobs('active', {
    asRole: onWorkerSide ? 'worker' : undefined,
    refetchInterval: 8000,
    enabled: !!user && !hideNav,
  })
  const activeJob = jobs[0]
  // Never show the indicator while already on that job's own page — same
  // rule ActiveJobBar used to apply.
  const onThatJobPage = activeJob && pathname.includes(activeJob.id)
  const showJobItem = !!activeJob && !onThatJobPage
  const jobTargetPath = activeJob
    ? (onWorkerSide ? `/worker/job/${activeJob.id}/active` : `/job/${activeJob.id}`)
    : null

  // Collapse the expanded panel automatically if the job item disappears
  // (job completed/cancelled, or navigated onto its own page) so it can't
  // get stuck open with stale content.
  useEffect(() => {
    if (!showJobItem) setJobExpanded(false)
  }, [showJobItem])

  if (hideNav) return null

  const userLinks = [
    { to: '/',         label: 'Home',     emoji: '🏠' },
    { to: '/bookings', label: 'Bookings', emoji: '📋' },
    { to: '/chat',     label: 'Chat',     emoji: '💬' },
    { to: '/discover', label: 'Discover', emoji: '🔍' },
  ]

  const workerLinks = [
    { to: '/worker',           label: 'Dashboard', emoji: '📊' },
    { to: '/worker/services',  label: 'Services',  emoji: '🛠️' },
    { to: '/worker/schedule',  label: 'Schedule',  emoji: '🗓️' },
    { to: '/worker/analytics', label: 'Earnings',  emoji: '💰' },
  ]

  const baseLinks = onWorkerSide ? workerLinks : userLinks

  // Insert the active-job pseudo-item in the middle of the row (not at
  // either end) when there's a job to show.
  const midIndex = Math.ceil(baseLinks.length / 2)
  const links = showJobItem
    ? [...baseLinks.slice(0, midIndex), { jobItem: true }, ...baseLinks.slice(midIndex)]
    : baseLinks

  const jobLabel = activeJob ? (JOB_STATUS_LABELS[activeJob.status] || activeJob.status) : ''
  const jobColor = activeJob ? (JOB_STATUS_COLORS[activeJob.status] || 'var(--accent)') : 'var(--accent)'
  const jobSubtitle = activeJob ? (activeJob.category_name || activeJob.title || 'Service') : ''

  return (
    <motion.nav
      // z-[60] + explicit safe-area-aware bottom offset so this can never end up
      // obscured or pushed under a device's home-indicator/gesture bar — on
      // larger screens (iPad mini and up) it also sits a bit further from the
      // edge and scales up (see sm: classes below) so it doesn't read as an
      // afterthought on a much bigger canvas.
      className="fixed inset-x-0 z-[60] flex justify-center px-6 pointer-events-none"
      style={{ bottom: 'max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 26 }}
    >
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="pointer-events-auto w-full max-w-sm overflow-hidden"
        style={{
          borderRadius: jobExpanded ? 28 : 9999,
          background: 'var(--g-bg-hi)',
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          border: '1.5px solid var(--g-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 var(--g-shine)',
        }}
      >
        {/* Expanded active-job panel — grows the whole nav container
            upward; collapses back down into the pill on a second tap. */}
        <AnimatePresence>
          {showJobItem && jobExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              style={{ overflow: 'hidden', borderBottom: '1px solid var(--g-border)' }}
            >
              <div className="px-4 pt-3.5 pb-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <motion.span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: jobColor }}
                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                    transition={{ repeat: Infinity, duration: 1.8 }}
                  />
                  <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {jobLabel}
                  </span>
                  <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    · {jobSubtitle}
                  </span>
                </div>
                {activeJob?.location_address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      {activeJob.location_address}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => navigate(jobTargetPath)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold"
                  style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
                >
                  View details <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Row of nav items */}
        <div className="flex items-center justify-center gap-0.5 sm:gap-1 px-1.5 py-1.5 sm:px-2.5 sm:py-2.5">
          {links.map((link) => {
            if (link.jobItem) {
              return (
                <motion.button
                  key="active-job"
                  type="button"
                  onClick={() => setJobExpanded(v => !v)}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.92 }}
                  className="relative flex flex-col items-center gap-0.5 sm:gap-1 px-2.5 py-1 sm:px-4 sm:py-2.5"
                  style={{ borderRadius: '9999px' }}
                >
                  {jobExpanded && (
                    <motion.div
                      layoutId="bottom-nav-job-highlight"
                      className="absolute inset-0"
                      style={{ borderRadius: '9999px', background: 'var(--surface)' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                    />
                  )}
                  <motion.span
                    className="relative w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full"
                    style={{ background: jobColor }}
                    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                    transition={{ repeat: Infinity, duration: 1.8 }}
                  />
                  <span
                    className="text-[11px] sm:text-sm font-medium relative leading-none"
                    style={{ color: jobExpanded ? 'var(--accent)' : 'var(--text-muted)' }}
                  >
                    Live
                  </span>
                </motion.button>
              )
            }

            const active =
              pathname === link.to ||
              (link.to !== '/' && pathname.startsWith(link.to))

            return (
              <Link key={link.to} to={link.to}>
                <motion.div
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.92 }}
                  className="relative flex flex-col items-center gap-0.5 sm:gap-1 px-2.5 py-1 sm:px-4 sm:py-2.5"
                  style={{ borderRadius: '9999px' }}
                >
                  {active && (
                    <motion.div
                      layoutId="bottom-nav-active"
                      className="absolute inset-0"
                      style={{ borderRadius: '9999px', background: 'var(--surface)' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                    />
                  )}
                  <span className="text-sm sm:text-xl relative leading-none">{link.emoji}</span>
                  <span
                    className="text-[11px] sm:text-sm font-medium relative leading-none"
                    style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
                  >
                    {link.label}
                  </span>
                </motion.div>
              </Link>
            )
          })}
        </div>
      </motion.div>
    </motion.nav>
  )
}

/* Keep legacy export */
export function GlassNavbar() { return null }
