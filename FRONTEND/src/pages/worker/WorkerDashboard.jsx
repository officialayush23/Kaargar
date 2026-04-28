import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, Briefcase, Star, ChevronRight, Clock, Zap, DollarSign, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useWorkerAnalytics, useWorkerStatus } from '@/hooks/useWorker'
import { useJobs } from '@/hooks/useJobs'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { GlassCard } from '@/components/glass/GlassCard'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import IncomingJobModal from './IncomingJobModal'

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <GlassCard className="p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40">{label}</p>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', `${color}/15`)}>
          <Icon className={cn('h-3.5 w-3.5', color.replace('bg-', 'text-'))} />
        </div>
      </div>
      <p className="text-xl font-mono font-bold text-white/90">{value}</p>
      {sub && <p className="text-xs text-white/35">{sub}</p>}
    </GlassCard>
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
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'job_worker_requests',
        filter: `worker_id=eq.${user.id}`,
      }, async (payload) => {
        try {
          const { data } = await api.get(`/jobs/${payload.new.job_id}`)
          setIncomingJob({ ...data, requestId: payload.new.id, expiresAt: payload.new.expires_at })
        } catch {}
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user?.id])

  async function toggleStatus() {
    setStatusLoading(true)
    try {
      const next = isOnline ? 'offline' : 'online'
      await api.patch('/workers/status', { status: next })
      refetchStatus()
      toast.success(`You are now ${next}`)
    } catch {
      toast.error('Failed to update status')
    } finally {
      setStatusLoading(false)
    }
  }

  const activeJob = activeJobs[0]
  const name = user?.full_name?.split(' ')[0] || 'Worker'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="text-sm text-white/40">Worker Dashboard</p>
        <h1 className="text-2xl font-bold font-syne gradient-text-hero">{name}</h1>
      </div>

      {/* Online toggle */}
      <GlassCard className={cn('p-4 transition-all', isOnline && 'border-emerald-500/25 bg-emerald-500/5')}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <motion.div
                className={cn('w-2.5 h-2.5 rounded-full', isOnline ? 'bg-emerald-400' : 'bg-white/20')}
                animate={isOnline ? { scale: [1, 1.3, 1] } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <span className={cn('text-sm font-semibold', isOnline ? 'text-emerald-400' : 'text-white/40')}>
                {isOnline ? 'Online — accepting jobs' : 'Offline'}
              </span>
            </div>
            <p className="text-xs text-white/30 pl-4.5">
              {isOnline ? 'You will receive new job requests' : 'Tap to go online'}
            </p>
          </div>

          <motion.button
            onClick={toggleStatus}
            disabled={statusLoading}
            whileTap={{ scale: 0.92 }}
            className={cn(
              'relative w-14 h-7 rounded-full transition-all duration-300',
              isOnline ? 'bg-emerald-500/80' : 'bg-white/15',
              'border',
              isOnline ? 'border-emerald-500/40' : 'border-white/15'
            )}
          >
            <motion.div
              className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm"
              animate={{ x: isOnline ? 28 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </motion.button>
        </div>
      </GlassCard>

      {/* Active job */}
      <AnimatePresence>
        {activeJob && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <GlassCard
              onClick={() => navigate(`/job/${activeJob.id}/active`)}
              hover
              glow
              glowColor="green"
              className="p-4 border-emerald-500/25 bg-emerald-500/5"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white/90">Active job in progress</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {activeJob.category?.name || 'Service'} · {activeJob.location_address}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-white/30" />
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <div>
        <p className="text-xs text-white/30 uppercase tracking-widest font-medium mb-3">Today</p>
        {analyticsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Today's earnings"
              value={formatCurrency(analytics?.earnings_today || 0)}
              sub={`${analytics?.jobs_today || 0} jobs completed`}
              icon={DollarSign}
              color="bg-emerald-500"
            />
            <StatCard
              label="This month"
              value={formatCurrency(analytics?.earnings_month || 0)}
              sub={`${analytics?.jobs_month || 0} total jobs`}
              icon={TrendingUp}
              color="bg-azure"
            />
            <StatCard
              label="Rating"
              value={(analytics?.avg_rating || 0).toFixed(1)}
              sub={`${analytics?.total_reviews || 0} reviews`}
              icon={Star}
              color="bg-amber-500"
            />
            <StatCard
              label="Acceptance"
              value={`${Math.round((analytics?.acceptance_rate || 0) * 100)}%`}
              sub="of jobs offered"
              icon={CheckCircle}
              color="bg-violet"
            />
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Services', path: '/worker/services', icon: Briefcase },
          { label: 'Analytics', path: '/worker/analytics', icon: TrendingUp },
          { label: 'Portfolio', path: '/worker/media', icon: Star },
        ].map(({ label, path, icon: Icon }) => (
          <GlassCard key={path} onClick={() => navigate(path)} hover className="p-4 text-center">
            <Icon className="h-5 w-5 text-white/50 mx-auto mb-2" />
            <p className="text-xs text-white/60 font-medium">{label}</p>
          </GlassCard>
        ))}
      </div>

      {/* Recent jobs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-white/30 uppercase tracking-widest font-medium">Recent jobs</p>
          <button onClick={() => navigate('/worker/analytics')} className="text-xs text-azure hover:text-azure-light transition-colors">
            See all
          </button>
        </div>
        <RecentJobsList />
      </div>

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

  if (isLoading) return <Skeleton className="h-32 rounded-2xl bg-white/5" />

  if (recent.length === 0) {
    return (
      <GlassCard className="p-6 text-center">
        <Briefcase className="h-6 w-6 text-white/20 mx-auto mb-2" />
        <p className="text-sm text-white/40">No completed jobs yet</p>
      </GlassCard>
    )
  }

  return (
    <div className="space-y-2">
      {recent.map((job) => (
        <GlassCard key={job.id} className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">{job.category?.name || 'Service'}</p>
            <p className="text-xs text-white/35 mt-0.5 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {formatRelativeTime(job.created_at)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-mono font-semibold text-emerald-400">
              {formatCurrency(job.payout_amount || 0)}
            </p>
            <p className="text-xs text-white/35 capitalize">{job.status}</p>
          </div>
        </GlassCard>
      ))}
    </div>
  )
}
