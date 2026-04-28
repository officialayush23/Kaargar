import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clock, CheckCircle, XCircle, ChevronRight, CalendarCheck } from 'lucide-react'
import { useJobs } from '@/hooks/useJobs'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime, formatCurrency, JOB_STATUS_COLORS, JOB_STATUS_LABELS } from '@/lib/utils'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'active', label: 'Active' },
  { id: 'past',   label: 'Past' },
]

const STATUS_CONFIG = {
  completed: { icon: CheckCircle, bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  cancelled:  { icon: XCircle,    bg: 'bg-red-500/15',     text: 'text-red-400',     dot: 'bg-red-400' },
  default:    { icon: Clock,      bg: 'bg-azure/15',       text: 'text-azure',       dot: 'bg-azure' },
}

function JobCard({ job, onClick }) {
  const cfg = STATUS_CONFIG[job.status] || STATUS_CONFIG.default
  const Icon = cfg.icon

  return (
    <GlassCard onClick={onClick} hover className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', cfg.bg)}>
          <Icon className={cn('h-5 w-5', cfg.text)} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white/90 truncate">{job.category?.name || 'Service'}</p>
          <p className="text-xs text-white/40 mt-0.5 truncate">{job.location_address}</p>
          <div className="flex items-center gap-2 mt-1">
            <div className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
            <span className={cn('text-[11px] font-medium', cfg.text)}>
              {JOB_STATUS_LABELS?.[job.status] || job.status}
            </span>
            <span className="text-[11px] text-white/25">·</span>
            <span className="text-[11px] text-white/30">{formatRelativeTime(job.created_at)}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {job.final_amount != null && (
            <span className="text-sm font-mono font-semibold text-white/80">
              {formatCurrency(job.final_amount)}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-white/25" />
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
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold font-syne gradient-text-hero">Bookings</h1>
        <p className="text-sm text-white/40 mt-0.5">Track your service requests</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'relative px-5 py-2 rounded-xl text-sm font-medium transition-all',
              tab === id
                ? 'text-white'
                : 'text-white/40 hover:text-white/70'
            )}
          >
            {tab === id && (
              <motion.div
                layoutId="bookings-tab"
                className="absolute inset-0 rounded-xl bg-white/10 border border-white/15"
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
            <Skeleton key={i} className="h-20 rounded-2xl bg-white/5" />
          ))
        ) : jobs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 py-16 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <CalendarCheck className="h-8 w-8 text-white/20" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/60">
                {tab === 'active' ? 'No active bookings' : 'No past bookings'}
              </p>
              <p className="text-xs text-white/30 mt-0.5">
                {tab === 'active' ? 'Book a service to get started' : 'Your completed jobs will appear here'}
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
                  const active = ['searching', 'assigned', 'en_route', 'arrived', 'started']
                  if (active.includes(job.status)) {
                    navigate(job.status === 'searching' ? `/job/${job.id}/searching` : `/job/${job.id}/active`)
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
