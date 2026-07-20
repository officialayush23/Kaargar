import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, Briefcase, Star, ChevronRight, Clock,
  Zap, DollarSign, CheckCircle, HelpCircle,
  ShieldAlert, ShieldCheck, RefreshCw, XCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useWorkerAnalytics, useWorkerStatus, useWorkerProfile } from '@/hooks/useWorker'
import { useJobs } from '@/hooks/useJobs'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { GlassCard } from '@/components/glass/GlassCard'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import IncomingJobModal from './IncomingJobModal'

function VerificationBanner({ status, rejectionReason }) {
  const [reapplying, setReapplying] = useState(false)
  const [done, setDone] = useState(false)

  async function handleReapply() {
    setReapplying(true)
    try {
      await api.post('/workers/me/reapply')
      setDone(true)
      toast.success('Reapplication submitted! We\'ll review your profile shortly.')
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to reapply')
    } finally {
      setReapplying(false)
    }
  }

  if (status === 'approved') return null

  const isPending = status === 'pending' || done
  const isRejected = status === 'rejected' && !done

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4"
      style={{
        background: isPending ? 'var(--accent-card)' : 'rgba(239,68,68,0.08)',
        border: `1px solid ${isPending ? 'var(--accent-mid)' : 'rgba(239,68,68,0.25)'}`,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: isPending ? 'var(--accent-deep)' : 'rgba(239,68,68,0.15)' }}
        >
          {isPending
            ? <ShieldAlert className="h-4.5 w-4.5" style={{ color: 'var(--accent)' }} />
            : <XCircle className="h-4.5 w-4.5" style={{ color: '#ef4444' }} />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: isPending ? 'var(--accent)' : '#ef4444' }}>
            {isPending ? 'Verification pending' : 'Application rejected'}
          </p>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {isPending
              ? 'Our team is reviewing your profile and documents. You\'ll be notified once approved — usually within 24 hours.'
              : rejectionReason
                ? `Reason: ${rejectionReason}`
                : 'Your application was not approved. Update your profile and reapply.'
            }
          </p>
          {isRejected && (
            <button
              onClick={handleReapply}
              disabled={reapplying}
              className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              {reapplying
                ? <><RefreshCw className="h-3 w-3 animate-spin" /> Submitting…</>
                : <><RefreshCw className="h-3 w-3" /> Reapply for verification</>
              }
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function StatCard({ label, value, sub, icon: Icon, accentColor }) {
  return (
    <GlassCard className="p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${accentColor}20` }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: accentColor }} />
        </div>
      </div>
      <p className="text-xl font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </GlassCard>
  )
}

export default function WorkerDashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { data: workerProfile, isLoading: profileLoading } = useWorkerProfile()
  const { data: analytics, isLoading: analyticsLoading } = useWorkerAnalytics('today')
  const { data: activeJobs = [] } = useJobs('active')
  const [incomingJob, setIncomingJob] = useState(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const { data: workerStatus, refetch: refetchStatus } = useWorkerStatus()

  const isOnline = workerStatus?.status === 'online'
  const verificationStatus = workerProfile?.verification_status || 'pending'
  const isApproved = verificationStatus === 'approved'

  // Redirect to onboarding if worker profile doesn't exist yet
  useEffect(() => {
    if (!profileLoading && workerProfile === null) {
      navigate('/onboard/worker', { replace: true })
    }
  }, [profileLoading, workerProfile, navigate])

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
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Worker Dashboard</p>
        <h1 className="text-2xl font-bold font-syne gradient-text-hero">{name}</h1>
      </div>

      {/* Verification banner — shown for pending/rejected workers */}
      {!isApproved && (
        <VerificationBanner
          status={verificationStatus}
          rejectionReason={workerProfile?.rejection_reason}
        />
      )}

      {/* Online toggle — locked until approved */}
      <GlassCard
        className={cn('p-4 transition-all', !isApproved && 'opacity-50 pointer-events-none select-none')}
        style={isOnline ? { borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.05)' } : {}}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <motion.div
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: isOnline ? '#4ade80' : 'var(--text-muted)' }}
                animate={isOnline ? { scale: [1, 1.3, 1] } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <span
                className="text-sm font-semibold"
                style={{ color: isOnline ? '#4ade80' : 'var(--text-muted)' }}
              >
                {isOnline ? 'Online — accepting jobs' : 'Offline'}
              </span>
            </div>
            <p className="text-xs pl-4.5" style={{ color: 'var(--text-muted)' }}>
              {isOnline ? 'You will receive new job requests' : 'Tap to go online'}
            </p>
          </div>

          <motion.button
            onClick={toggleStatus}
            disabled={statusLoading}
            whileTap={{ scale: 0.92 }}
            className="relative w-14 h-7 rounded-full transition-all duration-300"
            style={{
              background: isOnline ? '#22C55E' : 'var(--card)',
              border: `1px solid ${isOnline ? '#22C55E' : 'var(--card-border)'}`,
            }}
          >
            <motion.div
              className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm"
              animate={{ x: isOnline ? 28 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </motion.button>
        </div>
      </GlassCard>

      {/* Active job banner */}
      <AnimatePresence>
        {activeJob && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <GlassCard
              onClick={() => navigate(`/worker/job/${activeJob.id}/active`)}
              hover
              glow
              glowColor="green"
              className="p-4"
              style={{ borderColor: 'rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.05)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(34,197,94,0.2)' }}>
                  <Zap className="h-5 w-5 text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Active job in progress
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {activeJob.category?.name || 'Service'} · {activeJob.location_address}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <div>
        <p className="text-xs uppercase tracking-widest font-medium mb-3"
          style={{ color: 'var(--text-muted)' }}>Today</p>
        {analyticsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" style={{ background: 'var(--g-bg)' }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Today's earnings"
              value={formatCurrency(analytics?.today_earnings || 0)}
              sub={`${analytics?.today_jobs || 0} jobs completed`}
              icon={DollarSign}
              accentColor="#22c55e"
            />
            <StatCard
              label="This month"
              value={formatCurrency(analytics?.month_earnings || 0)}
              sub={`${analytics?.month_jobs || 0} total jobs`}
              icon={TrendingUp}
              accentColor="var(--accent)"
            />
            <StatCard
              label="Rating"
              value={Number(analytics?.avg_rating || 0).toFixed(1)}
              sub={`${analytics?.total_reviews || 0} reviews`}
              icon={Star}
              accentColor="var(--accent)"
            />
            <StatCard
              label="Acceptance"
              value={`${Math.round((analytics?.acceptance_rate || 0) * 100)}%`}
              sub="of jobs offered"
              icon={CheckCircle}
              accentColor="#a78bfa"
            />
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Services',  path: '/worker/services',  icon: Briefcase },
          { label: 'Analytics', path: '/worker/analytics', icon: TrendingUp },
          { label: 'Portfolio', path: '/worker/media',     icon: Star },
        ].map(({ label, path, icon: Icon }) => (
          <GlassCard key={path} onClick={() => navigate(path)} hover className="p-4 text-center">
            <Icon className="h-5 w-5 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
          </GlassCard>
        ))}
      </div>

      {/* Support link */}
      <GlassCard
        onClick={() => navigate('/worker/support')}
        className="p-4 flex items-center justify-between hover:opacity-90 transition-opacity cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            <HelpCircle className="h-5 w-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Help & Support</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Raise tickets for payment or job issues
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
      </GlassCard>

      {/* Recent jobs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-widest font-medium"
            style={{ color: 'var(--text-muted)' }}>Recent jobs</p>
          <button
            onClick={() => navigate('/worker/analytics')}
            className="text-xs transition-colors"
            style={{ color: 'var(--accent)' }}
          >
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

  if (isLoading) return (
    <Skeleton className="h-32 rounded-2xl" style={{ background: 'var(--g-bg)' }} />
  )

  if (recent.length === 0) {
    return (
      <GlassCard className="p-6 text-center">
        <Briefcase className="h-6 w-6 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No completed jobs yet</p>
      </GlassCard>
    )
  }

  return (
    <div className="space-y-2">
      {recent.map((job) => (
        <GlassCard key={job.id} className="px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {job.category?.name || 'Service'}
            </p>
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <Clock className="h-2.5 w-2.5" />
              {formatRelativeTime(job.created_at)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-mono font-semibold text-green-400">
              {formatCurrency(job.worker_payout || 0)}
            </p>
            <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{job.status}</p>
          </div>
        </GlassCard>
      ))}
    </div>
  )
}
