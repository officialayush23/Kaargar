import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion'
import {
  Search, SlidersHorizontal, X, Compass, Package, TrendingUp, Star,
  ChevronRight, ChevronLeft, Zap, MapPin,
  CheckCircle2, Users, ArrowRight, RotateCcw,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useGeoLocation } from '@/hooks/useGeoLocation'
import { useCategories } from '@/hooks/useCategories'
import { WorkerCard } from '@/components/kaargar/WorkerCard'
import { CategoryGrid } from '@/components/kaargar/CategoryGrid'
import { ModeToggle } from '@/components/kaargar/ModeToggle'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassModal } from '@/components/glass/GlassModal'
import { GlassButton } from '@/components/glass/GlassButton'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatCurrency, getInitials } from '@/lib/utils'
import { cn } from '@/lib/utils'

const SORT_OPTIONS = [
  { value: 'rating',     label: '⭐ Top Rated' },
  { value: 'price_asc',  label: '💸 Lowest Price' },
  { value: 'price_desc', label: '💎 Premium' },
  { value: 'distance',   label: '📍 Nearest' },
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
        className="flex overflow-x-auto  pb-3 no-scrollbar"
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

/* ── Service photo banner ────────────────────────────────────────
   Both service-card variants below (packages + trending) show a real,
   DB-sourced photo (svc.photo_url / pkg.photo_url, populated server-side
   from ServiceMedia via /search/recommendations + /search/trending-services)
   whenever the worker has actually uploaded one for that service —
   replacing the old always-generic Lucide icon. When no photo exists yet,
   falls back to a soft gradient tile bearing the same icon so the layout
   never breaks, it just quietly downgrades. */
function ServicePhotoBanner({ photoUrl, icon: Icon, iconColor = '#e99f2f', badge }) {
  const [failed, setFailed] = useState(false)
  const showPhoto = photoUrl && !failed
  return (
    <div className="relative w-full h-28 rounded-t-2xl overflow-hidden -m-4 mb-0" style={{ width: 'calc(100% + 2rem)' }}>
      {showPhoto ? (
        <img
          src={photoUrl}
          alt=""
          className="w-full h-full object-cover"
          style={{ display: 'block' }}
          onError={() => setFailed(true)}
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${iconColor}22, var(--bg-surface))` }}>
          <Icon className="h-8 w-8" style={{ color: iconColor, opacity: 0.85 }} />
        </div>
      )}
      {/* Bottom gradient so any badge/text overlaid on the photo stays legible */}
      {showPhoto && (
        <div className="absolute inset-x-0 bottom-0 h-10"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.45), transparent)' }} />
      )}
      {badge && (
        <div className="absolute top-2 right-2">{badge}</div>
      )}
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
      className="flex-shrink-0 w-52 text-left rounded-2xl p-4 space-y-3 overflow-hidden"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        scrollSnapAlign: 'start',
      }}
    >
      <ServicePhotoBanner
        photoUrl={pkg.photo_url}
        icon={Package}
        iconColor="#F59E0B"
        badge={discount > 0 && (
          <span className="text-[12px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(74,222,128,0.9)', color: '#04240f' }}>
            -{discount}%
          </span>
        )}
      />
      <div>
        <p className="text-sm font-semibold line-clamp-2 leading-tight"
          style={{ color: 'var(--text-primary)' }}>
          {pkg.name || pkg.title}
        </p>
        {pkg.worker_name && (
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
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
            <p className="text-[12px] line-through" style={{ color: 'var(--text-muted)' }}>
              {formatCurrency(pkg.original_price)}
            </p>
          )}
        </div>
        {pkg.validity_days && (
          <span className="text-[12px] px-2 py-1 rounded-lg"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}>
            {pkg.validity_days}d
          </span>
        )}
      </div>
    </motion.button>
  )
}

/* ── Trending service card ─────────────────────────────────────── */
function TrendingServiceCard({ svc, onClick, index }) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      whileHover={{ scale: 1.03, y: -3 }}
      whileTap={{ scale: 0.97 }}
      className="flex-shrink-0 w-52 text-left rounded-2xl p-4 space-y-3 overflow-hidden"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        scrollSnapAlign: 'start',
      }}
    >
      <ServicePhotoBanner
        photoUrl={svc.photo_url}
        icon={TrendingUp}
        iconColor="#e99f2f"
        badge={svc.category_name && (
          <span className="text-[12px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(4px)' }}>
            {svc.category_name}
          </span>
        )}
      />
      <div>
        <p className="text-sm font-semibold line-clamp-2 leading-tight"
          style={{ color: 'var(--text-primary)' }}>
          {svc.title}
        </p>
        <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
          by {svc.worker_name || 'Worker'}
        </p>
      </div>
      <div className="flex items-end justify-between">
        <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
          {svc.price ? formatCurrency(svc.price) : '—'}
        </p>
        {svc.worker_avg_rating > 0 && (
          <span className="flex items-center gap-1 text-[13px] font-semibold text-amber-400">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {Number(svc.worker_avg_rating).toFixed(1)}
          </span>
        )}
      </div>
    </motion.button>
  )
}

/* ── Frequently booked ──────────────────────────────────────────── */
// Blinkit-style "frequently bought" quick-rebook card. Only ever rendered
// when GET /jobs/frequently-booked returned a non-empty list (see
// DiscoveryHome) — a logged-out visitor or a customer with no repeat
// bookings never sees this card at all.
function FrequentlyBookedCard({ items, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      className="w-full flex items-center gap-3 rounded-2xl p-4 text-left"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          You've booked these before
        </p>
        <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Quickly rebook a favourite
        </p>
      </div>
      <div className="flex -space-x-2 shrink-0">
        {items.slice(0, 3).map(item => (
          <Avatar key={`${item.worker_id}-${item.service_id}`} className="w-8 h-8"
            style={{ border: '2px solid var(--bg-elevated)' }}>
            <AvatarImage src={item.worker_avatar_url} />
            <AvatarFallback className="text-[11px] font-bold"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
              {getInitials(item.worker_name || '')}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
    </motion.button>
  )
}

function FrequentlyBookedModal({ open, onClose, items, navigate }) {
  return (
    <GlassModal open={open} onClose={onClose} title="Frequently booked" size="md" solid>
      <div className="space-y-3">
        {items.map(item => (
          <div key={`${item.worker_id}-${item.service_id}`}
            className="flex items-center gap-3 rounded-xl p-3"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <Avatar className="w-10 h-10 shrink-0">
              <AvatarImage src={item.worker_avatar_url} />
              <AvatarFallback className="text-xs font-bold"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                {getInitials(item.worker_name || '')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {item.service_title}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {item.worker_name}
                {item.worker_avg_rating > 0 && <> · ★ {Number(item.worker_avg_rating).toFixed(1)}</>}
              </p>
              {item.price != null && (
                <p className="text-xs mt-0.5 font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(item.price)}
                </p>
              )}
            </div>
            <GlassButton
              variant="brand"
              size="sm"
              onClick={() => navigate(`/worker/${item.worker_id}/book`, {
                state: { preselectServiceId: item.service_id },
              })}
            >
              Book again
            </GlassButton>
          </div>
        ))}
      </div>
    </GlassModal>
  )
}

/* ── Section header ─────────────────────────────────────────────── */
function SectionHeader({ title, subtitle, accent = 'var(--accent)', onSeeAll }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
        )}
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
  const { isAuthenticated } = useAuthStore()
  const [showFrequentlyBooked, setShowFrequentlyBooked] = useState(false)
  const { data: categories = [], isLoading: catLoading } = useCategories('discovery')

  const { data: frequentlyBooked = [] } = useQuery({
    queryKey: ['jobs-frequently-booked'],
    queryFn: () => api.get('/jobs/frequently-booked').then(r => r.data),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const { data: recData = [], isLoading: recLoading } = useQuery({
    queryKey: ['discovery-recommendations'],
    queryFn: () => api.get('/search/recommendations').then(r => r.data),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const { data: trendingServices = [], isLoading: trendLoading } = useQuery({
    queryKey: ['discovery-trending-services'],
    queryFn: () => api.get('/search/trending-services').then(r => r.data),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const featuredPackages = Array.isArray(recData)
    ? recData.filter(r => r.price && r.price > 0).slice(0, 8)
    : []

  return (
    <div className="space-y-10">

      {/* ── Frequently booked — only for a returning customer with >=2 repeat
          worker+service combos (see GET /jobs/frequently-booked) ── */}
      {frequentlyBooked.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <FrequentlyBookedCard items={frequentlyBooked} onClick={() => setShowFrequentlyBooked(true)} />
        </motion.div>
      )}

      {/* ── Browse by profession — real categories, admin-photo aware ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <SectionHeader
          title="Browse by profession"
          subtitle="Tap to find workers instantly"
          accent="var(--accent)"
        />
        <CategoryGrid
          categories={categories}
          isLoading={catLoading}
          mode="discovery"
          onSelect={cat => onSearch(cat.name)}
          showAll
        />
      </motion.div>

      {/* ── Recommended packages ───────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <SectionHeader
          title="Recommended packages"
          subtitle="Curated deals from top workers"
          accent="#e99f2f"
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
                  style={{ background: '#e99f2f' }}>
                  <Package className="h-5 w-5 text-black" />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{name}</p>
                  <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>Workers offering soon</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-lg inline-block"
                  style={{ background: '#e99f2f', color: '#000000' }}>
                  Coming soon..
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
          title="Trending near you"
          subtitle="Most booked services this week"
          accent="#e99f2f"
          onSeeAll={() => onSearch('electrician')}
        />
        {trendLoading ? (
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="flex-shrink-0 w-52 h-36 rounded-2xl"
                style={{ background: 'var(--bg-elevated)' }} />
            ))}
          </div>
        ) : trendingServices.length > 0 ? (
          <Carousel>
            {trendingServices.map((svc, i) => (
              <TrendingServiceCard
                key={svc.id || i}
                svc={svc}
                index={i}
                onClick={() => navigate(`/worker/${svc.worker_id}`)}
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
                style={{ background: '#e99f2f', color: '#000000' , border: '1px solid #B45309'}}>
                {step}
              </span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{text}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <FrequentlyBookedModal
        open={showFrequentlyBooked}
        onClose={() => setShowFrequentlyBooked(false)}
        items={frequentlyBooked}
        navigate={navigate}
      />

    </div>
  )
}

/* ── Main Page ──────────────────────────────────────────────────── */
export default function DiscoveryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { mode, setMode } = useAppStore()

  // Keep the global mode store in sync with actually being on this page —
  // so the shared ModeToggle at the top always shows "Discover" active
  // here, even if someone lands on /discover directly (a link, a refresh,
  // browser back/forward) while the store still had 'instant' from
  // wherever they were before.
  useEffect(() => {
    if (mode !== 'discovery') setMode('discovery')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [query, setQuery]             = useState(searchParams.get('q') || '')
  const [sort, setSort]               = useState('rating')
  const [showFilters, setShowFilters] = useState(false)
  const [coords, setCoords]           = useState(null)
  const { getLocation, loading: geoLoading, error: geoError } = useGeoLocation()

  const currentQuery = searchParams.get('q') || ''

  // "Nearest" needs the customer's coordinates — fetch them lazily the first
  // time that sort is picked (not on every render/mount) and cache in state.
  async function handleSortChange(value) {
    setSort(value)
    if (value === 'distance' && !coords) {
      const loc = await getLocation()
      if (loc) setCoords({ lat: loc.lat, lon: loc.lon })
    }
  }

  const { data: workers = [], isLoading, isFetching } = useQuery({
    queryKey: ['search', currentQuery, sort, sort === 'distance' ? coords : null],
    queryFn: async () => {
      if (!currentQuery) return []
      const params = { q: currentQuery, mode: 'discovery', sort }
      if (sort === 'distance' && coords) {
        params.lat = coords.lat
        params.lon = coords.lon
      }
      const { data } = await api.get('/search', { params })
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

        {/* Same toggle as Home's — picking "Instant" here navigates back
            to / instead of leaving Discovery's own mode-switch UI behind. */}
        <div className="mb-3">
          <ModeToggle />
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
       >
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
                  border: `1px solid ${currentQuery ? 'var(--accent-dim)' : 'var(--border)'}`,
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
                background: showFilters ? '#e99f2f' : 'var(--bg-elevated)',
                border: `1px solid ${showFilters ? '#B45309' : 'var(--border)'}`,
                color: showFilters ? '#000000' : 'var(--text-muted)',
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
                    onClick={() => handleSortChange(opt.value)}
                    disabled={opt.value === 'distance' && geoLoading}
                    className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all"
                    style={{
                      background: sort === opt.value ? '#e99f2f' : 'var(--bg-elevated)',
                      border: `1px solid ${sort === opt.value ? '#B45309' : 'var(--border)'}`,
                      color: sort === opt.value ? '#000000' : 'var(--text-muted)',
                    }}>
                    {opt.value === 'distance' && geoLoading ? 'Locating…' : opt.label}
                  </motion.button>
                ))}
                {sort === 'distance' && geoError && (
                  <span className="flex-shrink-0 text-[11px] self-center" style={{ color: 'var(--text-muted)' }}>
                    {geoError} — showing default order
                  </span>
                )}
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
                      style={{ borderColor: 'var(--accent-dim)', borderTopColor: 'var(--accent)' }} />
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
