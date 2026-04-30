import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, SlidersHorizontal, X, Compass } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { WorkerCard } from '@/components/kaargar/WorkerCard'
import { GlassCard } from '@/components/glass/GlassCard'
import { Skeleton } from '@/components/ui/skeleton'
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

function SortChip({ label, active, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap"
      style={{
        background: active ? 'rgba(59,130,246,0.18)' : 'var(--g-bg)',
        border: `1px solid ${active ? 'rgba(59,130,246,0.35)' : 'var(--g-border)'}`,
        color: active ? '#60a5fa' : 'var(--text-muted)',
      }}
    >
      {label}
    </motion.button>
  )
}

export default function DiscoveryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [query, setQuery]           = useState(searchParams.get('q') || '')
  const [sort, setSort]             = useState('rating')
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
      const normalized = rows.map((item) => ({
        ...item,
        id: item.worker_id || item.id,
        full_name: item.full_name || item.worker_name || item.name,
        primary_category: item.primary_category || item.name,
      }))
      const deduped = Array.from(
        new Map(normalized.filter((item) => item.id).map((item) => [item.id, item])).values()
      )
      return deduped
    },
    staleTime: 60_000,
  })

  const isSearching = isLoading || isFetching

  function handleSearch(e) {
    e?.preventDefault()
    if (query.trim()) setSearchParams({ q: query.trim() })
  }

  function clearSearch() {
    setQuery('')
    setSearchParams({})
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      {/* Page heading */}
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
      <form onSubmit={handleSearch}>
        <div className="flex items-center gap-2">
          {/* Input */}
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
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <motion.button
            type="button"
            onClick={() => setShowFilters(v => !v)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-3 rounded-xl transition-all"
            style={{
              background: showFilters ? 'rgba(59,130,246,0.18)' : 'var(--g-bg)',
              border: `1px solid ${showFilters ? 'rgba(59,130,246,0.35)' : 'var(--g-border)'}`,
              color: showFilters ? '#60a5fa' : 'var(--text-muted)',
            }}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </motion.button>
        </div>

        {/* Sort chips */}
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

      {/* Content */}
      {!currentQuery ? (
        <div className="space-y-5">
          {/* Quick searches grid */}
          <div>
            <p
              className="text-xs uppercase tracking-widest font-medium mb-3"
              style={{ color: 'var(--text-muted)' }}
            >Popular services</p>
            <div className="grid grid-cols-4 gap-2.5">
              {QUICK_SEARCHES.map(({ label, emoji }, i) => (
                <motion.button
                  key={label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { setQuery(label); setSearchParams({ q: label }) }}
                  className="rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--card-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--card-bg)'}
                >
                  <span className="text-xl leading-none">{emoji}</span>
                  <span className="text-[11px] font-medium leading-tight" style={{ color: 'var(--text-secondary)' }}>
                    {label}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Empty prompt */}
          <GlassCard className="p-8 text-center">
            <Search className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Search for any service
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Find verified workers in your area
            </p>
          </GlassCard>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Result header */}
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isSearching ? (
                <span className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: 'rgba(59,130,246,0.5)', borderTopColor: 'transparent' }}
                  />
                  Searching…
                </span>
              ) : (
                `${workers.length} result${workers.length !== 1 ? 's' : ''} for "${currentQuery}"`
              )}
            </p>
            {workers.length > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {sort === 'rating' ? '⭐ Best match' : sort}
              </span>
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
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Try a different search term or category
              </p>
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
        </div>
      )}
    </div>
  )
}
