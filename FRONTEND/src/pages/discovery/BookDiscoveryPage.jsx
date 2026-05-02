/**
 * BookDiscoveryPage — Scheduled job booking flow.
 *
 * Flow:
 *   1. Pick up to 3 preferred days (multi-date)
 *   2. Set time window (start + end, min 1 h apart)
 *   3. Choose service / package
 *   4. Enter location
 *   5. Confirm → POST /jobs/scheduled
 *
 * The worker is NOT assigned at booking time.
 * The scheduler assigns ~2 h before the window on one of the selected days.
 */

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Calendar, Clock, MapPin, Package,
  Check, Loader2, Info, CalendarCheck, Sparkles,
} from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Background } from '@/components/glass/Background'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { MobileBottomNav } from '@/components/glass/GlassNavbar'

// ─── helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function formatShortDate(str) {
  if (!str) return ''
  const d = new Date(str + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function to24h(hhmm) {
  return hhmm + ':00'
}

function to12h(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function timeOptions() {
  const opts = []
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) continue
      opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return opts
}
const TIME_OPTIONS = timeOptions()

// ─── constants ────────────────────────────────────────────────────────────────

const STEPS        = ['days', 'window', 'service', 'location', 'confirm']
const STEP_LABELS  = ['Days', 'Time', 'Service', 'Location', 'Confirm']
const MAX_DAYS     = 3
const MIN_WIN_MINS = 60   // minimum window = 1 hour

// ─── InfoChip — inline info tooltip ──────────────────────────────────────────

function InfoChip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setShow(v => !v)}
        style={{
          width: 20, height: 20, borderRadius: '50%',
          border: '1px solid var(--card-border)',
          background: 'var(--card-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}
        aria-label="More info"
      >
        <Info size={11} style={{ color: 'var(--text-muted)' }} />
      </button>
      <AnimatePresence>
        {show && (
          <>
            {/* Backdrop */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 99 }}
              onClick={() => setShow(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              transition={{ duration: 0.14 }}
              style={{
                position: 'absolute',
                bottom: '110%',
                right: 0,
                width: '220px',
                background: 'var(--elevated, #1C1C1E)',
                border: '1px solid var(--card-border)',
                borderRadius: '12px',
                padding: '12px',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
                zIndex: 100,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
            >
              {text}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Day grid picker ──────────────────────────────────────────────────────────

function DayPicker({ selected, onChange }) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(todayStr(), i + 1))

  function toggle(day) {
    if (selected.includes(day)) {
      onChange(selected.filter(d => d !== day))
    } else if (selected.length < MAX_DAYS) {
      onChange([...selected, day].sort())
    } else {
      toast.error(`You can select up to ${MAX_DAYS} days`)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
      {days.map(day => {
        const d = new Date(day + 'T00:00:00')
        const weekday = d.toLocaleDateString('en-IN', { weekday: 'short' })
        const date    = d.getDate()
        const month   = d.toLocaleDateString('en-IN', { month: 'short' })
        const active  = selected.includes(day)
        const order   = selected.indexOf(day) + 1

        return (
          <motion.button
            key={day}
            onClick={() => toggle(day)}
            whileTap={{ scale: 0.94 }}
            style={{
              padding: '8px 4px',
              borderRadius: '12px',
              border: active ? '1.5px solid var(--amber)' : '1px solid var(--card-border)',
              background: active ? 'rgba(245,158,11,0.12)' : 'var(--card-bg)',
              cursor: 'pointer',
              position: 'relative',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px',
              transition: 'all 0.15s ease',
            }}
          >
            {active && (
              <div style={{
                position: 'absolute', top: '4px', right: '4px',
                width: 14, height: 14, borderRadius: '50%',
                background: 'var(--amber)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '8px', fontWeight: 700, color: '#000',
              }}>
                {order}
              </div>
            )}
            <span style={{ fontSize: '9px', color: active ? 'var(--amber)' : 'var(--text-muted)', fontWeight: 500 }}>
              {weekday}
            </span>
            <span style={{ fontSize: '17px', fontWeight: 700, color: active ? 'var(--amber)' : 'var(--text-primary)', lineHeight: 1 }}>
              {date}
            </span>
            <span style={{ fontSize: '9px', color: active ? 'var(--amber)' : 'var(--text-muted)' }}>
              {month}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}

// ─── Time select ──────────────────────────────────────────────────────────────

function TimeSelect({ label, value, onChange, options, placeholder }) {
  return (
    <div style={{ flex: 1 }}>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>
        {label}
      </p>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: '10px',
          border: value ? '1.5px solid var(--amber)' : '1px solid var(--card-border)',
          background: 'var(--card-bg)',
          color: value ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: '14px',
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
        }}
      >
        <option value="" style={{ color: 'var(--text-muted)' }}>{placeholder}</option>
        {options.map(t => (
          <option key={t} value={t}>{to12h(t)}</option>
        ))}
      </select>
    </div>
  )
}

// ─── Summary row ──────────────────────────────────────────────────────────────

function SummaryRow({ icon: Icon, label, children }) {
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '8px', flexShrink: 0,
        background: 'rgba(245,158,11,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={15} style={{ color: 'var(--amber)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px' }}>{label}</p>
        {children}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BookDiscoveryPage() {
  const { workerId } = useParams()
  const navigate     = useNavigate()

  // Step state
  const [stepIdx, setStepIdx] = useState(0)
  const [prevIdx, setPrevIdx] = useState(0)

  // Form
  const [preferredDays, setPreferredDays] = useState([])
  const [windowStart, setWindowStart]     = useState('')
  const [windowEnd,   setWindowEnd]       = useState('')
  const [selectedService, setSelectedService] = useState(null)
  const [selectedPackage, setSelectedPackage] = useState(null)
  const [address,      setAddress]        = useState('')
  const [locationArea, setLocationArea]   = useState('')
  const [locationNote, setLocationNote]   = useState('')

  function goNext() { setPrevIdx(stepIdx); setStepIdx(i => i + 1) }
  function goPrev() { setPrevIdx(stepIdx); setStepIdx(i => i - 1) }
  const direction = stepIdx >= prevIdx ? 1 : -1

  // Services
  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['worker-services-book', workerId],
    queryFn: async () => {
      const { data } = await api.get(`/workers/${workerId}/services`)
      return Array.isArray(data) ? data : []
    },
    enabled: !!workerId,
  })

  // Window validation
  const windowValid = (() => {
    if (!windowStart || !windowEnd) return false
    const [sh, sm] = windowStart.split(':').map(Number)
    const [eh, em] = windowEnd.split(':').map(Number)
    return (eh * 60 + em) - (sh * 60 + sm) >= MIN_WIN_MINS
  })()

  // End time options: only ≥1h after start
  const endOptions = TIME_OPTIONS.filter(t => {
    if (!windowStart) return true
    const [sh, sm] = windowStart.split(':').map(Number)
    const [eh, em] = t.split(':').map(Number)
    return (eh * 60 + em) - (sh * 60 + sm) >= MIN_WIN_MINS
  })

  const step = STEPS[stepIdx]

  const canProceed = {
    days:     preferredDays.length >= 1,
    window:   windowValid,
    service:  !!selectedService,
    location: address.trim().length >= 5,
    confirm:  true,
  }

  const price = selectedPackage?.price ?? selectedService?.base_price ?? 0

  // Submit
  const bookMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/jobs/scheduled', {
        job_type:         'scheduled',
        source:           'discovery',
        category_id:      selectedService?.category_id || null,
        service_id:       selectedService?.id,
        package_id:       selectedPackage?.id || null,
        title:            selectedService?.title || 'Service booking',
        description:      null,
        preferred_days:   preferredDays,
        window_start:     to24h(windowStart),
        window_end:       to24h(windowEnd),
        location_lat:     18.5204,
        location_lon:     73.8567,
        location_address: address,
        location_area:    locationArea || null,
        location_note:    locationNote || null,
        budget_max:       price || null,
      })
      return data
    },
    onSuccess: () => {
      toast.success("Booking confirmed! We'll assign your worker soon.")
      navigate('/bookings')
    },
    onError: (e) => {
      toast.error(e.response?.data?.detail || 'Booking failed. Please try again.')
    },
  })

  // Animation
  const slide = {
    enter:  d => ({ opacity: 0, x: d > 0 ? 48 : -48 }),
    center: { opacity: 1, x: 0 },
    exit:   d => ({ opacity: 0, x: d > 0 ? -48 : 48 }),
  }

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--page-bg)' }}>
      <Background />

      <div className="max-w-sm mx-auto px-4 py-6 pb-40">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <button
            onClick={stepIdx > 0 ? goPrev : () => navigate(-1)}
            style={{
              width: 38, height: 38, borderRadius: '10px',
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div>
            <h1 className="font-syne font-bold text-base" style={{ color: 'var(--text-primary)' }}>
              Schedule Service
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Step {stepIdx + 1} of {STEPS.length}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
          {STEP_LABELS.map((label, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{
                height: '3px', borderRadius: '2px', width: '100%',
                background: i <= stepIdx ? 'var(--amber)' : 'var(--card-border)',
                transition: 'background 0.3s',
              }} />
              <span style={{
                fontSize: '9px',
                color: i === stepIdx ? 'var(--amber)' : i < stepIdx ? 'var(--text-secondary)' : 'var(--text-muted)',
                fontWeight: i === stepIdx ? 600 : 400,
              }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Steps */}
        <AnimatePresence mode="wait" custom={direction}>

          {/* ── STEP 1: Days ── */}
          {step === 'days' && (
            <motion.div key="days" custom={direction}
              variants={slide} initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              className="space-y-4"
            >
              <GlassCard className="p-5">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={15} style={{ color: 'var(--amber)' }} />
                    <h3 className="font-syne font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                      Pick preferred days
                    </h3>
                  </div>
                  <InfoChip text="Select up to 3 days. We'll try day 1 first, then day 2, then day 3 if needed. You'll get a notification when a worker is confirmed." />
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                  Select up to {MAX_DAYS} days you're available
                  {preferredDays.length > 0 && (
                    <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
                      {' '}· {preferredDays.length}/{MAX_DAYS} chosen
                    </span>
                  )}
                </p>

                <DayPicker selected={preferredDays} onChange={setPreferredDays} />

                {preferredDays.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      marginTop: '14px', padding: '12px', borderRadius: '10px',
                      background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)',
                    }}
                  >
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Order of preference
                    </p>
                    {preferredDays.map((d, i) => (
                      <div key={d} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%',
                          background: 'var(--amber)', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: '#000',
                        }}>
                          {i + 1}
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {formatShortDate(d)}
                        </span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </GlassCard>
            </motion.div>
          )}

          {/* ── STEP 2: Time window ── */}
          {step === 'window' && (
            <motion.div key="window" custom={direction}
              variants={slide} initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              className="space-y-4"
            >
              <GlassCard className="p-5">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={15} style={{ color: 'var(--amber)' }} />
                    <h3 className="font-syne font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                      Your available window
                    </h3>
                  </div>
                  <InfoChip text="Set a time range when you'll be home and available. Example: 2 PM – 6 PM. The worker will arrive within this window. Minimum 1 hour." />
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  When can the worker come? (min 1 hour)
                </p>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                  <TimeSelect
                    label="From"
                    value={windowStart}
                    onChange={v => { setWindowStart(v); if (windowEnd && windowEnd <= v) setWindowEnd('') }}
                    options={TIME_OPTIONS}
                    placeholder="Start"
                  />
                  <div style={{ paddingBottom: '12px', color: 'var(--text-muted)', fontSize: '18px' }}>–</div>
                  <TimeSelect
                    label="Until"
                    value={windowEnd}
                    onChange={setWindowEnd}
                    options={endOptions}
                    placeholder="End"
                  />
                </div>

                {windowStart && windowEnd && !windowValid && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ marginTop: '10px', fontSize: '11px', color: '#F87171' }}>
                    Window must be at least 1 hour
                  </motion.p>
                )}

                {windowValid && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    style={{
                      marginTop: '14px', padding: '10px 14px', borderRadius: '10px',
                      background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)',
                      display: 'flex', alignItems: 'center', gap: '8px',
                    }}
                  >
                    <Check size={13} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Worker arrives between{' '}
                      <strong style={{ color: 'var(--amber)' }}>
                        {to12h(windowStart)} – {to12h(windowEnd)}
                      </strong>
                    </p>
                  </motion.div>
                )}
              </GlassCard>

              {/* Mini recap of selected days */}
              <GlassCard className="p-4">
                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Your days
                </p>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {preferredDays.map(d => (
                    <span key={d} style={{
                      padding: '3px 10px', borderRadius: '20px',
                      background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)',
                      fontSize: '11px', color: 'var(--amber)', fontWeight: 500,
                    }}>
                      {formatShortDate(d)}
                    </span>
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* ── STEP 3: Service ── */}
          {step === 'service' && (
            <motion.div key="service" custom={direction}
              variants={slide} initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              className="space-y-3"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <h3 className="font-syne font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Choose a service
                </h3>
                <InfoChip text="Select the service you need. If the worker offers packages (bundled services at a discount), you can opt for one." />
              </div>

              {servicesLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
                  <Loader2 size={26} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              ) : services.length === 0 ? (
                <GlassCard className="p-10" style={{ textAlign: 'center' }}>
                  <Package size={30} style={{ color: 'var(--text-muted)', margin: '0 auto 10px' }} />
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>No services listed yet</p>
                </GlassCard>
              ) : services.map(svc => {
                const isActive = selectedService?.id === svc.id
                return (
                  <motion.div key={svc.id}
                    onClick={() => { setSelectedService(svc); setSelectedPackage(null) }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      padding: '14px 16px', borderRadius: '14px', cursor: 'pointer',
                      border: isActive ? '1.5px solid var(--amber)' : '1px solid var(--card-border)',
                      background: isActive ? 'rgba(245,158,11,0.08)' : 'var(--card-bg)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{svc.title}</p>
                        {svc.description && (
                          <p style={{
                            fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px',
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}>
                            {svc.description}
                          </p>
                        )}
                        {svc.duration_min && (
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>~{svc.duration_min} min</p>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                        {svc.base_price && (
                          <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--amber)' }}>₹{svc.base_price}</p>
                        )}
                        {isActive && (
                          <div style={{
                            width: 20, height: 20, borderRadius: '50%',
                            background: 'var(--amber)', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', marginTop: '4px', marginLeft: 'auto',
                          }}>
                            <Check size={11} color="#000" strokeWidth={3} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Package sub-list */}
                    {isActive && svc.packages?.length > 0 && (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--card-border)' }}>
                        <p style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '8px' }}>
                          Packages (optional):
                        </p>
                        {svc.packages.map(pkg => (
                          <motion.button key={pkg.id}
                            onClick={e => { e.stopPropagation(); setSelectedPackage(selectedPackage?.id === pkg.id ? null : pkg) }}
                            whileTap={{ scale: 0.97 }}
                            style={{
                              width: '100%', padding: '10px 12px', borderRadius: '10px',
                              border: selectedPackage?.id === pkg.id ? '1.5px solid var(--amber)' : '1px solid var(--card-border)',
                              background: selectedPackage?.id === pkg.id ? 'rgba(245,158,11,0.10)' : 'transparent',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              cursor: 'pointer', transition: 'all 0.15s ease', marginBottom: '6px',
                            }}
                          >
                            <div style={{ textAlign: 'left' }}>
                              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>{pkg.name}</p>
                              {pkg.description && (
                                <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{pkg.description}</p>
                              )}
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--amber)', flexShrink: 0, marginLeft: '8px' }}>
                              ₹{pkg.price}
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </motion.div>
          )}

          {/* ── STEP 4: Location ── */}
          {step === 'location' && (
            <motion.div key="location" custom={direction}
              variants={slide} initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              className="space-y-4"
            >
              <GlassCard className="p-5">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={15} style={{ color: 'var(--amber)' }} />
                    <h3 className="font-syne font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                      Service address
                    </h3>
                  </div>
                  <InfoChip text="The worker will come to this address. Enter a complete address so they can find you easily." />
                </div>

                <div className="space-y-3">
                  <GlassInput
                    label="Full address"
                    placeholder="Flat no., building, street…"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    icon={MapPin}
                    autoFocus
                  />
                  <GlassInput
                    label="Area / locality"
                    placeholder="e.g. Baner, Kothrud, Wakad…"
                    value={locationArea}
                    onChange={e => setLocationArea(e.target.value)}
                  />
                  <GlassInput
                    label="Landmark (optional)"
                    placeholder="Near blue gate, 3rd floor…"
                    value={locationNote}
                    onChange={e => setLocationNote(e.target.value)}
                  />
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* ── STEP 5: Confirm ── */}
          {step === 'confirm' && (
            <motion.div key="confirm" custom={direction}
              variants={slide} initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 340, damping: 32 }}
              className="space-y-4"
            >
              {/* How it works */}
              <div style={{
                padding: '14px 16px', borderRadius: '14px',
                background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.20)',
                display: 'flex', gap: '12px', alignItems: 'flex-start',
              }}>
                <Sparkles size={17} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: '1px' }} />
                <div>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--amber)', marginBottom: '4px' }}>
                    How flexible scheduling works
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                    We find the best available worker on your first preferred day. If unavailable, we try day 2, then day 3.
                    You'll get a notification 2 hours before your window starts — no need to wait at home till then!
                  </p>
                </div>
              </div>

              {/* Summary card */}
              <GlassCard className="p-5 space-y-4">
                <h3 className="font-syne font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Booking summary
                </h3>

                <SummaryRow icon={Calendar} label="Preferred days">
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '3px' }}>
                    {preferredDays.map(d => (
                      <span key={d} style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                        background: 'rgba(245,158,11,0.10)', color: 'var(--amber)',
                        border: '1px solid rgba(245,158,11,0.25)',
                      }}>
                        {formatShortDate(d)}
                      </span>
                    ))}
                  </div>
                </SummaryRow>

                <SummaryRow icon={Clock} label="Time window">
                  <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {to12h(windowStart)} – {to12h(windowEnd)}
                  </p>
                </SummaryRow>

                <SummaryRow icon={Package} label="Service">
                  <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {selectedPackage
                      ? `${selectedService?.title} · ${selectedPackage.name}`
                      : selectedService?.title}
                  </p>
                </SummaryRow>

                <SummaryRow icon={MapPin} label="Address">
                  <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {address}{locationNote ? ` (${locationNote})` : ''}
                  </p>
                </SummaryRow>
              </GlassCard>

              {/* Price */}
              {price > 0 && (
                <GlassCard className="p-4">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Estimated budget</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Payment collected after job completion
                      </p>
                    </div>
                    <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--amber)' }}>₹{price}</p>
                  </div>
                </GlassCard>
              )}

              {/* Cancellation note */}
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                Free cancellation before a worker is assigned. After assignment, cancellation fees may apply.
              </p>
            </motion.div>
          )}

        </AnimatePresence>

        {/* CTA */}
        <div style={{ marginTop: '24px' }}>
          {step !== 'confirm' ? (
            <GlassButton
              variant="discovery"
              size="lg"
              className="w-full"
              disabled={!canProceed[step]}
              onClick={goNext}
              icon={ChevronRight}
              iconPosition="right"
            >
              Continue
            </GlassButton>
          ) : (
            <GlassButton
              variant="instant"
              size="lg"
              className="w-full"
              loading={bookMutation.isPending}
              onClick={() => bookMutation.mutate()}
              icon={CalendarCheck}
              iconPosition="left"
            >
              Confirm Booking
            </GlassButton>
          )}
        </div>
      </div>

      <MobileBottomNav />
    </div>
  )
}
