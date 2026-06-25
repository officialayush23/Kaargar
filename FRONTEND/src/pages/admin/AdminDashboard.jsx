import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Zap, Users, IndianRupee, TrendingUp, Activity, AlertCircle, Clock, CheckCircle, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'

function StatCard({ label, value, sub, icon: Icon, color, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 24 }}
      style={{
        background: 'rgba(13,17,23,0.85)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
        padding: '18px 20px',
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <p style={{ color: '#475569', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </p>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <p style={{ fontSize: 26, fontWeight: 700, fontFamily: 'monospace', color: '#F1F5F9', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ color: '#334155', fontSize: 11, marginTop: 6 }}>{sub}</p>}
    </motion.div>
  )
}

function QuickLink({ label, to, count, color }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(to)}
      className="flex items-center justify-between w-full px-4 py-3 rounded-xl transition-all text-left"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#92400E'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
    >
      <div className="flex items-center gap-3">
        {count != null && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: `${color}18`, color }}>{count}</span>
        )}
        <span style={{ color: '#94A3B8', fontSize: 13 }}>{label}</span>
      </div>
      <ArrowRight size={14} style={{ color: '#334155' }} />
    </button>
  )
}

export default function AdminDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.get('/admin/dashboard/live').then(r => r.data),
    refetchInterval: 15_000,
  })

  if (error) return (
    <div className="rounded-2xl p-5 flex items-center gap-3"
      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
      <AlertCircle size={18} style={{ color: '#f87171' }} />
      <p style={{ color: '#f87171', fontSize: 13 }}>Failed to load dashboard. Check backend connection.</p>
    </div>
  )

  const stats = [
    { label: 'Active Jobs',      value: data?.active_jobs ?? 0,      sub: 'currently in progress',    icon: Zap,          color: '#22c55e' },
    { label: 'Online Workers',   value: data?.online_workers ?? 0,    sub: 'accepting jobs now',       icon: Users,        color: '#4B7BFF' },
    { label: "Today's Revenue",  value: `₹${(data?.today_revenue ?? 0).toLocaleString('en-IN')}`, sub: 'platform fees', icon: IndianRupee, color: '#f59e0b' },
    { label: 'Searching',        value: data?.searching_jobs ?? 0,    sub: 'finding a worker',         icon: Activity,     color: '#a78bfa' },
    { label: 'Fill Rate',        value: data?.fill_rate != null ? `${Number(data.fill_rate).toFixed(1)}%` : '—', sub: 'jobs matched', icon: TrendingUp, color: '#34d399' },
    { label: 'Pending Verif.',   value: data?.pending_verifications ?? '—', sub: 'workers awaiting approval', icon: Clock, color: '#fb923c' },
  ]

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold font-syne" style={{ color: '#F1F5F9' }}>Live Dashboard</h1>
        <p style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>Real-time platform metrics · auto-refreshes every 15s</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-7">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-28 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-7">
          {stats.map((s, i) => <StatCard key={s.label} {...s} delay={i * 0.04} />)}
        </div>
      )}

      {/* Quick actions */}
      <div style={{ background: 'rgba(13,17,23,0.85)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 20px' }}>
        <p style={{ color: '#475569', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Quick Actions
        </p>
        <div className="space-y-2">
          <QuickLink label="Pending worker verifications" to="/admin/workers" count={data?.pending_verifications} color="#f59e0b" />
          <QuickLink label="Open support tickets" to="/admin/support" count={data?.open_tickets} color="#f87171" />
          <QuickLink label="Recent jobs" to="/admin/jobs" color="#4B7BFF" />
          <QuickLink label="Platform configuration" to="/admin/config" color="#94A3B8" />
        </div>
      </div>
    </div>
  )
}
