/**
 * AdminWorkers — worker verification queue with full-detail side panel.
 * Detail panel fetches /admin/workers/{id}/detail on open.
 * Shows docs (image previews), intro video player, categories, services.
 * Actions: Approve, Reject (+ reason), Suspend, Request Re-upload.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle, XCircle, Eye, Search, BadgeCheck, Clock, AlertTriangle,
  FileText, Video, ChevronRight, User, MapPin, Briefcase, Star,
  ShieldAlert, RefreshCw, X, ExternalLink, Loader2, Phone, Mail,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  color: 'var(--accent)', bg: 'var(--accent-deep)',  icon: Clock },
  approved: { label: 'Approved', color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   icon: BadgeCheck },
  rejected: { label: 'Rejected', color: '#f87171', bg: 'rgba(248,113,113,0.12)', icon: XCircle },
}

const DOC_LABEL = {
  aadhaar:          'Aadhaar Card',
  pan:              'PAN Card',
  driving_license:  'Driving Licence',
  voter_id:         'Voter ID',
  passport:         'Passport',
  verification_video: 'Intro Video',
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

function WorkerRow({ worker, onView }) {
  const name = worker.full_name || worker.user?.full_name || 'Unknown'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  return (
    <TableRow
      className="cursor-pointer hover:bg-white/3 transition-colors"
      onClick={() => onView(worker)}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={worker.avatar_url || worker.user?.avatar_url} />
            <AvatarFallback className="text-xs font-bold" style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)' }}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{name}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{worker.user?.email || worker.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{worker.primary_category || '—'}</TableCell>
      <TableCell style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{worker.pune_area || '—'}</TableCell>
      <TableCell><StatusBadge status={worker.verification_status} /></TableCell>
      <TableCell style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatRelativeTime(worker.created_at)}</TableCell>
      <TableCell>
        <div className="flex items-center justify-end">
          <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
        </div>
      </TableCell>
    </TableRow>
  )
}

// ── Full-screen detail panel ──────────────────────────────────────────────────

function DetailField({ label, value, icon: Icon }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '10px',
      padding: '10px 12px', borderRadius: '10px',
      background: 'var(--card-bg)', border: '1px solid var(--card-border)',
    }}>
      {Icon && <Icon size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</p>
        <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, wordBreak: 'break-word' }}>
          {value || '—'}
        </p>
      </div>
    </div>
  )
}

function DocCard({ doc }) {
  const label = DOC_LABEL[doc.type] || doc.type?.replace(/_/g, ' ')
  const isVideo = doc.type === 'verification_video'
  const isImage = doc.url && !isVideo

  return (
    <div style={{
      borderRadius: '12px', overflow: 'hidden',
      border: '1px solid var(--card-border)',
      background: 'var(--card-bg)',
    }}>
      {isVideo ? (
        <div style={{ background: '#000', position: 'relative' }}>
          <video
            controls
            style={{ width: '100%', maxHeight: '200px', objectFit: 'contain', display: 'block' }}
            src={doc.url}
          >
            <a href={doc.url} target="_blank" rel="noreferrer">Open video</a>
          </video>
        </div>
      ) : isImage ? (
        <a href={doc.url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
          <img
            src={doc.url}
            alt={label}
            style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }}
            onError={e => { e.target.style.display = 'none' }}
          />
        </a>
      ) : (
        <a href={doc.url} target="_blank" rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80px', gap: '8px', textDecoration: 'none', color: 'var(--text-secondary)' }}>
          <FileText size={24} />
          <span style={{ fontSize: 13 }}>View file</span>
          <ExternalLink size={12} />
        </a>
      )}
      <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        <a href={doc.url} target="_blank" rel="noreferrer"
          style={{ fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none', flexShrink: 0 }}>
          Open <ExternalLink size={10} />
        </a>
      </div>
    </div>
  )
}

function WorkerDetailPanel({ workerId, onClose, onApprove, onReject, onSuspend, onRequestReupload }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['admin', 'worker-detail', workerId],
    queryFn: () => api.get(`/admin/workers/${workerId}/detail`).then(r => r.data),
    enabled: !!workerId,
  })

  const name = detail?.full_name || 'Worker'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const identityDocs = (detail?.documents || []).filter(d => d.type !== 'verification_video')
  const videoDocs = (detail?.documents || []).filter(d => d.type === 'verification_video')

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)', zIndex: 50,
        }}
      />

      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '560px', maxWidth: '100vw',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--card-border)',
          zIndex: 51,
          display: 'flex', flexDirection: 'column',
          overflowY: 'hidden',
        }}
      >
        {/* Panel header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--card-border)',
          display: 'flex', alignItems: 'center', gap: '16px',
          background: 'var(--bg-surface)', flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={15} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Worker Details
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Verification review
            </p>
          </div>
          {detail && <StatusBadge status={detail.verification_status} />}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => (
                <Skeleton key={i} className="h-14 rounded-xl" style={{ background: 'var(--card-bg)' }} />
              ))}
            </div>
          ) : detail ? (
            <>
              {/* Worker identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Avatar className="h-16 w-16">
                  <AvatarImage src={detail.avatar_url} />
                  <AvatarFallback className="text-xl font-bold" style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)' }}>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {detail.full_name}
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '3px' }}>{detail.email}</p>
                  {detail.phone && (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{detail.phone}</p>
                  )}
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Joined {formatRelativeTime(detail.created_at)}
                  </p>
                </div>
              </div>

              {/* Info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <DetailField label="Area" value={detail.pune_area} icon={MapPin} />
                <DetailField label="Experience" value={detail.experience_years ? `${detail.experience_years} yrs` : null} icon={Briefcase} />
                <DetailField label="Avg Rating" value={detail.avg_rating > 0 ? `${detail.avg_rating.toFixed(1)} ★` : 'No ratings yet'} icon={Star} />
                <DetailField label="Jobs Done" value={String(detail.total_jobs_completed || 0)} icon={CheckCircle} />
                <DetailField label="Email" value={detail.email} icon={Mail} />
                <DetailField label="Phone" value={detail.phone} icon={Phone} />
              </div>

              {/* Bio */}
              {detail.bio && (
                <div>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Bio
                  </p>
                  <div style={{ padding: '12px 14px', borderRadius: '12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{detail.bio}</p>
                  </div>
                </div>
              )}

              {/* Categories */}
              {detail.categories?.length > 0 && (
                <div>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Categories ({detail.categories.length})
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {detail.categories.map(cat => (
                      <span key={cat.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '4px 10px', borderRadius: '20px',
                        background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                        fontSize: '12px', color: 'var(--text-secondary)',
                      }}>
                        {cat.icon_emoji && <span>{cat.icon_emoji}</span>}
                        {cat.name}
                        <span style={{
                          fontSize: '10px',
                          color: cat.mode === 'instant' ? '#22C55E' : cat.mode === 'discovery' ? 'var(--accent)' : 'var(--text-secondary)',
                        }}>
                          {cat.mode === 'instant' ? '⚡' : cat.mode === 'discovery' ? '🔍' : '⚡🔍'}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Services */}
              {detail.services?.length > 0 && (
                <div>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Services ({detail.services.length})
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {detail.services.map(svc => (
                      <div key={svc.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderRadius: '10px',
                        background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                      }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{svc.title}</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                          ₹{svc.price}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Intro video */}
              {videoDocs.length > 0 && (
                <div>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Intro Video
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {videoDocs.map(doc => <DocCard key={doc.id} doc={doc} />)}
                  </div>
                </div>
              )}

              {/* Identity documents */}
              {identityDocs.length > 0 && (
                <div>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Identity Documents ({identityDocs.length})
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                    {identityDocs.map(doc => <DocCard key={doc.id} doc={doc} />)}
                  </div>
                </div>
              )}

              {identityDocs.length === 0 && videoDocs.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', borderRadius: '12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                  <FileText size={28} style={{ color: 'var(--text-secondary)', margin: '0 auto 8px' }} />
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No documents uploaded yet</p>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Action footer */}
        {detail && (
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--card-border)',
            background: 'var(--bg-surface)', flexShrink: 0,
            display: 'flex', flexDirection: 'column', gap: '10px',
          }}>
            {detail.verification_status === 'pending' && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => onReject(detail)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '10px', cursor: 'pointer',
                    background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)',
                    color: '#f87171', fontSize: '13px', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}
                >
                  <XCircle size={14} /> Reject
                </button>
                <button
                  onClick={() => onApprove(detail)}
                  style={{
                    flex: 2, padding: '10px', borderRadius: '10px', cursor: 'pointer',
                    background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                    color: '#22c55e', fontSize: '13px', fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}
                >
                  <CheckCircle size={14} /> Approve
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => onRequestReupload(detail)}
                style={{
                  flex: 1, padding: '8px', borderRadius: '10px', cursor: 'pointer',
                  background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                  color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                }}
              >
                <RefreshCw size={12} /> Request Re-upload
              </button>
              {detail.is_active && (
                <button
                  onClick={() => onSuspend(detail)}
                  style={{
                    flex: 1, padding: '8px', borderRadius: '10px', cursor: 'pointer',
                    background: 'var(--accent-card)', border: '1px solid var(--accent-mid)',
                    color: 'var(--accent)', fontSize: '12px', fontWeight: 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                  }}
                >
                  <ShieldAlert size={12} /> Suspend
                </button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </>
  )
}

// ── Reject reason dialog ──────────────────────────────────────────────────────

function RejectDialog({ open, onClose, onConfirm, loading }) {
  const [reason, setReason] = useState('')
  function submit() {
    onConfirm(reason.trim() || 'Does not meet requirements')
    setReason('')
  }
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent style={{ zIndex: 60 }}>
        <DialogHeader>
          <DialogTitle>Reject Worker</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Provide a reason (will be sent to the worker by email).
          </p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Identity documents are not legible. Please resubmit clear photos."
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '10px',
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              color: 'var(--text-primary)', fontSize: '13px', resize: 'vertical', outline: 'none',
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminWorkers() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('pending')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [rejectTarget, setRejectTarget] = useState(null)

  const { data: workers = [], isLoading } = useQuery({
    queryKey: ['admin', 'workers', tab],
    queryFn: () => api.get('/admin/workers', { params: { status: tab, limit: 100 } }).then(r => r.data?.items || []),
    refetchInterval: 30_000,
  })

  const approveMut = useMutation({
    mutationFn: (detail) => api.post(`/admin/workers/${detail.user_id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries(['admin', 'workers'])
      qc.invalidateQueries(['admin', 'worker-detail', selectedId])
      toast.success('Worker approved')
      setSelectedId(null)
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Approval failed'),
  })

  const rejectMut = useMutation({
    mutationFn: ({ detail, reason }) => api.post(`/admin/workers/${detail.user_id}/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries(['admin', 'workers'])
      qc.invalidateQueries(['admin', 'worker-detail', selectedId])
      toast.success('Worker rejected')
      setRejectTarget(null)
      setSelectedId(null)
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Rejection failed'),
  })

  const suspendMut = useMutation({
    mutationFn: (detail) => api.post(`/admin/workers/${detail.user_id}/suspend`),
    onSuccess: () => {
      qc.invalidateQueries(['admin', 'workers'])
      qc.invalidateQueries(['admin', 'worker-detail', selectedId])
      toast.success('Worker suspended')
      setSelectedId(null)
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Suspend failed'),
  })

  const reuploadMut = useMutation({
    mutationFn: (detail) => api.post(`/admin/workers/${detail.user_id}/request-reupload`),
    onSuccess: () => {
      toast.success('Re-upload request sent')
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Failed'),
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
        <h1 className="text-2xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>Workers</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Manage worker verification and profiles</p>
      </div>

      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="pending">
              Pending {pendingCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: 'var(--accent-muted)' }}>
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <Input
            placeholder="Search workers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 w-56 h-9 text-xs"
            style={{ background: 'var(--card-bg)' }}
          />
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-12" style={{ background: 'var(--card-bg)' }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <AlertTriangle size={32} style={{ color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)' }}>No workers found</p>
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
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(worker => (
                <WorkerRow
                  key={worker.id}
                  worker={worker}
                  onView={(w) => setSelectedId(w.id)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selectedId && (
          <WorkerDetailPanel
            workerId={selectedId}
            onClose={() => setSelectedId(null)}
            onApprove={(detail) => approveMut.mutate(detail)}
            onReject={(detail) => setRejectTarget(detail)}
            onSuspend={(detail) => suspendMut.mutate(detail)}
            onRequestReupload={(detail) => reuploadMut.mutate(detail)}
          />
        )}
      </AnimatePresence>

      {/* Reject reason dialog */}
      <RejectDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        loading={rejectMut.isPending}
        onConfirm={(reason) => rejectMut.mutate({ detail: rejectTarget, reason })}
      />
    </div>
  )
}
