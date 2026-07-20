import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Phone, MapPin, Shield, Star, CheckCircle, Clock, Zap, CreditCard, Loader2, AlertCircle, ShieldAlert, FileText, ArrowRight, PhoneCall, Siren } from 'lucide-react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { JobStatusTimeline } from '@/components/kaargar/JobStatusTimeline'
import { JobCompletionFlow } from '@/components/kaargar/JobCompletionFlow'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassModal } from '@/components/glass/GlassModal'
import { GlassTextarea } from '@/components/glass/GlassInput'
import { useRazorpay } from '@/hooks/useRazorpay'
import { formatCurrency, getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const STATUS_CONFIG = {
  assigned:          { label: 'Worker assigned',      color: 'text-azure',       dot: 'bg-azure',        icon: Zap },
  en_route:          { label: 'On the way',           color: 'text-violet-400',  dot: 'bg-violet-400',   icon: MapPin },
  arrived:           { label: 'Worker arrived',        color: 'text-amber-400',   dot: 'bg-amber-400',    icon: Clock },
  started:           { label: 'Work in progress',      color: 'text-emerald-400', dot: 'bg-emerald-400',  icon: Zap },
  awaiting_approval: { label: 'Waiting for approval',  color: 'text-amber-400',   dot: 'bg-amber-400',    icon: FileText },
  approved:          { label: 'Approved — code shared',color: 'text-emerald-400', dot: 'bg-emerald-400',  icon: CheckCircle },
  disputed:          { label: 'Disputed',              color: 'text-red-400',     dot: 'bg-red-400',      icon: ShieldAlert },
  completed:         { label: 'Job completed',         color: 'text-emerald-400', dot: 'bg-emerald-400',  icon: CheckCircle },
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
      toast.error(err?.response?.data?.detail || 'Could not create payment order')
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

  const isWorkerViewer = user?.role === 'worker'

  const fetchJob = useCallback(async () => {
    try {
      const { data } = await api.get(`/jobs/${jobId}`)
      setJob(data)
      setLoading(false)
      // Check existing payment status
      try {
        const { data: pmt } = await api.get(`/payments/${jobId}`)
        setPaymentStatus(pmt.status)
      } catch {
        // no payment yet — that's fine
      }
    } catch {
      setLoading(false)
    }
  }, [jobId])

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

  // The "other party" card: customer sees the worker, worker sees the customer.
  const otherPartyName   = isWorkerViewer ? job?.client_name : job?.worker_name
  const otherPartyAvatar = isWorkerViewer ? job?.client_avatar_url : job?.worker_avatar_url
  const chatPath = isWorkerViewer ? `/worker/chat/${jobId}` : `/chat/${jobId}`

  const cfg = STATUS_CONFIG[job?.status] || STATUS_CONFIG.assigned
  const finalAmount = job?.approved_total ?? job?.final_price
  const isCompleted = job?.status === 'completed'
  const needsPayment = !isWorkerViewer && isCompleted && finalAmount && paymentStatus !== 'held' && paymentStatus !== 'released'

  // pull user info from store if available
  let userEmail = ''
  let userName = ''
  try {
    const auth = JSON.parse(localStorage.getItem('kaargar-auth') || '{}')
    userEmail = auth?.state?.user?.email || ''
    userName = auth?.state?.user?.full_name || ''
  } catch {}

  async function handleWorkerAction(endpoint, successMsg) {
    setActionLoading(true)
    try {
      await api.post(`/jobs/${jobId}/${endpoint}`)
      toast.success(successMsg)
      fetchJob()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* Status banner */}
      {job && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard className={cn('p-4', isCompleted && 'border-emerald-500/25 bg-emerald-500/5')}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--g-bg)' }}>
                <cfg.icon className={cn('h-5 w-5', cfg.color)} />
              </div>
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
          <div className="w-8 h-8 rounded-full border-2 border-azure/30 border-t-azure animate-spin" />
        </div>
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
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--accent-bg)' }}>
              <FileText className="h-5 w-5" style={{ color: 'var(--accent)' }} />
            </div>
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

      {/* Other-party card */}
      {otherPartyName && (
        <GlassCard className="p-5">
          <div className="flex items-center gap-4">
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
                  <Shield className="h-3 w-3 text-azure" />
                  <span className="text-[13px] text-azure">Verified worker</span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Link to={chatPath}>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 rounded-xl bg-azure/15 border border-azure/25 flex items-center justify-center"
                >
                  <MessageSquare className="h-4 w-4 text-azure" />
                </motion.div>
              </Link>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
                onClick={() => toast.info('Call feature coming soon')}
              >
                <Phone className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
              </motion.button>
            </div>
          </div>

          {job?.location_address && (
            <div className="mt-4 pt-4 flex items-center gap-2" style={{ borderTop: '1px solid var(--g-border)' }}>
              <MapPin className="h-3.5 w-3.5 text-azure shrink-0" />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{job.location_address}</span>
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
          <JobStatusTimeline status={job.status} />
        </GlassCard>
      )}

      {/* Worker: completed but customer hasn't paid yet */}
      {isWorkerViewer && isCompleted && finalAmount && paymentStatus !== 'held' && paymentStatus !== 'released' && (
        <GlassCard className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--accent-bg)' }}>
            <CreditCard className="h-4 w-4" style={{ color: 'var(--accent)' }} />
          </div>
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
                  <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
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

      {/* SOS — only during active job */}
      {job && !['completed', 'cancelled'].includes(job.status) && (
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

      <SOSModal
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        jobId={jobId}
        chatPath={chatPath}
        navigate={navigate}
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
