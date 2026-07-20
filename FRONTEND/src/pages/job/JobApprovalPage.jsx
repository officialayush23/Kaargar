/**
 * JobApprovalPage — customer-side bill review.
 * Shows before/after photos + itemized extras + total. Approve → shows the
 * completion code to share verbally with the worker. Reject → reason form,
 * routes into the existing SOS/dispute mechanism (backend reuses SOSEvent).
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, CheckCircle2, XCircle, Loader2, Copy, ShieldAlert, Clock } from 'lucide-react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassModal } from '@/components/glass/GlassModal'
import { GlassTextarea } from '@/components/glass/GlassInput'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

function Lightbox({ url, onClose }) {
  if (!url) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <img src={url} alt="" className="max-w-full max-h-full rounded-xl object-contain" />
    </div>
  )
}

function PhotoRow({ label, photos, onZoom }) {
  if (!photos?.length) return null
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {photos.map((url, i) => (
          <img
            key={i} src={url} alt="" onClick={() => onZoom(url)}
            className="w-20 h-20 rounded-xl object-cover shrink-0 cursor-pointer"
          />
        ))}
      </div>
    </div>
  )
}

export default function JobApprovalPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [zoomUrl, setZoomUrl] = useState(null)
  const [code, setCode] = useState(null)
  const [codeExpiresAt, setCodeExpiresAt] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/jobs/${jobId}/approval-summary`)
      setSummary(data)
      if (data.status === 'approved') {
        const { data: codeData } = await api.get(`/jobs/${jobId}/completion-code`).catch(() => ({ data: null }))
        if (codeData) { setCode(codeData.code); setCodeExpiresAt(codeData.expires_at) }
      }
    } catch {
      toast.error('Could not load job details')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`job-approval:${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}`,
      }, ({ new: updated }) => {
        setSummary(prev => prev ? { ...prev, status: updated.status } : prev)
        if (updated.status === 'approved') load()
        if (updated.status === 'completed') {
          toast.success('Job completed — you can pay from the active job screen')
          navigate(`/job/${jobId}/active`)
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [jobId, load, navigate])

  async function handleApprove() {
    setApproving(true)
    try {
      await api.post(`/jobs/${jobId}/approve`)
      toast.success('Approved!')
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not approve')
    } finally {
      setApproving(false)
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) return
    setRejecting(true)
    try {
      await api.post(`/jobs/${jobId}/reject-approval`, { reason: rejectReason.trim() })
      toast.success('Dispute raised — support has been notified')
      setShowReject(false)
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not submit dispute')
    } finally {
      setRejecting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }

  if (!summary) return null

  const total = Number(summary.approved_total ?? (Number(summary.final_price || 0) + Number(summary.extra_items_total || 0)))

  return (
    <div className="px-4 pt-6 pb-10 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl" style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
          <ArrowLeft className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
        </button>
        <h1 className="font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>Review & approve</h1>
      </div>

      {summary.status === 'disputed' ? (
        <GlassCard className="p-6 text-center space-y-2">
          <ShieldAlert className="h-8 w-8 mx-auto text-red-400" />
          <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Dispute raised</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Support has been notified and will get back to you.</p>
        </GlassCard>
      ) : summary.status === 'approved' && code ? (
        <GlassCard className="p-6 text-center space-y-4">
          <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-400" />
          <div>
            <p className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>Share this code with your service provider</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Read it aloud — don't share a screenshot with anyone else.</p>
          </div>
          <div
            className="flex items-center justify-center gap-3 py-4 rounded-2xl mx-auto"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--accent-border)', maxWidth: 260 }}
          >
            <span className="text-4xl font-mono font-bold tracking-[0.3em]" style={{ color: 'var(--accent)' }}>{code}</span>
            <button onClick={() => { navigator.clipboard?.writeText(code); toast.success('Copied') }}>
              <Copy className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
          {codeExpiresAt && (
            <p className="text-[11px] flex items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <Clock className="h-3 w-3" /> Valid until {new Date(codeExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </GlassCard>
      ) : (
        <>
          <GlassCard className="p-5 space-y-4">
            <PhotoRow label={`Before (${summary.before_photos.length})`} photos={summary.before_photos} onZoom={setZoomUrl} />
            <PhotoRow label={`After (${summary.after_photos.length})`} photos={summary.after_photos} onZoom={setZoomUrl} />
          </GlassCard>

          {summary.items.length > 0 && (
            <GlassCard className="p-5 space-y-3">
              <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Extra items</p>
              {summary.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <img src={item.item_photo_url} alt="" onClick={() => setZoomUrl(item.item_photo_url)}
                    className="w-11 h-11 rounded-lg object-cover shrink-0 cursor-pointer" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                    <button onClick={() => setZoomUrl(item.receipt_photo_url)} className="text-[11px] underline" style={{ color: 'var(--text-muted)' }}>
                      view receipt
                    </button>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </GlassCard>
          )}

          <GlassCard className="p-5 space-y-1.5">
            <div className="flex justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span>Base amount</span><span>{formatCurrency(summary.final_price || 0)}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span>Extra items</span><span>{formatCurrency(summary.extra_items_total || 0)}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-2" style={{ borderTop: '1px solid var(--card-border)', color: 'var(--text-primary)' }}>
              <span>Total</span><span>{formatCurrency(total)}</span>
            </div>
          </GlassCard>

          {summary.status === 'awaiting_approval' && (
            <div className="flex gap-3">
              <GlassButton variant="outline" size="lg" className="flex-1" icon={XCircle} onClick={() => setShowReject(true)}>
                Reject
              </GlassButton>
              <GlassButton variant="brand" size="lg" className="flex-1" icon={CheckCircle2} loading={approving} onClick={handleApprove}>
                Approve
              </GlassButton>
            </div>
          )}
        </>
      )}

      <GlassModal
        open={showReject}
        onClose={() => setShowReject(false)}
        title="Why are you rejecting this bill?"
        size="sm"
        footer={
          <GlassButton variant="danger" size="lg" className="w-full" loading={rejecting} disabled={!rejectReason.trim()} onClick={handleReject}>
            Submit dispute
          </GlassButton>
        }
      >
        <GlassTextarea
          placeholder="Describe what's wrong with the bill..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={4}
        />
      </GlassModal>

      <Lightbox url={zoomUrl} onClose={() => setZoomUrl(null)} />
    </div>
  )
}
