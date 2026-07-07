/**
 * JobDetailPage — /job/:jobId
 *
 * Shows everything about a booking:
 *   • Status banner + live timeline
 *   • Scheduling info (slot / window / instant)
 *   • Worker info (if assigned)
 *   • Location details
 *   • Price breakdown
 *   • Contextual actions (reschedule, cancel, chat, review, book again)
 */

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, Clock, MapPin, Package, User, Star,
  CheckCircle2, XCircle, CalendarClock, Zap, Navigation,
  MessageCircle, Calendar, RotateCcw, AlertTriangle,
  Ban, CheckCheck, CircleDot, IndianRupee, Loader2,
  PhoneOff, ShieldAlert, HeadphonesIcon, ChevronRight,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { Background } from '@/components/glass/Background'

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS = {
  requested:     { label: 'Requested',       color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  icon: Clock },
  searching:     { label: 'Finding Worker',   color: 'var(--accent)', bg: 'var(--accent-deep)',  icon: Zap },
  scheduled:     { label: 'Scheduled',        color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', icon: CalendarClock },
  confirmed:     { label: 'Confirmed',        color: '#34D399', bg: 'rgba(52,211,153,0.12)',  icon: CheckCircle2 },
  worker_assigned: { label: 'Worker Assigned',color: '#34D399', bg: 'rgba(52,211,153,0.12)', icon: CheckCircle2 },
  assigned:      { label: 'Worker Assigned',  color: '#34D399', bg: 'rgba(52,211,153,0.12)', icon: CheckCircle2 },
  en_route:      { label: 'On the Way',       color: '#22C55E', bg: 'rgba(34,197,94,0.12)',  icon: Navigation },
  arrived:       { label: 'Worker Arrived',   color: '#22C55E', bg: 'rgba(34,197,94,0.12)',  icon: CheckCircle2 },
  started:       { label: 'In Progress',      color: 'var(--accent)', bg: 'var(--accent-deep)', icon: CircleDot },
  completed:     { label: 'Completed',        color: '#34D399', bg: 'rgba(52,211,153,0.12)', icon: CheckCheck },
  cancelled:     { label: 'Cancelled',        color: '#F87171', bg: 'rgba(248,113,113,0.12)', icon: XCircle },
  failed:        { label: 'Failed',           color: '#F87171', bg: 'rgba(248,113,113,0.12)', icon: XCircle },
}

const SOURCE_LABELS = {
  instant:   'Instant Booking',
  scheduled: 'Scheduled Service',
  discovery: 'Discovery Booking',
  slot:      'Slot Booking',
  package:   'Package Booking',
}

// Timeline stages — ordered progression
const TIMELINE_STAGES = [
  { key: 'booked',    label: 'Booked',           field: 'created_at' },
  { key: 'assigned',  label: 'Worker Confirmed',  field: 'assigned_at' },
  { key: 'en_route',  label: 'On the Way',        field: 'en_route_at' },
  { key: 'arrived',   label: 'Arrived',           field: 'arrived_at' },
  { key: 'started',   label: 'Work Started',      field: 'started_at' },
  { key: 'done',      label: 'Completed',         field: 'completed_at' },
]

const STATUS_STAGE_MAP = {
  requested: 0, searching: 0, scheduled: 0, confirmed: 1,
  worker_assigned: 1, assigned: 1, en_route: 2, arrived: 3,
  started: 4, completed: 5, cancelled: -1, failed: -1,
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dt) {
  if (!dt) return null
  return new Date(dt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function fmtDate(str) {
  if (!str) return ''
  return new Date(str + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function fmtTime(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function errMsg(e, fallback = 'Something went wrong') {
  const d = e?.response?.data?.detail
  if (!d) return fallback
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg
  return fallback
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value, accent }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0',
      borderBottom: '1px solid var(--card-border)' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: accent ? 'var(--accent-deep)' : 'var(--card-bg)' }}>
        <Icon size={15} style={{ color: accent ? 'var(--accent)' : 'var(--text-muted)' }} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</p>
        <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4 }}>{value}</p>
      </div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
      letterSpacing: '0.07em', marginBottom: 12 }}>
      {children}
    </p>
  )
}

function StatusTimeline({ job }) {
  const currentStage = STATUS_STAGE_MAP[job.status] ?? 0
  const isCancelled = job.status === 'cancelled' || job.status === 'failed'

  if (isCancelled) {
    return (
      <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(248,113,113,0.08)',
        border: '1px solid rgba(248,113,113,0.20)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Ban size={16} style={{ color: '#F87171', flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#F87171', marginBottom: 3 }}>
            {job.status === 'cancelled' ? 'Booking Cancelled' : 'Booking Failed'}
          </p>
          {job.cancellation_reason && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{job.cancellation_reason}</p>
          )}
          {job.cancelled_by && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
              Cancelled by {job.cancelled_by}
              {job.cancelled_at ? ` · ${fmt(job.cancelled_at)}` : ''}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {TIMELINE_STAGES.map((stage, i) => {
        const done = i <= currentStage
        const active = i === currentStage
        const ts = job[stage.field]

        return (
          <div key={stage.key} style={{ display: 'flex', gap: 12, position: 'relative' }}>
            {/* Connector line */}
            {i < TIMELINE_STAGES.length - 1 && (
              <div style={{
                position: 'absolute', left: 11, top: 24, width: 2, height: 'calc(100% - 4px)',
                background: done && i < currentStage ? '#34D399' : 'var(--card-border)',
                transition: 'background 0.3s',
              }} />
            )}
            {/* Dot */}
            <div style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0, zIndex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done ? (active ? 'var(--accent)' : '#34D399') : 'var(--card-bg)',
              border: done ? 'none' : '1.5px solid var(--card-border)',
              transition: 'all 0.3s',
            }}>
              {done && !active && <CheckCheck size={11} color="#000" strokeWidth={3} />}
              {active && <CircleDot size={11} color="#000" strokeWidth={3} />}
            </div>
            {/* Label */}
            <div style={{ paddingBottom: i < TIMELINE_STAGES.length - 1 ? 20 : 0, flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: active ? 600 : 400,
                color: done ? 'var(--text-primary)' : 'var(--text-muted)', lineHeight: 1.3 }}>
                {stage.label}
              </p>
              {ts && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  {fmt(ts)}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Cancel modal ──────────────────────────────────────────────────────────────

function CancelModal({ open, onClose, onConfirm, loading }) {
  const [reason, setReason] = useState('')
  const REASONS = ['Changed my mind', 'Found another worker', 'Emergency', 'Other']

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000 }} />
          <motion.div initial={{ opacity: 0, y: 48, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24 }}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1001,
              background: 'var(--bg-elevated, #141B26)',
              borderRadius: '20px 20px 0 0', padding: '24px 20px 40px',
              border: '1px solid var(--card-border)',
            }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              Cancel booking?
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
              Please tell us why — this helps us improve.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {REASONS.map(r => (
                <button key={r} onClick={() => setReason(r)}
                  style={{
                    padding: '10px 8px', borderRadius: 10, fontSize: 12, cursor: 'pointer',
                    border: reason === r ? '1.5px solid #F87171' : '1px solid var(--card-border)',
                    background: reason === r ? 'rgba(248,113,113,0.10)' : 'var(--card-bg)',
                    color: reason === r ? '#F87171' : 'var(--text-secondary)',
                    fontWeight: reason === r ? 600 : 400, transition: 'all 0.15s',
                  }}>
                  {r}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <GlassButton variant="ghost" size="md" className="flex-1" onClick={onClose}>
                Keep booking
              </GlassButton>
              <button onClick={() => reason && onConfirm(reason)}
                disabled={!reason || loading}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                  background: reason ? 'rgba(248,113,113,0.90)' : 'rgba(248,113,113,0.30)',
                  color: '#fff', border: 'none', cursor: reason ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                Cancel booking
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── Reschedule modal ──────────────────────────────────────────────────────────

function RescheduleModal({ open, onClose, currentDays, currentStart, currentEnd, onConfirm, loading }) {
  const [days,        setDays]        = useState(currentDays)
  const [windowStart, setWindowStart] = useState(currentStart)
  const [windowEnd,   setWindowEnd]   = useState(currentEnd)

  // Reset to current values when modal opens
  const [init, setInit] = useState(false)
  if (open && !init) { setDays(currentDays); setWindowStart(currentStart); setWindowEnd(currentEnd); setInit(true) }
  if (!open && init) setInit(false)

  function todayStr() { return new Date().toISOString().split('T')[0] }
  function addDays(str, n) {
    const d = new Date(str + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().split('T')[0]
  }
  function formatShort(str) {
    return new Date(str + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  function to12h(hhmm) {
    if (!hhmm) return ''
    const [h, m] = hhmm.split(':').map(Number)
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  }

  const futureDays = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), i + 1))

  function toggleDay(d) {
    if (days.includes(d)) { setDays(days.filter(x => x !== d)); return }
    if (days.length >= 3) return
    setDays([...days, d].sort())
  }

  // Time options 06:00 – 22:00 in 30-min steps
  const timeOpts = []
  for (let h = 6; h <= 22; h++) for (const m of [0, 30]) {
    if (h === 22 && m === 30) continue
    timeOpts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  const endOpts = timeOpts.filter(t => {
    if (!windowStart) return true
    const [sh, sm] = windowStart.split(':').map(Number)
    const [eh, em] = t.split(':').map(Number)
    return (eh * 60 + em) - (sh * 60 + sm) >= 60
  })

  const valid = days.length >= 1 && windowStart && windowEnd

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000 }} />
          <motion.div initial={{ opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 32 }}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1001,
              background: 'var(--bg-elevated, #141B26)',
              borderRadius: '20px 20px 0 0', padding: '24px 20px 44px',
              border: '1px solid var(--card-border)', maxHeight: '80vh', overflowY: 'auto',
            }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              Reschedule booking
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Pick new preferred dates and arrival window.
            </p>

            {/* Day picker */}
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 8 }}>Preferred days (up to 3)</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 18 }}>
              {futureDays.map(day => {
                const active = days.includes(day)
                const dt = new Date(day + 'T12:00:00Z')
                return (
                  <button key={day} onClick={() => toggleDay(day)}
                    style={{
                      padding: '8px 4px', borderRadius: 10, cursor: 'pointer',
                      border: active ? '1.5px solid var(--accent)' : '1px solid var(--card-border)',
                      background: active ? 'var(--accent-deep)' : 'var(--card-bg)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, textAlign: 'center',
                    flexDirection: 'column',
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      {dt.getDate()}
                    </span>
                    <span style={{ fontSize: 10, opacity: 0.8 }}>
                      {dt.toLocaleDateString('en', { weekday: 'short' })}
                    </span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        </>
        )}
    </AnimatePresence>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const { jobId } = useParams()
  const navigate  = useNavigate()
  const queryClient = useQueryClient()

  const { data: job, isLoading, error } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.get(`/jobs/${jobId}`).then(r => r.data),
    refetchInterval: 15_000,
  })

  const cancelMut = useMutation({
    mutationFn: (reason) => api.post(`/jobs/${jobId}/cancel`, { reason }),
    onSuccess: () => {
      toast.success('Job cancelled')
      queryClient.invalidateQueries(['job', jobId])
    },
    onError: (e) => toast.error(errMsg(e, 'Cancel failed')),
  })

  const rescheduleMut = useMutation({
    mutationFn: ({ days, windowStart, windowEnd }) =>
      api.patch(`/jobs/${jobId}/reschedule`, { preferred_days: days, window_start: windowStart, window_end: windowEnd }),
    onSuccess: () => {
      toast.success('Reschedule request sent')
      queryClient.invalidateQueries(['job', jobId])
    },
    onError: (e) => toast.error(errMsg(e, 'Reschedule failed')),
  })

  const [showCancel,     setShowCancel]     = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error || !job) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <p style={{ color: 'var(--text-muted)' }}>Could not load job details.</p>
      <GlassButton variant="ghost" onClick={() => navigate(-1)}>Go Back</GlassButton>
    </div>
  )

  const worker = job.worker || {}
  const isActive = ['searching', 'assigned', 'arrived', 'in_progress'].includes(job.status)
  const isDone   = job.status === 'completed'
  const isCancellable = ['searching', 'assigned'].includes(job.status)
  const isScheduled = job.job_type === 'scheduled' || job.preferred_days?.length > 0

  return (
    <div className="px-0 pb-4 max-w-3xl mx-auto">
      {/* Back header */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)', borderRadius: 10,
            padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            color: 'var(--text-secondary)', fontSize: 13 }}>
          ← Back
        </button>
        <h1 style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', margin: 0 }}>
          Job Details
        </h1>
      </div>

      <div className="px-4 space-y-4">
        {/* Status card */}
        <div style={{ borderRadius: 20, padding: '16px 20px', background: 'var(--card-bg)',
          border: '1px solid var(--card-border)' }}>
          <StatusTimeline job={job} />
        </div>

        {/* Worker card (if assigned) */}
        {worker.id && (
          <div style={{ borderRadius: 20, padding: '16px 20px', background: 'var(--card-bg)',
            border: '1px solid var(--card-border)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 12 }}>Assigned Worker</p>
            <button onClick={() => navigate(`/worker/${worker.id}`)}
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', gap: 12, alignItems: 'center', padding: 0 }}>
              {worker.avatar_url
                ? <img src={worker.avatar_url} alt={worker.full_name}
                    style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover',
                      border: '2px solid var(--card-border)', flexShrink: 0 }} />
                : <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.07)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    fontSize: 20, color: 'var(--brand)' }}>
                    {worker.full_name?.[0]?.toUpperCase() || 'W'}
                  </div>
              }
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <p style={{ fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{worker.full_name}</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{job.category_name || 'Service'}</p>
                {worker.rating && (
                  <p style={{ fontSize: 12, color: 'var(--accent)', margin: '2px 0 0' }}>★ {worker.rating.toFixed(1)}</p>
                )}
              </div>
              <span style={{ color: 'var(--brand)', fontSize: 13 }}>View →</span>
            </button>
          </div>
        )}

        {/* Job info */}
        <div style={{ borderRadius: 20, padding: '16px 20px', background: 'var(--card-bg)',
          border: '1px solid var(--card-border)' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 12 }}>Details</p>
          <div className="space-y-3">
            <InfoRow icon={MapPin} label="Location" value={job.location_address || 'Not set'} />
            <InfoRow icon={Clock} label="Type" value={job.job_type === 'instant' ? 'Instant' : 'Scheduled'} />
            {job.created_at && <InfoRow icon={Calendar} label="Booked" value={fmtDate(job.created_at)} />}
            {job.started_at && <InfoRow icon={Clock} label="Started" value={fmt(job.started_at)} />}
            {job.completed_at && <InfoRow icon={CheckCircle} label="Completed" value={fmt(job.completed_at)} />}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {isActive && job.chat_id && (
            <GlassButton variant="brand" className="flex-1" onClick={() => navigate(`/chat/${jobId}`)}>
              Open Chat
            </GlassButton>
          )}
          {isCancellable && (
            <GlassButton variant="danger" className="flex-1" onClick={() => setShowCancel(true)}>
              Cancel Job
            </GlassButton>
          )}
          {isScheduled && isActive && (
            <GlassButton variant="outline" className="flex-1" onClick={() => setShowReschedule(true)}>
              Reschedule
            </GlassButton>
          )}
        </div>
      </div>

      <CancelModal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        loading={cancelMut.isPending}
        onConfirm={(reason) => cancelMut.mutate(reason)}
      />

      <RescheduleModal
        open={showReschedule}
        onClose={() => setShowReschedule(false)}
        currentDays={job.preferred_days || []}
        currentStart={job.arrival_window_start || '09:00'}
        currentEnd={job.arrival_window_end || '12:00'}
        loading={rescheduleMut.isPending}
        onConfirm={(vals) => rescheduleMut.mutate(vals)}
      />
    </div>
  )
}
