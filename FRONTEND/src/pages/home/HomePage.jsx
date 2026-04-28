import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Compass, Search, TrendingUp, Clock, Star } from 'lucide-react'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { ModeToggle } from '@/components/kaargar/ModeToggle'
import { CategoryGrid } from '@/components/kaargar/CategoryGrid'
import { WorkerCard } from '@/components/kaargar/WorkerCard'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassInput } from '@/components/glass/GlassInput'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategories } from '@/hooks/useCategories'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function QuickStat({ icon: Icon, label, value, color }) {
  return (
    <GlassCard className="flex items-center gap-3 p-3.5">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div>
        <p className="text-[11px] text-white/40">{label}</p>
        <p className="text-sm font-semibold text-white/90 font-mono">{value}</p>
      </div>
    </GlassCard>
  )
}

function InstantContent({ onCategorySelect, onSearch }) {
  const { data: categories = [], isLoading } = useCategories('instant')

  return (
    <motion.div
      key="instant"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="space-y-6"
    >
      {/* Hero */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-semibold text-emerald-400 tracking-wide uppercase">Instant</span>
          </div>
        </div>
        <h1 className="text-3xl font-bold font-syne gradient-text-hero leading-tight">
          Need someone<br />
          <span className="text-emerald-400">right now?</span>
        </h1>
        <p className="text-sm text-white/40">Worker at your door in 30–60 min</p>
      </div>

      {/* Search */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 glass rounded-xl border border-white/10 text-left"
        onClick={() => onSearch('')}
      >
        <Search className="h-4 w-4 text-white/30 shrink-0" />
        <span className="text-sm text-white/30">What do you need help with?</span>
      </button>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <QuickStat icon={TrendingUp} label="Online now" value="24+" color="bg-azure/70" />
        <QuickStat icon={Clock}      label="Avg. ETA"   value="38m"  color="bg-emerald-500/70" />
        <QuickStat icon={Star}       label="Avg. rating" value="4.8" color="bg-amber-500/70" />
      </div>

      {/* Category grid */}
      <div>
        <h3 className="text-xs text-white/40 uppercase tracking-widest mb-3 font-medium">
          Pick a service
        </h3>
        {isLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : (
          <CategoryGrid categories={categories} onSelect={onCategorySelect} accent="instant" />
        )}
      </div>
    </motion.div>
  )
}

function DiscoveryContent({ onSearch }) {
  const { data: recommendations = [], isLoading } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => api.get('/search/recommendations').then(r => r.data).catch(() => []),
    staleTime: 5 * 60_000,
  })

  return (
    <motion.div
      key="discovery"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className="space-y-6"
    >
      {/* Hero */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/25">
            <Compass className="h-3 w-3 text-amber-400" />
            <span className="text-[11px] font-semibold text-amber-400 tracking-wide uppercase">Discover</span>
          </div>
        </div>
        <h1 className="text-3xl font-bold font-syne gradient-text-hero leading-tight">
          Find the<br />
          <span className="text-amber-400">best pros</span>
        </h1>
        <p className="text-sm text-white/40">Browse portfolios, compare, and book</p>
      </div>

      {/* Search */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 glass rounded-xl border border-white/10 text-left"
        onClick={() => onSearch('')}
      >
        <Search className="h-4 w-4 text-white/30 shrink-0" />
        <span className="text-sm text-white/30">Search plumbers, electricians…</span>
      </button>

      {/* Recommendations */}
      <div>
        <h3 className="text-xs text-white/40 uppercase tracking-widest mb-3 font-medium">
          Recommended for you
        </h3>
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl bg-white/5" />
            ))
          ) : recommendations.length > 0 ? (
            recommendations.map((worker, i) => (
              <motion.div
                key={worker.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
              >
                <WorkerCard worker={worker} />
              </motion.div>
            ))
          ) : (
            <GlassCard className="p-8 text-center">
              <Compass className="h-8 w-8 text-white/20 mx-auto mb-3" />
              <p className="text-sm text-white/40">Search for a service to get recommendations</p>
            </GlassCard>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const { mode } = useAppStore()
  const { user } = useAuthStore()

  const name = user?.full_name?.split(' ')[0] || 'there'

  function handleCategorySelect(category) {
    navigate('/job/new', { state: { category } })
  }

  function handleSearch(query) {
    if (mode === 'instant') {
      navigate('/job/new', { state: { query } })
    } else {
      navigate(`/discover?q=${encodeURIComponent(query)}`)
    }
  }

  return (
    <div className="relative min-h-full">
      {/* Mode ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] rounded-full blur-[120px]"
            style={{
              background: mode === 'instant'
                ? 'radial-gradient(ellipse, rgba(16,185,129,0.12) 0%, transparent 70%)'
                : 'radial-gradient(ellipse, rgba(245,158,11,0.10) 0%, transparent 70%)',
            }}
          />
        </AnimatePresence>
      </div>

      <div className="space-y-5 pb-4">
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <p className="text-sm text-white/40">Good {getGreeting()},</p>
          <p className="text-xl font-semibold font-syne text-white/90 capitalize">{name} 👋</p>
        </motion.div>

        {/* Mode-specific content */}
        <AnimatePresence mode="wait">
          {mode === 'instant' ? (
            <InstantContent
              key="instant"
              onCategorySelect={handleCategorySelect}
              onSearch={handleSearch}
            />
          ) : (
            <DiscoveryContent
              key="discovery"
              onSearch={handleSearch}
            />
          )}
        </AnimatePresence>

        {/* Spacer for ModeToggle + bottom nav */}
        <div className="h-24" />
      </div>

      <ModeToggle />
    </div>
  )
}
