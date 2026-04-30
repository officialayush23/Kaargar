import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Zap, Users, DollarSign, TrendingUp, AlertCircle, Activity } from 'lucide-react'
import { api } from '@/lib/api'

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5"
      style={{
        background: 'rgba(13,17,23,0.8)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#475569' }}>
          {label}
        </p>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}20` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-mono font-bold" style={{ color: '#F1F5F9' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: '#475569' }}>{sub}</p>}
    </motion.div>
  )
}

export default function AdminDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/admin/dashboard/live')
      return data
    },
    refetchInterval: 15_000,
  })

  if (isLoading) return (
    <div className="text-center py-20" style={{ color: '#475569' }}>
      Loading dashboard…
    </div>
  )

  if (error) return (
    <div className="rounded-2xl p-6 flex items-center gap-3"
      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
      <AlertCircle className="h-5 w-5 text-red-400" />
      <p className="text-sm text-red-400">Failed to load dashboard. Is the backend running?</p>
    </div>
  )

  const fillRate = data?.fill_rate != null
    ? `${Number(data.fill_rate).toFixed(1)}%`
    : '—'

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold font-syne" style={{ color: '#F1F5F9' }}>
          Live Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: '#475569' }}>
          Real-time platform metrics · auto-refreshes every 15s
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Active Jobs"
          value={data?.active_jobs ?? 0}
          sub="currently in progress"
          icon={Zap}
          color="#22c55e"
        />
        <StatCard
          label="Online Workers"
          value={data?.online_workers ?? 0}
          sub="accepting jobs right now"
          icon={Users}
          color="#4B7BFF"
        />
        <StatCard
          label="Today's Revenue"
          value={`₹${(data?.today_revenue ?? 0).toLocaleString('en-IN')}`}
          sub="platform fees collected"
          icon={DollarSign}
          color="#f59e0b"
        />
        <StatCard
          label="Searching"
          value={data?.searching_jobs ?? 0}
          sub="jobs finding a worker"
          icon={Activity}
          color="#a78bfa"
        />
        <StatCard
          label="Fill Rate"
          value={fillRate}
          sub="jobs successfully matched"
          icon={TrendingUp}
          color="#34d399"
        />
      </div>

      {/* Quick actions */}
      <div className="rounded-2xl p-5"
        style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <h2 className="text-sm font-semibold mb-4" style={{ color: '#94A3B8' }}>
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Pending Verifications', href: '/admin/workers', badge: null },
            { label: 'Open Support Tickets', href: '/admin/support', badge: null },
            { label: 'Recent Jobs',           href: '/admin/jobs',    badge: null },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#94A3B8',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(245,158,11,0.4)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
