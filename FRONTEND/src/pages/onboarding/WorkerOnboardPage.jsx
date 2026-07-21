import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, User, Tag, FileText,
  MapPin, Rocket, Upload, X, Check, Loader2,
  Clock, AlertCircle, Search, Calendar,
  Video, Play,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Background } from '@/components/glass/Background'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput, GlassTextarea } from '@/components/glass/GlassInput'
import { GlassSelect } from '@/components/glass/GlassSelect'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { PUNE_AREAS, getErrorMessage } from '@/lib/utils'
import { toast } from 'sonner'

const RADIUS_OPTIONS = [
  { value: 2, label: '2 km', desc: 'Very local' },
  { value: 3, label: '3 km', desc: 'Local' },
  { value: 5, label: '5 km', desc: 'Standard' },
  { value: 8, label: '8 km', desc: 'Wide' },
  { value: 10, label: '10 km', desc: 'City-wide' },
]

const DOC_TYPES = [
  { value: 'aadhaar', label: 'Aadhaar Card' },
  { value: 'pan', label: 'PAN Card' },
  { value: 'driving_license', label: 'Driving Licence' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'passport', label: 'Passport' },
]

const STEPS = ['bio', 'categories', 'documents', 'video', 'area', 'schedule', 'publish']
const STEP_META = [
  { icon: User,     label: 'Bio',       desc: 'Your story' },
  { icon: Tag,      label: 'Skills',    desc: 'Categories' },
  { icon: FileText, label: 'Docs',      desc: 'Identity' },
  { icon: Video,    label: 'Video',     desc: 'Intro' },
  { icon: MapPin,   label: 'Area',      desc: 'Zone' },
  { icon: Calendar, label: 'Hours',     desc: 'Schedule' },
  { icon: Rocket,   label: 'Publish',   desc: 'Go live' },
]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TIME_OPTS = []
for (let h = 6; h <= 22; h++) for (const m of [0, 30]) {
  if (h === 22 && m === 30) continue
  TIME_OPTS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
}
function to12h(hhmm) {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
const DEFAULT_SCHEDULE = DAYS.map((_, i) => ({
  day_of_week: i,
  enabled: i < 6,
  start_time: '09:00',
  end_time:   '18:00',
}))

function AreaPicker({ value, onChange, error }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef()
  const inputRef = useRef()

  const filtered = PUNE_AREAS.filter(a =>
    a.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function select(area) {
    onChange(area)
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', zIndex: open ? 80 : 1 }}>
      <button
        type="button"
        onClick={() => { setOpen(v => !v); if (!open) setTimeout(() => inputRef.current?.focus(), 50) }}
        style={{
          width: '100%',
          padding: '12px 14px',
          borderRadius: '12px',
          border: error
            ? '1.5px solid rgba(239,68,68,0.6)'
            : open
              ? '1.5px solid var(--amber)'
              : '1px solid var(--card-border)',
          background: 'var(--card-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <span style={{
          fontSize: '14px',
          color: value ? 'var(--text-primary)' : 'var(--text-muted)',
        }}>
          {value || 'Select your area…'}
        </span>
        <ChevronRight
          size={15}
          style={{
            color: 'var(--text-muted)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.2s ease',
            flexShrink: 0,
          }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              zIndex: 120,
              borderRadius: '14px',
              background: 'var(--elevated)',
              border: '1px solid var(--card-border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '8px', borderBottom: '1px solid var(--card-border)' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={13}
                  style={{
                    position: 'absolute', left: '10px', top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)', pointerEvents: 'none',
                  }}
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search area…"
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 28px',
                    borderRadius: '8px',
                    border: '1px solid var(--card-border)',
                    background: 'var(--card-bg)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '6px' }}>
              {filtered.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No areas found
                </p>
              ) : filtered.map(area => (
                <button
                  key={area}
                  type="button"
                  onClick={() => select(area)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: value === area ? 'var(--accent-deep)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={e => { if (value !== area) e.currentTarget.style.background = 'var(--card-hover)' }}
                  onMouseLeave={e => { if (value !== area) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{
                    fontSize: '13px',
                    color: value === area ? 'var(--amber)' : 'var(--text-secondary)',
                    fontWeight: value === area ? 600 : 400,
                  }}>
                    {area}
                  </span>
                  {value === area && (
                    <Check size={13} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function WorkerOnboardPage() {
  const navigate = useNavigate()
  const { updateUser } = useAuthStore()
  const [stepIdx, setStepIdx] = useState(0)
  const [prevIdx, setPrevIdx] = useState(0)

  // Step 1: Bio
  const [bio, setBio] = useState('')
  const [yearsExp, setYearsExp] = useState('')
  const [phone, setPhone] = useState(useAuthStore.getState().user?.phone?.replace(/^\+91/, '') || '')
  const [allowMultiDay, setAllowMultiDay] = useState(false)

  // Step 2: Categories
  const [selectedCats, setSelectedCats] = useState([])

  // Step 3: Documents
  const [uploadedDocs, setUploadedDocs] = useState([])
  const [docType, setDocType] = useState('aadhaar')
  const [docUploading, setDocUploading] = useState(false)
  const docInputRef = useRef()

  // Step 4: Intro Video
  const [videoUploaded, setVideoUploaded] = useState(null)
  const [videoUploading, setVideoUploading] = useState(false)
  const videoInputRef = useRef()

  // Step 5: Area
  const [selectedArea, setSelectedArea] = useState('')
  const [radius, setRadius] = useState(5)

  // Step 6: Schedule
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE)

  function toggleDay(i) {
    setSchedule(prev => prev.map((d, idx) => idx === i ? { ...d, enabled: !d.enabled } : d))
  }
  function setDayTime(i, field, val) {
    setSchedule(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d))
  }

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const direction = stepIdx >= prevIdx ? 1 : -1
  function goTo(i) { setPrevIdx(stepIdx); setStepIdx(i) }
  function nextStep() { goTo(stepIdx + 1) }
  function prevStep() { goTo(stepIdx - 1) }
  const step = STEPS[stepIdx]

  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await api.get('/categories')
      return Array.isArray(data) ? data : []
    },
  })

  function toggleCat(cat) {
    setSelectedCats(prev =>
      prev.find(c => c.id === cat.id)
        ? prev.filter(c => c.id !== cat.id)
        : [...prev, cat]
    )
  }

  async function uploadDocument(file) {
    if (!file) return
    setDocUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('doc_type', docType)
      const { data } = await api.post('/upload/document', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setUploadedDocs(prev => [
        ...prev,
        { url: data.url, path: data.path, type: docType, filename: file.name },
      ])
      toast.success('Document uploaded')
    } catch (e) {
      toast.error(getErrorMessage(e, 'Upload failed'))
    } finally {
      setDocUploading(false)
    }
  }

  function removeDoc(idx) {
    setUploadedDocs(prev => prev.filter((_, i) => i !== idx))
  }

  async function uploadVerificationVideo(file) {
    if (!file) return
    setVideoUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post('/upload/verification-video', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setVideoUploaded({ url: data.url, path: data.path, filename: file.name, size: file.size })
      toast.success('Intro video uploaded!')
    } catch (e) {
      toast.error(getErrorMessage(e, 'Video upload failed'))
    } finally {
      setVideoUploading(false)
    }
  }

  function validateStep() {
    const errs = {}
    if (step === 'bio') {
      if (!bio.trim()) errs.bio = 'Please add a short bio'
      if (yearsExp && isNaN(Number(yearsExp))) errs.yearsExp = 'Enter a valid number'
    }
    if (step === 'categories') {
      if (selectedCats.length === 0) errs.cats = 'Select at least one category'
    }
    if (step === 'area') {
      if (!selectedArea) errs.area = 'Please select your area'
    }
    if (step === 'schedule') {
      if (!schedule.some(d => d.enabled)) errs.schedule = 'Enable at least one working day'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleNext() {
    if (!validateStep()) return
    nextStep()
  }

  async function publishProfile() {
    if (!validateStep()) return
    setLoading(true)
    try {
      // Save phone if provided
      const phoneDigits = phone.replace(/\D/g, '')
      if (phoneDigits.length === 10) {
        try { await api.patch('/users/me', { phone: `+91${phoneDigits}` }) } catch (_) {}
      }

      await api.post('/workers/profile', {
        bio: bio.trim() || undefined,
        experience_years: yearsExp ? Number(yearsExp) : 0,
        pune_area: selectedArea,
        service_radius_km: radius,
        category_ids: selectedCats.map(c => c.id),
        allow_multi_day_booking: allowMultiDay,
      })

      for (const doc of uploadedDocs) {
        try {
          await api.post('/workers/documents', {
            type: doc.type,
            cloudinary_url: doc.url,
            cloudinary_id: doc.path,
          })
        } catch (_) {}
      }

      // The intro video was uploaded to storage back in Step 4, before the
      // WorkerProfile row existed — register it now so it actually shows up
      // for admin review (registration silently no-ops without a profile).
      if (videoUploaded) {
        try {
          await api.post('/workers/documents', {
            type: 'verification_video',
            cloudinary_url: videoUploaded.url,
            cloudinary_id: videoUploaded.path,
          })
        } catch (_) {}
      }

      const enabledDays = schedule
        .filter(d => d.enabled)
        .map(d => ({
          day_of_week: d.day_of_week,
          start_time:  d.start_time,
          end_time:    d.end_time,
        }))
      if (enabledDays.length > 0) {
        try {
          await api.put('/workers/me/availability', enabledDays)
        } catch (_) {}
      }

      toast.success('Profile published! Welcome to Kaargar.')
      updateUser({ role: 'worker' })
      navigate('/worker')
    } catch (e) {
      const detail = e.response?.data?.detail
      if (detail === 'Worker profile already exists') {
        toast.info('Profile already exists — redirecting to dashboard.')
        updateUser({ role: 'worker' })
        navigate('/worker')
      } else {
        toast.error(getErrorMessage(e, 'Failed to publish profile. Try again.'))
      }
    } finally {
      setLoading(false)
    }
  }

  const slideVariants = {
    enter: (dir) => ({ opacity: 0, x: dir > 0 ? 40 : -40 }),
    center: { opacity: 1, x: 0 },
    exit:  (dir) => ({ opacity: 0, x: dir > 0 ? -40 : 40 }),
  }

  return (
    <div className="h-screen relative overflow-hidden flex flex-col" style={{ background: 'var(--page-bg)' }}>
      <Background />

      <div className="max-w-sm mx-auto px-4 pt-6 w-full flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 shrink-0">
          {stepIdx > 0 ? (
            <button
              onClick={prevStep}
              style={{
                width: '38px', height: '38px', borderRadius: '10px',
                background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
            </button>
          ) : (
            <button
              onClick={() => navigate('/')}
              style={{
                width: '38px', height: '38px', borderRadius: '10px',
                background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <X size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
              Worker Onboarding
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Step {stepIdx + 1} of {STEPS.length} — {STEP_META[stepIdx].label}
            </p>
          </div>
        </div>

        {/* Step progress bars */}
        <div className="flex items-center gap-1 mb-6 shrink-0">
          {STEP_META.map((s, i) => {
            const isActive = i === stepIdx
            const isDone = i < stepIdx
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={{
                  height: '3px', borderRadius: '2px', width: '100%',
                  background: isDone || isActive ? 'var(--amber)' : 'var(--card-border)',
                  transition: 'background 0.3s ease',
                  opacity: isActive ? 1 : isDone ? 0.7 : 0.4,
                }} />
                <span style={{
                  fontSize: '10px',
                  color: isActive ? 'var(--amber)' : isDone ? 'var(--text-secondary)' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 400,
                }}>
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Step content — scrollable, so header/progress/nav stay pinned on one screen */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1 pb-3">
        <AnimatePresence mode="wait" custom={direction}>

          {/* ── STEP 1: Bio ── */}
          {step === 'bio' && (
            <motion.div
              key="bio"
              custom={direction}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="space-y-4"
            >
              <GlassCard className="p-5 space-y-4 overflow-visible" style={{ position: 'relative', zIndex: 30 }}>
                <div>
                  <h2 className="text-base font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
                    Tell clients about yourself
                  </h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    A strong bio gets you more bookings
                  </p>
                </div>

                <GlassTextarea
                  label="Bio"
                  placeholder="e.g. Experienced electrician with 5+ years. Specialise in home wiring, appliance repair and panel upgrades. Quick, clean work — satisfaction guaranteed."
                  value={bio}
                  onChange={e => { setBio(e.target.value); setErrors(e => ({ ...e, bio: '' })) }}
                  rows={4}
                  error={errors.bio}
                />

                <GlassInput
                  label="Years of experience"
                  placeholder="e.g. 5"
                  type="number"
                  min="0"
                  value={yearsExp}
                  onChange={e => setYearsExp(e.target.value)}
                  icon={Clock}
                  error={errors.yearsExp}
                />

                {/* Phone */}
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Mobile number <span style={{ color: 'var(--text-muted)' }}>(clients use this)</span>
                  </p>
                  <div
                    className="flex items-center rounded-xl overflow-hidden"
                    style={{ border: '1.5px solid var(--card-border)', background: 'var(--card-bg)' }}
                  >
                    <span className="px-3 py-3 text-sm border-r shrink-0"
                      style={{ color: 'var(--text-muted)', borderColor: 'var(--card-border)' }}>+91</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="98765 43210"
                      className="flex-1 px-3 py-3 text-sm bg-transparent outline-none"
                      style={{ color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                {/* Overall opt-in — a customer only sees the "book across
                    multiple days" option in Discovery when this is on AND
                    the specific service also has it enabled (Services page). */}
                <div className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Allow multi-day booking</p>
                    <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Let customers book you across several days at once (you can change this later, per service)
                    </p>
                  </div>
                  <button type="button"
                    onClick={() => setAllowMultiDay(v => !v)}
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${allowMultiDay ? 'bg-instant' : ''}`}
                    style={!allowMultiDay ? { background: 'var(--g-bg)' } : undefined}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${allowMultiDay ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* ── STEP 2: Categories ── */}
          {step === 'categories' && (
            <motion.div
              key="categories"
              custom={direction}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            >
              <GlassCard className="p-5">
                <div className="mb-4">
                  <h2 className="text-base font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
                    What services do you offer?
                  </h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Select all that apply. You can add more later.
                  </p>
                </div>

                {errors.cats && (
                  <div className="flex items-center gap-2 p-3 rounded-xl mb-4"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertCircle size={14} style={{ color: '#f87171', flexShrink: 0 }} />
                    <p className="text-xs" style={{ color: '#f87171' }}>{errors.cats}</p>
                  </div>
                )}

                {catsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gridAutoRows: '1fr', gap: '8px', alignItems: 'stretch' }}>
                    {categories.map(cat => {
                      const selected = selectedCats.find(c => c.id === cat.id)
                      return (
                        <motion.button
                          key={cat.id}
                          onClick={() => { toggleCat(cat); setErrors(e => ({ ...e, cats: '' })) }}
                          whileTap={{ scale: 0.95 }}
                          style={{
                            padding: '12px',
                            borderRadius: '12px',
                            width: '100%',
                            minWidth: 0,
                            maxWidth: '100%',
                            overflow: 'hidden',
                            boxSizing: 'border-box',
                            border: selected
                              ? `1.5px solid ${cat.color_hex || 'var(--amber)'}`
                              : '1px solid var(--card-border)',
                            background: selected
                              ? `${cat.color_hex || 'var(--accent)'}12`
                              : 'var(--card-bg)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            textAlign: 'left',
                          }}
                        >
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: `${cat.color_hex || 'var(--accent)'}20`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {selected
                              ? <Check size={16} style={{ color: cat.color_hex || 'var(--amber)' }} />
                              : <span style={{ fontSize: '16px' }}>{cat.icon_emoji || '🔧'}</span>
                            }
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <span style={{
                              fontSize: '12px',
                              fontWeight: selected ? 600 : 400,
                              color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                              display: 'block',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {cat.name}
                            </span>
                            <span style={{
                              fontSize: '12px',
                              color: cat.mode === 'instant' ? 'var(--instant)' : cat.mode === 'discovery' ? 'var(--discovery)' : '#94A3B8',
                              fontWeight: 500,
                            }}>
                              {cat.mode === 'instant' ? '⚡ Instant' : cat.mode === 'discovery' ? '🔍 Discovery' : '⚡🔍 Both'}
                            </span>
                          </div>
                        </motion.button>
                      )
                    })}
                  </div>
                )}

                {selectedCats.length > 0 && (
                  <p className="text-xs mt-3 text-center" style={{ color: 'var(--text-muted)' }}>
                    {selectedCats.length} selected
                  </p>
                )}
              </GlassCard>
            </motion.div>
          )}

          {/* ── STEP 3: Documents ── */}
          {step === 'documents' && (
            <motion.div
              key="documents"
              custom={direction}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="space-y-4"
            >
              <GlassCard className="p-5">
                <div className="mb-4">
                  <h2 className="text-base font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
                    Identity verification
                  </h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Required for account approval. Kept secure and private.
                  </p>
                </div>

                <div className="mb-4">
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Document type
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {DOC_TYPES.map(dt => (
                      <motion.button
                        key={dt.value}
                        onClick={() => setDocType(dt.value)}
                        whileTap={{ scale: 0.96 }}
                        style={{
                          padding: '9px 12px', borderRadius: '10px',
                          width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box',
                          border: docType === dt.value
                            ? '1.5px solid var(--azure)'
                            : '1px solid var(--card-border)',
                          background: docType === dt.value
                            ? 'rgba(59,130,246,0.10)'
                            : 'var(--card-bg)',
                          color: docType === dt.value ? 'var(--azure)' : 'var(--text-secondary)',
                          fontSize: '13px',
                          fontWeight: docType === dt.value ? 600 : 400,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          textAlign: 'left',
                        }}
                      >
                        {dt.label}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <input
                  ref={docInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={e => { uploadDocument(e.target.files[0]); e.target.value = '' }}
                />
                <motion.button
                  onClick={() => docInputRef.current?.click()}
                  disabled={docUploading}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    width: '100%', padding: '20px', borderRadius: '12px',
                    border: '1.5px dashed var(--card-border)',
                    background: 'var(--card-bg)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                    cursor: docUploading ? 'not-allowed' : 'pointer',
                    opacity: docUploading ? 0.7 : 1,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {docUploading
                    ? <Loader2 size={24} className="animate-spin" style={{ color: 'var(--amber)' }} />
                    : <Upload size={24} style={{ color: 'var(--text-muted)' }} />
                  }
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {docUploading ? 'Uploading…' : `Upload ${DOC_TYPES.find(d => d.value === docType)?.label}`}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                    JPG, PNG or PDF · Max 10MB
                  </span>
                </motion.button>
              </GlassCard>

              {uploadedDocs.length > 0 && (
                <GlassCard className="p-5">
                  <h3 className="text-sm font-semibold mb-3 font-syne" style={{ color: 'var(--text-primary)' }}>
                    Uploaded ({uploadedDocs.length})
                  </h3>
                  <div className="space-y-2">
                    {uploadedDocs.map((doc, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 12px', borderRadius: '10px',
                        background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                      }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          background: 'rgba(34,197,94,0.12)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <Check size={16} style={{ color: 'var(--emerald)' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {doc.filename}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {DOC_TYPES.find(d => d.value === doc.type)?.label}
                          </p>
                        </div>
                        <button
                          onClick={() => removeDoc(i)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                        >
                          <X size={14} style={{ color: 'var(--text-muted)' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}

              <div className="flex items-start gap-2 p-3 rounded-xl"
                style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <AlertCircle size={13} style={{ color: 'var(--azure)', flexShrink: 0, marginTop: '1px' }} />
                <p className="text-xs" style={{ color: 'var(--azure)', lineHeight: '1.5' }}>
                  Documents are reviewed by our team within 24 hours. You can start setting up your profile now.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── STEP 4: Intro Video ── */}
          {step === 'video' && (
            <motion.div
              key="video"
              custom={direction}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="space-y-4"
            >
              <GlassCard className="p-5">
                <div className="mb-5">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '10px',
                      background: 'rgba(34,197,94,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Video size={18} style={{ color: '#22C55E' }} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
                        Intro video
                      </h2>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Recommended · 30–90 seconds</p>
                    </div>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    Introduce yourself, describe your skills, and tell clients why they should hire you.
                    Workers with a video get <strong style={{ color: 'var(--text-primary)' }}>3× more bookings</strong>.
                  </p>
                </div>

                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  onChange={e => { uploadVerificationVideo(e.target.files[0]); e.target.value = '' }}
                />

                {videoUploaded ? (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                      padding: '16px', borderRadius: '14px',
                      background: 'rgba(34,197,94,0.08)',
                      border: '1.5px solid rgba(34,197,94,0.25)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '48px', height: '48px', borderRadius: '12px', flexShrink: 0,
                        background: 'rgba(34,197,94,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Play size={20} style={{ color: '#22C55E', marginLeft: '2px' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {videoUploaded.filename}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: '#86efac' }}>
                          {(videoUploaded.size / (1024 * 1024)).toFixed(1)} MB · Uploaded successfully
                        </p>
                      </div>
                      <button
                        onClick={() => setVideoUploaded(null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}
                      >
                        <X size={16} style={{ color: 'var(--text-muted)' }} />
                      </button>
                    </div>
                    <button
                      onClick={() => videoInputRef.current?.click()}
                      className="text-xs mt-3"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#86efac', textDecoration: 'underline', padding: 0,
                      }}
                    >
                      Replace video
                    </button>
                  </motion.div>
                ) : (
                  <motion.button
                    onClick={() => !videoUploading && videoInputRef.current?.click()}
                    whileTap={!videoUploading ? { scale: 0.97 } : {}}
                    style={{
                      width: '100%', padding: '32px 20px', borderRadius: '14px',
                      border: videoUploading
                        ? '1.5px dashed rgba(34,197,94,0.5)'
                        : '1.5px dashed rgba(34,197,94,0.3)',
                      background: videoUploading
                        ? 'rgba(34,197,94,0.06)'
                        : 'rgba(34,197,94,0.03)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
                      cursor: videoUploading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {videoUploading ? (
                      <>
                        <Loader2 size={32} className="animate-spin" style={{ color: '#22C55E' }} />
                        <div style={{ textAlign: 'center' }}>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Uploading…
                          </p>
                          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                            This may take a moment for large files
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{
                          width: '56px', height: '56px', borderRadius: '16px',
                          background: 'rgba(34,197,94,0.12)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Video size={28} style={{ color: '#22C55E' }} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            Tap to upload your intro video
                          </p>
                          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                            MP4, MOV or WebM · Max 200MB
                          </p>
                        </div>
                      </>
                    )}
                  </motion.button>
                )}
              </GlassCard>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '12px 14px', borderRadius: '12px',
                background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <AlertCircle size={13} style={{ color: '#4ade80', flexShrink: 0, marginTop: '1px' }} />
                <p className="text-xs" style={{ color: '#86efac', lineHeight: '1.6' }}>
                  Your video is reviewed privately by Kaargar staff and never shared publicly.
                  You can skip this now and add it later from your dashboard.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── STEP 5: Area ── */}
          {step === 'area' && (
            <motion.div
              key="area"
              custom={direction}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="space-y-4"
            >
              <div style={{ position: 'relative', zIndex: 50 }}>
                <GlassCard className="p-5 space-y-4" style={{ overflow: 'visible' }}>
                  <div>
                    <h2 className="text-base font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
                      Your service area
                    </h2>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Where are you based? You'll receive jobs near this area.
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Pune area
                    </p>
                    <AreaPicker
                      value={selectedArea}
                      onChange={v => { setSelectedArea(v); setErrors(e => ({ ...e, area: '' })) }}
                      error={errors.area}
                    />
                    {errors.area && (
                      <p className="text-xs mt-1.5" style={{ color: '#f87171' }}>{errors.area}</p>
                    )}
                  </div>
                </GlassCard>
              </div>

              <div style={{ position: 'relative', zIndex: 10 }}>
                <GlassCard className="p-5">
                  <h3 className="text-sm font-semibold mb-3 font-syne" style={{ color: 'var(--text-primary)' }}>
                    Service radius
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                    {RADIUS_OPTIONS.map(opt => (
                      <motion.button
                        key={opt.value}
                        onClick={() => setRadius(opt.value)}
                        whileTap={{ scale: 0.94 }}
                        style={{
                          padding: '10px 6px', borderRadius: '10px',
                          width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box',
                          border: radius === opt.value
                            ? '1.5px solid var(--amber)'
                            : '1px solid var(--card-border)',
                          background: radius === opt.value
                            ? 'var(--accent-deep)'
                            : 'var(--card-bg)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                          cursor: 'pointer', transition: 'all 0.15s ease'
                        }}
                      >
                        <span style={{
                          fontSize: '13px', fontWeight: radius === opt.value ? 700 : 500,
                          color: radius === opt.value ? 'var(--amber)' : 'var(--text-primary)'
                        }}>
                          {opt.label}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </GlassCard>
              </div>
            </motion.div>
          )}

          {/* ── STEP 6: Schedule ── */}
          {step === 'schedule' && (
            <motion.div
              key="schedule"
              custom={direction}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
                  When do you work?
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Set your regular working hours. You can update this anytime from your dashboard.
                </p>
              </div>

              <GlassCard className="p-4 space-y-2">
                {schedule.map((day, i) => (
                  <div key={i} style={{
                    borderRadius: 12,
                    padding: '10px 12px',
                    background: day.enabled ? 'var(--accent-card)' : 'transparent',
                    border: day.enabled ? '1px solid var(--accent-mid)' : '1px solid var(--card-border)',
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        onClick={() => toggleDay(i)}
                        style={{
                          width: 40, height: 22, borderRadius: 11, flexShrink: 0,
                          background: day.enabled ? 'var(--accent)' : 'var(--g-bg-mid)',
                          border: `1px solid ${day.enabled ? 'var(--accent)' : 'var(--g-border)'}`,
                          position: 'relative', cursor: 'pointer', transition: 'all 0.2s',
                        }}>
                        <div style={{
                          position: 'absolute', top: 2,
                          left: day.enabled ? 20 : 2,
                          width: 16, height: 16, borderRadius: '50%',
                          background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                          transition: 'left 0.2s',
                        }} />
                      </button>
                      <span style={{
                        fontSize: 14, fontWeight: 600, flex: 1,
                        color: day.enabled ? 'var(--accent)' : 'var(--text-muted)',
                      }}>
                        {DAYS[i]}
                      </span>
                      {day.enabled && (
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                          {to12h(day.start_time)} – {to12h(day.end_time)}
                        </span>
                      )}
                      {!day.enabled && (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Off</span>
                      )}
                    </div>

                    {day.enabled && (
                      <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>From</p>
                          <GlassSelect
                            size="sm"
                            value={day.start_time}
                            onChange={v => setDayTime(i, 'start_time', v)}
                            options={TIME_OPTS.map(t => ({ value: t, label: to12h(t) }))}
                          />
                        </div>
                        <div style={{ paddingTop: 18, color: 'var(--text-muted)', fontSize: 14 }}>—</div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>To</p>
                          <GlassSelect
                            size="sm"
                            value={day.end_time}
                            onChange={v => setDayTime(i, 'end_time', v)}
                            options={TIME_OPTS.filter(t => t > day.start_time).map(t => ({ value: t, label: to12h(t) }))}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </GlassCard>
            </motion.div>
          )}

          {/* ── STEP 7: Publish ── */}
          {step === 'publish' && (
            <motion.div
              key="publish"
              custom={direction}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="space-y-4"
            >
              <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                <div style={{
                  width: '64px', height: '64px', borderRadius: '20px', margin: '0 auto 16px',
                  background: 'var(--accent-bg)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Rocket size={30} style={{ color: 'var(--brand)' }} />
                </div>
                <h2 className="text-xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
                  Ready to go live?
                </h2>
                <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                  Review your details, then launch your profile.
                </p>
              </div>

              <GlassCard className="p-4 space-y-3">
                {[
                  { label: 'Bio', value: bio ? bio.slice(0, 60) + (bio.length > 60 ? '…' : '') : 'Not set', ok: !!bio },
                  { label: 'Categories', value: selectedCats.length > 0 ? selectedCats.map(c => c.name).join(', ') : 'None selected', ok: selectedCats.length > 0 },
                  { label: 'Documents', value: uploadedDocs.length > 0 ? `${uploadedDocs.length} uploaded` : 'None uploaded', ok: uploadedDocs.length > 0 },
                  { label: 'Intro video', value: videoUploaded ? videoUploaded.filename.slice(0, 30) : 'Not uploaded (recommended)', ok: !!videoUploaded },
                  { label: 'Area', value: selectedArea || 'Not selected', ok: !!selectedArea },
                  { label: 'Working days', value: schedule.filter(d => d.enabled).map(d => DAYS[d.day_of_week]).join(', ') || 'None', ok: schedule.some(d => d.enabled) },
                ].map(row => (
                  <div key={row.label} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                    padding: '10px 12px', borderRadius: '10px',
                    background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                  }}>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0, marginTop: '1px',
                      background: row.ok ? 'rgba(34,197,94,0.12)' : 'var(--accent-deep)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {row.ok
                        ? <Check size={11} style={{ color: '#22C55E' }} />
                        : <AlertCircle size={11} style={{ color: 'var(--accent)' }} />
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{row.label}</p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: row.ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {row.value}
                      </p>
                    </div>
                  </div>
                ))}
              </GlassCard>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '12px 14px', borderRadius: '12px',
                background: 'var(--accent-bg-sm)', border: '1px solid var(--accent-border)' }}>
                <AlertCircle size={13} style={{ color: 'var(--brand)', flexShrink: 0, marginTop: '1px' }} />
                <p className="text-xs" style={{ color: 'var(--brand)', lineHeight: '1.6' }}>
                  Your profile will be submitted for review. You can start receiving jobs once approved (usually within 24 hours).
                </p>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
        </div>

        {/* Navigation — pinned, always visible */}
        <div className="shrink-0" style={{ display: 'flex', gap: 12, padding: '14px 0' }}>
          {stepIdx > 0 && (
            <GlassButton variant="ghost" size="lg" style={{ flex: 1 }} onClick={prevStep}>
              Back
            </GlassButton>
          )}
          <GlassButton
            variant={step === 'publish' ? 'instant' : 'brand'}
            size="lg"
            style={{ flex: 2 }}
            loading={loading}
            onClick={step === 'publish' ? publishProfile : handleNext}
          >
            {step === 'publish'
              ? (loading ? 'Publishing…' : '🚀 Launch Profile')
              : step === 'video' && !videoUploaded
                ? 'Skip for now'
                : 'Continue'
            }
          </GlassButton>
        </div>
      </div>
    </div>
  )
}
