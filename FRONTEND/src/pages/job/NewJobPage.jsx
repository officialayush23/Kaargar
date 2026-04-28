import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, MapPin, ChevronRight, Loader2, FileText } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/app'
import { useCategories } from '@/hooks/useCategories'
import { PUNE_AREAS } from '@/lib/utils'
import { toast } from 'sonner'

const PUNE_AREA_COORDS = {
  'Hinjewadi': [18.5912, 73.7389],
  'Kothrud': [18.5074, 73.8077],
  'Aundh': [18.5590, 73.8076],
  'Baner': [18.5590, 73.7847],
  'Wakad': [18.5983, 73.7612],
  'Pimpri-Chinchwad': [18.6298, 73.7997],
  'Hadapsar': [18.5089, 73.9260],
  'Kharadi': [18.5512, 73.9420],
  'Viman Nagar': [18.5679, 73.9143],
  'Kalyani Nagar': [18.5457, 73.9015],
  'Koregaon Park': [18.5362, 73.8939],
  'Camp': [18.5195, 73.8769],
  'Shivajinagar': [18.5308, 73.8474],
  'Deccan': [18.5156, 73.8413],
  'Katraj': [18.4528, 73.8680],
  'Kondhwa': [18.4734, 73.8864],
  'Magarpatta': [18.5143, 73.9290],
  'Sinhagad Road': [18.4721, 73.8074],
  'Warje': [18.4862, 73.8007],
  'Bavdhan': [18.5180, 73.7762],
}

export default function NewJobPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { mode, selectedArea } = useAppStore()

  const preselectedCategory = location.state?.category || null

  const [step, setStep] = useState(preselectedCategory ? 'location' : 'category')
  const [selectedCategory, setSelectedCategory] = useState(preselectedCategory)
  const [selectedLoc, setSelectedLoc] = useState(selectedArea || null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: categories = [], isLoading } = useCategories(mode)

  const handleSelectCategory = (cat) => {
    setSelectedCategory(cat)
    setStep('location')
  }

  const handleSubmit = async () => {
    if (!selectedCategory || !selectedLoc) return
    const coords = PUNE_AREA_COORDS[selectedLoc] || [18.5204, 73.8567]

    setLoading(true)
    try {
      const { data: job } = await api.post('/jobs', {
        category_id: selectedCategory.id,
        job_type: mode,
        location_lat: coords[0],
        location_lon: coords[1],
        location_address: selectedLoc + ', Pune',
        description: description.trim() || undefined,
      })
      navigate(mode === 'instant' ? `/job/${job.id}/searching` : `/job/${job.id}/active`)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to create job')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[--bg-base] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 glass border-b border-white/5 flex items-center gap-3 px-4 py-4">
        <button onClick={() => step === 'category' ? navigate(-1) : setStep('category')} className="p-1.5 rounded-xl hover:bg-white/5">
          <ArrowLeft size={20} className="text-[--text-secondary]" />
        </button>
        <h1 className="font-syne font-bold text-[--text-primary]">
          {step === 'category' ? 'Choose service' : step === 'location' ? 'Where?' : 'Confirm'}
        </h1>
      </div>

      <div className="flex-1 px-4 pt-5 pb-32 space-y-4">
        {step === 'category' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            {isLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="glass-light rounded-2xl aspect-[4/3] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleSelectCategory(cat)}
                    className="glass-light rounded-2xl p-4 flex flex-col items-center gap-2 hover:border-brand/30 transition-all active:scale-95 border border-transparent"
                  >
                    <span className="text-2xl">{cat.icon || '🔧'}</span>
                    <span className="text-xs font-medium text-[--text-secondary] text-center leading-tight">{cat.name}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {step === 'location' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Selected category */}
            {selectedCategory && (
              <div className="glass-light rounded-2xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{selectedCategory.icon || '🔧'}</span>
                  <span className="text-sm font-medium text-[--text-primary]">{selectedCategory.name}</span>
                </div>
                <button onClick={() => setStep('category')} className="text-xs text-brand">Change</button>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider mb-3">
                Select your area
              </p>
              <div className="grid grid-cols-2 gap-2">
                {PUNE_AREAS.map((area) => (
                  <button
                    key={area}
                    onClick={() => setSelectedLoc(area)}
                    className={`py-3 px-4 rounded-xl text-sm font-medium transition-all text-left ${
                      selectedLoc === area
                        ? 'bg-brand/15 border border-brand/30 text-brand'
                        : 'glass-light text-[--text-secondary] hover:bg-white/5'
                    }`}
                  >
                    <MapPin size={12} className="inline mr-1.5 opacity-60" />
                    {area}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional description */}
            <div>
              <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider mb-2">
                Describe the work <span className="text-[--text-muted] font-normal normal-case">(optional)</span>
              </p>
              <div className="relative">
                <FileText size={15} className="absolute left-3.5 top-3.5 text-[--text-muted]" />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Need to fix a leaking tap in the kitchen..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none focus:border-brand/50 resize-none transition-all"
                />
              </div>
            </div>

            <button
              onClick={() => setStep('confirm')}
              disabled={!selectedLoc}
              className="w-full btn-brand py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              Continue <ChevronRight size={18} />
            </button>
          </motion.div>
        )}

        {step === 'confirm' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="glass rounded-2xl p-5 space-y-4">
              <h3 className="font-syne font-bold text-lg text-[--text-primary]">Order summary</h3>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[--text-muted]">Service</span>
                  <span className="text-sm font-medium text-[--text-primary]">{selectedCategory?.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[--text-muted]">Location</span>
                  <span className="text-sm font-medium text-[--text-primary]">{selectedLoc}, Pune</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[--text-muted]">Mode</span>
                  <span className={`text-sm font-medium capitalize ${mode === 'instant' ? 'text-instant' : 'text-discovery'}`}>{mode}</span>
                </div>
                {description && (
                  <div>
                    <span className="text-sm text-[--text-muted]">Notes</span>
                    <p className="text-sm text-[--text-secondary] mt-1">{description}</p>
                  </div>
                )}
              </div>
            </div>

            {mode === 'instant' && (
              <div className="glass-light rounded-2xl p-4 border border-instant/15">
                <p className="text-xs text-instant font-semibold">⚡ Instant mode</p>
                <p className="text-sm text-[--text-secondary] mt-1">We'll find you a worker nearby. Payment after job completion.</p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full btn-brand py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : mode === 'instant' ? '⚡ Find worker now' : 'Book service'}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
