import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, ChevronDown, Zap, Compass } from 'lucide-react'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { ModeToggle } from '@/components/kaargar/ModeToggle'
import { CategoryGrid } from '@/components/kaargar/CategoryGrid'
import { SearchBar } from '@/components/kaargar/SearchBar'
import { WorkerCard } from '@/components/kaargar/WorkerCard'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategories } from '@/hooks/useCategories'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PUNE_AREAS } from '@/lib/utils'

function AreaPicker({ selectedArea, onSelect }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-light hover:bg-white/8 transition-colors"
      >
        <MapPin size={13} className="text-brand" />
        <span className="text-sm font-medium text-[--text-primary]">{selectedArea || 'Select area'}</span>
        <ChevronDown size={13} className="text-[--text-muted]" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-2 left-0 glass-strong rounded-2xl py-2 z-50 w-56 shadow-xl max-h-72 overflow-y-auto"
          >
            {PUNE_AREAS.map((area) => (
              <button
                key={area}
                onClick={() => { onSelect(area); setOpen(false) }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-white/5 ${
                  selectedArea === area ? 'text-brand font-medium' : 'text-[--text-secondary]'
                }`}
              >
                {area}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function InstantContent({ onCategorySelect }) {
  const { data: categories = [], isLoading } = useCategories('instant')

  return (
    <motion.div
      key="instant"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Zap size={14} className="text-instant" />
          <span className="text-xs font-semibold text-instant uppercase tracking-wider">Instant</span>
        </div>
        <h2 className="text-2xl font-syne font-bold text-[--text-primary]">Need someone <span className="text-instant">right now?</span></h2>
        <p className="text-sm text-[--text-muted] mt-1">Worker reaches you in 30–60 min</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
        </div>
      ) : (
        <CategoryGrid categories={categories} onSelect={onCategorySelect} accent="instant" />
      )}
    </motion.div>
  )
}

function DiscoveryContent() {
  const { data: recommendations = [], isLoading } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => api.get('/search/recommendations').then(r => r.data),
  })

  return (
    <motion.div
      key="discovery"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Compass size={14} className="text-discovery" />
          <span className="text-xs font-semibold text-discovery uppercase tracking-wider">Discover</span>
        </div>
        <h2 className="text-2xl font-syne font-bold text-[--text-primary]">Find the <span className="text-discovery">best pros</span></h2>
        <p className="text-sm text-[--text-muted] mt-1">Browse, compare, and book with confidence</p>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)
        ) : recommendations.length > 0 ? (
          recommendations.map((worker) => (
            <WorkerCard key={worker.id} worker={worker} />
          ))
        ) : (
          <div className="glass-light rounded-2xl p-8 text-center">
            <Compass size={32} className="text-[--text-muted] mx-auto mb-3" />
            <p className="text-sm text-[--text-muted]">Search for services above to get started</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const { mode, selectedArea, setArea } = useAppStore()
  const { user } = useAuthStore()

  const handleCategorySelect = (category) => {
    navigate('/job/new', { state: { category } })
  }

  const handleSearch = (query) => {
    if (mode === 'instant') {
      navigate('/job/new', { state: { query } })
    } else {
      navigate(`/discover?q=${encodeURIComponent(query)}`)
    }
  }

  return (
    <div className="relative min-h-full">
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <AnimatePresence mode="wait">
          {mode === 'instant' ? (
            <motion.div
              key="instant-glow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-instant/8 blur-[100px]"
            />
          ) : (
            <motion.div
              key="discovery-glow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-discovery/8 blur-[100px]"
            />
          )}
        </AnimatePresence>
      </div>

      <div className="relative px-4 pt-4 pb-4 space-y-5">
        {/* Greeting + area */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[--text-muted] text-xs">Good {getGreeting()}</p>
            <p className="font-syne font-semibold text-[--text-primary]">{user?.full_name?.split(' ')[0] || 'there'}</p>
          </div>
          <AreaPicker selectedArea={selectedArea} onSelect={setArea} />
        </div>

        {/* Search */}
        <SearchBar onSearch={handleSearch} mode={mode} />

        {/* Mode-specific content */}
        <AnimatePresence mode="wait">
          {mode === 'instant' ? (
            <InstantContent key="instant" onCategorySelect={handleCategorySelect} />
          ) : (
            <DiscoveryContent key="discovery" />
          )}
        </AnimatePresence>

        {/* Spacer for floating pill + bottom nav */}
        <div className="h-28" />
      </div>

      {/* Floating mode toggle */}
      <ModeToggle />
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
