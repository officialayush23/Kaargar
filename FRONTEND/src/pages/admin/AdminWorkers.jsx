/**
 * AdminWorkers — worker verification queue + approved workers table.
 * Uses shadcn Table + Tabs + Dialog for confirm/reject flow.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, Eye, Search, BadgeCheck, Clock, AlertTriangle, FileText } from 'lucide-react'
import { api } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: Clock },
  approved: { label: 'Approved', color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   icon: BadgeCheck },
  rejected: { label: 'Rejected', color: '#f87171', bg: 'rgba(248,113,113,0.12)', icon: XCircle },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const Icon = cfg.icon
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      <Icon size={10} /> {cfg.label}
    </span>
  )
}

function WorkerRow({ worker, onApprove, onReject, onView }) {
  const name = worker.full_name || worker.user?.full_name || 'Unknown'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={worker.avatar_url || worker.user?.avatar_url} />
            <AvatarFallback className="text-xs font-bold" style={{ background: 'rgba(75,123,255,0.15)', color: '#4B7BFF' }}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium" style={{ color: '#F1F5F9' }}>{name}</p>
            <p className="text-[11px]" style={{ color: '#475569' }}>{worker.user?.email || worker.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>{worker.primary_category || '—'}</TableCell>
      <TableCell>{worker.pune_area || '—'}</TableCell>
      <TableCell><StatusBadge status={worker.verification_status} /></TableCell>
      <TableCell style={{ color: '#475569' }}>{formatRelativeTime(worker.created_at)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <button onClick={() => onView(worker)}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
            title="View details">
            <Eye size={14} style={{ color: '#94A3B8' }} />
          </button>
          {worker.verification_status === 'pending' && (
            <>
              <button onClick={() => onApprove(worker)}
                className="p-1.5 rounded-lg transition-colors hover:bg-green-500/10"
                title="Approve">
                <CheckCircle size={14} style={{ color: '#22c55e' }} />
              </button>
              <button onClick={() => onReject(worker)}
                className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                title="Reject">
                <XCircle size={14} style={{ color: '#f87171' }} />
              </button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function WorkerDetailDialog({ worker, open, onClose, onApprove, onReject, approving, rejecting }) {
  const name = worker?.full_name || worker?.user?.full_name || 'Worker'
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent onClose={onClose} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Worker Profile — {name}</DialogTitle>
        </DialogHeader>

        {worker && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Email', worker.user?.email || worker.email],
                ['Phone', worker.user?.phone || worker.phone || '—'],
                ['Category', worker.primary_category || '—'],
                ['Area', worker.pune_area || '—'],
                ['Type', worker.worker_type || 'individual'],
                ['Status', worker.verification_status],
              ].map(([k, v]) => (
                <div key={k} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p style={{ color: '#475569', fontSize: 11 }}>{k}</p>
                  <p style={{ color: '#F1F5F9', fontWeight: 500, marginTop: 2 }}>{v}</p>
                </div>
              ))}
            </div>

            {worker.bio && (
              <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p style={{ color: '#475569', fontSize: 11, marginBottom: 4 }}>Bio</p>
                <p style={{ color: '#94A3B8', lineHeight: 1.6 }}>{worker.bio}</p>
              </div>
            )}

            {worker.documents?.length > 0 && (
              <div>
                <p style={{ color: '#475569', fontSize: 11, marginBottom: 8 }}>Documents</p>
                <div className="space-y-2">
                  {worker.documents.map((doc, i) => (
                    <a key={i} href={doc.cloudinary_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 p-2.5 rounded-xl transition-colors hover:bg-white/5"
                      style={{ border: '1px solid rgba(255,255,255,0.07)', color: '#4B7BFF', textDecoration: 'none' }}>
                      <FileText size={14} />
                      <span style={{ fontSize: 12 }}>{doc.type?.replace('_', ' ') || 'Document'}</span>
                      <span style={{ color: '#475569', fontSize: 11, marginLeft: 'auto' }}>View &#8594;</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {worker?.verification_status === 'pending' && (
          <DialogFooter>
            <Button variant="destructive" disabled={rejecting} onClick={() => onReject(worker)}>
              {rejecting ? 'Rejecting…' : 'Reject'}
            </Button>
            <Button disabled={approving} onClick={() => onApprove(worker)}
              style={{ background: '#22c55e', color: '#fff' }}>
              {approving ? 'Approving…' : 'Approve'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function AdminWorkers() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('pending')
  const [search, setSearch] = useState('')
  const [selectedWorker, setSelectedWorker] = useState(null)
  const [approvingId, setApprovingId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)

  const { data: workers = [], isLoading } = useQuery({
    queryKey: ['admin', 'workers', tab],
    queryFn: () => api.get('/admin/workers', { params: { status: tab, limit: 100 } }).then(r => r.data?.workers || r.data || []),
    refetchInterval: 30_000,
  })

  const approveMut = useMutation({
    mutationFn: async (worker) => {
      setApprovingId(worker.id)
      return api.post(`/admin/workers/${worker.user_id || worker.id}/approve`)
    },
    onSuccess: () => { qc.invalidateQueries(['admin', 'workers']); toast.success('Worker approved'); setSelectedWorker(null) },
    onError: () => toast.error('Approval failed'),
    onSettled: () => setApprovingId(null),
  })

  const rejectMut = useMutation({
    mutationFn: async (worker) => {
      setRejectingId(worker.id)
      return api.post(`/admin/workers/${worker.user_id || worker.id}/reject`, { reason: 'Does not meet requirements' })
    },
    onSuccess: () => { qc.invalidateQueries(['admin', 'workers']); toast.success('Worker rejected'); setSelectedWorker(null) },
    onError: () => toast.error('Rejection failed'),
    onSettled: () => setRejectingId(null),
  })

  const filtered = workers.filter(w => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (w.full_name || w.user?.full_name || '').toLowerCase().includes(q) ||
      (w.user?.email || w.email || '').toLowerCase().includes(q) ||
      (w.primary_category || '').toLowerCase().includes(q) ||
      (w.pune_area || '').toLowerCase().includes(q)
    )
  })

  const pendingCount = workers.filter(w => w.verification_status === 'pending').length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-syne" style={{ color: '#F1F5F9' }}>Workers</h1>
        <p className="text-sm mt-1" style={{ color: '#475569' }}>Manage worker verification and profiles</p>
      </div>

      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="pending">
              Pending {pendingCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(245,158,11,0.3)' }}>{pendingCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#475569' }} />
          <Input
            placeholder="Search workers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 w-56 h-9 text-xs"
            style={{ background: 'rgba(13,17,23,0.8)' }}
          />
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-12" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <AlertTriangle size={32} style={{ color: '#334155', margin: '0 auto 12px' }} />
            <p style={{ color: '#475569' }}>No workers found</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(worker => (
                <WorkerRow
                  key={worker.id}
                  worker={worker}
                  onApprove={(w) => approveMut.mutate(w)}
                  onReject={(w) => rejectMut.mutate(w)}
                  onView={setSelectedWorker}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <WorkerDetailDialog
        worker={selectedWorker}
        open={!!selectedWorker}
        onClose={() => setSelectedWorker(null)}
        onApprove={(w) => approveMut.mutate(w)}
        onReject={(w) => rejectMut.mutate(w)}
        approving={!!approvingId}
        rejecting={!!rejectingId}
      />
    </div>
  )
}
