/**
 * AdminPayouts — payout ledger with summary stats and filterable table.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { IndianRupee, Clock, CheckCircle, XCircle, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'

const STATUS_CFG = {
  pending:    { label: 'Pending',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: Clock },
  processing: { label: 'Processing', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  icon: RefreshCw },
  paid:       { label: 'Paid',       color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   icon: CheckCircle },
  failed:     { label: 'Failed',     color: '#f87171', bg: 'rgba(248,113,113,0.1)', icon: XCircle },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending
  const Icon = cfg.icon
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      <Icon size={10} /> {cfg.label}
    </span>
  )
}

function SummaryCard({ label, value, sub, color, delay }) {
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
      <p style={{ color: '#475569', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        {label}
      </p>
      <p style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace', color: color || '#F1F5F9', lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ color: '#475569', fontSize: 11, marginTop: 6 }}>{sub}</p>}
    </motion.div>
  )
}

export default function AdminPayouts() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const { data: summary } = useQuery({
    queryKey: ['admin', 'payouts', 'summary'],
    queryFn: () => api.get('/admin/payouts/summary').then(r => r.data).catch(() => ({})),
    refetchInterval: 30_000,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'payouts', status, page],
    queryFn: () => api.get('/admin/payouts', { params: { status: status || undefined, page, limit: 25 } }).then(r => r.data),
    keepPreviousData: true,
  })

  const items = data?.items || []
  const total = data?.total || 0
  const pages = data?.pages || 1

  const fmt = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-syne" style={{ color: '#F1F5F9' }}>Payouts</h1>
        <p style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>Worker earnings disbursement ledger</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard label="Pending"    value={fmt(summary?.pending?.total    || 0)} sub={`${summary?.pending?.count    || 0} payouts`} color="#f59e0b" delay={0}    />
        <SummaryCard label="Processing" value={fmt(summary?.processing?.total || 0)} sub={`${summary?.processing?.count || 0} payouts`} color="#60a5fa" delay={0.04} />
        <SummaryCard label="Paid"       value={fmt(summary?.paid?.total       || 0)} sub={`${summary?.paid?.count       || 0} payouts`} color="#22c55e" delay={0.08} />
        <SummaryCard label="Failed"     value={fmt(summary?.failed?.total     || 0)} sub={`${summary?.failed?.count     || 0} payouts`} color="#f87171" delay={0.12} />
        <SummaryCard label="Today Paid" value={fmt(summary?.today_paid        || 0)} sub="released today"                               color="#a78bfa" delay={0.16} />
      </div>

      {/* Filter + table */}
      <div style={{ background: 'rgba(13,17,23,0.85)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16 }}>
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ color: '#475569', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 'auto' }}>
            {total} payouts
          </p>
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1) }}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8' }}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                {['Worker', 'Job', 'Gross', 'Platform Fee', 'GST', 'TDS', 'Net Payout', 'Status', 'Date'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap"
                    style={{ color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton style={{ height: 14, background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center" style={{ color: '#334155' }}>
                    No payouts found
                  </td>
                </tr>
              ) : items.map((p, idx) => (
                <tr key={p.id}
                  style={{ borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                  className="hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: '#F1F5F9' }}>
                    {p.worker_name}
                  </td>
                  <td className="px-4 py-3 max-w-[140px] truncate" style={{ color: '#64748B', fontSize: 12 }}>
                    <span title={p.job_title}>{p.job_title || p.job_id.slice(0, 8)}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: '#94A3B8' }}>{fmt(p.gross_amount)}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: '#f87171' }}>-{fmt(p.platform_fee)}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: '#f87171' }}>-{fmt(p.gst_on_fee)}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: '#f87171' }}>-{fmt(p.tds_deducted)}</td>
                  <td className="px-4 py-3 font-mono text-sm font-bold" style={{ color: '#22c55e' }}>{fmt(p.net_amount)}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: '#475569' }}>
                    {p.processed_at
                      ? new Date(p.processed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
                      : new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: '#475569', fontSize: 12 }}>Page {page} of {pages}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded-lg text-xs disabled:opacity-30 transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Prev
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded-lg text-xs disabled:opacity-30 transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
