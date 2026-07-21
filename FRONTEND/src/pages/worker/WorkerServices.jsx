import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Edit3, Loader2, Check, MapPin, Store, Tag, X, Package, ChevronRight, CalendarClock, CalendarRange } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

const MODE_OPTIONS = [
  { value: 'walkin', label: 'Walk-in', icon: Store, tip: 'Customer comes to you' },
  { value: 'onsite', label: 'On-site', icon: MapPin, tip: 'You go to customer' },
  { value: 'both',   label: 'Both',    icon: null,  tip: 'Either works' },
]

const MODE_COLORS = {
  walkin: { bg: 'rgba(168,85,247,0.12)', color: '#a855f7', border: 'rgba(168,85,247,0.25)' },
  onsite: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  both:   { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.25)' },
}

function ServiceModeToggle({ value, onChange }) {
  return (
    <div>
      <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Service mode</p>
      <div className="flex rounded-xl p-0.5 gap-0.5" style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
        {MODE_OPTIONS.map(opt => {
          const active = value === opt.value
          return (
            <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
              className="flex-1 py-2 px-2 rounded-[10px] text-xs font-semibold transition-all duration-150 flex items-center justify-center gap-1"
              style={active ? { background: MODE_COLORS[opt.value].bg, color: MODE_COLORS[opt.value].color, border: `1px solid ${MODE_COLORS[opt.value].border}` } : { color: 'var(--text-muted)', border: '1px solid transparent' }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
        {MODE_OPTIONS.find(o => o.value === value)?.tip}
      </p>
    </div>
  )
}

// ── Booking mode toggle (slot-based vs multi-day) ──────────────────────────────
// A service is always exactly one of these — never both, never neither. This
// replaces the old standalone "allow multi-day booking" switch: booking mode
// is now an explicit binary choice made up-front, since it changes what other
// fields the form needs (duration for slot-mode, "per-day" pricing note for
// multi-day).
const BOOKING_MODE_OPTIONS = [
  {
    value: 'slot',
    label: 'Slot-based',
    icon: CalendarClock,
    tip: 'Customers pick a specific time slot (e.g. a haircut, a repair visit)',
  },
  {
    value: 'multi_day',
    label: 'Multi-day',
    icon: CalendarRange,
    tip: 'Customers book you for a number of days at once (e.g. security guard, live-in help)',
  },
]

function BookingModeToggle({ value, onChange }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {BOOKING_MODE_OPTIONS.map(opt => {
          const active = value === opt.value
          const Icon = opt.icon
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="flex flex-col items-start gap-1.5 rounded-xl px-3.5 py-3 text-left transition-all duration-150"
              style={active
                ? { background: 'var(--accent-deep)', border: '1.5px solid var(--accent-mid)' }
                : { background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
            >
              <div className="flex items-center gap-1.5">
                <Icon size={14} style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }} />
                <span className="text-xs font-semibold" style={{ color: active ? 'var(--accent)' : 'var(--text-primary)' }}>
                  {opt.label}
                </span>
              </div>
            </button>
          )
        })}
      </div>
      <p className="text-[12px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
        {BOOKING_MODE_OPTIONS.find(o => o.value === value)?.tip}
      </p>
    </div>
  )
}

// ── Tag input ─────────────────────────────────────────────────────────────────
function TagInput({ selectedTags, onChange }) {
  const [input, setInput]             = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showDrop, setShowDrop]       = useState(false)
  const [timer, setTimer]             = useState(null)
  const inputRef = useRef()

  const fetchSugg = async (q) => {
    if (!q.trim()) { setSuggestions([]); return }
    try {
      const { data } = await api.get('/workers/tags', { params: { q } })
      setSuggestions(data.filter(t => !selectedTags.find(s => s.id === t.id)))
    } catch { setSuggestions([]) }
  }

  const handleInput = (e) => {
    const val = e.target.value
    setInput(val)
    setShowDrop(true)
    clearTimeout(timer)
    setTimer(setTimeout(() => fetchSugg(val), 220))
  }

  const addExisting = (tag) => {
    onChange([...selectedTags, tag])
    setInput(''); setSuggestions([]); setShowDrop(false)
    inputRef.current?.focus()
  }

  const addNew = () => {
    const name = input.trim()
    if (name.length < 2) return
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (selectedTags.find(t => t.slug === slug || t.name.toLowerCase() === name.toLowerCase())) {
      setInput(''); return
    }
    onChange([...selectedTags, { id: `__new__${slug}`, name, slug, isNew: true }])
    setInput(''); setSuggestions([]); setShowDrop(false)
    inputRef.current?.focus()
  }

  const removeTag = (id) => onChange(selectedTags.filter(t => t.id !== id))

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      if (suggestions.length > 0 && suggestions[0].name.toLowerCase() === input.trim().toLowerCase()) {
        addExisting(suggestions[0])
      } else {
        addNew()
      }
    }
    if (e.key === 'Backspace' && !input && selectedTags.length > 0) removeTag(selectedTags[selectedTags.length - 1].id)
    if (e.key === 'Escape') setShowDrop(false)
  }

  return (
    <div>
      <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
        <Tag size={11} /> Tags
        <span style={{ fontWeight: 400 }}> — helps customers find you</span>
      </p>
      <div
        className="flex flex-wrap gap-1.5 rounded-xl px-3 py-2 min-h-[42px] cursor-text"
        style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
        onClick={() => inputRef.current?.focus()}
      >
        {selectedTags.map(tag => (
          <span key={tag.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: 'var(--accent-deep)', color: 'var(--accent)', border: `1px solid var(--accent-dim)` }}>
            {tag.name}
            <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(tag.id) }} className="opacity-60 hover:opacity-100">
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (input) setShowDrop(true) }}
          onBlur={() => setTimeout(() => setShowDrop(false), 150)}
          placeholder={selectedTags.length === 0 ? 'Type a tag, press Enter...' : ''}
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-primary)', minWidth: 80 }}
        />
      </div>
      <AnimatePresence>
        {showDrop && (suggestions.length > 0 || input.trim().length >= 2) && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }} className="mt-1 rounded-xl overflow-hidden"
            style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)', position: 'relative', zIndex: 20 }}>
            {suggestions.map(tag => (
              <button key={tag.id} type="button" onMouseDown={() => addExisting(tag)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-white/5 transition-colors text-left"
                style={{ color: 'var(--text-primary)' }}>
                <span>{tag.name}</span>
                {tag.usage_count > 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{tag.usage_count} uses</span>}
              </button>
            ))}
            {input.trim().length >= 2 && !suggestions.find(t => t.name.toLowerCase() === input.trim().toLowerCase()) && (
              <button type="button" onMouseDown={addNew}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 transition-colors text-left"
                style={{ color: 'var(--accent)' }}>
                <Plus size={12} /> Create "{input.trim()}"
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
        Press Enter or comma to add · Backspace to remove
      </p>
    </div>
  )
}

// ── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-semibold mb-2" style={{
      color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      {children}
    </p>
  )
}

// ── Service form ──────────────────────────────────────────────────────────────
function ServiceForm({ initial, onSave, onCancel, minPrice }) {
  const [title, setTitle]             = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [hourlyRate, setHourlyRate]   = useState(initial?.hourly_rate || initial?.price || '')
  const [serviceMode, setServiceMode] = useState(initial?.service_mode || 'both')
  const [visitFee, setVisitFee]       = useState(initial?.visit_fee || '')
  const [tags, setTags]               = useState(initial?.tags || [])
  // Booking mode — mutually exclusive slot-based vs multi-day. New services
  // default to slot-based; editing an existing multi-day service preserves it.
  const [bookingMode, setBookingMode] = useState(initial?.allow_multi_day_booking ? 'multi_day' : 'slot')
  // Average time to complete one instance — only meaningful in slot mode,
  // where it drives auto-generated slot availability. Split into hours +
  // minutes for easier entry, combined into duration_min on submit.
  const initialDuration = initial?.duration_min || 0
  const [durationHours, setDurationHours]     = useState(initialDuration ? Math.floor(initialDuration / 60) : '')
  const [durationMinutes, setDurationMinutes] = useState(initialDuration ? initialDuration % 60 : '')
  const [loading, setLoading]         = useState(false)
  const [priceError, setPriceError]   = useState('')
  const showVisitFee = serviceMode === 'onsite' || serviceMode === 'both'
  const isSlotMode = bookingMode === 'slot'
  const isMultiDayMode = bookingMode === 'multi_day'
  const totalDurationMin = (Number(durationHours) || 0) * 60 + (Number(durationMinutes) || 0)
  const durationMissing = isSlotMode && totalDurationMin <= 0

  // Live price validation — checks against category floor on every keystroke,
  // not just on submit, so the red warning shows up immediately.
  useEffect(() => {
    if (minPrice && hourlyRate !== '' && !isNaN(Number(hourlyRate)) && Number(hourlyRate) < Number(minPrice)) {
      setPriceError(`Must be at least ₹${minPrice} — the platform minimum for this category`)
    } else {
      setPriceError('')
    }
  }, [hourlyRate, minPrice])

  const isPriceInvalid = !!priceError
  const canSubmit = !!title.trim() && !isPriceInvalid && !durationMissing && !loading

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    try {
      const payload = {
        title: title.trim(),
        service_mode: serviceMode,
        _tags: tags,
        requires_slot: isSlotMode,
        allow_multi_day_booking: isMultiDayMode,
        // duration_min only means something for slot-mode services (it drives
        // slot auto-generation) — multi-day services don't have a single
        // "instance" duration, so it's cleared instead of sent stale.
        duration_min: isSlotMode ? totalDurationMin : null,
      }
      if (description.trim()) payload.description = description.trim()
      if (hourlyRate && !isNaN(Number(hourlyRate))) payload.hourly_rate = Number(hourlyRate)
      if (showVisitFee && visitFee && !isNaN(Number(visitFee))) payload.visit_fee = Number(visitFee)
      // onSave must return the mutation's promise (mutateAsync) — awaiting it
      // here is what keeps the button disabled + spinning for the full
      // round-trip, instead of resetting instantly and inviting a double-click.
      await onSave(payload)
    } catch (_) {
      // error toast already surfaced by the mutation's onError
    } finally {
      setLoading(false)
    }
  }

  const inp = "w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
  const inpStyle = { background: 'var(--g-bg)', border: '1px solid var(--g-border)', color: 'var(--text-primary)' }
  const inpErrorStyle = { ...inpStyle, border: '1.5px solid rgba(239,68,68,0.55)' }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl p-5 space-y-5"
      style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--border)', position: 'relative' }}>

      {/* Full-form overlay while saving — blocks all input, no double-submits */}
      {loading && (
        <div className="absolute inset-0 rounded-2xl flex items-center justify-center z-10"
          style={{ background: 'var(--modal-backdrop, rgba(0,0,0,0.35))', backdropFilter: 'blur(2px)' }}>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ background: 'var(--elevated)', border: '1px solid var(--g-border)' }}>
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Saving…</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {initial ? 'Edit service' : 'Add service'}
        </p>
      </div>

      <fieldset disabled={loading} className="space-y-5 border-0 p-0 m-0">

        {/* Basic info */}
        <div className="space-y-2.5">
          <SectionLabel>Basic info</SectionLabel>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Service title (e.g. Plumbing repair)" required className={inp} style={inpStyle} />
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Brief description (optional)" rows={2} className={inp + ' resize-none'} style={inpStyle} />
        </div>

        {/* Pricing */}
        <div>
          <SectionLabel>Pricing</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  {isMultiDayMode ? 'Per-day rate ₹' : 'Base rate ₹'}
                </p>
                {minPrice && (
                  <span className="text-[12px] font-medium px-1.5 py-0.5 rounded-md"
                    style={{ background: 'var(--accent-deep)', color: 'var(--accent)' }}>
                    Min ₹{minPrice}
                  </span>
                )}
              </div>
              <input type="number" value={hourlyRate}
                onChange={e => setHourlyRate(e.target.value)}
                placeholder={minPrice ? `Min ₹${minPrice}` : 'e.g. 499'}
                min={minPrice || 0} className={inp}
                aria-invalid={isPriceInvalid}
                style={isPriceInvalid ? inpErrorStyle : inpStyle} />
              {isMultiDayMode && (
                <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Charged per day booked — a 5-day booking bills 5× this rate.
                </p>
              )}
            </div>
            <AnimatePresence>
              {showVisitFee && (
                <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.15 }}>
                  <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Visit fee ₹</p>
                  <input type="number" value={visitFee} onChange={e => setVisitFee(e.target.value)}
                    placeholder="e.g. 99" min={0} className={inp} style={inpStyle} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {priceError && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
                <div className="flex items-center gap-1.5 mt-2 px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <span className="text-[12px] font-medium" style={{ color: '#f87171' }}>{priceError}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Availability */}
        <div>
          <SectionLabel>Availability mode</SectionLabel>
          <ServiceModeToggle value={serviceMode} onChange={setServiceMode} />
        </div>

        {/* Booking mode — every service is EITHER slot-based OR multi-day,
            never both. This decides whether customers see a time-slot
            calendar or a start-date + number-of-days picker in Discovery. */}
        <div>
          <SectionLabel>Booking mode</SectionLabel>
          <BookingModeToggle value={bookingMode} onChange={setBookingMode} />
        </div>

        {/* Slot-mode: average completion time — used to auto-generate slots */}
        <AnimatePresence mode="wait">
          {isSlotMode && (
            <motion.div key="duration" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }} style={{ overflow: 'hidden' }}>
              <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Average time to complete this service
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input type="number" min={0} value={durationHours}
                    onChange={e => setDurationHours(e.target.value)}
                    placeholder="Hours" className={inp}
                    style={durationMissing ? inpErrorStyle : inpStyle} />
                </div>
                <div>
                  <input type="number" min={0} max={59} value={durationMinutes}
                    onChange={e => setDurationMinutes(e.target.value)}
                    placeholder="Minutes" className={inp}
                    style={durationMissing ? inpErrorStyle : inpStyle} />
                </div>
              </div>
              <p className="text-[12px] mt-1.5" style={{ color: durationMissing ? '#f87171' : 'var(--text-muted)' }}>
                {durationMissing
                  ? 'Required for slot-based services — used to auto-generate your available booking slots.'
                  : 'Used to auto-generate available booking slots for customers.'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tags */}
        <div>
          <SectionLabel>Tags</SectionLabel>
          <TagInput selectedTags={tags} onChange={setTags} />
        </div>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-xl btn-brand text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-transform active:scale-[0.98]">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {loading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </fieldset>
    </form>
  )
}

// ── Service card ──────────────────────────────────────────────────────────────
function ServiceCard({ svc, onEdit, onDelete, deleting, disabled }) {
  const modeColor = MODE_COLORS[svc.service_mode || 'both']
  const modeLabel = MODE_OPTIONS.find(o => o.value === (svc.service_mode || 'both'))?.label || 'Both'
  const tags = svc.tags || []

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
      className="rounded-xl p-4" style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{svc.title}</p>
            <span className="text-[12px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: modeColor.bg, color: modeColor.color, border: `1px solid ${modeColor.border}` }}>
              {modeLabel}
            </span>
            {svc.requires_slot && (
              <span className="text-[12px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' }}>
                <CalendarClock size={10} /> Slot-based{svc.duration_min ? ` · ${svc.duration_min}min` : ''}
              </span>
            )}
            {svc.allow_multi_day_booking && (
              <span className="text-[12px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                style={{ background: 'var(--accent-deep)', color: 'var(--accent-hover)', border: '1px solid var(--accent-mid)' }}>
                <CalendarRange size={10} /> Multi-day
              </span>
            )}
          </div>
          {svc.description && (
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{svc.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            {(svc.price > 0 || svc.hourly_rate > 0) && (
              <span className="text-xs font-semibold" style={{ color: 'var(--azure, #60a5fa)' }}>{formatCurrency(svc.price || svc.hourly_rate)}</span>
            )}
            {svc.visit_fee > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>+{formatCurrency(svc.visit_fee)} visit fee</span>
            )}
            {svc.avg_rating > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                ★ {Number(svc.avg_rating).toFixed(1)} ({svc.rating_count})
              </span>
            )}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.map(tag => (
                <span key={tag.id} className="text-[12px] px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--accent-bg)', color: 'var(--brand)', border: '1px solid var(--accent-border)' }}>
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} disabled={disabled}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-transform active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
            <Edit3 size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button onClick={onDelete} disabled={deleting || disabled}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-transform active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {deleting ? <Loader2 size={13} className="animate-spin" style={{ color: '#f87171' }} /> : <Trash2 size={13} style={{ color: '#f87171' }} />}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Save tags helper ──────────────────────────────────────────────────────────
async function saveTags(serviceId, tags) {
  const tag_ids       = (tags || []).filter(t => !t.isNew).map(t => t.id)
  const new_tag_names = (tags || []).filter(t => t.isNew).map(t => t.name)
  await api.put(`/workers/me/services/${serviceId}/tags`, { tag_ids, new_tag_names })
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WorkerServices() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd]     = useState(false)
  const [editingId, setEditingId] = useState(null)

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['my-services'],
    queryFn: () => api.get('/workers/me/services').then(r => r.data),
  })

  // Fetch worker's categories to derive the effective min_price hint
  const { data: minPrice } = useQuery({
    queryKey: ['worker-min-price'],
    queryFn: async () => {
      // Get the worker's first category's min_price from the categories list
      const [profRes, catsRes] = await Promise.all([
        api.get('/workers/profile'),
        api.get('/categories'),
      ])
      // WorkerProfile has category_ids via WorkerCategory join — but the profile
      // endpoint doesn't return them directly. Use the services list to infer
      // the category, or fall back to global categories minimum.
      const allCats = Array.isArray(catsRes.data) ? catsRes.data : []
      if (allCats.length === 0) return null
      // Use the minimum min_price across all active categories as a safe floor
      const floors = allCats.map(c => Number(c.min_price || 0)).filter(n => n > 0)
      return floors.length > 0 ? Math.min(...floors) : null
    },
    staleTime: 5 * 60 * 1000,
  })

  const extractError = (err) => {
    const detail = err.response?.data?.detail
    if (Array.isArray(detail)) return `${detail[0]?.loc?.slice(1).join('.') || 'Field'}: ${detail[0]?.msg}`
    return typeof detail === 'string' ? detail : 'Failed to save service'
  }

  const addMut = useMutation({
    mutationFn: async (data) => {
      const { _tags, ...payload } = data
      const res = await api.post('/workers/me/services', payload)
      if (_tags && _tags.length > 0) await saveTags(res.data.id, _tags)
      return res
    },
    onSuccess: () => { queryClient.invalidateQueries(['my-services']); setShowAdd(false); toast.success('Service added') },
    onError: (err) => { console.error(err.response?.data); toast.error(extractError(err)) },
  })

  const updateMut = useMutation({
    mutationFn: async ({ id, data }) => {
      const { _tags, ...payload } = data
      const res = await api.patch(`/workers/me/services/${id}`, payload)
      await saveTags(id, _tags || [])
      return res
    },
    onSuccess: () => { queryClient.invalidateQueries(['my-services']); setEditingId(null); toast.success('Updated') },
    onError: (err) => { console.error(err.response?.data); toast.error(extractError(err)) },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/workers/me/services/${id}`),
    onSuccess: () => { queryClient.invalidateQueries(['my-services']); toast.success('Deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  // Any in-flight mutation — used to guard against opening a second form
  // (e.g. Add + Edit at once) while one is still saving.
  const anyPending = addMut.isPending || updateMut.isPending || deleteMut.isPending

  return (
    <div className="px-4 pt-5 pb-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {services.length} service{services.length !== 1 ? 's' : ''} listed
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditingId(null) }}
          disabled={anyPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl btn-brand text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-transform active:scale-[0.97]"
        >
          <Plus size={15} /> Add
        </button>
      </div>

      {/* Bundle several services into a package — surfaced here since it's a
          natural next step after adding services, not just buried in the menu. */}
      <Link to="/worker/packages">
        <motion.div
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-3 rounded-xl m-1 p-3.5 cursor-pointer transition-colors"
          style={{ background: 'var(--accent-deep)', border: '1px solid var(--accent-mid)' }}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent-bg-md)' }}>
            <Package size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Create a package</p>
            <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Bundle your services together at a combined price</p>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--accent)' }} className="shrink-0" />
        </motion.div>
      </Link>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            {/* mutateAsync (not mutate) so the form's own await actually spans
                the full request — this is what keeps Save disabled/spinning
                for the whole round-trip instead of resetting instantly. */}
            <ServiceForm onSave={(data) => addMut.mutateAsync(data)} onCancel={() => setShowAdd(false)} minPrice={minPrice} />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : services.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No services yet. Add your first!</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {services.map((svc) =>
              editingId === svc.id ? (
                <motion.div key={svc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ServiceForm initial={svc} onSave={(data) => updateMut.mutateAsync({ id: svc.id, data })} onCancel={() => setEditingId(null)} minPrice={minPrice} />
                </motion.div>
              ) : (
                <ServiceCard key={svc.id} svc={svc}
                  onEdit={() => { if (anyPending) return; setEditingId(svc.id); setShowAdd(false) }}
                  onDelete={() => { if (deleteMut.isPending) return; deleteMut.mutate(svc.id) }}
                  deleting={deleteMut.isPending && deleteMut.variables === svc.id}
                  disabled={anyPending}
                />
              )
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
