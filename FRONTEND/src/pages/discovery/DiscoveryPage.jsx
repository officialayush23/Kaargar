import { useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import {
  Search, SlidersHorizontal, X, Compass, Package, TrendingUp, Star,
  ChevronRight, ChevronLeft, Zap, Shield, Clock, MapPin, Sparkles,
  CheckCircle2, Users, BadgeCheck, Wallet, ArrowRight
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { WorkerCard } from '@/components/kaargar/WorkerCard'
import { GlassCard } from '@/components/glass/GlassCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, getInitials } from '@/lib/utils'
import { cn } from '@/lib/utils'

const SORT_OPTIONS = [
  { value: 'rating',     label: '⭐ Top Rated' },
  { value: 'price_asc',  label: '💸 Lowest Price' },
  { value: 'price_desc', label: '💎 Premium' },
  { value: 'distance',   label: '📍 Nearest' },
]

const QUICK_TAGS = [
  { label: 'Electrician', emoji: '⚡', color: '#F59E0B' },
  { label: 'Plumber',     emoji: '🔧', color: '#3B82F6' },
  { label: 'Carpenter',   emoji: '🪚', color: '#92400E' },
  { label: 'Cleaner',     emoji: '🧹', color: '#10B981' },
  { label: 'AC Repair',   emoji: '❄️', color: '#06B6D4' },
  { label: 'Painter',     emoji: '🎨', color: '#F97316' },
  { label: 'Mechanic',    emoji: '🔩', color: '#374151' },
  { label: 'Pest Control',emoji: '🐛', color: '#DC2626' },
  { label: 'Photographer',emoji: '📸', color: '#EC4899' },
  { label: 'Chef',        emoji: '👨‍🍳', color: '#F59E0B' },
  { label: 'Beautician',  emoji: '💄', color: '#A855F7' },
  { label: 'Tutor',       emoji: '📚', color: '#6366F1' },
]

const PLATFORM_FEATURES = [
  {
    icon: BadgeCheck,
    color: '#4ade80',
    title: 'Verified Workers',
    desc: 'Every worker is background-checked, document-verified, and rated by real customers.',
  },
  {
    icon: Clock,
    color: '#60a5fa',
    title: 'Instant Matching',
    desc: 'Get a worker at your door in under 30 minutes with our real-time dispatch system.',
  },
  {
    icon: Wallet,
    color: '#fbbf24',
    title: 'Secure Payments',
    desc: 'Pay only after the job is done. Money held in escrow until you approve.',
  },
  {
    icon: Shield,
    color: '#f472b6',
    title: 'Work Guarantee',
    desc: 'Not satisfied? We rebook the job or refund — no questions asked.',
  },
]

/* ── Horizontal scroll carousel ────────────────────────────────── */
function Carousel({ children, gap = 12 }) {
  const ref = useRef(null)
  const scroll = (dir) => {
    if (ref.current) ref.current.scrollBy({ left: dir * 220, behavior: 'smooth' })
  }
  return (
    <div className="relative group">
      <div
        ref={ref}
        className="flex overflow-x-auto pb-3 no-scrollbar"
        style={{ gap, scrollSnapType: 'x mandatory' }}
      >
        {children}
      </div>
      <button
        onClick={() => scroll(-1)}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
      >
        <ChevronLeft className="h-3.5 w-3.5" style={{ color: 'var(--text-primary)' }} />
      </button>
      <button
        onClick={() => scroll(1)}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
      >
        <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--text-primary)' }} />
      </button>
    </div>
  )
}

/* ── Package card ───────────────────────────────────────────────── */
function PackageCard({ pkg, onClick, index }) {
  const discount = pkg.original_price && pkg.price
    ? Math.round((1 - pkg.price / pkg.original_price) * 100)
    : null
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      whileHover={{ scale: 1.03, y: -3 }}
      whileTap={{ scale: 0.97 }}
      className="flex-shrink-0 w-52 text-left rounded-2xl p-4 space-y-3"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        scrollSnapAlign: 'start',
      }}
    >
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)' }}>
          <Package className="h-5 w-5 text-amber-400" />
        </div>
        {discount > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>
            -{discount}%
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold line-clamp-2 leading-tight"
          style={{ color: 'var(--text-primary)' }}>
          {pkg.name || pkg.title}
        </p>
        {pkg.worker_name && (
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
            by {pkg.worker_name}
          </p>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(pkg.price)}
          </p>
          {pkg.original_price > pkg.price && (
            <p className="text-[10px] line-through" style={{ color: 'var(--text-muted)' }}>
              {formatCurrency(pkg.original_price)}
            </p>
          )}
        </div>
        {pkg.validity_days && (
          <span className="text-[10px] px-2 py-1 rounded-lg"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
            {pkg.validity_days}d
          </span>
        )}
      </div>
    </motion.button>
  )
}

/* ── Trending worker card ──────────────────────────────────────── */
function TrendingCard({ worker, onClick, index }) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.03, y: -3 }}
      whileTap={{ scale: 0.97 }}
      className="flex-shrink-0 w-40 text-left rounded-2xl p-3 space-y-2.5"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        scrollSnapAlign: 'start',
      }}
    >
      <div className="relative w-fit">
        <Avatar className="w-12 h-12">
          <AvatarImage src={worker.avatar_url} />
          <AvatarFallback className="text-xs font-bold"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
            {getInitials(worker.full_name || '')}
          </AvatarFallback>
        </Avatar>
        {worker.is_online && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2"
            style={{ borderColor: 'var(--bg-base)' }} />
        )}
      </div>
      <div>
        <p className="text-xs font-semibold line-clamp-1" style={{ color: 'var(--text-primary)' }}>
          {worker.full_name || 'Worker'}
        </p>
        <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
          {worker.primary_category || '—'}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
        <span className="text-[11px] font-semibold text-amber-400">
          {(worker.avg_rating || 4.8).toFixed(1)}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          ({worker.rating_count || 0})
        </span>
      </div>
    </motion.button>
  )
}

/* ── Section header ─────────────────────────────────────────────── */
function SectionHeader({ icon: Icon, title, subtitle, accent = '#f59e0b', onSeeAll }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center mt-0.5"
          style={{ background: 'rgba(255,255,255,0.06)' }}>
          <Icon className="h-4 w-4" style={{ color: accent }} />
        </div>
        <div>
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
          )}
        </div>
      </div>
      {onSeeAll && (
        <button onClick={onSeeAll}
          className="flex items-center gap-1 text-xs font-medium mt-1 transition-colors"
          style={{ color: accent }}>
          See all <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

/* ── Discovery Home ─────────────────────────────────────────────── */
function DiscoveryHome({ onSearch, navigate }) {
  const { data: recData = [], isLoading: recLoading } = useQuery({
    queryKey: ['discovery-recommendations'],
    queryFn: () => api.get('/search/recommendations').then(r => r.data),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const { data: trendingData, isLoading: trendLoading } = useQuery({
    queryKey: ['discovery-trending'],
    queryFn: () => api.get('/search/workers', { params: { page: 1 } }).then(r => r.data),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  // trendingData is { results: [...] }
  const trendingWorkers = Array.isArray(trendingData)
    ? trendingData.slice(0, 10)
    : Array.isArray(trendingData?.results)
      ? trendingData.results.slice(0, 10)
      : []

  const featuredPackages = Array.isArray(recData)
    ? recData.filter(r => r.price && r.price > 0).slice(0, 8)
    : []

  return (
    <div className="space-y-10">

      {/* ── Quick search tags ───────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <SectionHeader
          icon={Sparkles}
          title="Browse by profession"
          subtitle="Tap to find workers instantly"
          accent="#f59e0b"
        />
        <div className="grid grid-cols-4 gap-2">
          {QUICK_TAGS.slice(0, 8).map(({ label, emoji, color }, i) => (
            <motion.button
              key={label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSearch(label)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all text-center"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
              }}
            >
              <span className="text-xl leading-none">{emoji}</span>
              <span className="text-[10px] font-medium leading-tight"
                style={{ color: 'var(--text-secondary)' }}>
                {label}
              </span>
            </motion.button>
          ))}
        </div>
        {/* More tags pill row */}
        <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar pb-1">
          {QUICK_TAGS.slice(8).map(({ label, emoji, color }) => (
            <motion.button
              key={label}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSearch(label)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              <span>{emoji}</span> {label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* ── Recommended packages ───────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <SectionHeader
          icon={Package}
          title="Recommended packages"
          subtitle="Curated deals from top workers"
          accent="#f59e0b"
        />
        {recLoading ? (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="flex-shrink-0 w-52 h-36 rounded-2xl"
                style={{ background: 'var(--bg-elevated)' }} />
            ))}
          </div>
        ) : featuredPackages.length > 0 ? (
          <Carousel>
            {featuredPackages.map((pkg, i) => (
              <PackageCard
                key={pkg.id || i}
                pkg={pkg}
                index={i}
                onClick={() => navigate(`/worker/${pkg.worker_id}`)}
              />
            ))}
          </Carousel>
        ) : (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            {/* Placeholder cards when no packages yet */}
            {['House Deep Clean', 'AC Service + Gas', 'Full Home Painting', 'Plumbing Checkup'].map((name, i) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="flex-shrink-0 w-52 rounded-2xl p-4 space-y-3"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: '#251606' }}>
                  <Package className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Workers offering soon</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-lg inline-block"
                  style={{ background: '#1A1004', color: '#f59e0b' }}>
                  Coming soon
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ── Trending workers ───────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <SectionHeader
          icon={TrendingUp}
          title="Trending near you"
          subtitle="Most booked workers this week"
          accent="#60a5fa"
          onSeeAll={() => onSearch('electrician')}
        />
        {trendLoading ? (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="flex-shrink-0 w-40 h-36 rounded-2xl"
                style={{ background: 'var(--bg-elevated)' }} />
            ))}
          </div>
        ) : trendingWorkers.length > 0 ? (
          <Carousel>
            {trendingWorkers.map((worker, i) => (
              <TrendingCard
                key={worker.id || i}
                worker={worker}
                index={i}
                onClick={() => navigate(`/worker/${worker.id}`)}
              />
            ))}
          </Carousel>
        ) : (
          <GlassCard className="p-6 text-center">
            <Users className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Workers are being verified — check back soon
            </p>
          </GlassCard>
        )}
      </motion.div>

      {/* ── Platform features ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <SectionHeader
          icon={Shield}
          title="Why Kaargar?"
          subtitle="Built for trust, speed, and quality"
          accent="#f472b6"
        />
        <div className="grid grid-cols-2 gap-3">
          {PLATFORM_FEATURES.map(({ icon: Icon, color, title, desc }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + i * 0.07 }}
              className="rounded-2xl p-4 space-y-2.5"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <Icon className="h-4.5 w-4.5" style={{ color, width: 18, height: 18 }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {title}
                </p>
                <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ── How it works ───────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="rounded-2xl p-5"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
        }}
      >
        <h3 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          How Discovery works
        </h3>
        <div className="space-y-3">
          {[
            { step: '1', text: 'Search for any service or profession' },
            { step: '2', text: 'Browse worker profiles, ratings & packages' },
            { step: '3', text: 'Book at a time that works for you' },
            { step: '4', text: 'Pay securely after the job is done' },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: '#3D2508', color: '#fbbf24' }}>
                {step}
              </span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{text}</span>
            </div>
          ))}
        </div>
      </motion.div>

    </div>
  )
}

/* ── Main Page ──────────────────────────────────────────────────── */
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
        new Map(normalized.filter(i => i.id).map(i => [i.id, i])).values()
      )
    },
    staleTime: 60_000,
    enabled: !!currentQuery,
  })

  function handleSearch(term) {
    const q = (term || query).trim()
    if (q) { setQuery(q); setSearchParams({ q }) }
  }
  function clearSearch() { setQuery(''); setSearchParams({}) }

  return (
    <div className="px-4 pt-4 pb-28 max-w-2xl mx-auto">

      {/* ── Hero search header ────────────────────────────────── */}
      <div className="pt-2 pb-5">

        <div className="flex items-center gap-2 mb-1">
          <Compass className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-[11px] font-bold text-amber-400 uppercase tracking-widest">Discovery</span>
        </div>
        <h1 className="text-xl font-semibold mb-0.5"
          style={{ color: 'var(--text-primary)' }}>
          Find the best pros
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Browse verified workers in Pune
        </p>
      </div>

      {/* ── Sticky search bar ─────────────────────────────────── */}
      <div className="sticky top-0 z-20 -mx-4 px-4 pb-3 pt-1"
        style={{ background: 'rgba(7,9,15,0.85)', backdropFilter: 'blur(16px)' }}>
        <form onSubmit={e => { e.preventDefault(); handleSearch() }}>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none"
                style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search plumber, photographer…"
                className="w-full rounded-xl pl-10 pr-10 py-3 text-sm outline-none transition-all"
                style={{
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${currentQuery ? '#92400E' : 'var(--border)'}`,
                  color: 'var(--text-primary)',
                }}
              />
              {query && (
                <button type="button" onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-white/10 transition-colors">
                  <X className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
              )}
            </div>
            <motion.button type="button" onClick={() => setShowFilters(v => !v)}
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className="p-3 rounded-xl flex-shrink-0 transition-all"
              style={{
                background: showFilters ? '#2D1A06' : 'var(--bg-elevated)',
                border: `1px solid ${showFilters ? '#B45309' : 'var(--border)'}`,
                color: showFilters ? '#f59e0b' : 'var(--text-muted)',
              }}>
              <SlidersHorizontal className="h-4 w-4" />
            </motion.button>
          </div>
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex gap-2 overflow-x-auto no-scrollbar pt-2.5"
              >
                {SORT_OPTIONS.map(opt => (
                  <motion.button key={opt.value} type="button"
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => setSort(opt.value)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all"
                    style={{
                      background: sort === opt.value ? '#2D1A06' : 'var(--bg-elevated)',
                      border: `1px solid ${sort === opt.value ? '#B45309' : 'var(--border)'}`,
                      color: sort === opt.value ? '#f59e0b' : 'var(--text-muted)',
                    }}>
                    {opt.label}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>

      {/* ── Content ───────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {!currentQuery ? (
          <motion.div key="home"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}>
            <DiscoveryHome onSearch={handleSearch} navigate={navigate} />
          </motion.div>
        ) : (
          <motion.div key="results"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-4 mt-2">
            {/* Result count */}
            <div className="flex items-center justify-between">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {isLoading || isFetching ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full border-2 animate-spin"
                      style={{ borderColor: '#92400E', borderTopColor: '#f59e0b' }} />
                    Searching…
                  </span>
                ) : `${workers.length} result${workers.length !== 1 ? 's' : ''} for "${currentQuery}"`}
              </p>
              {workers.length > 0 && (
                <button onClick={clearSearch}
                  className="text-xs flex items-center gap-1 hover:text-amber-400 transition-colors"
                  style={{ color: 'var(--text-muted)' }}>
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>

            {isLoading
              ? [...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-2xl" style={{ background: 'var(--bg-elevated)' }} />
                ))
              : workers.length === 0
                ? (
                  <GlassCard className="p-10 text-center">
                    <Compass className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                      No workers found
                    </p>
                    <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
                      Try a different search term
                    </p>
                    <button onClick={clearSearch}
                      className="text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 mx-auto">
                      <ChevronLeft className="h-4 w-4" /> Back to browse
                    </button>
                  </GlassCard>
                )
                : workers.map((worker, i) => (
                  <motion.div key={worker.id}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}>
                    <WorkerCard worker={worker} onClick={() => navigate(`/worker/${worker.id}`)} />
                  </motion.div>
                ))
            }
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
