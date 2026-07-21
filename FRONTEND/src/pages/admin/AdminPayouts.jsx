/**
 * AdminPayouts — payout ledger with summary stats and filterable table.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { IndianRupee, Clock, CheckCircle, XCircle, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { GlassSelect } from '@/components/glass/GlassSelect'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const STATUS_CFG = {
  pending:    { label: 'Pending',    color: 'var(--accent)', bg: 'var(--accent-bg)',  icon: Clock },
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

/* Manual disbursement — there's no automated Razorpay Payouts/RazorpayX
   integration wired up (that's a separate KYC'd product from plain
   Razorpay checkout), so today the admin transfers the money themselves
   via UPI/NEFT using the worker's bank/UPI details below, then records
   that transfer here so it moves out of "Pending". */
function PayoutActionDialog({ payout, mode, onClose }) {
  const [value, setValue] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => mode === 'paid'
      ? api.post(`/admin/payouts/${payout.id}/mark-paid`, { transfer_reference: value || undefined })
      : api.post(`/admin/payouts/${payout.id}/mark-failed`, { reason: value }),
    onSuccess: () => {
      toast.success(mode === 'paid' ? 'Payout marked as paid' : 'Payout marked as failed')
      queryClient.invalidateQueries({ queryKey: ['admin', 'payouts'] })
      onClose()
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to update payout')),
  })

  if (!payout) return null
  const isPaid = mode === 'paid'

  return (
    <Dialog open={!!payout} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isPaid ? 'Mark payout as paid' : 'Mark payout as failed'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {isPaid && (
            <div className="p-3 rounded-xl space-y-1" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Send ₹{Number(payout.net_amount).toLocaleString('en-IN')} to</p>
              {payout.payout_upi_id ? (
                <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{payout.payout_upi_id} (UPI)</p>
              ) : payout.payout_bank_account ? (
                <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {payout.payout_account_name || payout.worker_name} · {payout.payout_bank_account} · {payout.payout_ifsc}
                </p>
              ) : (
                <p style={{ color: '#f87171' }}>No payout method on file for this worker — contact them before sending.</p>
              )}
            </div>
          )}
          <div className="space-y-1">
            <label style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 500 }}>
              {isPaid ? 'Transfer reference (UPI txn ID / bank UTR) — optional' : 'Reason for failure'}
            </label>
            <Input
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={isPaid ? 'e.g. UPI/2024...' : 'e.g. Bank details rejected'}
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={mutation.isPending || (!isPaid && !value.trim())}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Saving…' : isPaid ? 'Confirm paid' : 'Confirm failed'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryCard({ label, value, sub, color, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 24 }}
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 16,
        padding: '18px 20px',
      }}
    >
      <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        {label}
      </p>
      <p style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace', color: color || 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 6 }}>{sub}</p>}
    </motion.div>
  )
}

export default function AdminPayouts() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [actionDialog, setActionDialog] = useState(null) // { payout, mode: 'paid'|'failed' }

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
        <h1 className="text-2xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>Payouts</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Worker earnings disbursement ledger</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard label="Pending"    value={fmt(summary?.pending?.total    || 0)} sub={`${summary?.pending?.count    || 0} payouts`} color="var(--accent)" delay={0}    />
        <SummaryCard label="Processing" value={fmt(summary?.processing?.total || 0)} sub={`${summary?.processing?.count || 0} payouts`} color="#60a5fa" delay={0.04} />
        <SummaryCard label="Paid"       value={fmt(summary?.paid?.total       || 0)} sub={`${summary?.paid?.count       || 0} payouts`} color="#22c55e" delay={0.08} />
        <SummaryCard label="Failed"     value={fmt(summary?.failed?.total     || 0)} sub={`${summary?.failed?.count     || 0} payouts`} color="#f87171" delay={0.12} />
        <SummaryCard label="Today Paid" value={fmt(summary?.today_paid        || 0)} sub="released today"                               color="#a78bfa" delay={0.16} />
      </div>

      {/* Filter + table */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 16 }}>
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--card-border)' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 'auto' }}>
            {total} payouts
          </p>
          <GlassSelect
            size="sm"
            value={status}
            onChange={v => { setStatus(v); setPage(1) }}
            placeholder="All statuses"
            options={[
              { value: '', label: 'All statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'processing', label: 'Processing' },
              { value: 'paid', label: 'Paid' },
              { value: 'failed', label: 'Failed' },
            ]}
            align="right"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--card-bg)' }}>
                {['Worker', 'Job', 'Gross', 'Platform Fee', 'GST', 'TDS', 'Net Payout', 'Status', 'Date', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap"
                    style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton style={{ height: 14, background: 'var(--card-bg)', borderRadius: 4 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>
                    No payouts found
                  </td>
                </tr>
              ) : items.map((p, idx) => (
                <tr key={p.id}
                  style={{ borderTop: idx > 0 ? '1px solid var(--card-border)' : 'none' }}
                  className="hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3 font-medium whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                    {p.worker_name}
                  </td>
                  <td className="px-4 py-3 max-w-[140px] truncate" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    <span title={p.job_title}>{p.job_title || p.job_id.slice(0, 8)}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{fmt(p.gross_amount)}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: '#f87171' }}>-{fmt(p.platform_fee)}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: '#f87171' }}>-{fmt(p.gst_on_fee)}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: '#f87171' }}>-{fmt(p.tds_deducted)}</td>
                  <td className="px-4 py-3 font-mono text-sm font-bold" style={{ color: '#22c55e' }}>{fmt(p.net_amount)}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: 'var(--text-muted)' }}>
                    {p.processed_at
                      ? new Date(p.processed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
                      : new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {(p.status === 'pending' || p.status === 'processing') ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setActionDialog({ payout: p, mode: 'paid' })}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
                          style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}
                        >
                          Mark paid
                        </button>
                        <button
                          onClick={() => setActionDialog({ payout: p, mode: 'failed' })}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors"
                          style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}
                        >
                          Mark failed
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {p.razorpay_transfer_id || p.failure_reason || '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--card-border)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Page {page} of {pages}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded-lg text-xs disabled:opacity-30 transition-colors"
                style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
              >
                Prev
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded-lg text-xs disabled:opacity-30 transition-colors"
                style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <PayoutActionDialog
        payout={actionDialog?.payout}
        mode={actionDialog?.mode}
        onClose={() => setActionDialog(null)}
      />
    </div>
  )
}
