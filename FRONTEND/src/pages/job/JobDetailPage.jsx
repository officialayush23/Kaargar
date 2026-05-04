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
  PhoneOff, ShieldAlert,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { Background } from '@/components/glass/Background'
import { MobileBottomNav } from '@/components/glass/GlassNavbar'

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS = {
  requested:     { label: 'Requested',       color: '#60A5FA', bg: 'rgba(96,165,250,0.12)',  icon: Clock },
  searching:     { label: 'Finding Worker',   color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  icon: Zap },
  scheduled:     { label: 'Scheduled',        color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', icon: CalendarClock },
  confirmed:     { label: 'Confirmed',        color: '#34D399', bg: 'rgba(52,211,153,0.12)',  icon: CheckCircle2 },
  worker_assigned: { label: 'Worker Assigned',color: '#34D399', bg: 'rgba(52,211,153,0.12)', icon: CheckCircle2 },
  assigned:      { label: 'Worker Assigned',  color: '#34D399', bg: 'rgba(52,211,153,0.12)', icon: CheckCircle2 },
  en_route:      { label: 'On the Way',       color: '#22C55E', bg: 'rgba(34,197,94,0.12)',  icon: Navigation },
  arrived:       { label: 'Worker Arrived',   color: '#22C55E', bg: 'rgba(34,197,94,0.12)',  icon: CheckCircle2 },
  started:       { label: 'In Progress',      color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', icon: CircleDot },
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
        background: accent ? 'rgba(245,158,11,0.10)' : 'var(--card-bg)' }}>
        <Icon size={15} style={{ color: accent ? 'var(--amber, #F59E0B)' : 'var(--text-muted)' }} />
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
              background: done ? (active ? '#F59E0B' : '#34D399') : 'var(--card-bg)',
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

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const { jobId }   = useParams()
  const navigate    = useNavigate()
  const qc          = useQueryClient()
  const [showCancel, setShowCancel] = useState(false)

  // Fetch job
  const { data: job, isLoading, error } = useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      const { data } = await api.get(`/jobs/${jobId}`)
      return data
    },
    refetchInterval: (data) => {
      // Poll while job is in a live state
      const live = ['searching', 'assigned', 'en_route', 'arrived', 'started']
      return live.includes(data?.status) ? 10_000 : false
    },
  })

  // Fetch worker details if assigned
  const { data: worker } = useQuery({
    queryKey: ['worker-detail', job?.worker_id],
    queryFn: async () => {
      const { data } = await api.get(`/workers/${job.worker_id}`)
      return data
    },
    enabled: !!job?.worker_id,
  })

  // Cancel mutation
  const cancelMut = useMutation({
    mutationFn: async (reason) => {
      await api.post(`/jobs/${jobId}/cancel`, { reason })
    },
    onSuccess: () => {
      toast.success('Booking cancelled')
      qc.invalidateQueries({ queryKey: ['job', jobId] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
      setShowCancel(false)
    },
    onError: (e) => toast.error(errMsg(e, 'Cancellation failed')),
  })

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--page-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }

  if (error || !job) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--page-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <AlertTriangle size={36} style={{ color: '#F87171' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Booking not found</p>
        <GlassButton variant="ghost" onClick={() => navigate('/bookings')}>Back to bookings</GlassButton>
      </div>
    )
  }

  const cfg = STATUS[job.status] || STATUS.requested
  const StatusIcon = cfg.icon
  const isLive = ['searching', 'assigned', 'en_route', 'arrived', 'started'].includes(job.status)
  const isScheduledPending = ['scheduled', 'requested', 'searching'].includes(job.status)
  const isConfirmedOrAssigned = ['confirmed', 'worker_assigned', 'assigned'].includes(job.status)
  const isDone = ['completed', 'cancelled', 'failed'].includes(job.status)
  const canCancel = !isDone && !['en_route', 'arrived', 'started'].includes(job.status)
  const hasSlot = !!job.slot_id && !!job.scheduled_at
  const hasWindow = !!(job.preferred_days?.length && job.window_start && job.window_end)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--page-bg)', position: 'relative' }}>
      <Background />
      <div style={{ maxWidth: 428, margin: '0 auto', padding: '0 16px 120px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0 16px' }}>
          <button onClick={() => navigate(-1)}
            style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--card-bg)',
              border: '1px solid var(--card-border)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>
              Booking Details
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              #{job.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>

        {/* ── Status banner ── */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          style={{ padding: '16px 18px', borderRadius: 16, background: cfg.bg,
            border: `1px solid ${cfg.color}30`, marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${cfg.color}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <StatusIcon size={22} style={{ color: cfg.color }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: cfg.color }}>{cfg.label}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {job.title || SOURCE_LABELS[job.source] || 'Booking'}
              {' · '}
              <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {fmt(job.created_at)}
              </span>
            </p>
          </div>
          {isLive && (
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color,
              boxShadow: `0 0 8px ${cfg.color}` }} className="animate-pulse" />
          )}
        </motion.div>

        {/* ── Progress timeline ── */}
        <GlassCard className="p-5" style={{ marginBottom: 12 }}>
          <SectionTitle>Progress</SectionTitle>
          <StatusTimeline job={job} />
        </GlassCard>

        {/* ── Scheduling info ── */}
        {(hasSlot || hasWindow) && (
          <GlassCard className="p-5" style={{ marginBottom: 12 }}>
            <SectionTitle>Schedule</SectionTitle>
            {hasSlot ? (
              <>
                <InfoRow icon={Calendar} label="Date" accent
                  value={fmtDate(new Date(job.scheduled_at).toISOString().split('T')[0])} />
                <InfoRow icon={Clock} label="Time" accent
                  value={`${new Date(job.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`} />
                <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(52,211,153,0.07)',
                  border: '1px solid rgba(52,211,153,0.15)' }}>
                  <p style={{ fontSize: 11, color: '#34D399' }}>
                    ✓ Specific slot reserved — worker arrives exactly at this time
                  </p>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Preferred days</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {job.preferred_days?.map((d, i) => (
                      <span key={d} style={{
                        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: i === 0 ? 'rgba(167,139,250,0.15)' : 'var(--card-bg)',
                        color: i === 0 ? '#A78BFA' : 'var(--text-secondary)',
                        border: `1px solid ${i === 0 ? 'rgba(167,139,250,0.3)' : 'var(--card-border)'}`,
                      }}>
                        {i === 0 ? '1st · ' : i === 1 ? '2nd · ' : '3rd · '}
                        {fmtDate(d)}
                      </span>
                    ))}
                  </div>
                </div>
                <InfoRow icon={Clock} label="Arrival window" accent
                  value={`${fmtTime(job.window_start)} – ${fmtTime(job.window_end)}`} />
              </>
            )}
          </GlassCard>
        )}

        {/* ── Worker info ── */}
        {worker ? (
          <GlassCard className="p-5" style={{ marginBottom: 12 }}>
            <SectionTitle>Your Worker</SectionTitle>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {worker.avatar_url ? (
                <img src={worker.avatar_url} alt={worker.full_name}
                  style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover',
                    border: '2px solid var(--card-border)' }} />
              ) : (
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(75,123,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={22} style={{ color: '#4B7BFF' }} />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {worker.full_name || 'Your Worker'}
                </p>
                {worker.avg_rating > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Star size={12} style={{ color: '#F59E0B', fill: '#F59E0B' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {Number(worker.avg_rating).toFixed(1)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      ({worker.rating_count || 0} reviews)
                    </span>
                  </div>
                )}
                {worker.bio && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{worker.bio}</p>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                borderRadius: 20, background: 'rgba(75,123,255,0.10)', border: '1px solid rgba(75,123,255,0.20)' }}>
                <PhoneOff size={10} style={{ color: '#4B7BFF' }} />
                <span style={{ fontSize: 10, color: '#4B7BFF', fontWeight: 600 }}>Phone hidden</span>
              </div>
            </div>
          </GlassCard>
        ) : isScheduledPending ? (
          <GlassCard className="p-4" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(245,158,11,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User size={18} style={{ color: '#F59E0B' }} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Worker not yet assigned</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                  {job.status === 'searching'
                    ? 'Matching in progress — usually takes under a minute.'
                    : 'We\'ll assign the best available worker and notify you before your window.'}
                </p>
              </div>
            </div>
          </GlassCard>
        ) : null}

        {/* ── Location ── */}
        <GlassCard className="p-5" style={{ marginBottom: 12 }}>
          <SectionTitle>Location</SectionTitle>
          <InfoRow icon={MapPin} label="Address" value={job.location_address} accent />
          {job.location_area && <InfoRow icon={MapPin} label="Area" value={job.location_area} />}
          {job.location_note && <InfoRow icon={MapPin} label="Landmark" value={job.location_note} />}
        </GlassCard>

        {/* ── Price breakdown ── */}
        {(job.quoted_price || job.final_price) && (
          <GlassCard className="p-5" style={{ marginBottom: 12 }}>
            <SectionTitle>Payment</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {job.quoted_price && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Estimated</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)',
                    fontFamily: 'JetBrains Mono, monospace' }}>
                    ₹{Number(job.quoted_price).toFixed(0)}
                  </span>
                </div>
              )}
              {job.final_price && (
                <>
                  <div style={{ height: 1, background: 'var(--card-border)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Total Paid</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#34D399',
                      fontFamily: 'JetBrains Mono, monospace' }}>
                      ₹{Number(job.final_price).toFixed(0)}
                    </span>
                  </div>
                  {job.platform_fee && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Platform fee</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                        ₹{Number(job.platform_fee).toFixed(0)}
                      </span>
                    </div>
                  )}
                </>
              )}
              {!job.final_price && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Payment collected after work is completed via Kaargar
                </p>
              )}
            </div>
          </GlassCard>
        )}

        {/* ── Actions ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Chat — available once a worker is assigned and job is active */}
          {(isConfirmedOrAssigned || isLive) && !isDone && (
            <GlassButton variant="brand" size="lg" className="w-full"
              icon={MessageCircle} iconPosition="left"
              onClick={() => navigate(`/chat/${jobId}`)}>
              Message Worker
            </GlassButton>
          )}

          {/* Live job — go to tracking */}
          {['en_route', 'arrived', 'started'].includes(job.status) && (
            <GlassButton variant="instant" size="lg" className="w-full"
              icon={Navigation} iconPosition="left"
              onClick={() => navigate(`/job/${jobId}/active`)}>
              Track Live
            </GlassButton>
          )}

          {/* Reschedule — only window-based jobs not yet assigned */}
          {isScheduledPending && hasWindow && (
            <GlassButton variant="discovery" size="lg" className="w-full"
              icon={RotateCcw} iconPosition="left"
              onClick={() => navigate(`/job/${jobId}/reschedule`)}>
              Reschedule
            </GlassButton>
          )}

          {/* Completed — review */}
          {job.status === 'completed' && (
            <GlassButton variant="instant" size="lg" className="w-full"
              icon={Star} iconPosition="left"
              onClick={() => navigate(`/job/${jobId}/review`)}>
              Leave a Review
            </GlassButton>
          )}

          {/* Cancel */}
          {canCancel && (
            <button onClick={() => setShowCancel(true)}
              style={{
                width: '100%', padding: '13px 16px', borderRadius: 12, fontSize: 14,
                fontWeight: 600, color: '#F87171', cursor: 'pointer',
                background: 'rgba(248,113,113,0.07)',
                border: '1px solid rgba(248,113,113,0.20)',
              }}>
              Cancel Booking
            </button>
          )}

          {/* Book again */}
          {isDone && (
            <GlassButton variant="ghost" size="lg" className="w-full"
              onClick={() => navigate('/')}>
              Book Again
            </GlassButton>
          )}
        </div>

      </div>

      <CancelModal
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onConfirm={(reason) => cancelMut.mutate(reason)}
        loading={cancelMut.isPending}
      />

      <MobileBottomNav />
    </div>
  )
}
