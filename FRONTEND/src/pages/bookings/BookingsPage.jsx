import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clock, CheckCircle, XCircle, ChevronRight, Loader2 } from 'lucide-react'
import { useJobs } from '@/hooks/useJobs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime, formatCurrency, JOB_STATUS_COLORS, JOB_STATUS_LABELS } from '@/lib/utils'

const TABS = ['active', 'past']

function JobCard({ job, onClick }) {
  const statusColor = JOB_STATUS_COLORS[job.status] || 'text-[--text-muted]'
  const isCompleted = job.status === 'completed'
  const isCancelled = job.status === 'cancelled'

  return (
    <button onClick={onClick} className="w-full glass-light rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
        isCompleted ? 'bg-instant/15' : isCancelled ? 'bg-red-500/15' : 'bg-brand/15'
      }`}>
        {isCompleted ? (
          <CheckCircle size={18} className="text-instant" />
        ) : isCancelled ? (
          <XCircle size={18} className="text-red-400" />
        ) : (
          <Clock size={18} className="text-brand" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[--text-primary] truncate">{job.category?.name || 'Service'}</p>
        <p className="text-xs text-[--text-muted] mt-0.5 truncate">{job.location_address}</p>
        <p className="text-xs text-[--text-muted] mt-0.5">{formatRelativeTime(job.created_at)}</p>
      </div>

      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {job.final_amount && (
          <span className="text-sm font-mono font-semibold text-[--text-primary]">{formatCurrency(job.final_amount)}</span>
        )}
        <Badge className={`text-[10px] px-2 py-0.5 ${statusColor} bg-current/10 border-current/20`}>
          {JOB_STATUS_LABELS[job.status] || job.status}
        </Badge>
        <ChevronRight size={14} className="text-[--text-muted]" />
      </div>
    </button>
  )
}

export default function BookingsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('active')
  const { data: jobs = [], isLoading } = useJobs(tab)

  return (
    <div className="min-h-full">
      {/* Tabs */}
      <div className="sticky top-0 z-10 glass border-b border-white/5 px-4 pt-3 pb-0">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-xl capitalize transition-colors relative ${
                tab === t ? 'text-[--text-primary]' : 'text-[--text-muted] hover:text-[--text-secondary]'
              }`}
            >
              {t}
              {tab === t && (
                <motion.div layoutId="booking-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 pb-28 space-y-3">
        {isLoading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Clock size={40} className="text-[--text-muted]" />
            <p className="text-[--text-muted] text-sm">{tab === 'active' ? 'No active bookings' : 'No past bookings'}</p>
            {tab === 'active' && (
              <button onClick={() => navigate('/')} className="btn-brand px-6 py-2.5 rounded-xl text-sm font-medium mt-2">
                Book a service
              </button>
            )}
          </div>
        ) : (
          jobs.map((job, i) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <JobCard
                job={job}
                onClick={() => {
                  const activeStatuses = ['searching', 'assigned', 'en_route', 'arrived', 'started']
                  if (activeStatuses.includes(job.status)) {
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
