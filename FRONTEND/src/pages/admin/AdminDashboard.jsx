/**
 * AdminDashboard — live CRM overview with stats, activity, quick actions.
 */
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Zap, Users, IndianRupee, TrendingUp, Activity,
  AlertCircle, Clock, CheckCircle, ArrowRight, Briefcase,
  LifeBuoy, Shield, Settings, Wallet, ChevronRight,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'

const CARD_ANIM = i => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: i * 0.05, type: 'spring', stiffness: 280, damping: 26 },
})

function StatCard({ label, value, sub, icon: Icon, accent, i }) {
  return (
    <motion.div {...CARD_ANIM(i)}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--card-border)',
        borderRadius: 16,
        padding: '18px 20px',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </p>
        <div style={{
          width: 30, height: 30, borderRadius: 10,
          background: 'var(--card-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} style={{ color: accent }} />
        </div>
      </div>
      <p style={{ fontSize: 28, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', color: 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>{sub}</p>}
    </motion.div>
  )
}

function ActionRow({ icon: Icon, label, badge, badgeColor, to, desc }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(to)}
      className="w-full flex items-center gap-3 px-4 py-3 transition-all text-left rounded-xl group"
      style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--card-bg)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >
      <div
        style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--card-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <Icon size={15} style={{ color: 'var(--text-muted)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>{label}</p>
        {desc && <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 1 }}>{desc}</p>}
      </div>
      <div className="flex items-center gap-2">
        {badge != null && badge > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
            background: badgeColor ? `${badgeColor}20` : 'var(--card-bg)',
            color: badgeColor || 'var(--text-secondary)',
          }}>
            {badge}
          </span>
        )}
        <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
      </div>
    </button>
  )
}

const HEALTH_ITEMS = (data) => [
  {
    label: 'Fill rate', value: data?.fill_rate != null ? `${Number(data.fill_rate).toFixed(1)}%` : '—',
    ok: data?.fill_rate > 70,
    desc: '>70% is healthy',
  },
  {
    label: 'Online workers', value: data?.online_workers ?? '—',
    ok: data?.online_workers > 5,
    desc: 'Ready to accept jobs',
  },
  {
    label: 'Pending verif.', value: data?.pending_verifications ?? '—',
    ok: data?.pending_verifications === 0,
    desc: 'Workers awaiting approval',
  },
  {
    label: 'Open tickets', value: data?.open_tickets ?? '—',
    ok: data?.open_tickets === 0,
    desc: 'Support queue',
  },
]

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
      <p style={{ color: '#f87171', fontSize: 13 }}>Failed to load dashboard data — check backend connection.</p>
    </div>
  )

  const STATS = [
    { label: 'Active Jobs',     value: data?.active_jobs ?? 0,  sub: 'currently in progress',    icon: Zap,          accent: '#22c55e' },
    { label: 'Online Workers',  value: data?.online_workers ?? 0,    sub: 'accepting jobs now',   icon: Users,        accent: 'var(--accent)' },
    { label: "Today's Revenue", value: `₹${(data?.today_revenue ?? 0).toLocaleString('en-IN')}`, sub: 'platform commission', icon: IndianRupee, accent: 'var(--accent)' },
    { label: 'Searching',       value: data?.searching_jobs ?? 0,    sub: 'finding a worker',     icon: Activity,     accent: '#a78bfa' },
  ]

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Live Dashboard</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
          Real-time metrics · auto-refreshes every 15 seconds
        </p>
      </div>

      {/* Stat grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" style={{ background: 'var(--card-bg)' }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map((s, i) => <StatCard key={s.label} {...s} i={i} />)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Health signals */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 260, damping: 26 }}
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--card-border)', borderRadius: 16, padding: '18px 20px' }}
        >
          <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            Platform Health
          </p>
          <div className="space-y-3">
            {HEALTH_ITEMS(data).map(item => (
              <div key={item.label} className="flex items-center justify-between gap-4">
                <div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{item.label}</p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 1 }}>{item.desc}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {isLoading ? '—' : item.value}
                  </span>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: isLoading ? 'var(--text-secondary)' : item.ok ? '#22c55e' : '#f87171',
                    boxShadow: isLoading ? 'none' : item.ok ? '0 0 6px #22c55e80' : '0 0 6px #f8717180',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Quick navigation */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, type: 'spring', stiffness: 260, damping: 26 }}
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--card-border)', borderRadius: 16, padding: '18px 4px' }}
        >
          <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, paddingLeft: 16 }}>
            Quick Navigation
          </p>
          <ActionRow to="/admin/workers"    icon={Shield}      label="Worker Verifications" badge={data?.pending_verifications} badgeColor="#f59e0b" desc="Approve pending workers" />
          <ActionRow to="/admin/support"    icon={LifeBuoy}    label="Support Tickets"      badge={data?.open_tickets} badgeColor="#f87171" desc="Review open cases" />
          <ActionRow to="/admin/jobs"       icon={Briefcase}   label="Recent Jobs"          desc="All jobs across the platform" />
          <ActionRow to="/admin/payouts"    icon={Wallet}      label="Worker Payouts"       desc="Pending & completed payouts" />
          <ActionRow to="/admin/config"     icon={Settings}    label="Platform Config"      desc="Commission, limits, matching" />
        </motion.div>
      </div>
    </div>
  )
}
