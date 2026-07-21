import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, Clock, Zap, ChevronRight, Loader2, CalendarClock } from 'lucide-react'
import { useWorkerSchedule } from '@/hooks/useWorker'
import { formatCurrency } from '@/lib/utils'

const STATUS_LABEL = {
  requested: 'Requested', searching: 'Searching', scheduled: 'Scheduled',
  confirmed: 'Confirmed', worker_assigned: 'Assigned', assigned: 'Assigned',
  en_route: 'On the way', arrived: 'Arrived', started: 'In progress',
}

function jobDateKey(job) {
  // Multi-day bundle days (see create_multi_day_booking) never set
  // scheduled_at at all — each day's real date only lives in
  // preferred_days[0]. Falling back to scheduled_at/created_at for those
  // meant every expanded day of a 39-day booking collapsed onto the single
  // date the booking was CREATED on, instead of each day's own date.
  const d = job.preferred_days?.[0] || job.scheduled_at || job.created_at
  return d ? d.slice(0, 10) : 'unscheduled'
}

function fmtDay(key) {
  if (key === 'unscheduled') return 'Unscheduled'
  const d = new Date(key + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (d.getTime() === today.getTime()) return 'Today'
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function fmtTime(job) {
  if (job.window_start && job.window_end) return `${job.window_start} – ${job.window_end}`
  if (job.scheduled_at) {
    const d = new Date(job.scheduled_at)
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }
  return null
}

function StripDay({ dateStr, count, active, onClick }) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const isToday = d.getTime() === today.getTime()
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={onClick}
      className="flex-shrink-0 flex flex-col items-center gap-1 rounded-2xl px-3 py-2.5 relative"
      style={{
        minWidth: 54,
        border: active ? '1.5px solid var(--brand)' : '1px solid var(--card-border)',
        background: active ? 'var(--accent-bg)' : 'var(--card-bg)',
      }}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: active ? 'var(--brand)' : 'var(--text-muted)' }}>
        {d.toLocaleDateString('en-IN', { weekday: 'short' })}
      </span>
      <span className="text-base font-bold font-mono" style={{ color: active ? 'var(--brand)' : 'var(--text-primary)' }}>
        {d.getDate()}
      </span>
      {isToday && <span className="text-[9px] font-semibold" style={{ color: 'var(--brand)' }}>Today</span>}
      {count > 0 && (
        <div
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
          style={{ background: 'var(--accent)', color: 'var(--accent-on, #000)', zIndex: 20 }}
        >
          {count}
        </div>
      )}
    </motion.button>
  )
}

function JobRow({ job, onOpen }) {
  const time = fmtTime(job)
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      className="w-full text-left glass rounded-2xl p-4 flex items-start gap-3"
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: job.job_type === 'instant' ? 'var(--instant-bg, rgba(34,197,94,0.12))' : 'var(--accent-bg)' }}>
        <Zap size={16} style={{ color: job.job_type === 'instant' ? 'var(--instant)' : 'var(--discovery)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {job.category_name || 'Service'}
          </p>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0"
            style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)' }}>
            {STATUS_LABEL[job.status] || job.status}
          </span>
        </div>
        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>{job.client_name || 'Customer'}</p>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {time && (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Clock size={11} /> {time}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs truncate" style={{ color: 'var(--text-muted)' }}>
            <MapPin size={11} /> {job.location_area || job.location_address}
          </span>
        </div>
        {job.quoted_price && (
          <p className="text-xs font-mono font-semibold mt-1.5" style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(job.quoted_price)}
          </p>
        )}
      </div>
      <ChevronRight size={16} className="shrink-0 mt-1" style={{ color: 'var(--text-muted)' }} />
    </motion.button>
  )
}

export default function WorkerSchedule() {
  const navigate = useNavigate()
  const { data: jobs, isLoading } = useWorkerSchedule()
  const [selectedDay, setSelectedDay] = useState(null)
  // Days the worker has already opened this session — the little count
  // badge on the strip is a "new/unseen" indicator, so once a day has been
  // clicked/viewed it should stop showing the badge instead of nagging
  // forever.
  const [viewedDays, setViewedDays] = useState(() => new Set())

  function selectDay(d) {
    setSelectedDay(d)
    setViewedDays(prev => (prev.has(d) ? prev : new Set(prev).add(d)))
  }

  const strip = useMemo(() => {
    const days = []
    const start = new Date(); start.setHours(0, 0, 0, 0)
    for (let i = 0; i < 14; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i)
      days.push(d.toISOString().slice(0, 10))
    }
    return days
  }, [])

  const grouped = useMemo(() => {
    const map = {}
    for (const j of jobs || []) {
      const key = jobDateKey(j)
      if (!map[key]) map[key] = []
      map[key].push(j)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (fmtTime(a) || '').localeCompare(fmtTime(b) || ''))
    }
    return map
  }, [jobs])

  const activeDay = selectedDay || strip.find(d => (grouped[d] || []).length > 0) || strip[0]
  const dayJobs = grouped[activeDay] || []
  const unscheduled = grouped['unscheduled'] || []

  // Whatever day is actually showing (even the default selection, before
  // any explicit tap) counts as "viewed" — its badge shouldn't linger once
  // its jobs are already visible on screen.
  useEffect(() => {
    if (!activeDay) return
    setViewedDays(prev => (prev.has(activeDay) ? prev : new Set(prev).add(activeDay)))
  }, [activeDay])

  function openJob(job) {
    navigate(`/worker/job/${job.id}/active`)
  }

  return (
    <div className="px-4 pt-5 pb-24 space-y-5">
      <h2 className="font-syne font-bold text-xl" style={{ color: 'var(--text-primary)' }}>Schedule</h2>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin" style={{ color: 'var(--brand)' }} />
        </div>
      ) : (
        <>
          {/* Day strip */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {strip.map(d => (
              <StripDay
                key={d}
                dateStr={d}
                count={viewedDays.has(d) ? 0 : (grouped[d] || []).length}
                active={d === activeDay}
                onClick={() => selectDay(d)}
              />
            ))}
          </div>

          {/* Selected day's jobs */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {fmtDay(activeDay)} · {dayJobs.length} {dayJobs.length === 1 ? 'job' : 'jobs'}
            </p>
            {dayJobs.length === 0 ? (
              <div className="glass-light rounded-2xl p-8 flex flex-col items-center text-center gap-2">
                <CalendarClock size={26} style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No jobs scheduled for this day</p>
              </div>
            ) : (
              dayJobs.map(job => <JobRow key={job.id} job={job} onOpen={() => openJob(job)} />)
            )}
          </div>

          {/* Unscheduled / instant-in-progress jobs, always visible */}
          {unscheduled.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Awaiting date · {unscheduled.length}
              </p>
              {unscheduled.map(job => <JobRow key={job.id} job={job} onOpen={() => openJob(job)} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
