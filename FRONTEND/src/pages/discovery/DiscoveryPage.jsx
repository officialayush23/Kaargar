import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, SlidersHorizontal, X, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { WorkerCard } from '@/components/kaargar/WorkerCard'
import { Skeleton } from '@/components/ui/skeleton'

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
        active
          ? 'bg-brand/20 text-brand border border-brand/30'
          : 'glass-light text-[--text-muted] border border-transparent hover:border-white/10'
      }`}
    >
      {label}
    </button>
  )
}

const SORT_OPTIONS = [
  { value: 'rating', label: 'Top rated' },
  { value: 'price_asc', label: 'Lowest price' },
  { value: 'price_desc', label: 'Highest price' },
  { value: 'distance', label: 'Nearest' },
]

export default function DiscoveryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [sort, setSort] = useState('rating')
  const [showFilters, setShowFilters] = useState(false)

  const currentQuery = searchParams.get('q') || ''

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', currentQuery, sort],
    queryFn: () => api.get('/search', { params: { q: currentQuery, mode: 'discovery', sort } }).then(r => r.data),
    enabled: !!currentQuery,
  })

  const handleSearch = (e) => {
    e.preventDefault()
    if (query.trim()) setSearchParams({ q: query.trim() })
  }

  const workers = data?.results || []

  return (
    <div className="min-h-screen bg-[--bg-base]">
      {/* Header */}
      <div className="sticky top-0 z-20 glass border-b border-white/5 px-4 py-3 space-y-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[--text-muted]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services, workers…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none focus:border-brand/50 transition-all"
            />
            {query && (
              <button type="button" onClick={() => { setQuery(''); setSearchParams({}) }} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X size={14} className="text-[--text-muted]" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2.5 rounded-xl transition-all ${showFilters ? 'bg-brand/20 text-brand' : 'glass-light text-[--text-muted]'}`}
          >
            <SlidersHorizontal size={16} />
          </button>
        </form>

        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
          >
            {SORT_OPTIONS.map((opt) => (
              <FilterChip key={opt.value} label={opt.label} active={sort === opt.value} onClick={() => setSort(opt.value)} />
            ))}
          </motion.div>
        )}
      </div>

      <div className="px-4 pt-4 pb-28 space-y-3">
        {!currentQuery && (
          <div className="text-center py-16 space-y-3">
            <Search size={40} className="text-[--text-muted] mx-auto" />
            <p className="text-[--text-primary] font-semibold">Find skilled workers</p>
            <p className="text-sm text-[--text-muted]">Search by service type, name, or specialty</p>
          </div>
        )}

        {currentQuery && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-[--text-muted]">
                {isLoading || isFetching ? (
                  <span className="flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Searching…</span>
                ) : (
                  `${workers.length} result${workers.length !== 1 ? 's' : ''} for "${currentQuery}"`
                )}
              </p>
            </div>

            {isLoading ? (
              [...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
            ) : workers.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[--text-muted] text-sm">No workers found. Try a different search.</p>
              </div>
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
          </>
        )}
      </div>
    </div>
  )
}
