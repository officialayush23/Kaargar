import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, Briefcase, Star, ToggleLeft, ToggleRight, ChevronRight, Clock, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useWorkerAnalytics, useWorkerStatus } from '@/hooks/useWorker'
import { useJobs } from '@/hooks/useJobs'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import IncomingJobModal from './IncomingJobModal'

function StatCard({ label, value, sub, accent = 'brand' }) {
  const colors = { brand: 'text-brand', instant: 'text-instant', discovery: 'text-discovery' }
  return (
    <div className="glass-light rounded-2xl p-4">
      <p className="text-xs text-[--text-muted] mb-1">{label}</p>
      <p className={`text-2xl font-mono font-bold ${colors[accent]}`}>{value}</p>
      {sub && <p className="text-xs text-[--text-muted] mt-0.5">{sub}</p>}
    </div>
  )
}

export default function WorkerDashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { data: analytics, isLoading: analyticsLoading } = useWorkerAnalytics('today')
  const { data: activeJobs = [] } = useJobs('active')
  const [incomingJob, setIncomingJob] = useState(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const { data: workerStatus, refetch: refetchStatus } = useWorkerStatus()

  const isOnline = workerStatus?.status === 'online'

  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`worker-requests:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'job_worker_requests', filter: `worker_id=eq.${user.id}` },
        async (payload) => {
          const { data } = await api.get(`/jobs/${payload.new.job_id}`)
          setIncomingJob({ ...data, requestId: payload.new.id, expiresAt: payload.new.expires_at })
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user?.id])

  const toggleStatus = async () => {
    setStatusLoading(true)
    try {
      const next = isOnline ? 'offline' : 'online'
      await api.patch('/workers/status', { status: next })
      refetchStatus()
      toast.success(`You're now ${next}`)
    } catch {
      toast.error('Failed to update status')
    } finally {
      setStatusLoading(false)
    }
  }

  const activeJob = activeJobs[0]

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
      {/* Status toggle */}
      <div className="glass rounded-2xl p-4 flex items-center justify-between">
        <div>
          <p className="font-syne font-bold text-[--text-primary] text-lg">
            {user?.full_name?.split(' ')[0] || 'Worker'}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-instant animate-pulse' : 'bg-[--text-muted]'}`} />
            <span className={`text-sm ${isOnline ? 'text-instant' : 'text-[--text-muted]'}`}>
              {isOnline ? 'Online — accepting jobs' : 'Offline'}
            </span>
          </div>
        </div>
        <button
          onClick={toggleStatus}
          disabled={statusLoading}
          className="transition-transform active:scale-95"
        >
          {isOnline ? (
            <ToggleRight size={44} className="text-instant" />
          ) : (
            <ToggleLeft size={44} className="text-[--text-muted]" />
          )}
        </button>
      </div>

      {/* Active job banner */}
      <AnimatePresence>
        {activeJob && (
          <motion.button
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onClick={() => navigate(`/job/${activeJob.id}/active`)}
            className="w-full glass rounded-2xl p-4 flex items-center justify-between border border-instant/20 bg-instant/5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-instant/20 flex items-center justify-center">
                <Zap size={18} className="text-instant" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-[--text-primary]">Active job in progress</p>
                <p className="text-xs text-[--text-muted]">{activeJob.category?.name || 'Service'} · {activeJob.location_address}</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-[--text-muted]" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Today's stats */}
      <div>
        <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider mb-3">Today</p>
        {analyticsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Earnings"
              value={formatCurrency(analytics?.earnings_today || 0)}
              sub={`${analytics?.jobs_today || 0} jobs`}
              accent="instant"
            />
            <StatCard
              label="This month"
              value={formatCurrency(analytics?.earnings_month || 0)}
              sub={`${analytics?.jobs_month || 0} jobs`}
              accent="brand"
            />
            <StatCard
              label="Rating"
              value={(analytics?.avg_rating || 0).toFixed(1)}
              sub={`${analytics?.total_reviews || 0} reviews`}
              accent="discovery"
            />
            <StatCard
              label="Acceptance"
              value={`${Math.round((analytics?.acceptance_rate || 0) * 100)}%`}
              sub="of jobs offered"
              accent="brand"
            />
          </div>
        )}
      </div>

      {/* Recent jobs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider">Recent jobs</p>
          <button onClick={() => navigate('/worker/analytics')} className="text-xs text-brand">See all</button>
        </div>
        <RecentJobsList />
      </div>

      {/* Incoming job modal */}
      <AnimatePresence>
        {incomingJob && (
          <IncomingJobModal
            job={incomingJob}
            onAccept={() => setIncomingJob(null)}
            onDecline={() => setIncomingJob(null)}
            onExpire={() => setIncomingJob(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function RecentJobsList() {
  const { data: jobs = [], isLoading } = useJobs('past')
  const recent = jobs.slice(0, 5)

  if (isLoading) return <Skeleton className="h-32 rounded-2xl" />
  if (recent.length === 0) return (
    <div className="glass-light rounded-2xl p-6 text-center">
      <Briefcase size={24} className="text-[--text-muted] mx-auto mb-2" />
      <p className="text-sm text-[--text-muted]">No completed jobs yet</p>
    </div>
  )

  return (
    <div className="space-y-2">
      {recent.map((job) => (
        <div key={job.id} className="glass-light rounded-xl p-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[--text-primary]">{job.category?.name || 'Service'}</p>
            <p className="text-xs text-[--text-muted] mt-0.5 flex items-center gap-1">
              <Clock size={10} /> {formatRelativeTime(job.created_at)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-mono font-semibold text-instant">{formatCurrency(job.payout_amount || 0)}</p>
            <p className="text-xs text-[--text-muted] capitalize">{job.status}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
