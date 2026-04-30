import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clock, CheckCircle, XCircle, ChevronRight, CalendarCheck } from 'lucide-react'
import { useJobs } from '@/hooks/useJobs'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime, formatCurrency, JOB_STATUS_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'active', label: 'Active' },
  { id: 'past',   label: 'Past'   },
]

const STATUS_CONFIG = {
  completed: { icon: CheckCircle, bgColor: 'rgba(52,211,153,0.12)',  textColor: '#34d399' },
  cancelled:  { icon: XCircle,    bgColor: 'rgba(248,113,113,0.12)', textColor: '#f87171' },
  default:    { icon: Clock,      bgColor: 'rgba(59,130,246,0.12)',  textColor: '#60a5fa' },
}

function JobCard({ job, onClick }) {
  const cfg  = STATUS_CONFIG[job.status] || STATUS_CONFIG.default
  const Icon = cfg.icon
  const amount = job.final_amount ?? job.final_price

  return (
    <GlassCard onClick={onClick} hover className="p-4">
      <div className="flex items-center gap-3">
        {/* Status icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: cfg.bgColor }}
        >
          <Icon className="h-5 w-5" style={{ color: cfg.textColor }} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {job.category?.name || 'Service'}
          </p>
          <p
            className="text-xs mt-0.5 truncate"
            style={{ color: 'var(--text-muted)' }}
          >
            {job.location_address}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: cfg.textColor }}
            />
            <span className="text-[11px] font-medium" style={{ color: cfg.textColor }}>
              {JOB_STATUS_LABELS?.[job.status] || job.status}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>·</span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {formatRelativeTime(job.created_at)}
            </span>
          </div>
        </div>

        {/* Amount + chevron */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {amount != null && (
            <span
              className="text-sm font-mono font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {formatCurrency(amount)}
            </span>
          )}
          <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
        </div>
      </div>
    </GlassCard>
  )
}

export default function BookingsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('active')
  const { data: jobs = [], isLoading } = useJobs(tab)

  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
          Bookings
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Track your service requests
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

      {/* Job list */}
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
                onClick={() => {
                  const activeStatuses = ['searching', 'assigned', 'en_route', 'arrived', 'started']
                  if (activeStatuses.includes(job.status)) {
                    navigate(
                      job.status === 'searching'
                        ? `/job/${job.id}/searching`
                        : `/job/${job.id}/active`
                    )
                  } else if (job.status === 'completed') {
                    navigate(`/job/${job.id}/review`)
                  }
                }}
              />
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}
