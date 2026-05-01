import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, SlidersHorizontal, X, Compass, Package, TrendingUp, Star,
  ChevronRight, MapPin, Zap
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { WorkerCard } from '@/components/kaargar/WorkerCard'
import { GlassCard } from '@/components/glass/GlassCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatCurrency, getInitials } from '@/lib/utils'
import { cn } from '@/lib/utils'

const SORT_OPTIONS = [
  { value: 'rating',     label: '⭐ Top Rated' },
  { value: 'price_asc',  label: '💸 Lowest Price' },
  { value: 'price_desc', label: '💎 Premium' },
  { value: 'distance',   label: '📍 Nearest' },
]

const QUICK_SEARCHES = [
  { label: 'Electrician', emoji: '⚡' },
  { label: 'Plumber',     emoji: '🔧' },
  { label: 'Carpenter',   emoji: '🪚' },
  { label: 'Cleaner',     emoji: '🧹' },
  { label: 'AC Repair',   emoji: '❄️' },
  { label: 'Painter',     emoji: '🎨' },
  { label: 'Mechanic',    emoji: '🔩' },
  { label: 'Pest Control',emoji: '🐛' },
]

/* ─── Sort chip ───────────────────────────────────────────────── */
function SortChip({ label, active, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap"
      style={{
        background: active ? 'rgba(245,158,11,0.15)' : 'var(--g-bg)',
        border: `1px solid ${active ? 'rgba(245,158,11,0.35)' : 'var(--g-border)'}`,
        color: active ? '#f59e0b' : 'var(--text-muted)',
      }}
    >
      {label}
    </motion.button>
  )
}

/* ─── Package card (horizontal scroll) ────────────────────────── */
function PackageCard({ pkg, onClick }) {
  const discount = pkg.original_price && pkg.price
    ? Math.round((1 - pkg.price / pkg.original_price) * 100)
    : null

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="flex-shrink-0 w-52 text-left rounded-2xl p-4 space-y-2.5"
      style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-xl bg-amber-400/10 flex items-center justify-center shrink-0">
          <Package className="h-4 w-4 text-amber-400" />
        </div>
        {discount > 0 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400">
            -{discount}%
          </span>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold leading-tight line-clamp-2" style={{ color: 'var(--text-primary)' }}>
          {pkg.name || pkg.title}
        </p>
        {pkg.worker_name && (
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            by {pkg.worker_name}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(pkg.price)}
          </p>
          {pkg.original_price && pkg.original_price > pkg.price && (
            <p className="text-[10px] line-through" style={{ color: 'var(--text-muted)' }}>
              {formatCurrency(pkg.original_price)}
            </p>
          )}
        </div>
        {pkg.validity_days && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'var(--g-bg)', color: 'var(--text-muted)' }}>
            {pkg.validity_days}d
          </span>
        )}
      </div>
    </motion.button>
  )
}

/* ─── Trending worker card (compact, horizontal) ──────────────── */
function TrendingWorkerCard({ worker, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="flex-shrink-0 w-40 text-left rounded-2xl p-3 space-y-2"
      style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)' }}
    >
      <div className="relative">
        <Avatar className="w-12 h-12">
          <AvatarImage src={worker.avatar_url} />
          <AvatarFallback className="text-xs font-bold">{getInitials(worker.worker_name || worker.full_name || '')}</AvatarFallback>
        </Avatar>
        {worker.is_online && (
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2"
            style={{ borderColor: 'var(--bg-base)' }} />
        )}
      </div>
      <div>
        <p className="text-xs font-semibold leading-tight line-clamp-1" style={{ color: 'var(--text-primary)' }}>
          {worker.worker_name || worker.full_name || 'Worker'}
        </p>
        <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
          {worker.primary_category || worker.name || '—'}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
        <span className="text-[11px] font-medium text-amber-400">
          {(worker.avg_rating || 4.8).toFixed(1)}
        </span>
      </div>
    </motion.button>
  )
}

/* ─── Section header ──────────────────────────────────────────── */
function SectionHeader({ icon: Icon, title, color = 'text-amber-400', onSeeAll }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', color)} />
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          {title}
        </p>
      </div>
      {onSeeAll && (
        <button
          onClick={onSeeAll}
          className="flex items-center gap-0.5 text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
        >
          See all <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

/* ─── Homepage content (no active search) ─────────────────────── */
function DiscoveryHome({ onSearch, navigate }) {
  // Recommended packages from top-rated services
  const { data: recommendations = [], isLoading: recLoading } = useQuery({
    queryKey: ['discovery-recommendations'],
    queryFn: async () => {
      const { data } = await api.get('/search/recommendations')
      return data
    },
    staleTime: 5 * 60_000,
    retry: 1,
  })

  // Trending workers (top-rated, online)
  const { data: trendingData, isLoading: trendLoading } = useQuery({
    queryKey: ['discovery-trending'],
    queryFn: async () => {
      const { data } = await api.get('/search/workers', { params: { page: 1 } })
      return data
    },
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const trendingWorkers = (trendingData?.workers ?? trendingData ?? []).slice(0, 8)
  const featuredPackages = recommendations.filter(r => r.price && r.price > 0).slice(0, 6)

  return (
    <div className="space-y-7">

      {/* Recommended packages */}
      <div>
        <SectionHeader
          icon={Package}
          title="Recommended packages"
          color="text-amber-400"
        />
        {recLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="flex-shrink-0 w-52 h-32 rounded-2xl" style={{ background: 'var(--g-bg)' }} />
            ))}
          </div>
        ) : featuredPackages.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {featuredPackages.map((pkg, i) => (
              <motion.div
                key={pkg.id || i}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <PackageCard
                  pkg={pkg}
                  onClick={() => navigate(`/worker/${pkg.worker_id}`)}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <GlassCard className="p-5 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Packages loading soon</p>
          </GlassCard>
        )}
      </div>

      {/* Trending workers */}
      <div>
        <SectionHeader
          icon={TrendingUp}
          title="Trending near you"
          color="text-azure"
          onSeeAll={() => onSearch('electrician')}
        />
        {trendLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="flex-shrink-0 w-40 h-36 rounded-2xl" style={{ background: 'var(--g-bg)' }} />
            ))}
          </div>
        ) : trendingWorkers.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
            {trendingWorkers.map((worker, i) => (
              <motion.div
                key={worker.id || i}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <TrendingWorkerCard
                  worker={worker}
                  onClick={() => navigate(`/worker/${worker.id}`)}
                />
              </motion.div>
            ))}
          </div>
        ) : (
          <GlassCard className="p-5 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No workers available right now</p>
          </GlassCard>
        )}
      </div>

      {/* Popular services grid */}
      <div>
        <SectionHeader icon={Zap} title="Popular services" color="text-emerald-400" />
        <div className="grid grid-cols-4 gap-2.5">
          {QUICK_SEARCHES.map(({ label, emoji }, i) => (
            <motion.button
              key={label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSearch(label)}
              className="rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center transition-colors"
              style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)' }}
            >
              <span className="text-xl leading-none">{emoji}</span>
              <span className="text-[11px] font-medium leading-tight" style={{ color: 'var(--text-secondary)' }}>
                {label}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ────────────────────────────────────────────────── */
export default function DiscoveryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [query, setQuery]             = useState(searchParams.get('q') || '')
  const [sort, setSort]               = useState('rating')
  const [showFilters, setShowFilters] = useState(false)

  const currentQuery = searchParams.get('q') || ''

  const { data: workers = [], isLoading, isFetching } = useQuery({
    queryKey: ['search', currentQuery, sort],
    queryFn: async () => {
      if (!currentQuery) return []
      const { data } = await api.get('/search', {
        params: { q: currentQuery, mode: 'discovery', sort },
      })
      const rows = data.results ?? data ?? []
      const normalized = rows.map(item => ({
        ...item,
        id: item.worker_id || item.id,
        full_name: item.full_name || item.worker_name || item.name,
        primary_category: item.primary_category || item.name,
      }))
      return Array.from(
        new Map(normalized.filter(item => item.id).map(item => [item.id, item])).values()
      )
    },
    staleTime: 60_000,
    enabled: !!currentQuery,
  })

  const isSearching = isLoading || isFetching

  function handleSearch(term) {
    const q = (term || query).trim()
    if (q) {
      setQuery(q)
      setSearchParams({ q })
    }
  }

  function clearSearch() {
    setQuery('')
    setSearchParams({})
  }

  return (
    <div className="px-4 pt-6 pb-24 space-y-5">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Compass className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Discovery</span>
        </div>
        <h1 className="text-2xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
          Find the best pros
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Browse verified workers in Pune
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={e => { e.preventDefault(); handleSearch() }}>
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search electrician, plumber…"
              className="w-full rounded-xl pl-10 pr-10 py-3 text-sm outline-none"
              style={{
                background: 'var(--g-bg-mid)',
                border: '1px solid var(--g-border)',
                color: 'var(--text-primary)',
              }}
            />
            {query && (
              <button type="button" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
              </button>
            )}
          </div>

          <motion.button
            type="button"
            onClick={() => setShowFilters(v => !v)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-3 rounded-xl transition-all"
            style={{
              background: showFilters ? 'rgba(245,158,11,0.15)' : 'var(--g-bg)',
              border: `1px solid ${showFilters ? 'rgba(245,158,11,0.35)' : 'var(--g-border)'}`,
              color: showFilters ? '#f59e0b' : 'var(--text-muted)',
            }}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </motion.button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex gap-2 overflow-x-auto pb-1 pt-3 no-scrollbar"
            >
              {SORT_OPTIONS.map(opt => (
                <SortChip
                  key={opt.value}
                  label={opt.label}
                  active={sort === opt.value}
                  onClick={() => setSort(opt.value)}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      {/* Content — home or search results */}
      <AnimatePresence mode="wait">
        {!currentQuery ? (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <DiscoveryHome onSearch={handleSearch} navigate={navigate} />
          </motion.div>
        ) : (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Result header */}
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {isSearching ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                      style={{ borderColor: 'rgba(245,158,11,0.5)', borderTopColor: 'transparent' }} />
                    Searching…
                  </span>
                ) : (
                  `${workers.length} result${workers.length !== 1 ? 's' : ''} for "${currentQuery}"`
                )}
              </p>
              {workers.length > 0 && (
                <button
                  onClick={clearSearch}
                  className="text-xs flex items-center gap-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>

            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" style={{ background: 'var(--g-bg)' }} />
              ))
            ) : workers.length === 0 ? (
              <GlassCard className="p-10 text-center">
                <Compass className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No workers found</p>
                <p className="text-xs mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>
                  Try a different search term or category
                </p>
                <button
                  onClick={clearSearch}
                  className="text-xs text-amber-400 hover:text-amber-300"
                >
                  ← Back to browse
                </button>
              </GlassCard>
            ) : (
              workers.map((worker, i) => (
                <motion.div
                  key={worker.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <WorkerCard worker={worker} onClick={() => navigate(`/worker/${worker.id}`)} />
                </motion.div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
