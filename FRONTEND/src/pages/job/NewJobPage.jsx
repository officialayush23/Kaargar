/**
 * NewJobPage — 4-step instant hiring flow.
 * Step 1: Category selection (animated glass cards)
 * Step 2: Location picker (Mapbox map + GPS)
 * Step 3: Price estimate
 * Step 4: Confirm + submit
 */
import { useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, MapPin, Zap, Compass, Navigation, FileText, ChevronRight, Check, TrendingUp, Clock } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/app'
import { useCategories } from '@/hooks/useCategories'
import { useGeoLocation } from '@/hooks/useGeoLocation'
import { useAddressAutocomplete, reverseGeocode } from '@/hooks/useGeocoding'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput, GlassTextarea } from '@/components/glass/GlassInput'
import { PuneMap } from '@/components/kaargar/PuneMap'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const STEPS = ['service', 'location', 'estimate', 'confirm']
const STEP_LABELS = { service: 'Service', location: 'Location', estimate: 'Estimate', confirm: 'Confirm' }

const CATEGORY_ICONS = {
  electrician: '⚡', plumber: '🔧', carpenter: '🪚', mechanic: '🔩',
  cleaner: '🧹', painter: '🎨', ac_repair: '❄️', appliance: '🔌',
  pest_control: '🐛', shifting: '📦', default: '🛠',
}

function getCatIcon(slug) {
  return CATEGORY_ICONS[slug] || CATEGORY_ICONS.default
}

function StepIndicator({ current }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const done   = STEPS.indexOf(current) > i
        const active = current === s
        return (
          <div key={s} className="flex items-center gap-1">
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '9999px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 700,
                transition: 'all 0.2s',
                background: done
                  ? 'var(--amber)'
                  : active
                  ? 'var(--g-bg-hi)'
                  : 'var(--g-bg)',
                border: active
                  ? '1.5px solid var(--g-border)'
                  : done
                  ? 'none'
                  : '1px solid var(--g-border)',
                color: done
                  ? '#000'
                  : active
                  ? 'var(--text-primary)'
                  : 'var(--text-muted)',
              }}
            >
              {done ? <Check style={{ width: '11px', height: '11px' }} /> : <span>{i + 1}</span>}
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  height: '1.5px',
                  width: '12px',
                  background: done ? 'var(--amber)' : 'var(--g-border)',
                  borderRadius: '1px',
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Category ─────────────────────────────────────────

function CategoryStep({ mode, onSelect }) {
  const { data: categories = [], isLoading } = useCategories(mode)

  return (
    <motion.div
      key="step-service"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>What do you need?</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Pick a service category</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] rounded-2xl animate-pulse" style={{ background: 'var(--g-bg)' }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {categories.map((cat, i) => (
            <motion.button
              key={cat.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSelect(cat)}
              className="rounded-2xl p-4 flex flex-col items-center gap-2 text-center"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--card-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--card-bg)'}
            >
              <span className="text-2xl">{getCatIcon(cat.slug)}</span>
              <span className="text-xs font-medium leading-tight" style={{ color: 'var(--text-secondary)' }}>
                {cat.name}
              </span>
              {cat.min_price && (
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>from {formatCurrency(cat.min_price)}</span>
              )}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ── Step 2: Location ─────────────────────────────────────────

function LocationStep({ location, onLocationSelect, category }) {
  const { getLocation, loading: geoLoading } = useGeoLocation()
  const { suggestions, loading: acLoading, search, resolvePlace, clear } = useAddressAutocomplete()
  const [addressInput, setAddressInput] = useState(location?.address || '')
  const [showSuggestions, setShowSuggestions] = useState(false)

  async function handleGPS() {
    const loc = await getLocation()
    if (loc) {
      // Try reverse geocode to get nice address
      const geo = await reverseGeocode(loc.lat, loc.lon)
      const addr = geo?.formatted_address || loc.address || 'Current location'
      setAddressInput(addr)
      onLocationSelect({ ...loc, address: addr })
    }
  }

  function handleAddressInput(val) {
    setAddressInput(val)
    search(val)
    setShowSuggestions(true)
    if (!val) onLocationSelect(prev => ({ ...prev, address: '' }))
  }

  async function handleSelectSuggestion(suggestion) {
    setAddressInput(suggestion.description)
    setShowSuggestions(false)
    clear()
    try {
      const place = await resolvePlace(suggestion.place_id)
      onLocationSelect({
        lat: place.lat,
        lon: place.lon,
        address: place.formatted_address || suggestion.description,
      })
    } catch {
      onLocationSelect(prev => ({ ...prev, address: suggestion.description }))
    }
  }

  return (
    <motion.div
      key="step-location"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>Where do you need it?</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {category ? `${category.name} at your location` : 'Choose location'}
        </p>
      </div>

      {/* Address search with autocomplete */}
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <MapPin
            className="h-4 w-4"
            style={{
              position: 'absolute', left: '12px', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', zIndex: 1,
            }}
          />
          <input
            type="text"
            value={addressInput}
            onChange={e => handleAddressInput(e.target.value)}
            onFocus={() => addressInput && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
            placeholder="Search for an address in Pune..."
            className="glass-input w-full rounded-xl text-sm"
            style={{
              paddingLeft: '36px', paddingRight: '12px', paddingTop: '11px', paddingBottom: '11px',
              color: 'var(--text-primary)', width: '100%',
            }}
          />
          {acLoading && (
            <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
              <div className="w-4 h-4 border-2 border-azure/30 border-t-azure rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Suggestions dropdown */}
        <AnimatePresence>
          {showSuggestions && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)',
                borderRadius: '12px', marginTop: '4px', overflow: 'hidden',
                backdropFilter: 'blur(24px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              }}
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.place_id || i}
                  onMouseDown={() => handleSelectSuggestion(s)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                    borderBottom: i < suggestions.length - 1 ? '1px solid var(--g-border)' : 'none',
                    background: 'transparent', cursor: 'pointer', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--g-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: 'var(--azure)' }} />
                  <div style={{ minWidth: 0 }}>
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {s.main_text || s.description}
                    </p>
                    {s.secondary_text && (
                      <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {s.secondary_text}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* GPS button */}
      <GlassButton
        variant="ghost"
        className="w-full justify-start gap-3"
        icon={Navigation}
        loading={geoLoading}
        onClick={handleGPS}
      >
        Use my current location
      </GlassButton>

      {/* Map */}
      <PuneMap
        onLocationSelect={(loc) => {
          onLocationSelect({ ...loc })
          if (loc.address) setAddressInput(loc.address)
        }}
        initialLat={location?.lat}
        initialLon={location?.lon}
        className="h-48"
      />

      {/* Description */}
      <GlassTextarea
        label="Describe the work (optional)"
        placeholder="e.g. Fix leaking tap under the kitchen sink..."
        rows={2}
        onChange={e => onLocationSelect(prev => ({ ...prev, description: e.target.value }))}
      />
    </motion.div>
  )
}

// ── Step 3: Estimate ─────────────────────────────────────────

function EstimateStep({ category, mode }) {
  const basePrice = Number(category?.min_price || 99)
  const surge = mode === 'instant' ? 1.15 : 1.0
  const low  = Math.round(basePrice * surge)
  const high = Math.round(low * 2.8)

  return (
    <motion.div
      key="step-estimate"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>Estimated fare</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Final price set after job assessment</p>
      </div>

      {/* Big price card */}
      <GlassCard blue glow glowColor="azure" className="p-6 text-center">
        <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Estimated range</p>
        <p className="text-4xl font-bold font-syne gradient-text-azure">
          {formatCurrency(low)} – {formatCurrency(high)}
        </p>
        <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>{category?.name} · {mode} mode</p>

        {mode === 'instant' && (
          <div className="flex items-center justify-center gap-1.5 mt-3">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs text-amber-400 font-medium">Peak demand — 15% surge applied</span>
          </div>
        )}
      </GlassCard>

      {/* Breakdown */}
      <GlassCard className="p-4 space-y-3">
        <p className="text-xs uppercase tracking-widest font-medium" style={{ color: 'var(--text-muted)' }}>Price breakdown</p>
        <div className="space-y-2">
          {[
            { label: 'Base fare',        value: formatCurrency(basePrice) },
            { label: 'Platform fee',     value: formatCurrency(Math.round(low * 0.15)) },
            mode === 'instant' && { label: 'Surge (15%)', value: `+${formatCurrency(Math.round(basePrice * 0.15))}` },
            { label: 'GST (18%)',        value: formatCurrency(Math.round(low * 0.18)) },
          ].filter(Boolean).map(row => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
              <span className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{row.value}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Info pills */}
      <div className="grid grid-cols-2 gap-3">
        <GlassCard className="p-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-emerald-400 shrink-0" />
          <div>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Worker ETA</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>30–45 min</p>
          </div>
        </GlassCard>
        <GlassCard className="p-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-azure shrink-0" />
          <div>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Avg. rating</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>4.8 ★</p>
          </div>
        </GlassCard>
      </div>

      <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
        You only pay after the job is done. No upfront payment.
      </p>
    </motion.div>
  )
}

// ── Step 4: Confirm ───────────────────────────────────────────

function ConfirmStep({ category, location, mode, description, loading, onSubmit }) {
  return (
    <motion.div
      key="step-confirm"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="space-y-4"
    >
      <div>
        <h2 className="text-xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>Confirm booking</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Review and place your order</p>
      </div>

      <GlassCard className="p-5 space-y-4">
        <div className="flex items-center gap-3 pb-4" style={{ borderBottom: '1px solid var(--g-border)' }}>
          <div className="w-12 h-12 rounded-2xl bg-azure/15 flex items-center justify-center text-2xl">
            {getCatIcon(category?.slug)}
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{category?.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {mode === 'instant' ? (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15">
                  <Zap className="h-2.5 w-2.5 text-emerald-400" />
                  <span className="text-[10px] text-emerald-400 font-medium">Instant</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15">
                  <Compass className="h-2.5 w-2.5 text-amber-400" />
                  <span className="text-[10px] text-amber-400 font-medium">Discovery</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          <SummaryRow label="Location" value={location?.address || 'Pune'} icon={MapPin} />
          {description && <SummaryRow label="Notes" value={description} icon={FileText} />}
        </div>
      </GlassCard>

      {mode === 'instant' && (
        <GlassCard className="p-4" style={{ border: '1px solid rgba(52,211,153,0.2)', background: 'rgba(52,211,153,0.05)' }}>
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-400">Instant Match</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                We search for nearby workers within 5 km. Average wait: 30–45 min.
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      <motion.button
        onClick={onSubmit}
        disabled={loading}
        whileHover={{ scale: loading ? 1 : 1.02, y: loading ? 0 : -2 }}
        whileTap={{ scale: 0.97 }}
        className={cn(
          'w-full py-4 rounded-2xl font-bold text-base text-white flex items-center justify-center gap-2 relative overflow-hidden',
          mode === 'instant'
            ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-[0_8px_32px_rgba(16,185,129,0.4)]'
            : 'bg-gradient-to-r from-azure to-azure-dim shadow-[0_8px_32px_rgba(59,130,246,0.4)]',
          loading && 'opacity-70'
        )}
      >
        {/* Glare sweep */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          initial={{ x: '-100%' }}
          animate={{ x: '200%' }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
        />
        {loading ? (
          <span className="relative animate-spin">⌛</span>
        ) : (
          <>
            {mode === 'instant' ? <Zap className="h-5 w-5 relative" /> : <Compass className="h-5 w-5 relative" />}
            <span className="relative">
              {mode === 'instant' ? 'Find worker now' : 'Book service'}
            </span>
          </>
        )}
      </motion.button>
    </motion.div>
  )
}

function SummaryRow({ label, value, icon: Icon }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{value}</p>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────

export default function NewJobPage() {
  const navigate = useNavigate()
  const routeState = useLocation().state || {}
  const { mode } = useAppStore()
  const { currentLocation } = useAppStore()

  const [step, setStep] = useState(routeState.category ? 'location' : 'service')
  const [category, setCategory] = useState(routeState.category || null)
  const [location, setLocation] = useState(currentLocation || null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const prevStep = useCallback(() => {
    const idx = STEPS.indexOf(step)
    if (idx > 0) setStep(STEPS[idx - 1])
    else navigate(-1)
  }, [step, navigate])

  const nextStep = useCallback(() => {
    const idx = STEPS.indexOf(step)
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1])
  }, [step])

  async function handleSubmit() {
    if (!category || !location) return
    setLoading(true)
    try {
      const { data: job } = await api.post('/jobs', {
        category_id: category.id,
        job_type: mode,
        location_lat: location.lat || 18.5204,
        location_lon: location.lon || 73.8567,
        location_address: location.address || 'Pune',
        description: description.trim() || undefined,
      })
      navigate(
        mode === 'instant' ? `/job/${job.id}/searching` : `/job/${job.id}/active`,
        { replace: true }
      )
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to create booking')
    } finally {
      setLoading(false)
    }
  }

  const canAdvance = {
    service:  !!category,
    location: !!location?.address,
    estimate: true,
    confirm:  !!category && !!location,
  }

  return (
    <div className="min-h-full">
      {/* Oval page header */}
      <div className="px-4 pt-5 pb-4">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 16px 8px 8px',
            borderRadius: '9999px',
            background: 'var(--g-bg-mid)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid var(--g-border)',
            boxShadow: '0 2px 16px rgba(0,0,0,0.12), inset 0 1px 0 var(--g-shine)',
          }}
        >
          <button
            onClick={prevStep}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '9999px',
              background: 'var(--g-bg)',
              border: '1px solid var(--g-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <ArrowLeft style={{ width: '15px', height: '15px', color: 'var(--text-secondary)' }} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1 }}>
              Step {STEPS.indexOf(step) + 1} of {STEPS.length}
            </p>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, marginTop: '1px' }}>
              {STEP_LABELS[step]}
            </p>
          </div>

          <StepIndicator current={step} />
        </div>
      </div>

      <div className="px-4 pb-10 space-y-5">
        <AnimatePresence mode="wait">
          {step === 'service' && (
            <CategoryStep
              mode={mode}
              onSelect={(cat) => { setCategory(cat); setStep('location') }}
            />
          )}
          {step === 'location' && (
            <LocationStep
              location={location}
              onLocationSelect={(loc) => {
                if (typeof loc === 'function') {
                  setLocation(prev => loc(prev))
                } else {
                  setLocation(loc)
                  if (loc.description !== undefined) setDescription(loc.description)
                }
              }}
              category={category}
            />
          )}
          {step === 'estimate' && (
            <EstimateStep category={category} mode={mode} />
          )}
          {step === 'confirm' && (
            <ConfirmStep
              category={category}
              location={location}
              mode={mode}
              description={description}
              loading={loading}
              onSubmit={handleSubmit}
            />
          )}
        </AnimatePresence>

        {/* Bottom CTA (not on confirm — it has its own) */}
        {step !== 'confirm' && (
          <GlassButton
            variant={mode === 'instant' ? 'instant' : 'brand'}
            size="lg"
            className="w-full"
            disabled={!canAdvance[step]}
            onClick={nextStep}
            icon={ChevronRight}
            iconPosition="right"
          >
            Continue
          </GlassButton>
        )}
      </div>
    </div>
  )
}
