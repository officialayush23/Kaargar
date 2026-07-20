import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock, CheckCircle, XCircle, ChevronRight, CalendarCheck,
  Package, Repeat, AlertCircle, CheckCheck
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useJobs } from '@/hooks/useJobs'
import { api } from '@/lib/api'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime, formatCurrency, JOB_STATUS_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'active',   label: 'Active'    },
  { id: 'past',     label: 'Past'      },
  { id: 'packages', label: 'Packages'  },
]

const STATUS_CONFIG = {
  completed: { icon: CheckCircle, bgColor: 'rgba(52,211,153,0.12)',  textColor: '#34d399' },
  cancelled:  { icon: XCircle,    bgColor: 'rgba(248,113,113,0.12)', textColor: '#f87171' },
  default:    { icon: Clock,      bgColor: 'rgba(59,130,246,0.12)',  textColor: '#60a5fa' },
}

/* ── Job card ───────────────────────────────────────────────────── */
function JobCard({ job, onClick }) {
  const cfg  = STATUS_CONFIG[job.status] || STATUS_CONFIG.default
  const Icon = cfg.icon
  const amount = job.final_amount ?? job.final_price

  return (
    <GlassCard onClick={onClick} hover className="p-4">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: cfg.bgColor }}
        >
          <Icon className="h-5 w-5" style={{ color: cfg.textColor }} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {job.category_name || job.category?.name || job.title || 'Service'}
          </p>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
            {job.location_address}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.textColor }} />
            <span className="text-[13px] font-medium" style={{ color: cfg.textColor }}>
              {JOB_STATUS_LABELS?.[job.status] || job.status}
            </span>
            <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>&#183;</span>
            <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {formatRelativeTime(job.created_at)}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {amount != null && (
            <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              {formatCurrency(amount)}
            </span>
          )}
          <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>
    </GlassCard>
  )
}

/* ── Package order card ─────────────────────────────────────────── */
function PackageOrderCard({ order }) {
  const [expanded, setExpanded] = useState(false)

  const now = new Date()
  const expiresAt = order.expires_at ? new Date(order.expires_at) : null
  const daysLeft = expiresAt ? Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)) : null
  const isExpired = daysLeft !== null && daysLeft <= 0

  const totalItems = order.items?.length ?? 0
  const completedItems = order.items?.filter(i => {
    if (i.redeem_type === 'once') return i.usages_used >= 1
    return false
  }).length ?? 0

  // For multi_use: show uses_remaining; for single_use_bundle: show items done
  const isBundle = order.redemption_type === 'single_use_bundle'

  let statusColor = '#60a5fa'
  let statusLabel = 'Active'
  if (isExpired) { statusColor = '#f87171'; statusLabel = 'Expired' }
  else if (!isBundle && order.uses_remaining === 0) { statusColor = '#34d399'; statusLabel = 'Exhausted' }
  else if (isBundle && completedItems === totalItems) { statusColor = '#34d399'; statusLabel = 'Completed' }

  return (
    <GlassCard className="overflow-hidden">
      <button
        className="w-full p-4 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: 'var(--accent-deep)' }}
          >
            <Package className="h-5 w-5" style={{ color: 'var(--accent)' }} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {order.package?.title || 'Package'}
            </p>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              by {order.worker?.full_name || 'Worker'}
            </p>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* Status pill */}
              <span
                className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: `${statusColor}20`, color: statusColor }}
              >
                {statusLabel}
              </span>

              {/* Uses remaining (multi_use) */}
              {!isBundle && (
                <span
                  className="text-[12px] px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: 'var(--g-bg)', color: 'var(--text-secondary)', border: '1px solid var(--g-border)' }}
                >
                  <Repeat className="h-2.5 w-2.5" />
                  {order.uses_remaining} uses left
                </span>
              )}

              {/* Bundle progress */}
              {isBundle && (
                <span
                  className="text-[12px] px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ background: 'var(--g-bg)', color: 'var(--text-secondary)', border: '1px solid var(--g-border)' }}
                >
                  <CheckCheck className="h-2.5 w-2.5" />
                  {completedItems}/{totalItems} done
                </span>
              )}

              {/* Expiry */}
              {daysLeft !== null && !isExpired && (
                <span
                  className="text-[12px] px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{
                    background: daysLeft <= 3 ? 'var(--accent-deep)' : 'var(--g-bg)',
                    color: daysLeft <= 3 ? 'var(--accent)' : 'var(--text-muted)',
                    border: `1px solid ${daysLeft <= 3 ? 'var(--accent-dim)' : 'var(--g-border)'}`,
                  }}
                >
                  {daysLeft <= 3 && <AlertCircle className="h-2.5 w-2.5" />}
                  {daysLeft}d left
                </span>
              )}
              {isExpired && (
                <span
                  className="text-[12px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
                >
                  Expired {formatRelativeTime(order.expires_at)}
                </span>
              )}
            </div>
          </div>

          {/* Price + chevron */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              {formatCurrency(order.paid_amount ?? order.package?.discounted_price ?? 0)}
            </span>
            <motion.div
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            </motion.div>
          </div>
        </div>
      </button>

      {/* Expanded: service items */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: 'hidden', borderTop: '1px solid var(--g-border)' }}
          >
            <div className="p-4 pt-3 space-y-2">
              <p className="text-[13px] font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>
                Included services
              </p>

              {order.items?.map((item, idx) => {
                const isDone = item.redeem_type === 'once'
                  ? item.usages_used >= 1
                  : false
                const usedOf = item.redeem_type === 'repeatable'
                  ? `${item.usages_used ?? 0}/${item.quantity} used`
                  : isDone ? 'Redeemed' : 'Not yet redeemed'

                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 px-3 rounded-xl"
                    style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isDone
                        ? <CheckCircle className="h-3.5 w-3.5 shrink-0" style={{ color: '#34d399' }} />
                        : <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                      }
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {item.service?.name || item.service_name || 'Service'}
                      </p>
                    </div>
                    <span
                      className="text-[12px] ml-2 shrink-0"
                      style={{ color: isDone ? '#34d399' : 'var(--text-muted)' }}
                    >
                      {usedOf}
                    </span>
                  </div>
                )
              })}

              {/* Purchased at */}
              <p className="text-[12px] pt-1" style={{ color: 'var(--text-muted)' }}>
                Purchased {formatRelativeTime(order.created_at)}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  )
}

/* ── Packages tab content ───────────────────────────────────────── */
function PackagesTab() {
  const navigate = useNavigate()
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['package-orders'],
    queryFn: () => api.get('/workers/me/package-orders').then(r => r.data),
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 rounded-2xl" style={{ background: 'var(--g-bg)' }} />
        ))}
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4 py-16 text-center"
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--accent-card)', border: '1px solid var(--accent-mid)' }}
        >
          <Package className="h-8 w-8" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            No packages purchased yet
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Discover bundles and save on services you use often
          </p>
        </div>
        <GlassButton variant="brand" onClick={() => navigate('/discover')}>
          Browse packages
        </GlassButton>
      </motion.div>
    )
  }

  return (
    <div className="space-y-3">
      {orders.map((order, i) => (
        <motion.div
          key={order.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
        >
          <PackageOrderCard order={order} />
        </motion.div>
      ))}
    </div>
  )
}

/* ── Main page ──────────────────────────────────────────────────── */
export default function BookingsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('active')
  const { data: jobs = [], isLoading } = useJobs(tab === 'packages' ? null : tab)

  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
          Bookings
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Track your service requests &amp; packages
        </p>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 rounded-2xl"
        style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="relative flex-1 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ color: tab === id ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {tab === id && (
              <motion.div
                layoutId="bookings-tab"
                className="absolute inset-0 rounded-xl"
                style={{ background: 'var(--g-bg-hi)', border: '1px solid var(--g-border)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              />
            )}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {tab === 'packages' ? (
          <motion.div
            key="packages"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <PackagesTab />
          </motion.div>
        ) : (
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <div className="space-y-3">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-20 rounded-2xl"
                    style={{ background: 'var(--g-bg)' }}
                  />
                ))
              ) : jobs.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center gap-4 py-16 text-center"
                >
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
                  >
                    <CalendarCheck className="h-8 w-8" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {tab === 'active' ? 'No active bookings' : 'No past bookings'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {tab === 'active'
                        ? 'Book a service to get started'
                        : 'Your completed jobs will appear here'}
                    </p>
                  </div>
                  {tab === 'active' && (
                    <GlassButton variant="brand" onClick={() => navigate('/')}>
                      Book a service
                    </GlassButton>
                  )}
                </motion.div>
              ) : (
                jobs.map((job, i) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <JobCard
                      job={job}
                      onClick={() => navigate(`/job/${job.id}`)}
                    />
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
