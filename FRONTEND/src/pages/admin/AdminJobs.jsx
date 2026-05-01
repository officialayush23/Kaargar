/**
 * AdminJobs — all jobs table with status filter + detail view.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, AlertTriangle, Zap, Clock, CheckCircle, XCircle, Eye } from 'lucide-react'
import { api } from '@/lib/api'
import { formatRelativeTime, formatCurrency } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

const STATUS_CFG = {
  searching:  { label: 'Searching',  color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  assigned:   { label: 'Assigned',   color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  en_route:   { label: 'En route',   color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  arrived:    { label: 'Arrived',    color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  started:    { label: 'In progress',color: '#4B7BFF', bg: 'rgba(75,123,255,0.12)'  },
  completed:  { label: 'Completed',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)'   },
  cancelled:  { label: 'Cancelled',  color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  failed:     { label: 'Failed',     color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, color: '#94A3B8', bg: 'rgba(148,163,184,0.1)' }
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function JobDetailDialog({ job, open, onClose }) {
  if (!job) return null
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Job #{job.id?.slice(0,8)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Category', job.category?.name || '—'],
              ['Type', job.job_type || '—'],
              ['Status', job.status],
              ['Amount', job.final_amount ? formatCurrency(job.final_amount) : '—'],
              ['Client', job.client?.full_name || '—'],
              ['Worker', job.assigned_worker?.full_name || 'Unassigned'],
              ['Location', job.location_area || job.location_address || '—'],
              ['Created', formatRelativeTime(job.created_at)],
            ].map(([k, v]) => (
              <div key={k} className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p style={{ color: '#475569', fontSize: 10 }}>{k}</p>
                <p style={{ color: '#F1F5F9', fontWeight: 500, marginTop: 2, wordBreak: 'break-all' }}>{String(v)}</p>
              </div>
            ))}
          </div>
          {job.description && (
            <div className="p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p style={{ color: '#475569', fontSize: 10, marginBottom: 4 }}>Description</p>
              <p style={{ color: '#94A3B8', lineHeight: 1.6 }}>{job.description}</p>
            </div>
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
    queryFn: () => api.get('/admin/jobs', { params: { status: status === 'all' ? undefined : status, limit: 200 } }).then(r => r.data?.jobs || r.data || []),
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
        <h1 className="text-2xl font-bold font-syne" style={{ color: '#F1F5F9' }}>Jobs</h1>
        <p className="text-sm mt-1" style={{ color: '#475569' }}>Monitor all platform jobs</p>
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
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#475569' }} />
          <Input
            placeholder="Search jobs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 w-52 h-9 text-xs"
            style={{ background: 'rgba(13,17,23,0.8)' }}
          />
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <AlertTriangle size={32} style={{ color: '#334155', margin: '0 auto 12px' }} />
            <p style={{ color: '#475569' }}>No jobs found</p>
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
                  <TableCell className="font-mono text-[11px]" style={{ color: '#94A3B8' }}>
                    #{job.id?.slice(0,8)}
                  </TableCell>
                  <TableCell style={{ color: '#F1F5F9' }}>{job.category?.name || '—'}</TableCell>
                  <TableCell>{job.client?.full_name || '—'}</TableCell>
                  <TableCell>{job.assigned_worker?.full_name || <span style={{ color: '#475569' }}>Unassigned</span>}</TableCell>
                  <TableCell><StatusBadge status={job.status} /></TableCell>
                  <TableCell className="font-mono">
                    {job.final_amount ? formatCurrency(job.final_amount) : <span style={{ color: '#475569' }}>—</span>}
                  </TableCell>
                  <TableCell style={{ color: '#475569', fontSize: 11 }}>{formatRelativeTime(job.created_at)}</TableCell>
                  <TableCell>
                    <button onClick={() => setSelected(job)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                      <Eye size={13} style={{ color: '#94A3B8' }} />
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
