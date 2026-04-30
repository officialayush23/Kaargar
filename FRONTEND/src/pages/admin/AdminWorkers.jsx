/**
 * AdminWorkers — Worker verification queue + full worker list.
 * Tabs: Pending Verification | All Workers
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, Clock, ChevronRight, User, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'

const TABS = ['Pending', 'All Workers']

/* ── Pending verification list ── */
function PendingWorkers() {
  const qc = useQueryClient()
  const { data: workers = [], isLoading } = useQuery({
    queryKey: ['admin', 'workers', 'pending'],
    queryFn: async () => {
      const { data } = await api.get('/admin/workers/pending')
      return data
    },
    refetchInterval: 30_000,
  })

  const approve = useMutation({
    mutationFn: (id) => api.post(`/admin/workers/${id}/approve`),
    onSuccess: () => {
      toast.success('Worker approved')
      qc.invalidateQueries({ queryKey: ['admin', 'workers'] })
    },
    onError: () => toast.error('Failed to approve worker'),
  })

  const [rejectId, setRejectId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const reject = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/admin/workers/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Worker rejected')
      setRejectId(null)
      setRejectReason('')
      qc.invalidateQueries({ queryKey: ['admin', 'workers'] })
    },
    onError: () => toast.error('Failed to reject worker'),
  })

  if (isLoading) return (
    <div className="text-center py-12" style={{ color: '#475569' }}>Loading…</div>
  )

  if (workers.length === 0) return (
    <div className="text-center py-16"
      style={{ color: '#475569', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 16 }}>
      <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium">No pending verifications</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {workers.map((w) => (
        <motion.div
          key={w.id}
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="rounded-2xl p-4"
          style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
              >
                {w.full_name?.[0]?.toUpperCase() || 'W'}
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate" style={{ color: '#F1F5F9' }}>
                  {w.full_name || 'Unknown'}
                </p>
                <p className="text-xs truncate mt-0.5" style={{ color: '#475569' }}>
                  {w.email} · {w.pune_area || 'Area not set'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
                  {w.experience_years || 0} yrs exp · Applied {new Date(w.created_at).toLocaleDateString('en-IN')}
                </p>
              </div>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => approve.mutate(w.id)}
                disabled={approve.isPending}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}
              >
                <CheckCircle className="h-3.5 w-3.5 inline mr-1" />
                Approve
              </button>
              <button
                onClick={() => setRejectId(rejectId === w.id ? null : w.id)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <XCircle className="h-3.5 w-3.5 inline mr-1" />
                Reject
              </button>
            </div>
          </div>

          {/* Documents list */}
          {w.documents?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {w.documents.map((doc) => (
                <a
                  key={doc.id}
                  href={doc.cloudinary_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg text-xs transition-all"
                  style={{
                    background: 'rgba(75,123,255,0.12)',
                    color: '#6B94FF',
                    border: '1px solid rgba(75,123,255,0.25)',
                  }}
                >
                  📄 {doc.type}
                </a>
              ))}
            </div>
          )}

          {/* Reject reason input */}
          <AnimatePresence>
            {rejectId === w.id && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3"
              >
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection (sent to worker)"
                  rows={2}
                  className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#F1F5F9',
                  }}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => reject.mutate({ id: w.id, reason: rejectReason })}
                    disabled={!rejectReason.trim() || reject.isPending}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50"
                    style={{ background: '#ef4444', color: '#fff' }}
                  >
                    Confirm Rejection
                  </button>
                  <button
                    onClick={() => { setRejectId(null); setRejectReason('') }}
                    className="px-4 py-1.5 rounded-xl text-xs"
                    style={{ color: '#475569' }}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  )
}

/* ── All workers list (basic) ── */
function AllWorkers() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'workers', 'all', page],
    queryFn: async () => {
      // This endpoint may need to be created in the backend; using workers/pending as fallback shape
      try {
        const { data } = await api.get(`/admin/workers?page=${page}&limit=20`)
        return data
      } catch {
        return { items: [], total: 0, pages: 1 }
      }
    },
  })

  const workers = data?.items ?? []

  if (isLoading) return (
    <div className="text-center py-12" style={{ color: '#475569' }}>Loading…</div>
  )

  return (
    <div>
      <div className="space-y-2">
        {workers.length === 0 ? (
          <div className="text-center py-12" style={{ color: '#475569' }}>
            <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No workers found</p>
          </div>
        ) : workers.map((w) => (
          <div
            key={w.id}
            className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
            >
              {w.full_name?.[0]?.toUpperCase() || 'W'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: '#F1F5F9' }}>
                {w.full_name || 'Unknown'}
              </p>
              <p className="text-xs truncate" style={{ color: '#475569' }}>{w.email}</p>
            </div>
            <StatusBadge status={w.verification_status} />
            <StatusBadge status={w.status} />
          </div>
        ))}
      </div>

      {data?.pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl text-sm disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}
          >
            ← Prev
          </button>
          <span className="text-sm" style={{ color: '#475569' }}>
            {page} / {data.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
            disabled={page === data.pages}
            className="px-4 py-2 rounded-xl text-sm disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    online:   { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80' },
    offline:  { bg: 'rgba(71,85,105,0.3)',     color: '#94A3B8' },
    approved: { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80' },
    pending:  { bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24' },
    rejected: { bg: 'rgba(239,68,68,0.15)',   color: '#f87171' },
    banned:   { bg: 'rgba(239,68,68,0.15)',   color: '#f87171' },
  }
  const style = map[status] || { bg: 'rgba(255,255,255,0.06)', color: '#94A3B8' }
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0"
      style={{ background: style.bg, color: style.color }}
    >
      {status}
    </span>
  )
}

/* ── Page ── */
export default function AdminWorkers() {
  const [tab, setTab] = useState(0)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-syne" style={{ color: '#F1F5F9' }}>Workers</h1>
        <p className="text-sm mt-1" style={{ color: '#475569' }}>
          Verify new worker applications and manage existing workers
        </p>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 rounded-2xl mb-6 w-fit"
        style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className="px-5 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: tab === i ? 'rgba(245,158,11,0.15)' : 'transparent',
              color: tab === i ? '#f59e0b' : '#94A3B8',
              border: tab === i ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {tab === 0 ? <PendingWorkers /> : <AllWorkers />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
