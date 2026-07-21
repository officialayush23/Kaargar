import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Phone, MapPin, Shield, Star, CheckCircle, Clock, Zap, CreditCard, Loader2, AlertCircle, ShieldAlert, FileText, ArrowRight, ArrowLeft, PhoneCall, Siren, XCircle, Search, Calendar, HeadphonesIcon, Ban, RotateCcw, UserX, AlertTriangle, MoreVertical } from 'lucide-react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { JobStatusTimeline } from '@/components/kaargar/JobStatusTimeline'
import { JobCompletionFlow } from '@/components/kaargar/JobCompletionFlow'
import { JobTrackingMap } from '@/components/kaargar/JobTrackingMap'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassModal } from '@/components/glass/GlassModal'
import { GlassTextarea } from '@/components/glass/GlassInput'
import { GlassSelect } from '@/components/glass/GlassSelect'
import { useRazorpay } from '@/hooks/useRazorpay'
import { decryptPhone } from '@/lib/phoneCipher'
import { formatCurrency, getInitials, getErrorMessage } from '@/lib/utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const STATUS_CONFIG = {
  requested:         { label: 'Requested',             color: 'text-amber-300',   dot: 'bg-amber-300',    icon: Clock },
  scheduled:         { label: 'Scheduled',              color: 'text-violet-400',  dot: 'bg-violet-400',   icon: Calendar },
  searching:         { label: 'Finding a worker',      color: 'text-amber-400',   dot: 'bg-amber-400',    icon: Search },
  confirmed:         { label: 'Worker assigned',       color: 'text-amber-500',   dot: 'bg-amber-500',    icon: Zap },
  worker_assigned:   { label: 'Worker assigned',       color: 'text-amber-500',   dot: 'bg-amber-500',    icon: Zap },
  assigned:          { label: 'Worker assigned',      color: 'text-amber-600',   dot: 'bg-amber-600',    icon: Zap },
  en_route:          { label: 'On the way',           color: 'text-violet-400',  dot: 'bg-violet-400',   icon: MapPin },
  arrived:           { label: 'Worker arrived',        color: 'text-amber-400',   dot: 'bg-amber-400',    icon: Clock },
  started:           { label: 'Work in progress',      color: 'text-emerald-400', dot: 'bg-emerald-400',  icon: Zap },
  awaiting_approval: { label: 'Waiting for approval',  color: 'text-amber-400',   dot: 'bg-amber-400',    icon: FileText },
  approved:          { label: 'Approved — code shared',color: 'text-emerald-400', dot: 'bg-emerald-400',  icon: CheckCircle },
  disputed:          { label: 'Disputed',              color: 'text-red-400',     dot: 'bg-red-400',      icon: ShieldAlert },
  completed:         { label: 'Job completed',         color: 'text-emerald-400', dot: 'bg-emerald-400',  icon: CheckCircle },
  cancelled:         { label: 'Booking cancelled',     color: 'text-red-400',     dot: 'bg-red-400',      icon: XCircle },
  failed:            { label: 'No worker found',       color: 'text-red-400',     dot: 'bg-red-400',      icon: XCircle },
}

/* ─── Rating Modal ────────────────────────────────────────────────────────── */
function RatingModal({ open, jobId, onSubmit, onClose }) {
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    try {
      await api.post('/reviews', { job_id: jobId, rating, text: text.trim() || undefined })
      toast.success('Review submitted — thank you!')
      onSubmit()
    } catch {
      toast.error('Failed to submit review')
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="Rate your experience"
      size="sm"
      footer={
        <GlassButton variant="brand" size="lg" className="w-full" loading={loading} onClick={handleSubmit}>
          Submit review
        </GlassButton>
      }
    >
      <div className="space-y-5">
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map(s => (
            <motion.button
              key={s}
              onClick={() => setRating(s)}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
            >
              <Star
                className={cn('h-9 w-9 transition-colors', s <= rating ? 'text-amber-400 fill-amber-400' : '')}
                style={s <= rating ? {} : { color: 'var(--text-muted)' }}
              />
            </motion.button>
          ))}
        </div>
        <GlassTextarea
          placeholder="Share your experience (optional)..."
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
        />
      </div>
    </GlassModal>
  )
}

/* ─── Pay Now Button ──────────────────────────────────────────────────────── */
function PayNowButton({ jobId, amount, userEmail, userName, onPaymentSuccess }) {
  const { openCheckout, loading: rzpLoading, error: rzpError } = useRazorpay()
  const [creating, setCreating] = useState(false)
  const [paid, setPaid] = useState(false)

  const handlePay = useCallback(async () => {
    setCreating(true)
    let order
    try {
      const { data } = await api.post('/payments/create-order', { job_id: jobId })
      order = data
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not create payment order'))
      setCreating(false)
      return
    }
    setCreating(false)

    openCheckout({
      amount: order.amount, // already in paise from backend
      orderId: order.razorpay_order_id,
      name: 'Kaargar',
      description: 'Service payment',
      prefillEmail: userEmail || '',
      prefillName: userName || '',
      themeColor: '#22C55E',
      onSuccess: async (rzpResponse) => {
        try {
          await api.post('/payments/verify', {
            razorpay_order_id: rzpResponse.razorpay_order_id,
            razorpay_payment_id: rzpResponse.razorpay_payment_id,
            razorpay_signature: rzpResponse.razorpay_signature,
          })
          setPaid(true)
          toast.success('Payment successful! Funds held in escrow.')
          onPaymentSuccess?.()
        } catch {
          toast.error('Payment verification failed — contact support')
        }
      },
      onDismiss: () => {
        toast.info('Payment cancelled')
      },
    })
  }, [jobId, amount, userEmail, userName, openCheckout, onPaymentSuccess])

  if (paid) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 rounded-xl"
        style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}>
        <CheckCircle className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-medium text-emerald-400">Payment confirmed</span>
      </div>
    )
  }

  const busy = creating || rzpLoading

  return (
    <div className="space-y-2">
      <motion.button
        onClick={handlePay}
        disabled={busy}
        whileHover={busy ? {} : { scale: 1.02 }}
        whileTap={busy ? {} : { scale: 0.98 }}
        className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold text-sm transition-opacity"
        style={{
          background: busy ? 'rgba(34,197,94,0.3)' : '#22C55E',
          color: '#fff',
          opacity: busy ? 0.7 : 1,
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
      >
        {busy
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
          : <><CreditCard className="h-4 w-4" /> Pay {formatCurrency(amount)}</>
        }
      </motion.button>

      {rzpError && (
        <div className="flex items-center gap-2 text-xs text-red-400 px-1">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {rzpError}
        </div>
      )}

      <p className="text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
        Secured by Razorpay · Funds released after job confirmation
      </p>
    </div>
  )
}

// Kaargar in-app instant-support helpline (tap-to-call).
const INSTANT_SUPPORT_PHONE = '+911800123456'

/* ─── Safety / SOS Modal ──────────────────────────────────────────────────── */
function SOSModal({ open, onClose, jobId, chatPath, navigate }) {
  const [reporting, setReporting] = useState(false)

  async function reportDispute() {
    setReporting(true)
    try {
      await api.post(`/jobs/${jobId}/sos`, { notes: 'Dispute raised from safety menu' })
      toast.error('Support notified. Opening job chat…')
    } catch {
      toast.error('Could not notify support — opening chat anyway')
    } finally {
      setReporting(false)
      onClose()
      navigate(chatPath)
    }
  }

  return (
    <GlassModal open={open} onClose={onClose} title="Safety & support" size="sm">
      <div className="p-5 space-y-3">
        <a
          href="tel:100"
          className="flex items-center gap-3 p-4 rounded-2xl transition-colors"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(248,113,113,0.15)' }}>
            <Siren className="h-5 w-5 text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-400">Call Police — 100</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>For immediate danger or emergencies</p>
          </div>
        </a>

        <a
          href={`tel:${INSTANT_SUPPORT_PHONE}`}
          className="flex items-center gap-3 p-4 rounded-2xl transition-colors"
          style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--accent-bg)' }}>
            <PhoneCall className="h-5 w-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Talk to instant support</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Call the Kaargar helpline now</p>
          </div>
        </a>

        <button
          onClick={reportDispute}
          disabled={reporting}
          className="w-full flex items-center gap-3 p-4 rounded-2xl transition-colors text-left"
          style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)', opacity: reporting ? 0.6 : 1 }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--g-bg)' }}>
            <ShieldAlert className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Report a problem with this job</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {reporting ? 'Notifying support…' : 'Opens this job\'s chat with support flagged'}
            </p>
          </div>
        </button>
      </div>
    </GlassModal>
  )
}

function timeOptions() {
  const o = []
  for (let h = 6; h <= 22; h++) for (const m of [0, 30]) {
    if (h === 22 && m === 30) continue
    o.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return o
}
const RESCHED_TIME_OPTS = timeOptions()
function to12h(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/* ─── Cancel booking modal ───────────────────────────────────────────────────
 * Client has no way to know the customer's offense count in advance, so this
 * doesn't try to predict the outcome — it just submits and surfaces whatever
 * penalty/free-cancellation message the backend response includes. A 402
 * (or 409 "blocked, contact support") response redirects to support instead
 * of showing a raw error, since the backend is telling us this cancellation
 * can't be completed in-app at all. */
function CancelBookingModal({ open, onClose, jobId, onCancelled, navigate }) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCancel() {
    setLoading(true)
    try {
      const { data } = await api.post(`/jobs/${jobId}/cancel`, { reason: reason.trim() || 'Customer requested cancellation' })
      toast.success(data?.message || 'Booking cancelled')
      onCancelled()
    } catch (err) {
      const status = err.response?.status
      if (status === 402 || status === 409) {
        toast.error(getErrorMessage(err, 'This cancellation needs to go through support'))
        onClose()
        navigate(`/support?job_id=${jobId}`)
        return
      }
      toast.error(getErrorMessage(err, 'Could not cancel booking'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={loading ? undefined : onClose}
      title="Cancel booking"
      size="sm"
      footer={
        <div className="flex gap-2">
          <GlassButton variant="outline" size="lg" className="flex-1" onClick={onClose} disabled={loading}>
            Keep booking
          </GlassButton>
          <GlassButton variant="danger" size="lg" className="flex-1" loading={loading} onClick={handleCancel}>
            Cancel it
          </GlassButton>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Your first cancellation is free. After that, cancelling less than 6 hours before arrival
            may carry a 50% penalty, and repeat late cancellations may need to go through support instead.
            We'll show you the exact outcome after you confirm.
          </p>
        </div>
        <GlassTextarea
          placeholder="Reason for cancelling (optional)"
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
        />
      </div>
    </GlassModal>
  )
}

/* ─── Reschedule modal ────────────────────────────────────────────────────── */
function RescheduleModal({ open, onClose, job, jobId, onRescheduled }) {
  const [date, setDate]   = useState('')
  const [start, setStart] = useState(job?.window_start?.slice(0, 5) || '')
  const [end, setEnd]     = useState(job?.window_end?.slice(0, 5) || '')
  const [loading, setLoading] = useState(false)

  const minDate = new Date().toISOString().split('T')[0]
  const windowValid = (() => {
    if (!start || !end) return false
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    return (eh * 60 + em) - (sh * 60 + sm) >= 60
  })()
  const endOpts = RESCHED_TIME_OPTS.filter(t => {
    if (!start) return true
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = t.split(':').map(Number)
    return (eh * 60 + em) - (sh * 60 + sm) >= 60
  })
  const canSubmit = !!date && windowValid && !loading

  // Slot-based bookings can't be shifted with this generic reschedule —
  // the backend rejects it outright, so this is caught up-front with a
  // clearer message pointing at cancel + rebook instead.
  if (job?.slot_id) {
    return (
      <GlassModal open={open} onClose={onClose} title="Reschedule" size="sm" solid>
        <div className="space-y-3 text-center py-2">
          <Calendar className="h-8 w-8 mx-auto" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Slot bookings can't be rescheduled directly — cancel this booking and pick a new slot instead.
          </p>
        </div>
      </GlassModal>
    )
  }

  async function handleReschedule() {
    if (!canSubmit) return
    setLoading(true)
    try {
      await api.patch(`/jobs/${jobId}/reschedule`, {
        preferred_days: [date],
        window_start: start,
        window_end: end,
      })
      toast.success('Booking rescheduled')
      onRescheduled()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not reschedule — must be at least 2 hours before arrival and target an open window'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={loading ? undefined : onClose}
      title="Reschedule booking"
      size="sm"
      solid
      footer={
        <GlassButton variant="brand" size="lg" className="w-full" loading={loading} disabled={!canSubmit} onClick={handleReschedule}>
          Confirm new time
        </GlassButton>
      }
    >
      <div className="space-y-4">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Only available up to 2 hours before your current arrival window, and must target an open slot.
        </p>
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>New date</p>
          <input
            type="date"
            value={date}
            min={minDate}
            onChange={e => setDate(e.target.value)}
            className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
            style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>From</p>
            <GlassSelect value={start} onChange={v => { setStart(v); if (end && end <= v) setEnd('') }} options={RESCHED_TIME_OPTS.map(t => ({ value: t, label: to12h(t) }))} placeholder="Start" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Until</p>
            <GlassSelect value={end} onChange={setEnd} options={endOpts.map(t => ({ value: t, label: to12h(t) }))} placeholder="End" />
          </div>
        </div>
        {start && end && !windowValid && (
          <p className="text-xs" style={{ color: '#f87171' }}>Window must be at least 1 hour</p>
        )}
      </div>
    </GlassModal>
  )
}

/* ─── Job actions overflow menu (reschedule / cancel booking) ────────────────
 * Both actions used to render as a full-width two-button row directly on the
 * page. That's now tucked behind a single kebab (3-dot) icon button — same
 * icon-button footprint as the call button on the other-party card below —
 * that opens a small glass dropdown with the same two actions as menu items.
 * Nothing about *when* these are available changed (still gated by
 * canCancel/canReschedule upstream); only where they render. */
function JobActionsMenu({ canReschedule, canCancel, onReschedule, onCancel }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative flex justify-end" ref={menuRef}>
      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(v => !v)}
        aria-label="Booking actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
      >
        <MoreVertical className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-12 z-20 w-52 rounded-2xl overflow-hidden"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--g-border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
            }}
          >
            {canReschedule && (
              <button
                role="menuitem"
                onClick={() => { setOpen(false); onReschedule() }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-left transition-colors hover:bg-white/5"
                style={{ color: 'var(--text-primary)' }}
              >
                <RotateCcw className="h-4 w-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                Reschedule
              </button>
            )}
            {canReschedule && canCancel && (
              <div style={{ height: 1, background: 'var(--g-border)' }} />
            )}
            {canCancel && (
              <button
                role="menuitem"
                onClick={() => { setOpen(false); onCancel() }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-left transition-colors hover:bg-white/5"
                style={{ color: '#f87171' }}
              >
                <Ban className="h-4 w-4 shrink-0" />
                Cancel booking
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */
export default function ActiveJobPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [job, setJob] = useState(null)
  const [showRating, setShowRating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [paymentStatus, setPaymentStatus] = useState(null) // null | 'pending' | 'held' | 'refunded'
  const [actionLoading, setActionLoading] = useState(false)
  const [sosOpen, setSosOpen] = useState(false)
  const [calling, setCalling] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [noShowLoading, setNoShowLoading] = useState(false)
  const [flagLoading, setFlagLoading] = useState(false)
  // Multi-day bundle — day-by-day list, only fetched when this job is the
  // parent of a multi-day booking (total_days > 1). GET /jobs/me now only
  // ever returns the bundle's parent row, so `job` here IS that parent.
  const [bundleDays, setBundleDays] = useState(null)
  const [bundleLoading, setBundleLoading] = useState(false)

  const isWorkerViewer = user?.role === 'worker'

  const fetchJob = useCallback(async () => {
    try {
      const { data } = await api.get(`/jobs/${jobId}`)
      setJob(data)
      setLoading(false)
      // Only the customer ever pays, and only once there's a billed amount —
      // checking earlier just spams the console with expected 404s (no
      // Payment row exists until a completed job has an approved total).
      const billable = data.approved_total ?? data.final_price
      if (data.user_id === user?.id && billable) {
        try {
          const { data: pmt } = await api.get(`/payments/${jobId}`)
          setPaymentStatus(pmt.status)
        } catch {
          // no payment record created yet — fine, PayNowButton handles that
        }
      }
    } catch {
      setLoading(false)
    }
  }, [jobId, user?.id])

  useEffect(() => {
    fetchJob()

    const channel = supabase
      .channel(`job:${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}`,
      }, ({ new: updated }) => {
        setJob(prev => ({ ...prev, ...updated }))
        if (updated.status === 'completed' && !isWorkerViewer) {
          setTimeout(() => setShowRating(true), 1500)
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [jobId, fetchJob, isWorkerViewer])

  const isBundle = (job?.total_days ?? 1) > 1

  useEffect(() => {
    if (!isBundle) { setBundleDays(null); return }
    let cancelled = false
    setBundleLoading(true)
    api.get(`/jobs/${jobId}/bundle`)
      .then(({ data }) => { if (!cancelled) setBundleDays(data.days || []) })
      .catch(() => { if (!cancelled) setBundleDays(null) })
      .finally(() => { if (!cancelled) setBundleLoading(false) })
    return () => { cancelled = true }
  }, [jobId, isBundle, job?.status])

  // The "other party" card: customer sees the worker, worker sees the customer.
  const otherPartyName   = isWorkerViewer ? job?.client_name : job?.worker_name
  const otherPartyAvatar = isWorkerViewer ? job?.client_avatar_url : job?.worker_avatar_url
  const chatPath = isWorkerViewer ? `/worker/chat/${jobId}` : `/chat/${jobId}`

  // Customer-side only: pull in the assigned worker's public rating/portfolio
  // so the job detail page actually shows who's coming and what they've done,
  // instead of just a name + "Verified worker" label. Full profile is still
  // one tap away (existing onClick → /worker/:id); this is just enough to
  // build trust right here without leaving the job page.
  const [workerInfo, setWorkerInfo] = useState(null)
  const [workerMedia, setWorkerMedia] = useState([])
  useEffect(() => {
    if (isWorkerViewer || !job?.worker_id) { setWorkerInfo(null); setWorkerMedia([]); return }
    let cancelled = false
    api.get(`/workers/${job.worker_id}`).then(({ data }) => { if (!cancelled) setWorkerInfo(data) }).catch(() => {})
    api.get(`/workers/${job.worker_id}/media`).then(({ data }) => { if (!cancelled) setWorkerMedia((data || []).slice(0, 4)) }).catch(() => {})
    return () => { cancelled = true }
  }, [isWorkerViewer, job?.worker_id])

  const cfg = STATUS_CONFIG[job?.status] || STATUS_CONFIG.assigned
  const finalAmount = job?.approved_total ?? job?.final_price
  const isCompleted = job?.status === 'completed'
  const needsPayment = !isWorkerViewer && isCompleted && finalAmount && paymentStatus !== 'held' && paymentStatus !== 'released'

  // ── Cancel / reschedule / no-show gating ──────────────────────────────────
  // "Pre-arrival" = the worker hasn't arrived yet and the job hasn't reached
  // a terminal state — this is the only window cancel/reschedule/no-show
  // make sense in. Only discovery/scheduled bookings go through this flow;
  // instant jobs are matched live and don't have a scheduled arrival window
  // to cancel/reschedule/no-show against.
  const PRE_ARRIVAL_STATUSES = ['requested', 'scheduled', 'searching', 'confirmed', 'worker_assigned', 'assigned', 'en_route']
  const isScheduledBooking = job && job.source !== 'instant'
  const isPreArrival = job && PRE_ARRIVAL_STATUSES.includes(job.status)

  // Best-effort "expected arrival" time: slot bookings have scheduled_at;
  // window/multi-day bookings have assigned_date + window_end (falls back to
  // window_start if no assigned_date yet, or the booking's created date).
  const arrivalDeadline = (() => {
    if (!job) return null
    if (job.scheduled_at) return new Date(job.scheduled_at)
    if (job.assigned_date && job.window_end) return new Date(`${job.assigned_date}T${job.window_end}`)
    return null
  })()
  const arrivalTimePassed = arrivalDeadline ? Date.now() > arrivalDeadline.getTime() : false

  const canCancel = !isWorkerViewer && isScheduledBooking && isPreArrival
  const canReschedule = !isWorkerViewer && isScheduledBooking && isPreArrival
  const canReportNoShow = !isWorkerViewer && isScheduledBooking && isPreArrival && arrivalTimePassed
  const canFlagCustomerUnavailable = isWorkerViewer && job?.status === 'arrived'

  // pull user info from store if available
  let userEmail = ''
  let userName = ''
  try {
    const auth = JSON.parse(localStorage.getItem('kaargar-auth') || '{}')
    userEmail = auth?.state?.user?.email || ''
    userName = auth?.state?.user?.full_name || ''
  } catch {}

  async function handleCall() {
    if (calling) return
    setCalling(true)
    // The API never returns a plaintext number — only an AES-256-GCM
    // ciphertext. It's decrypted here in memory and used ONLY to build the
    // tel: link; it's never assigned to state, rendered, or logged, so it
    // never appears in the DOM, React devtools, or console.
    try {
      const { data } = await api.get(`/jobs/${jobId}/contact`)
      const phone = await decryptPhone(data)
      window.location.href = `tel:${phone}`
    } catch (err) {
      toast.error(getErrorMessage(err, 'Number not available yet'))
    } finally {
      setCalling(false)
    }
  }

  async function handleWorkerAction(endpoint, successMsg) {
    setActionLoading(true)
    try {
      await api.post(`/jobs/${jobId}/${endpoint}`)
      toast.success(successMsg)
      fetchJob()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Action failed'))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReportNoShow() {
    if (noShowLoading) return
    setNoShowLoading(true)
    try {
      const { data } = await api.post(`/jobs/${jobId}/report-no-show`, {})
      toast.success(data?.message || 'Reported — we\'re looking into it')
      fetchJob()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not submit report'))
    } finally {
      setNoShowLoading(false)
    }
  }

  async function handleFlagCustomerUnavailable() {
    if (flagLoading) return
    setFlagLoading(true)
    try {
      const { data } = await api.post(`/jobs/${jobId}/flag-customer-unavailable`, {})
      toast.success(data?.message || 'Reported — support has been notified')
      fetchJob()
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not submit report'))
    } finally {
      setFlagLoading(false)
    }
  }

  // This page is shared between the customer route (/job/:jobId, under
  // AppLayout — which adds NO padding of its own, unlike every other
  // customer page here that supplies its own px-4/pt-*) and the worker
  // portal route (/worker/job/:jobId/active, under WorkerLayout — which
  // already wraps every page's <Outlet> in its own px-4). Hardcoding px-4
  // here unconditionally would leave the customer view flush against the
  // screen edges with no top spacing (the actual bug being fixed) while
  // simultaneously double-padding the worker view. So the horizontal/top
  // padding is only added for the customer viewer; the worker view relies
  // on WorkerLayout's existing wrapper, same as every other worker page.
  return (
    <div className={isWorkerViewer ? 'space-y-5 pb-8' : 'px-4 pt-6 pb-8 space-y-5'}>

      {/* Back — this page is reached from the Bookings list (both active and
          past), so it needs a way back to it; there was none before. */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Status banner */}
      {job && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard className={cn('p-4', isCompleted && 'border-emerald-500/25 bg-emerald-500/5')}>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className={cn('font-semibold text-sm', cfg.color)}>{cfg.label}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {job.category_name} · {job.location_address}
                </p>
              </div>
              <motion.div
                className={cn('w-2.5 h-2.5 rounded-full', cfg.dot)}
                animate={!isCompleted ? { scale: [1, 1.4, 1] } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
              />
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
        </div>
      )}

      {/* Tracking map — destination pin + live worker marker.
          Worker only needs navigation on the way there; once they've
          arrived the map/nav is just clutter, so it's hidden for them from
          that point on. Customer keeps seeing it through the rest of the
          job (still useful context even after the worker has arrived). */}
      {job && (
        isWorkerViewer
          ? ['assigned', 'confirmed', 'worker_assigned', 'en_route'].includes(job.status)
          : !['completed', 'cancelled', 'failed', 'disputed'].includes(job.status)
      ) && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          <JobTrackingMap job={job} />
        </motion.div>
      )}

      {/* Disputed banner — both sides */}
      {job?.status === 'disputed' && (
        <GlassCard className="p-5 text-center space-y-3" style={{ borderColor: 'rgba(248,113,113,0.25)' }}>
          <ShieldAlert className="h-7 w-7 mx-auto text-red-400" />
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Dispute raised</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Support has been notified and will follow up shortly.</p>
          </div>
          <GlassButton variant="outline" size="sm" className="w-full" icon={MessageSquare} onClick={() => navigate(chatPath)}>
            Open job chat
          </GlassButton>
        </GlassCard>
      )}

      {/* Customer: report no-show — only once the scheduled arrival window
          has clearly passed and the worker still hasn't marked arrived. */}
      {canReportNoShow && (
        <GlassCard className="p-4" style={{ borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.05)' }}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>Worker hasn't arrived</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Past your expected arrival time and no update? Let us know.
              </p>
              <button
                onClick={handleReportNoShow}
                disabled={noShowLoading}
                className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-60"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
              >
                {noShowLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Reporting…</> : 'Report no-show'}
              </button>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Customer: cancel / reschedule — pre-arrival, discovery/scheduled only,
          tucked into a 3-dot overflow menu instead of inline buttons */}
      {(canCancel || canReschedule) && (
        <JobActionsMenu
          canReschedule={canReschedule}
          canCancel={canCancel}
          onReschedule={() => setRescheduleOpen(true)}
          onCancel={() => setCancelOpen(true)}
        />
      )}

      {/* Worker: arrived / start-job actions */}
      {isWorkerViewer && job && ['assigned', 'confirmed', 'en_route', 'arrived'].includes(job.status) && (
        <GlassButton
          variant="brand" size="lg" className="w-full" loading={actionLoading}
          onClick={() => job.status === 'arrived'
            ? handleWorkerAction('start', 'Job started')
            : handleWorkerAction('arrived', 'Marked as arrived')}
        >
          {job.status === 'arrived' ? 'Start job' : "I've arrived"}
        </GlassButton>
      )}

      {/* Worker: flag that the customer wasn't there once arrived */}
      {canFlagCustomerUnavailable && (
        <GlassButton variant="outline" size="sm" className="w-full" icon={UserX} loading={flagLoading} onClick={handleFlagCustomerUnavailable}>
          Customer not available
        </GlassButton>
      )}

      {/* Worker: photos → items → submit → waiting → OTP */}
      {isWorkerViewer && job && ['started', 'awaiting_approval', 'approved'].includes(job.status) && (
        <JobCompletionFlow
          jobId={jobId}
          job={job}
          onJobUpdate={(patch) => setJob(prev => ({ ...prev, ...patch }))}
        />
      )}

      {/* Customer: prompt to review bill / see completion code */}
      {!isWorkerViewer && job && ['awaiting_approval', 'approved'].includes(job.status) && (
        <GlassCard hover onClick={() => navigate(`/job/${jobId}/approve`)} className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {job.status === 'awaiting_approval' ? 'Bill ready for your review' : 'Approved — view completion code'}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Tap to open</p>
            </div>
            <ArrowRight className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
          </div>
        </GlassCard>
      )}

      {/* Other-party card — customer can tap through to the worker's full profile */}
      {otherPartyName && (
        <GlassCard className="p-5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => !isWorkerViewer && job?.worker_id && navigate(`/worker/${job.worker_id}`)}
              disabled={isWorkerViewer || !job?.worker_id}
              className="flex items-center gap-4 flex-1 min-w-0 text-left"
              style={{ background: 'none', border: 'none', cursor: (!isWorkerViewer && job?.worker_id) ? 'pointer' : 'default', padding: 0 }}
            >
              <Avatar className="w-14 h-14 border-2 shrink-0" style={{ borderColor: 'var(--g-border)' }}>
                <AvatarImage src={otherPartyAvatar} />
                <AvatarFallback className="font-bold text-base">{getInitials(otherPartyName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>{otherPartyName}</p>
                {isWorkerViewer ? (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Customer</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 mt-1">
                    <Shield className="h-3 w-3 text-amber-500" />
                    <span className="text-[13px] text-amber-500">Verified worker · View profile</span>
                  </div>
                )}
              </div>
            </button>
            <div className="flex flex-col gap-2">
              <Link to={chatPath}>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center"
                >
                  <MessageSquare className="h-4 w-4 text-amber-500" />
                </motion.div>
              </Link>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
                onClick={handleCall}
                disabled={calling}
              >
                {calling
                  ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--text-secondary)' }} />
                  : <Phone className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />}
              </motion.button>
            </div>
          </div>

          {/* Rating + experience + portfolio strip — customer side only.
              Previously this card was just a name and avatar with no way to
              tell who's actually coming or what they've done, short of
              tapping through to the full profile. */}
          {!isWorkerViewer && workerInfo && (
            <div className="mt-4 pt-4 space-y-3" style={{ borderTop: '1px solid var(--g-border)' }}>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {Number(workerInfo.avg_rating || 0).toFixed(1)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    ({workerInfo.rating_count || 0})
                  </span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {workerInfo.total_jobs_completed || 0} jobs completed
                </span>
                {workerInfo.experience_years > 0 && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {workerInfo.experience_years}y experience
                  </span>
                )}
              </div>

              {workerInfo.bio && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {workerInfo.bio}
                </p>
              )}

              {workerMedia.length > 0 && (
                <div className="flex gap-2">
                  {workerMedia.map(m => (
                    <button
                      key={m.id}
                      onClick={() => navigate(`/worker/${job.worker_id}`)}
                      className="w-14 h-14 rounded-xl overflow-hidden shrink-0"
                      style={{ border: '1px solid var(--g-border)' }}
                    >
                      <img src={m.thumbnail_url || m.cloudinary_url || m.url} alt="" className="w-full h-full object-cover" style={{ display: 'block' }} />
                    </button>
                  ))}
                  <button
                    onClick={() => navigate(`/worker/${job.worker_id}`)}
                    className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 text-xs font-medium"
                    style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)', color: 'var(--text-muted)' }}
                  >
                    View all
                  </button>
                </div>
              )}
            </div>
          )}

          {job?.location_address && (
            <div className="mt-4 pt-4 flex items-center gap-2" style={{ borderTop: '1px solid var(--g-border)' }}>
              <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{job.location_address}</span>
            </div>
          )}
        </GlassCard>
      )}

      {/* Booking details — category, booked date, price. Uses `new Date(job.created_at)`
          directly since it's already a full ISO timestamp from the backend; the old
          JobDetailPage appended a second "T00:00:00" onto that same string, which
          produced "Invalid Date" instead of the actual booking time. */}
      {job && (
        <GlassCard className="p-5">
          <p className="text-xs uppercase tracking-widest font-medium mb-4" style={{ color: 'var(--text-muted)' }}>
            Booking details
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Service</span>
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {job.category_name || job.title || 'Service'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Booked</span>
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {job.created_at
                  ? new Date(job.created_at).toLocaleString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
                    })
                  : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Type</span>
              <span className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                {job.source === 'discovery' ? 'Discovery booking' : 'Instant booking'}
              </span>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Multi-day bundle — day-by-day progress under this one card. This
          job IS the bundle's parent (GET /jobs/me only ever returns parent
          rows now), so job.total_days/job.bundle_status describe the whole
          bundle while each entry below is one day's own Job row with its
          own independent status/price/lifecycle. */}
      {isBundle && (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted)' }}>
              {job.total_days}-day booking
            </p>
            {job.bundle_status && (
              <span className="text-xs font-semibold font-mono" style={{ color: 'var(--amber-400, #f59e0b)' }}>
                {job.bundle_status}
              </span>
            )}
          </div>

          {bundleLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          )}

          {!bundleLoading && bundleDays && (
            // Capped height + internal scroll instead of letting a long
            // multi-day booking (e.g. a 2-week job) push everything below
            // it — including the Job progress timeline — way down the
            // page. Days/slots scroll inside this box; the section itself
            // stays a fixed, predictable size so booking details + job
            // progress both land within roughly one screen's height.
            <div
              className="space-y-2 overflow-y-auto pr-1"
              style={{ maxHeight: 264, WebkitOverflowScrolling: 'touch' }}
            >
              {bundleDays.map(day => {
                const dCfg = STATUS_CONFIG[day.status] || STATUS_CONFIG.assigned
                const dayDate = day.preferred_days?.[0]
                return (
                  <div
                    key={day.id}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{
                      background: day.id === job.id ? 'var(--accent-bg)' : 'var(--g-bg)',
                      border: '1px solid var(--g-border)',
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold shrink-0"
                      style={{ background: 'var(--card-bg, rgba(255,255,255,0.05))', color: 'var(--text-secondary)' }}
                    >
                      {day.day_index}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {dayDate
                          ? new Date(`${dayDate}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
                          : `Day ${day.day_index}`}
                      </p>
                      <p className={cn('text-xs mt-0.5 flex items-center gap-1', dCfg.color)}>
                        <dCfg.icon className="h-3 w-3" /> {dCfg.label}
                      </p>
                    </div>
                    {(day.approved_total ?? day.final_price ?? day.quoted_price) != null && (
                      <p className="text-xs font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {formatCurrency(day.approved_total ?? day.final_price ?? day.quoted_price)}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </GlassCard>
      )}

      {/* Before/after photos the worker submitted at job completion */}
      {job && ((job.before_photos?.length ?? 0) > 0 || (job.after_photos?.length ?? 0) > 0) && (
        <GlassCard className="p-5">
          <p className="text-xs uppercase tracking-widest font-medium mb-4" style={{ color: 'var(--text-muted)' }}>
            Job photos
          </p>
          {job.before_photos?.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Before</p>
              <div className="grid grid-cols-3 gap-2">
                {job.before_photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="block aspect-square rounded-xl overflow-hidden" style={{ background: 'var(--g-bg)' }}>
                    <img src={url} alt={`Before ${i + 1}`} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
          {job.after_photos?.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>After</p>
              <div className="grid grid-cols-3 gap-2">
                {job.after_photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="block aspect-square rounded-xl overflow-hidden" style={{ background: 'var(--g-bg)' }}>
                    <img src={url} alt={`After ${i + 1}`} className="w-full h-full object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {/* Job timeline */}
      {job && (
        <GlassCard className="p-5">
          <p className="text-xs uppercase tracking-widest font-medium mb-5" style={{ color: 'var(--text-muted)' }}>
            Job progress
          </p>
          <JobStatusTimeline status={job.status} source={job.source} isWorkerViewer={isWorkerViewer} />
        </GlassCard>
      )}

      {/* Worker: completed but customer hasn't paid yet */}
      {isWorkerViewer && isCompleted && finalAmount && paymentStatus !== 'held' && paymentStatus !== 'released' && (
        <GlassCard className="p-4 flex items-center gap-3">
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Waiting for customer payment</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatCurrency(finalAmount)} — you'll be notified once it's confirmed</p>
          </div>
        </GlassCard>
      )}

      {/* Payment section — customer only, shown when job is completed */}
      <AnimatePresence>
        {!isWorkerViewer && isCompleted && finalAmount && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <GlassCard glow glowColor="green" className="p-5 border-emerald-500/25 bg-emerald-500/5 space-y-4">
              {/* Amount display */}
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total amount</p>
                  <p className="font-mono font-bold text-2xl text-emerald-400 mt-0.5">
                    {formatCurrency(finalAmount)}
                  </p>
                  {job.commission_fee && (
                    <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Incl. ₹{job.commission_fee} platform fee
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center ml-auto">
                    <CheckCircle className="h-5 w-5 text-emerald-400" />
                  </div>
                  <p className="text-[13px] mt-1.5" style={{ color: 'var(--text-muted)' }}>Work done</p>
                </div>
              </div>

              {/* Pay button or already-paid state */}
              {needsPayment ? (
                <PayNowButton
                  jobId={jobId}
                  amount={finalAmount}
                  userEmail={userEmail}
                  userName={userName}
                  onPaymentSuccess={() => {
                    setPaymentStatus('held')
                    setTimeout(() => setShowRating(true), 800)
                  }}
                />
              ) : (
                <div className="flex items-center gap-2 py-2.5 px-3 rounded-xl"
                  style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <div>
                    <p className="text-xs font-medium text-emerald-400">Payment held in escrow</p>
                    <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Released to worker after 2 hours
                    </p>
                  </div>
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SOS — only meaningful during an active job (police/instant-support tap-to-call) */}
      {job && !['completed', 'cancelled', 'failed'].includes(job.status) && (
        <GlassButton
          variant="danger"
          size="sm"
          className="w-full"
          icon={Shield}
          onClick={() => setSosOpen(true)}
        >
          Safety & Support
        </GlassButton>
      )}

      {/* A finished/cancelled booking has no live emergency to call in on, but the
          customer can still need help with it (billing dispute, lost item, etc.) —
          this was previously not reachable at all once a job left the "active" tabs. */}
      {job && ['completed', 'cancelled', 'failed', 'disputed'].includes(job.status) && (
        <GlassButton
          variant="outline"
          size="sm"
          className="w-full"
          icon={HeadphonesIcon}
          onClick={() => navigate(`/support?job_id=${jobId}`)}
        >
          Get help with this booking
        </GlassButton>
      )}

      <SOSModal
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        jobId={jobId}
        chatPath={chatPath}
        navigate={navigate}
      />

      <CancelBookingModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        jobId={jobId}
        navigate={navigate}
        onCancelled={() => { setCancelOpen(false); fetchJob() }}
      />

      <RescheduleModal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        job={job}
        jobId={jobId}
        onRescheduled={() => { setRescheduleOpen(false); fetchJob() }}
      />

      <RatingModal
        open={showRating}
        jobId={jobId}
        onSubmit={() => { setShowRating(false); navigate('/bookings') }}
        onClose={() => setShowRating(false)}
      />
    </div>
  )
}
