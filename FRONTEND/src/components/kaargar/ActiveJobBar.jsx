/**
 * ActiveJobBar — Zomato-style floating status pill for an in-progress job.
 * Docked just above the bottom nav on every page (both customer and worker
 * side) so whoever has an active job can always get back to it without
 * hunting through Bookings. Tap the pill to expand it in place (category,
 * address, a "View" button); tap again (or the chevron) to collapse it back
 * down to its resting slim state.
 *
 * Before this, the only way back to an in-progress job was the Bookings
 * list (customer) or the dashboard's one active-job card (worker) — nothing
 * followed you around the rest of the app the way a live order does.
 */
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronUp, ChevronDown, MapPin, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { useJobs } from '@/hooks/useJobs'
import { shouldHideNav } from '@/components/glass/GlassNavbar'
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from '@/lib/utils'

export function ActiveJobBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [expanded, setExpanded] = useState(false)

  const isWorker = user?.role === 'worker'

  const { data: jobs = [] } = useJobs('active', {
    asRole: isWorker ? 'worker' : undefined,
    refetchInterval: 8000,
    enabled: !!user,
  })

  const job = jobs[0]

  // Same routes the bottom nav itself hides on (job detail/active pages,
  // login, onboarding, admin) — the pill has no business floating there,
  // and specifically: never show it while already ON that job's own page.
  const onThatJobPage = job && pathname.includes(job.id)
  const hide = !job || shouldHideNav(pathname) || onThatJobPage

  if (hide) return null

  const label = JOB_STATUS_LABELS[job.status] || job.status
  const color = JOB_STATUS_COLORS[job.status] || 'var(--accent)'
  const targetPath = isWorker ? `/worker/job/${job.id}/active` : `/job/${job.id}`
  const subtitle = job.category_name || job.title || 'Service'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="fixed inset-x-0 z-50 flex justify-center px-4 pointer-events-none"
      style={{ bottom: 'calc(max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem)) + 5.5rem)' }}
    >
      <div
        className="pointer-events-auto w-full max-w-sm overflow-hidden"
        style={{
          borderRadius: 22,
          background: 'var(--g-bg-hi)',
          backdropFilter: 'blur(40px) saturate(200%)',
          WebkitBackdropFilter: 'blur(40px) saturate(200%)',
          border: '1.5px solid var(--g-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 var(--g-shine)',
        }}
      >
        {/* Collapsed row — always visible, tapping it navigates straight to the job.
            A plain div (not a <button>) because it contains the chevron
            toggle button — nested <button> elements are invalid HTML and
            browsers handle their click/focus behavior inconsistently. */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate(targetPath)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(targetPath) }}
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
          style={{ cursor: 'pointer' }}
        >
          <motion.span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: color }}
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
            transition={{ repeat: Infinity, duration: 1.8 }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {label}
            </p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
          >
            {expanded
              ? <ChevronDown className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              : <ChevronUp className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />}
          </button>
        </div>

        {/* Expanded panel — grows upward from the pill, collapses back down behind it */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              style={{ overflow: 'hidden', borderTop: '1px solid var(--g-border)' }}
            >
              <div className="px-4 py-3 space-y-2.5">
                {job.location_address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      {job.location_address}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => navigate(targetPath)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold"
                  style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
                >
                  View details <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
