/**
 * BookDiscoveryPage — Unified booking flow.
 *
 * Every service is EITHER slot-mode OR multi-day-mode — never both, never
 * neither (the old freeform "pick any window on any day" path has been
 * retired; a service that has neither flag set shows a not-configured
 * message instead of a booking flow):
 *
 *   • requires_slot=true            → SLOT MODE:      service → slot calendar → location → confirm
 *   • allow_multi_day_booking=true  → MULTI-DAY MODE: service → start date + #days → window → location → confirm
 *
 * Slot mode:      POST /jobs/book-slot  (worker assigned immediately)
 * Multi-day mode: POST /jobs/scheduled/multi-day — ONE call for the whole
 *                 range (start_date + num_days), created as a single atomic
 *                 bundle server-side (one parent Job + N-1 child Jobs, same
 *                 worker, all-or-nothing). Replaces the old per-day loop
 *                 over POST /jobs/scheduled, which took ~1 call/day, showed
 *                 up as N unrelated bookings, and had no atomicity — a
 *                 mid-way failure left a partial, inconsistent booking.
 */

import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Calendar, Clock, MapPin, Package,
  Check, Loader2, CalendarCheck, Sparkles, Grid3x3, CalendarRange,
  AlertTriangle, Minus, Plus,
} from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Background } from '@/components/glass/Background'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { GlassSelect } from '@/components/glass/GlassSelect'
import { InfoButton } from '@/components/kaargar/InfoButton'
import { MapLocationPicker } from '@/components/kaargar/MapLocationPicker'
import { api } from '@/lib/api'
import { useAddresses } from '@/hooks/useAddresses'
import { toast } from 'sonner'
import { MobileBottomNav } from '@/components/glass/GlassNavbar'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely extract a human-readable message from an axios error.
 *  FastAPI detail can be: string | {msg:string}[] | undefined */
function errMsg(e, fallback = 'Something went wrong') {
  const detail = e?.response?.data?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    // FastAPI validation error: [{loc, msg, type}, ...]
    const first = detail[0]
    return typeof first?.msg === 'string' ? first.msg : fallback
  }
  return fallback
}

// Local-calendar-date string (YYYY-MM-DD). Deliberately NOT
// `new Date().toISOString().split('T')[0]` — toISOString() converts to UTC
// first, which in IST (UTC+5:30) can silently return YESTERDAY's date for
// several hours after midnight. That skew is what let a user pick a slot
// dated a day in the past even though the day-strip is meant to start at
// "tomorrow" — the "tomorrow" it computed was actually today, or earlier.
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(str, n) {
  const d = new Date(str + 'T00:00:00'); d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}
function formatShort(str) {
  if (!str) return ''
  return new Date(str + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}
function to24h(hhmm) { return hhmm }   // already HH:MM from the time picker
function to12h(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function timeOptions() {
  const o = []
  for (let h = 6; h <= 22; h++) for (const m of [0, 30]) {
    if (h === 22 && m === 30) continue
    o.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return o
}
const TIME_OPTS = timeOptions()

// ─── Sub-components ───────────────────────────────────────────────────────────


function SavedAddressPicker({ onSelect }) {
  const { data: addresses = [] } = useAddresses()
  if (!addresses.length) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Saved addresses
      </p>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
        {addresses.map(addr => (
          <button key={addr.id} onClick={() => onSelect(addr)}
            style={{
              flexShrink: 0, padding: '6px 13px', borderRadius: 20,
              border: addr.is_default ? '1.5px solid var(--brand)' : '1px solid var(--card-border)',
              background: addr.is_default ? 'var(--accent-bg)' : 'var(--card-bg)',
              color: addr.is_default ? 'var(--brand)' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            {addr.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Multi-day range picker — customer picks a START DATE and a NUMBER OF DAYS;
// the resulting consecutive date range is what gets booked (e.g. a security
// guard booked for 5 days starting next Monday). Replaces the old freeform
// "pick up to N arbitrary days" picker, which is retired along with window
// mode — multi-day bookings are always a contiguous run of days.
function MultiDayRangePicker({ startDate, onStartDateChange, numDays, onNumDaysChange, maxDays = 60 }) {
  const dates = useMemo(() => {
    if (!startDate || !numDays) return []
    return Array.from({ length: numDays }, (_, i) => addDays(startDate, i))
  }, [startDate, numDays])

  const minStart = todayStr()

  return (
    <div className="space-y-4">
      <div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>Start date</p>
        <input
          type="date"
          value={startDate}
          min={minStart}
          onChange={e => onStartDateChange(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 12, fontSize: 14,
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            color: 'var(--text-primary)', outline: 'none',
          }}
        />
      </div>

      <div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>Number of days</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <motion.button whileTap={{ scale: 0.9 }} type="button"
            onClick={() => onNumDaysChange(Math.max(1, (Number(numDays) || 1) - 1))}
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
            <Minus size={15} style={{ color: 'var(--text-secondary)' }} />
          </motion.button>
          <div style={{
            flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 10,
            background: 'var(--accent-deep)', border: '1px solid var(--accent-mid)',
          }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--amber)' }}>{numDays || 0}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 6 }}>day{numDays === 1 ? '' : 's'}</span>
          </div>
          <motion.button whileTap={{ scale: 0.9 }} type="button"
            onClick={() => onNumDaysChange(Math.min(maxDays, (Number(numDays) || 0) + 1))}
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
            <Plus size={15} style={{ color: 'var(--text-secondary)' }} />
          </motion.button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Up to {maxDays} days per booking</p>
      </div>

      {dates.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          style={{ padding: 12, borderRadius: 10, background: 'var(--accent-card)', border: '1px solid var(--accent-mid)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {formatShort(dates[0])} → {formatShort(dates[dates.length - 1])} · {dates.length}-day booking with this worker
          </p>
        </motion.div>
      )}
    </div>
  )
}

function TimeSelect({ label, value, onChange, options, placeholder }) {
  return (
    <div style={{ flex: 1 }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>{label}</p>
      <GlassSelect
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        options={options.map(t => ({ value: t, label: to12h(t) }))}
      />
    </div>
  )
}

function SummaryRow({ icon: Icon, label, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: 'var(--accent-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={15} style={{ color: 'var(--amber)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</p>
        {children}
      </div>
    </div>
  )
}

// Which part of the day a slot falls in — used to group the slot list for
// a selected date into clearly-labelled Morning / Afternoon / Evening
// sections instead of one flat grid.
function timeSegment(hhmm) {
  const h = parseInt(hhmm.slice(0, 2), 10)
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}
const SEGMENTS = ['Morning', 'Afternoon', 'Evening']

function LegendDot({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  )
}

// Slot calendar — shows a week at a time, highlights available slots
function SlotCalendar({ workerId, serviceId, selectedSlot, onSelect }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState(null)
  const today = todayStr()

  const fromDate = addDays(today, weekOffset * 7 + 1)
  const toDate   = addDays(today, weekOffset * 7 + 7)

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ['slots', workerId, serviceId, fromDate, toDate],
    queryFn: async () => {
      const { data } = await api.get(`/workers/${workerId}/services/${serviceId}/slots`, {
        params: { from_date: fromDate, to_date: toDate },
      })
      return Array.isArray(data) ? data : []
    },
    enabled: !!workerId && !!serviceId,
  })

  // Group slots by date
  const byDate = useMemo(() => {
    const m = {}
    slots.forEach(s => {
      if (!m[s.slot_date]) m[s.slot_date] = []
      m[s.slot_date].push(s)
    })
    return m
  }, [slots])

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(today, weekOffset * 7 + i + 1))
  // Defensive client-side guard: never surface slots for an already-past
  // date, even if the backend response (or a stale query) includes one.
  const slotsForDay = selectedDate && selectedDate >= today ? (byDate[selectedDate] || []) : []

  // Group the selected day's slots into Morning/Afternoon/Evening buckets
  const groupedSlots = useMemo(() => {
    const groups = { Morning: [], Afternoon: [], Evening: [] }
    slotsForDay.forEach(s => { groups[timeSegment(s.slot_start.slice(0, 5))].push(s) })
    return groups
  }, [slotsForDay])

  return (
    <div>
      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={() => setWeekOffset(w => Math.max(0, w - 1))}
          disabled={weekOffset === 0}
          style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--card-border)', background: 'var(--card-bg)', color: weekOffset === 0 ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: weekOffset === 0 ? 'default' : 'pointer', fontSize: 13 }}>
          ‹ Prev
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {formatShort(fromDate)} – {formatShort(toDate)}
        </span>
        <button onClick={() => setWeekOffset(w => Math.min(7, w + 1))}
          style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--card-border)', background: 'var(--card-bg)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>
          Next ›
        </button>
      </div>

      {/* Day strip */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {weekDays.map(day => {
          const dt = new Date(day + 'T00:00:00')
          // Past dates are never selectable, even defensively (the strip
          // already starts at "tomorrow", but todayStr()/timezone skew or a
          // stale week offset could otherwise let one slip through).
          const isPast = day < today
          const hasFree = (byDate[day] || []).some(s => s.available)
          const isSelected = selectedDate === day
          return (
            <motion.button key={day} type="button" disabled={isPast}
              onClick={() => !isPast && setSelectedDate(day)}
              whileTap={isPast ? {} : { scale: 0.93 }}
              style={{
                flex: 1, padding: '8px 2px', borderRadius: 10, cursor: isPast ? 'not-allowed' : 'pointer',
                border: isSelected ? '1.5px solid var(--amber)' : '1px solid var(--card-border)',
                background: isSelected ? 'var(--accent-deep)' : isPast ? 'rgba(255,255,255,0.02)' : 'var(--card-bg)',
                opacity: isPast ? 0.35 : 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                transition: 'all 0.15s',
              }}>
              <span style={{ fontSize: 11, color: isSelected ? 'var(--amber)' : 'var(--text-muted)' }}>
                {dt.toLocaleDateString('en-IN', { weekday: 'short' })}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: isSelected ? 'var(--amber)' : isPast ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                {dt.getDate()}
              </span>
              {/* availability dot */}
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: isPast ? 'transparent' : hasFree ? '#22C55E' : 'var(--card-border)' }} />
            </motion.button>
          )
        })}
      </div>

      {/* Slots for selected day */}
      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      )}

      {!isLoading && selectedDate && slotsForDay.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          No available slots on {formatShort(selectedDate)}
        </div>
      )}

      {!isLoading && !selectedDate && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          Select a day above to see available slots
        </div>
      )}

      {!isLoading && slotsForDay.length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
            {formatShort(selectedDate)}
          </p>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
            <LegendDot color="#22C55E" label="Available" />
            <LegendDot color="var(--amber)" label="Few left" />
            <LegendDot color="var(--text-muted)" label="Full" />
          </div>

          {SEGMENTS.filter(seg => groupedSlots[seg].length > 0).map(seg => (
            <div key={seg} style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {seg}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {groupedSlots[seg].map(slot => {
                  const isChosen = selectedSlot?.id === slot.id
                  const full = !slot.available
                  const few = !full && slot.spots_left != null && slot.spots_left <= 2
                  const dotColor = full ? 'var(--text-muted)' : few ? 'var(--amber)' : '#22C55E'
                  return (
                    <motion.button key={slot.id} type="button"
                      onClick={() => !full && onSelect(slot)}
                      whileTap={full ? {} : { scale: 0.95 }}
                      style={{
                        padding: '10px 6px', borderRadius: 10, cursor: full ? 'not-allowed' : 'pointer',
                        border: isChosen ? '1.5px solid var(--amber)' : '1px solid var(--card-border)',
                        background: isChosen ? 'var(--accent-deep)' : full ? 'rgba(255,255,255,0.02)' : 'var(--card-bg)',
                        opacity: full ? 0.45 : 1, transition: 'all 0.15s',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: isChosen ? 'var(--amber)' : 'var(--text-primary)' }}>
                          {to12h(slot.slot_start.slice(0, 5))}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {full ? 'Full' : `${slot.spots_left} left`}
                      </span>
                      {isChosen && <Check size={11} style={{ color: 'var(--amber)' }} />}
                    </motion.button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BookDiscoveryPage() {
  const { workerId } = useParams()
  const navigate     = useNavigate()

  // Step management
  const [stepIdx, setStepIdx] = useState(0)
  const [prevIdx, setPrevIdx] = useState(0)

  // Form state
  const [selectedService, setSelectedService] = useState(null)
  const [selectedPackage, setSelectedPackage] = useState(null)
  const [selectedSlot,    setSelectedSlot]    = useState(null)  // slot mode
  const [windowStart,     setWindowStart]     = useState('')
  const [windowEnd,       setWindowEnd]       = useState('')
  const [address,         setAddress]         = useState('')
  const [locationArea,    setLocationArea]    = useState('')
  const [locationNote,    setLocationNote]    = useState('')
  // Actual picked coordinates from the map/search — previously this step
  // collected an address but the booking payload silently sent Pune's city
  // center every time. Falls back to that same center only if the map
  // genuinely never resolved a location (e.g. geolocation denied + no search).
  const [locationLat,     setLocationLat]     = useState(null)
  const [locationLon,     setLocationLon]     = useState(null)

  // Multi-day booking — start date + number of days, computed into a
  // contiguous date range. Sent as ONE bundle (POST /jobs/scheduled/multi-day)
  // pinned to the SAME worker for every day; multiDayDates below is purely
  // for display (day chips in the picker/summary).
  const [multiDayStart,   setMultiDayStart]   = useState(addDays(todayStr(), 1))
  const [multiDayCount,   setMultiDayCount]   = useState(1)
  const multiDayDates = useMemo(
    () => (multiDayStart && multiDayCount ? Array.from({ length: multiDayCount }, (_, i) => addDays(multiDayStart, i)) : []),
    [multiDayStart, multiDayCount]
  )
  const [multiDayProgress, setMultiDayProgress] = useState(null) // reserved for future progress UI; multi-day bulk create is a single request today

  // Every service is exactly one of: slot-mode, multi-day-mode, or (rare,
  // misconfigured) neither. There's no more freeform "pick any window"
  // fallback — a service that has neither flag set can't be booked here.
  const isSlotMode = selectedService?.requires_slot === true
  const isMultiDayMode = !isSlotMode && selectedService?.allow_multi_day_booking === true
  const isUnconfigured = !!selectedService && !isSlotMode && !isMultiDayMode

  const STEPS = isSlotMode
    ? ['service', 'slot', 'location', 'confirm']
    : isMultiDayMode
      ? ['service', 'days', 'window', 'location', 'confirm']
      : ['service']
  const LABELS = isSlotMode
    ? ['Service', 'Time Slot', 'Location', 'Confirm']
    : isMultiDayMode
      ? ['Service', 'Days', 'Time', 'Location', 'Confirm']
      : ['Service']

  function goNext() { setPrevIdx(stepIdx); setStepIdx(i => i + 1) }
  function goPrev() {
    if (stepIdx === 0) return navigate(-1)
    setPrevIdx(stepIdx); setStepIdx(i => i - 1)
  }
  const direction = stepIdx >= prevIdx ? 1 : -1
  const step = STEPS[stepIdx]

  // Services query
  const { data: services = [], isLoading: svcLoading } = useQuery({
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
    return (eh * 60 + em) - (sh * 60 + sm) >= 60
  })()

  const endOpts = TIME_OPTS.filter(t => {
    if (!windowStart) return true
    const [sh, sm] = windowStart.split(':').map(Number)
    const [eh, em] = t.split(':').map(Number)
    return (eh * 60 + em) - (sh * 60 + sm) >= 60
  })

  const canProceed = {
    service:  !!selectedService && !isUnconfigured,
    slot:     !!selectedSlot,
    days:     multiDayDates.length >= 1,
    window:   windowValid,
    location: address.trim().length >= 5,
    confirm:  true,
  }

  const price = selectedPackage?.discounted_price ?? selectedPackage?.price ?? selectedService?.price ?? 0

  // Multi-day booking — ONE call to /jobs/scheduled/multi-day for the whole
  // range. The backend creates every day's Job row in a single DB
  // transaction (one parent + N-1 children, same worker, all-or-nothing) —
  // replaces the old pattern of looping POST /jobs/scheduled once per day,
  // which for a long booking (e.g. 39 days) took ~1 call/day, could
  // partially fail leaving an inconsistent booking, and showed up as N
  // unrelated cards instead of one bundle.
  const multiDayMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/jobs/scheduled/multi-day', {
        source: 'discovery',
        category_id: selectedService?.category_id || null,
        service_id: selectedService?.id,
        package_id: selectedPackage?.id || null,
        preferred_worker_id: workerId,
        title: selectedService?.title,
        description: null,
        start_date: multiDayStart,
        num_days: multiDayCount,
        window_start: to24h(windowStart),
        window_end: to24h(windowEnd),
        location_lat: locationLat || 18.5204, location_lon: locationLon || 73.8567,
        location_address: address,
        location_area: locationArea || null,
        location_note: locationNote || null,
        budget_max: price || null,
      })
      return data
    },
    onSuccess: (bundle) => {
      setMultiDayProgress(null)
      toast.success(`${bundle.total_days}-day booking confirmed!`)
      navigate('/bookings')
    },
    onError: (e) => { setMultiDayProgress(null); toast.error(errMsg(e, 'Booking failed')) },
  })

  // Slot mode booking
  const slotMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/jobs/book-slot', {
        slot_id: selectedSlot.id,
        service_id: selectedService.id,
        package_id: selectedPackage?.id || null,
        location_lat: locationLat || 18.5204, location_lon: locationLon || 73.8567,
        location_address: address,
        location_area: locationArea || null,
        location_note: locationNote || null,
      })
      return data
    },
    onSuccess: () => { toast.success('Slot booked! Your worker is confirmed.'); navigate('/bookings') },
    onError: e => {
      toast.error(errMsg(e, 'Slot booking failed'))
      if (e.response?.status === 409) setSelectedSlot(null) // slot taken, force re-pick
    },
  })

  const isPending = slotMutation.isPending || multiDayMutation.isPending
  function handleConfirm() {
    if (isSlotMode) slotMutation.mutate()
    else if (isMultiDayMode) multiDayMutation.mutate()
  }
  const confirmLabel = multiDayMutation.isPending
    ? 'Booking…'
    : isSlotMode ? 'Confirm Slot' : isMultiDayMode ? `Confirm ${multiDayDates.length}-Day Booking` : 'Confirm Booking'

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={goPrev}
            style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div>
            <h1 className="font-syne font-bold text-base" style={{ color: 'var(--text-primary)' }}>
              {isSlotMode ? 'Book a Slot' : 'Schedule Service'}
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Step {stepIdx + 1} of {STEPS.length}</p>
          </div>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {LABELS.map((label, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ height: 3, borderRadius: 2, width: '100%', background: i <= stepIdx ? 'var(--amber)' : 'var(--card-border)', transition: 'background 0.3s' }} />
              <span style={{ fontSize: 11, color: i === stepIdx ? 'var(--amber)' : i < stepIdx ? 'var(--text-secondary)' : 'var(--text-muted)', fontWeight: i === stepIdx ? 600 : 400 }}>{label}</span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait" custom={direction}>

          {/* ── SERVICE ── */}
          {step === 'service' && (
            <motion.div key="service" custom={direction} variants={slide} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 340, damping: 32 }} className="space-y-3">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <h3 className="font-syne font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Choose a service</h3>
                <InfoButton text="Select what you need done. Services marked with a clock icon require booking a specific time slot. Others use a flexible window system." />
              </div>

              {svcLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Loader2 size={26} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
              ) : services.length === 0 ? (
                <GlassCard className="p-10" style={{ textAlign: 'center' }}>
                  <Package size={30} style={{ color: 'var(--text-muted)', margin: '0 auto 10px' }} />
                  <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>No services listed yet</p>
                </GlassCard>
              ) : services.map(svc => {
                const isActive = selectedService?.id === svc.id
                return (
                  <motion.div key={svc.id} onClick={() => { setSelectedService(svc); setSelectedPackage(null); setSelectedSlot(null); setMultiDayStart(addDays(todayStr(), 1)); setMultiDayCount(1) }}
                    whileTap={{ scale: 0.98 }}
                    style={{ padding: '14px 16px', borderRadius: 14, cursor: 'pointer', border: isActive ? '1.5px solid var(--amber)' : '1px solid var(--card-border)', background: isActive ? 'var(--accent-card)' : 'var(--card-bg)', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{svc.title}</p>
                          {svc.requires_slot && (
                            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: 'rgba(59,130,246,0.15)', color: '#60A5FA', border: '1px solid rgba(59,130,246,0.3)', fontWeight: 600 }}>SLOT</span>
                          )}
                          {svc.allow_multi_day_booking && (
                            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: 'rgba(245,158,11,0.15)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.3)', fontWeight: 600 }}>MULTI-DAY</span>
                          )}
                        </div>
                        {isActive && !svc.requires_slot && !svc.allow_multi_day_booking && (
                          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                            <AlertTriangle size={12} style={{ color: '#F87171', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: '#F87171' }}>This service isn't set up for booking yet</span>
                          </div>
                        )}
                        {svc.description && <p style={{ fontSize: 12, color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{svc.description}</p>}
                        {svc.duration_min && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>~{svc.duration_min} min</p>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                        {svc.price > 0 && <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber)' }}>₹{svc.price}</p>}
                        {isActive && <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4, marginLeft: 'auto' }}><Check size={11} color="#000" strokeWidth={3} /></div>}
                      </div>
                    </div>
                    {/* Package sub-list */}
                    {isActive && svc.packages?.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--card-border)' }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 8 }}>Packages (optional):</p>
                        {svc.packages.map(pkg => (
                          <motion.button key={pkg.id} onClick={e => { e.stopPropagation(); setSelectedPackage(selectedPackage?.id === pkg.id ? null : pkg) }} whileTap={{ scale: 0.97 }}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: selectedPackage?.id === pkg.id ? '1.5px solid var(--amber)' : '1px solid var(--card-border)', background: selectedPackage?.id === pkg.id ? 'var(--accent-deep)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.15s', marginBottom: 6 }}>
                            <div style={{ textAlign: 'left' }}>
                              <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{pkg.title}</p>
                              {pkg.description && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{pkg.description}</p>}
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                              {pkg.discounted_price && <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)' }}>₹{pkg.discounted_price}</p>}
                              {pkg.original_price && pkg.discounted_price && <p style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'line-through' }}>₹{pkg.original_price}</p>}
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </motion.div>
          )}

          {/* ── SLOT PICKER ── */}
          {step === 'slot' && (
            <motion.div key="slot" custom={direction} variants={slide} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 340, damping: 32 }} className="space-y-4">
              <GlassCard className="p-5">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Grid3x3 size={15} style={{ color: 'var(--amber)' }} />
                    <h3 className="font-syne font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Pick a time slot</h3>
                  </div>
                  <InfoButton text="Each slot is a specific time reserved just for you. Once booked, the worker is confirmed immediately — no waiting." />
                </div>
                <SlotCalendar workerId={workerId} serviceId={selectedService?.id} selectedSlot={selectedSlot} onSelect={setSelectedSlot} />
                {selectedSlot && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--accent-card)', border: '1px solid var(--accent-mid)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Check size={13} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Slot: <strong style={{ color: 'var(--amber)' }}>{formatShort(selectedSlot.slot_date)} · {to12h(selectedSlot.slot_start?.slice(0, 5))} – {to12h(selectedSlot.slot_end?.slice(0, 5))}</strong>
                    </p>
                  </motion.div>
                )}
              </GlassCard>
            </motion.div>
          )}

          {/* ── DAYS (multi-day mode) ── */}
          {step === 'days' && (
            <motion.div key="days" custom={direction} variants={slide} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 340, damping: 32 }} className="space-y-4">
              <GlassCard className="p-5">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CalendarRange size={15} style={{ color: 'var(--amber)' }} />
                    <h3 className="font-syne font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Which days?</h3>
                  </div>
                  <InfoButton text="Pick a start date and how many days you need. One booking is created for the whole range, all with the same worker." />
                </div>
                <MultiDayRangePicker
                  startDate={multiDayStart}
                  onStartDateChange={setMultiDayStart}
                  numDays={multiDayCount}
                  onNumDaysChange={setMultiDayCount}
                />
              </GlassCard>
            </motion.div>
          )}

          {/* ── TIME WINDOW (multi-day mode — the daily arrival window) ── */}
          {step === 'window' && (
            <motion.div key="window" custom={direction} variants={slide} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 340, damping: 32 }} className="space-y-4">
              <GlassCard className="p-5">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={15} style={{ color: 'var(--amber)' }} />
                    <h3 className="font-syne font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Daily arrival window</h3>
                  </div>
                  <InfoButton text="Set a time range for when the worker should arrive each day. Example: 9 AM – 6 PM. Minimum 1 hour." />
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>What time should the worker arrive, each day? (min 1 hour)</p>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <TimeSelect label="From" value={windowStart} onChange={v => { setWindowStart(v); if (windowEnd && windowEnd <= v) setWindowEnd('') }} options={TIME_OPTS} placeholder="Start" />
                  <div style={{ paddingBottom: 12, color: 'var(--text-muted)', fontSize: 18 }}>–</div>
                  <TimeSelect label="Until" value={windowEnd} onChange={setWindowEnd} options={endOpts} placeholder="End" />
                </div>
                {windowStart && windowEnd && !windowValid && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 10, fontSize: 13, color: '#F87171' }}>Window must be at least 1 hour</motion.p>}
                {windowValid && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--accent-card)', border: '1px solid var(--accent-mid)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Check size={13} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Worker arrives between <strong style={{ color: 'var(--amber)' }}>{to12h(windowStart)} – {to12h(windowEnd)}</strong></p>
                  </motion.div>
                )}
              </GlassCard>
              <GlassCard className="p-4">
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Your days (one booking)
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {multiDayDates.map(d => <span key={d} style={{ padding: '3px 10px', borderRadius: 20, background: 'var(--accent-deep)', border: '1px solid var(--accent-mid)', fontSize: 13, color: 'var(--amber)', fontWeight: 500 }}>{formatShort(d)}</span>)}
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* ── LOCATION ── */}
          {step === 'location' && (
            <motion.div key="location" custom={direction} variants={slide} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 340, damping: 32 }} className="space-y-4">
              <GlassCard className="p-5">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MapPin size={15} style={{ color: 'var(--amber)' }} />
                    <h3 className="font-syne font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Service address</h3>
                  </div>
                  <InfoButton text="Drag the map or search to pin the exact spot — we use your current location by default. The worker travels to these coordinates, so the pin matters more than the typed address." />
                </div>
                <div className="space-y-3">
                  {/* Saved addresses quick-pick */}
                  <SavedAddressPicker onSelect={(addr) => {
                    setAddress(addr.address_line)
                    if (addr.area) setLocationArea(addr.area)
                    if (addr.lat && addr.lon) { setLocationLat(parseFloat(addr.lat)); setLocationLon(parseFloat(addr.lon)) }
                  }} />

                  <MapLocationPicker
                    location={{ lat: locationLat, lon: locationLon, address }}
                    onLocationSelect={(loc) => {
                      setAddress(loc.address || '')
                      if (loc.lat) setLocationLat(loc.lat)
                      if (loc.lon) setLocationLon(loc.lon)
                      if (loc.area && !locationArea) setLocationArea(loc.area)
                    }}
                  />

                  <GlassInput label="Full address" placeholder="Flat no., building, street…" value={address} onChange={e => setAddress(e.target.value)} icon={MapPin} />
                  <GlassInput label="Area / locality" placeholder="e.g. Baner, Kothrud…" value={locationArea} onChange={e => setLocationArea(e.target.value)} />
                  <GlassInput label="Landmark (optional)" placeholder="Near blue gate, 3rd floor…" value={locationNote} onChange={e => setLocationNote(e.target.value)} />
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* ── CONFIRM ── */}
          {step === 'confirm' && (
            <motion.div key="confirm" custom={direction} variants={slide} initial="enter" animate="center" exit="exit" transition={{ type: 'spring', stiffness: 340, damping: 32 }} className="space-y-4">
              <div style={{ padding: '14px 16px', borderRadius: 14, background: 'var(--accent-card)', border: '1px solid var(--accent-mid)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Sparkles size={17} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)', marginBottom: 4 }}>
                    {isSlotMode ? 'Worker confirmed immediately' : 'Worker confirmed for your window'}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                    {isSlotMode
                      ? 'Your slot is reserved. This specific worker is confirmed right away — no waiting or matching needed. Payment happens after the job is done.'
                      : 'This specific worker will arrive within your chosen window. You\'ll get a reminder 2 hours before — payment happens after the job is done.'}
                  </p>
                </div>
              </div>

              <GlassCard className="p-5 space-y-4">
                <h3 className="font-syne font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Booking summary</h3>
                <SummaryRow icon={Package} label="Service">
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {selectedPackage ? `${selectedService?.title} · ${selectedPackage.title}` : selectedService?.title}
                  </p>
                </SummaryRow>
                {isSlotMode && selectedSlot && (
                  <SummaryRow icon={Clock} label="Booked slot">
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {formatShort(selectedSlot.slot_date)} · {to12h(selectedSlot.slot_start?.slice(0, 5))} – {to12h(selectedSlot.slot_end?.slice(0, 5))}
                    </p>
                  </SummaryRow>
                )}
                {isMultiDayMode && (
                  <>
                    <SummaryRow icon={Calendar} label={`${multiDayDates.length}-day booking (one bundle)`}>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 3 }}>
                        {multiDayDates.map(d => <span key={d} style={{ fontSize: 13, padding: '2px 8px', borderRadius: 20, background: 'var(--accent-deep)', color: 'var(--amber)', border: '1px solid var(--accent-mid)' }}>{formatShort(d)}</span>)}
                      </div>
                    </SummaryRow>
                    <SummaryRow icon={Clock} label="Daily arrival window">
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{to12h(windowStart)} – {to12h(windowEnd)}</p>
                    </SummaryRow>
                  </>
                )}
                <SummaryRow icon={MapPin} label="Address">
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{address}{locationNote ? ` (${locationNote})` : ''}</p>
                </SummaryRow>
              </GlassCard>

              {price > 0 && (
                <GlassCard className="p-4">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Estimated price</p>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Collected after job completion</p>
                    </div>
                    <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber)' }}>₹{price}</p>
                  </div>
                </GlassCard>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                {isSlotMode ? 'Cancellations more than 2 hours before the slot are free.' : 'Free cancellation before a worker is assigned.'}
              </p>
            </motion.div>
          )}

        </AnimatePresence>

        {/* CTA */}
        <div style={{ marginTop: 24 }}>
          {step !== 'confirm' ? (
            <GlassButton variant="discovery" size="lg" className="w-full" disabled={!canProceed[step]} onClick={goNext} icon={ChevronRight} iconPosition="right">
              Continue
            </GlassButton>
          ) : (
            <GlassButton variant="instant" size="lg" className="w-full" loading={isPending} onClick={handleConfirm} icon={CalendarCheck} iconPosition="left">
              {confirmLabel}
            </GlassButton>
          )}
        </div>
      </div>

      <MobileBottomNav />
    </div>
  )
}
