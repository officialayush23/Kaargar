import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, User, Tag, FileText,
  MapPin, Rocket, Upload, X, Check, Loader2,
  IndianRupee, Clock, AlertCircle, Search,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Background } from '@/components/glass/Background'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput, GlassTextarea } from '@/components/glass/GlassInput'
import { api } from '@/lib/api'
import { PUNE_AREAS } from '@/lib/utils'
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

const STEPS = ['bio', 'categories', 'documents', 'area', 'publish']
const STEP_META = [
  { icon: User,     label: 'Bio',        desc: 'Your story' },
  { icon: Tag,      label: 'Categories', desc: 'Your skills' },
  { icon: FileText, label: 'Documents',  desc: 'Identity' },
  { icon: MapPin,   label: 'Area',       desc: 'Service zone' },
  { icon: Rocket,   label: 'Publish',    desc: 'Go live' },
]

// ── Area search popover ────────────────────────────────────
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
    <div ref={containerRef} style={{ position: 'relative' }}>
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
              zIndex: 50,
              borderRadius: '14px',
              background: 'var(--g-bg-mid)',
              backdropFilter: 'blur(24px) saturate(180%)',
              border: '1px solid var(--g-border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              overflow: 'hidden',
            }}
          >
            {/* Search input */}
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

            {/* Options list */}
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
                    background: value === area ? 'rgba(245,158,11,0.15)' : 'transparent',
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

// ── Main page ──────────────────────────────────────────────
export default function WorkerOnboardPage() {
  const navigate = useNavigate()
  const [stepIdx, setStepIdx] = useState(0)
  const [prevIdx, setPrevIdx] = useState(0)

  // ── Step 1: Bio ───────────────────────────────────────────
  const [bio, setBio] = useState('')
  const [yearsExp, setYearsExp] = useState('')
  const [minRate, setMinRate] = useState('')
  const [maxRate, setMaxRate] = useState('')

  // ── Step 2: Categories ────────────────────────────────────
  const [selectedCats, setSelectedCats] = useState([])

  // ── Step 3: Documents ─────────────────────────────────────
  // Each doc: { url, path, type, filename }
  const [uploadedDocs, setUploadedDocs] = useState([])
  const [docType, setDocType] = useState('aadhaar')
  const [docUploading, setDocUploading] = useState(false)
  const docInputRef = useRef()

  // ── Step 4: Area ──────────────────────────────────────────
  const [selectedArea, setSelectedArea] = useState('')
  const [radius, setRadius] = useState(5)

  // ── Global ────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const direction = stepIdx >= prevIdx ? 1 : -1
  function goTo(i) { setPrevIdx(stepIdx); setStepIdx(i) }
  function nextStep() { goTo(stepIdx + 1) }
  function prevStep() { goTo(stepIdx - 1) }
  const step = STEPS[stepIdx]

  // Fetch categories
  const { data: categories = [], isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await api.get('/categories?mode=both')
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

  // Upload doc → /upload/document → get URL back (no WorkerProfile needed)
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
      toast.error(e.response?.data?.detail || 'Upload failed')
    } finally {
      setDocUploading(false)
    }
  }

  function removeDoc(idx) {
    setUploadedDocs(prev => prev.filter((_, i) => i !== idx))
  }

  // Validation per step
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
      // 1. Create worker profile — only send WorkerProfileCreate fields
      await api.post('/workers/profile', {
        bio: bio.trim() || undefined,
        experience_years: yearsExp ? Number(yearsExp) : 0,
        pune_area: selectedArea,
        service_radius_km: radius,
        category_ids: selectedCats.map(c => c.id),
      })

      // 2. Register each uploaded document (now WorkerProfile exists)
      for (const doc of uploadedDocs) {
        try {
          await api.post('/workers/documents', {
            type: doc.type,
            cloudinary_url: doc.url,   // field name in DB (stores Supabase URL)
            cloudinary_id: doc.path,   // field name in DB (stores Supabase path)
          })
        } catch (_) {
          // Non-fatal — docs can be uploaded later
        }
      }

      // 3. Save rate range if provided
      if (minRate || maxRate) {
        try {
          await api.patch('/workers/profile', {
            min_rate: minRate ? Number(minRate) : undefined,
            max_rate: maxRate ? Number(maxRate) : undefined,
          })
        } catch (_) {}
      }

      toast.success('Profile published! Welcome to Kaargar.')
      navigate('/worker')
    } catch (e) {
      const detail = e.response?.data?.detail
      if (detail === 'Worker profile already exists') {
        toast.info('Profile already exists — redirecting to dashboard.')
        navigate('/worker')
      } else {
        toast.error(detail || 'Failed to publish profile. Try again.')
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
    <div className="min-h-screen relative" style={{ background: 'var(--page-bg)' }}>
      <Background />

      <div className="max-w-sm mx-auto px-4 py-6 pb-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
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
        <div className="flex items-center gap-1.5 mb-6">
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
                  fontSize: '9px',
                  color: isActive ? 'var(--amber)' : isDone ? 'var(--text-secondary)' : 'var(--text-muted)',
                  fontWeight: isActive ? 600 : 400,
                }}>
                  {s.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Step content */}
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
              <GlassCard className="p-5 space-y-4">
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
              </GlassCard>

              <GlassCard className="p-5 space-y-4">
                <h3 className="text-sm font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>
                  Rate range <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <GlassInput
                    label="Min (₹/hr)"
                    placeholder="300"
                    type="number"
                    min="0"
                    value={minRate}
                    onChange={e => setMinRate(e.target.value)}
                    icon={IndianRupee}
                  />
                  <GlassInput
                    label="Max (₹/hr)"
                    placeholder="800"
                    type="number"
                    min="0"
                    value={maxRate}
                    onChange={e => setMaxRate(e.target.value)}
                    icon={IndianRupee}
                  />
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
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
                            border: selected
                              ? `1.5px solid ${cat.color_hex || 'var(--amber)'}`
                              : '1px solid var(--card-border)',
                            background: selected
                              ? `${cat.color_hex || '#F59E0B'}12`
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
                            background: `${cat.color_hex || '#F59E0B'}20`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {selected
                              ? <Check size={16} style={{ color: cat.color_hex || 'var(--amber)' }} />
                              : <span style={{ fontSize: '16px' }}>🔧</span>
                            }
                          </div>
                          <span style={{
                            fontSize: '12px',
                            fontWeight: selected ? 600 : 400,
                            color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {cat.name}
                          </span>
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

                {/* Doc type selector */}
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
                          border: docType === dt.value
                            ? '1.5px solid var(--azure)'
                            : '1px solid var(--card-border)',
                          background: docType === dt.value
                            ? 'rgba(59,130,246,0.10)'
                            : 'var(--card-bg)',
                          color: docType === dt.value ? 'var(--azure)' : 'var(--text-secondary)',
                          fontSize: '11px',
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

                {/* Upload area */}
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

              {/* Uploaded docs list */}
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

          {/* ── STEP 4: Area ── */}
          {step === 'area' && (
            <motion.div
              key="area"
              custom={direction}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="space-y-4"
            >
              <GlassCard className="p-5 space-y-4">
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

              {/* Radius */}
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
                        border: radius === opt.value
                          ? '1.5px solid var(--amber)'
                          : '1px solid var(--card-border)',
                        background: radius === opt.value
                          ? 'rgba(245,158,11,0.12)'
                          : 'var(--card-bg)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                        cursor: 'pointer', transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{
                        fontSize: '12px', fontWeight: 700,
                        color: radius === opt.value ? 'var(--amber)' : 'var(--text-primary)',
                      }}>
                        {opt.label}
                      </span>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                        {opt.desc}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* ── STEP 5: Publish ── */}
          {step === 'publish' && (
            <motion.div
              key="publish"
              custom={direction}
              variants={slideVariants}
              initial="enter" animate="center" exit="exit"
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="space-y-4"
            >
              <div className="text-center pt-2 pb-4">
                <div style={{
                  width: '72px', height: '72px', borderRadius: '20px',
                  background: 'rgba(245,158,11,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                  boxShadow: '0 0 32px rgba(245,158,11,0.25)',
                }}>
                  <Rocket size={32} style={{ color: 'var(--amber)' }} />
                </div>
                <h2 className="text-xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
                  Ready to launch!
                </h2>
                <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                  Review your profile before going live
                </p>
              </div>

              <GlassCard className="p-5 space-y-4">
                {[
                  { label: 'Bio', value: bio || 'Not set', colored: !!bio },
                  { label: 'Experience', value: yearsExp ? `${yearsExp} years` : 'Not specified', colored: !!yearsExp },
                  { label: 'Rate', value: minRate && maxRate ? `₹${minRate}–₹${maxRate}/hr` : minRate ? `From ₹${minRate}/hr` : 'Not set', colored: !!minRate },
                  { label: 'Categories', value: selectedCats.length ? selectedCats.map(c => c.name).join(', ') : 'None selected', colored: selectedCats.length > 0 },
                  { label: 'Documents', value: uploadedDocs.length ? `${uploadedDocs.length} uploaded` : 'Skipped (can add later)', colored: uploadedDocs.length > 0 },
                  { label: 'Area', value: selectedArea ? `${selectedArea} · ${radius} km radius` : 'Not set', colored: !!selectedArea },
                ].map(({ label, value, colored }) => (
                  <div key={label} style={{
                    display: 'flex', gap: '12px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid var(--card-border)',
                  }}>
                    <span style={{ minWidth: '90px', fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {label}
                    </span>
                    <span style={{
                      fontSize: '12px',
                      color: colored ? 'var(--text-primary)' : 'var(--text-muted)',
                      flex: 1, wordBreak: 'break-word', lineHeight: '1.5',
                    }}>
                      {value}
                    </span>
                  </div>
                ))}
              </GlassCard>

              <div className="flex items-start gap-2 p-3 rounded-xl"
                style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <Check size={13} style={{ color: 'var(--emerald)', flexShrink: 0, marginTop: '1px' }} />
                <p className="text-xs" style={{ color: 'var(--emerald)', lineHeight: '1.5' }}>
                  Your profile will be submitted for review. Once approved, you can go online and start accepting jobs.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA */}
        <div className="mt-6 space-y-3">
          {step !== 'publish' ? (
            <GlassButton
              variant="brand"
              size="lg"
              className="w-full"
              onClick={handleNext}
              icon={ChevronRight}
              iconPosition="right"
            >
              {step === 'documents' ? 'Continue (docs optional)' : 'Continue'}
            </GlassButton>
          ) : (
            <GlassButton
              variant="discovery"
              size="lg"
              className="w-full"
              loading={loading}
              onClick={publishProfile}
              icon={Rocket}
              iconPosition="left"
            >
              Publish Profile
            </GlassButton>
          )}

          {step === 'documents' && uploadedDocs.length === 0 && (
            <button
              onClick={nextStep}
              className="w-full text-center text-sm py-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
