/**
 * AdminJobs — all jobs table with status filter + detail view.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, AlertTriangle, Zap, Clock, CheckCircle, XCircle, Eye, CalendarRange } from 'lucide-react'
import { api } from '@/lib/api'
import { formatRelativeTime, formatCurrency } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const STATUS_CFG = {
  searching:  { label: 'Searching',  color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  assigned:   { label: 'Assigned',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)'  },
  en_route:   { label: 'En route',   color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  arrived:    { label: 'Arrived',    color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  started:    { label: 'In progress',color: '#D97706', bg: 'rgba(217,119,6,0.12)'  },
  completed:  { label: 'Completed',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  cancelled:  { label: 'Cancelled',  color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  failed:     { label: 'Failed',     color: 'var(--text-muted)', bg: 'rgba(107,114,128,0.12)' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, color: 'var(--text-secondary)', bg: 'rgba(148,163,184,0.1)' }
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function JobDetailDialog({ job, open, onClose }) {
  // The row passed in from the table already has the core fields (from
  // list_jobs), but this fetches the fuller GET /admin/jobs/{id} payload —
  // payment record, bundle day list, item receipts, event timeline — none
  // of which the list endpoint returns (deliberately, to keep it light).
  const { data: detail, isLoading } = useQuery({
    queryKey: ['admin', 'job-detail', job?.id],
    queryFn: () => api.get(`/admin/jobs/${job.id}`).then(r => r.data),
    enabled: open && !!job?.id,
  })

  if (!job) return null
  const d = detail || job

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Job #{job.id?.slice(0,8)}
            {d.bundle?.is_bundle && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent)' }}>
                <CalendarRange size={11} /> {d.bundle.total_days}-day booking
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Category', d.category?.name || '—'],
              ['Type', d.job_type || '—'],
              ['Status', d.status],
              ['Amount', d.final_amount ? formatCurrency(d.final_amount) : '—'],
              ['Payment', d.payment ? `${d.payment.status} · ${formatCurrency(d.payment.amount)}` : (d.payment_status || 'No payment yet')],
              ['Client', d.client?.full_name || '—'],
              ['Client contact', d.client?.phone || d.client?.email || '—'],
              ['Worker', d.assigned_worker?.full_name || 'Unassigned'],
              ['Worker contact', d.assigned_worker?.phone || '—'],
              ['Worker rating', d.assigned_worker ? `${d.assigned_worker.avg_rating}★ (${d.assigned_worker.rating_count ?? '—'})` : '—'],
              ['Location', d.location_area || d.location_address || '—'],
              ['Created', formatRelativeTime(d.created_at)],
            ].map(([k, v]) => (
              <div key={k} className="p-2.5 rounded-xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 10 }}>{k}</p>
                <p style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: 2, wordBreak: 'break-all' }}>{String(v)}</p>
              </div>
            ))}
          </div>

          {d.description && (
            <div className="p-2.5 rounded-xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 4 }}>Description</p>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{d.description}</p>
            </div>
          )}

          {d.status === 'cancelled' && d.cancellation_reason && (
            <div className="p-2.5 rounded-xl" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
              <p style={{ color: '#f87171', fontSize: 10, marginBottom: 4 }}>Cancelled by {d.cancelled_by || '—'}</p>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{d.cancellation_reason}</p>
            </div>
          )}

          {d.bundle?.is_bundle && d.bundle.days?.length > 0 && (
            <div className="p-2.5 rounded-xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 6 }}>Bundle days ({d.bundle.days.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {d.bundle.days.map(day => (
                  <span key={day.id} className="text-[11px] px-2 py-1 rounded-lg"
                    style={{ background: 'var(--surface)', color: 'var(--text-secondary)' }}>
                    Day {day.day_index} · {day.date || '—'} · {day.status}
                  </span>
                ))}
              </div>
            </div>
          )}

          {d.events?.length > 0 && (
            <div className="p-2.5 rounded-xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 10, marginBottom: 6 }}>Timeline</p>
              <div className="space-y-1.5">
                {d.events.map((ev, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-secondary)' }}>{ev.status} <span style={{ color: 'var(--text-muted)' }}>({ev.actor})</span></span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{formatRelativeTime(ev.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isLoading && !detail && (
            <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>Loading full details…</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const ALL_STATUSES = ['all', 'searching', 'assigned', 'started', 'completed', 'cancelled', 'failed']

export default function AdminJobs() {
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'jobs', status],
    queryFn: () => api.get('/admin/jobs', { params: { status: status === 'all' ? undefined : status, limit: 200 } }).then(r => r.data?.items || []),
    refetchInterval: 20_000,
  })

  const jobs = Array.isArray(data) ? data : []
  const filtered = jobs.filter(j => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (j.id || '').toLowerCase().includes(q) ||
      (j.category?.name || '').toLowerCase().includes(q) ||
      (j.client?.full_name || '').toLowerCase().includes(q) ||
      (j.location_area || j.location_address || '').toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>Jobs</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Monitor all platform jobs</p>
      </div>

      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList className="flex-wrap h-auto gap-1">
            {ALL_STATUSES.map(s => (
              <TabsTrigger key={s} value={s} className="capitalize text-xs">
                {s === 'all' ? 'All' : STATUS_CFG[s]?.label || s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <Input
            placeholder="Search jobs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 w-52 h-9 text-xs"
            style={{ background: 'var(--card-bg)' }}
          />
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10" style={{ background: 'var(--card-bg)' }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <AlertTriangle size={32} style={{ color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)' }}>No jobs found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Worker</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Time</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(job => (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    #{job.id?.slice(0,8)}
                    {job.is_bundle && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent)' }}>
                        <CalendarRange size={9} /> {job.total_days}d
                      </span>
                    )}
                  </TableCell>
                  <TableCell style={{ color: 'var(--text-primary)' }}>{job.category?.name || '—'}</TableCell>
                  <TableCell>{job.client?.full_name || '—'}</TableCell>
                  <TableCell>{job.assigned_worker?.full_name || <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}</TableCell>
                  <TableCell><StatusBadge status={job.status} /></TableCell>
                  <TableCell className="font-mono">
                    {job.final_amount ? formatCurrency(job.final_amount) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </TableCell>
                  <TableCell style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatRelativeTime(job.created_at)}</TableCell>
                  <TableCell>
                    <button onClick={() => setSelected(job)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                      <Eye size={13} style={{ color: 'var(--text-secondary)' }} />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <JobDetailDialog job={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  )
}
