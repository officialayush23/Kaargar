import { useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Star, Briefcase, Clock, Loader2 } from 'lucide-react'
import { useWorkerAnalytics } from '@/hooks/useWorker'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All time' },
]

function StatBlock({ icon: Icon, label, value, sub, accent = 'brand' }) {
  const accents = {
    brand: 'text-brand bg-brand/10',
    instant: 'text-instant bg-instant/10',
    discovery: 'text-discovery bg-discovery/10',
    muted: 'text-[--text-muted] bg-[--card-bg]',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-light rounded-2xl p-4"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${accents[accent]}`}>
        <Icon size={17} />
      </div>
      <p className="text-2xl font-mono font-bold text-[--text-primary]">{value}</p>
      <p className="text-xs text-[--text-muted] mt-0.5">{label}</p>
      {sub && <p className="text-xs text-[--text-secondary] mt-1">{sub}</p>}
    </motion.div>
  )
}

function EarningsBar({ label, amount, max }) {
  const pct = max > 0 ? (amount / max) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-[--text-muted]">{label}</span>
        <span className="text-xs font-mono font-medium text-[--text-primary]">{formatCurrency(amount)}</span>
      </div>
      <div className="h-1.5 bg-[--card-bg] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full bg-instant rounded-full"
        />
      </div>
    </div>
  )
}

export default function WorkerAnalytics() {
  const [period, setPeriod] = useState('week')
  const { data: analytics, isLoading } = useWorkerAnalytics(period)

  const maxEarnings = Math.max(
    Number(analytics?.today_earnings || 0),
    Number(analytics?.week_earnings || 0),
    Number(analytics?.month_earnings || 0),
  )

  return (
    <div className="px-4 pt-5 pb-8 space-y-5">
      <h2 className="font-syne font-bold text-xl text-[--text-primary]">Analytics</h2>

      {/* Period tabs */}
      <div className="flex gap-1 glass-light rounded-xl p-1">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
              period === p.value
                ? 'bg-brand/20 text-brand'
                : 'text-[--text-muted] hover:text-[--text-secondary]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <>
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatBlock
              icon={TrendingUp}
              label="Earnings"
              value={formatCurrency(
                period === 'today' ? analytics?.today_earnings :
                period === 'week' ? analytics?.week_earnings :
                period === 'month' ? analytics?.month_earnings :
                analytics?.total_earnings || 0
              )}
              sub={`${period === 'today' ? analytics?.today_jobs : period === 'week' ? analytics?.week_jobs : period === 'month' ? analytics?.month_jobs : analytics?.total_jobs || 0} jobs`}
              accent="instant"
            />
            <StatBlock
              icon={Star}
              label="Avg rating"
              value={Number(analytics?.avg_rating || 0).toFixed(1)}
              sub={`${analytics?.total_reviews || 0} reviews`}
              accent="discovery"
            />
            <StatBlock
              icon={Briefcase}
              label="Acceptance"
              value={`${Math.round(Number(analytics?.acceptance_rate || 0) * 100)}%`}
              sub="of offers accepted"
              accent="brand"
            />
            <StatBlock
              icon={Clock}
              label="Completion"
              value={`${Math.round(Number(analytics?.completion_rate || 0) * 100)}%`}
              sub="jobs completed"
              accent="brand"
            />
          </div>

          {/* Earnings breakdown */}
          <div className="glass rounded-2xl p-5 space-y-4">
            <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider">Earnings breakdown</p>
            <EarningsBar label="Today" amount={Number(analytics?.today_earnings || 0)} max={maxEarnings} />
            <EarningsBar label="This week" amount={Number(analytics?.week_earnings || 0)} max={maxEarnings} />
            <EarningsBar label="This month" amount={Number(analytics?.month_earnings || 0)} max={maxEarnings} />
          </div>

          {/* Cancellation score */}
          {analytics?.cancellation_score !== undefined && (
            <div className="glass-light rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-[--text-primary]">Reliability score</p>
                <p className={`text-sm font-mono font-bold ${
                  Number(analytics.cancellation_score) >= 0.8 ? 'text-instant' :
                  Number(analytics.cancellation_score) >= 0.5 ? 'text-discovery' : 'text-red-400'
                }`}>
                  {(Number(analytics.cancellation_score) * 100).toFixed(0)}%
                </p>
              </div>
              <div className="h-2 bg-[--card-bg] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Number(analytics.cancellation_score) * 100}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className={`h-full rounded-full ${
                    Number(analytics.cancellation_score) >= 0.8 ? 'bg-instant' :
                    Number(analytics.cancellation_score) >= 0.5 ? 'bg-discovery' : 'bg-red-400'
                  }`}
                />
              </div>
              <p className="text-xs text-[--text-muted] mt-2">
                Affects your job matching priority. Complete more jobs to improve.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}