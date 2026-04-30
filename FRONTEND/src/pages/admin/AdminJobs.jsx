/**
 * AdminJobs — view and filter all platform jobs.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Zap, Compass, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { api } from '@/lib/api'

const STATUS_COLORS = {
  searching:  { bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24' },
  active:     { bg: 'rgba(34,197,94,0.15)',   color: '#4ade80' },
  completed:  { bg: 'rgba(75,123,255,0.15)',  color: '#6B94FF' },
  cancelled:  { bg: 'rgba(239,68,68,0.15)',   color: '#f87171' },
  failed:     { bg: 'rgba(239,68,68,0.15)',   color: '#f87171' },
  pending:    { bg: 'rgba(71,85,105,0.3)',    color: '#94A3B8' },
  assigned:   { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' },
}

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || { bg: 'rgba(255,255,255,0.06)', color: '#94A3B8' }
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0"
      style={{ background: s.bg, color: s.color }}
    >
      {status}
    </span>
  )
}

const FILTER_OPTIONS = ['all', 'searching', 'active', 'completed', 'cancelled', 'failed']

export default function AdminJobs() {
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'jobs', filter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page, limit: 20 })
      if (filter !== 'all') params.set('status', filter)
      try {
        const { data } = await api.get(`/admin/jobs?${params}`)
        return data
      } catch {
        return { items: [], total: 0, pages: 1 }
      }
    },
    keepPreviousData: true,
  })

  const jobs = data?.items ?? []

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-syne" style={{ color: '#F1F5F9' }}>Jobs</h1>
        <p className="text-sm mt-1" style={{ color: '#475569' }}>
          All platform jobs across Instant and Discovery modes
        </p>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1) }}
            className="px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all"
            style={{
              background: filter === f ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
              color: filter === f ? '#f59e0b' : '#94A3B8',
              border: filter === f ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16" style={{ color: '#475569' }}>Loading…</div>
      ) : error ? (
        <div className="rounded-2xl p-4 flex items-center gap-3"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-400">Failed to load jobs</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#475569' }}>
          <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No jobs found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: job.job_type === 'instant' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                }}
              >
                {job.job_type === 'instant'
                  ? <Zap className="h-4 w-4 text-green-400" />
                  : <Compass className="h-4 w-4 text-amber-400" />
                }
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#F1F5F9' }}>
                  {job.title || job.category_id?.slice(0, 8) || 'Job'}
                </p>
                <p className="text-xs truncate mt-0.5" style={{ color: '#475569' }}>
                  {job.location_address} · {new Date(job.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge status={job.status} />
                {job.quoted_price && (
                  <span className="text-xs font-mono" style={{ color: '#94A3B8' }}>
                    ₹{Number(job.quoted_price).toLocaleString('en-IN')}
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
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
            Page {page} of {data.pages}
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
