/**
 * WorkerCard — modern, clean card.
 * Shows avatar with online dot, name, category, rating, jobs, price range, service mode badge.
 * Used in DiscoveryPage + search results.
 */
import { Star, MapPin, Briefcase, BadgeCheck, Zap, Home } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { formatCurrency } from '@/lib/utils'

export function WorkerCard({ worker, index = 0 }) {
  const navigate = useNavigate()
  const workerId = worker.worker_id || worker.id
  const name = worker.full_name || worker.worker_name || 'Worker'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const category = worker.primary_category || worker.category_name || 'Professional'
  const rating = Number(worker.avg_rating || 0)
  const ratingCount = worker.rating_count || worker.total_reviews || 0
  const jobs = worker.total_jobs_completed || 0
  const area = worker.pune_area || worker.location_area
  const isOnline = worker.status === 'online'
  const isVerified = worker.verification_status === 'approved'
  const minRate = worker.min_rate ? formatCurrency(worker.min_rate) : null
  const maxRate = worker.max_rate ? formatCurrency(worker.max_rate) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 300, damping: 28 }}
      onClick={() => navigate(`/worker/${workerId}`)}
      className="cursor-pointer active:scale-[0.985] transition-transform"
      style={{
        background: 'var(--g-bg-mid)',
        border: '1px solid var(--g-border)',
        borderRadius: '18px',
        padding: '16px',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="relative shrink-0">
          <Avatar className="h-14 w-14" style={{ border: '2px solid var(--g-border)' }}>
            <AvatarImage src={worker.avatar_url} alt={name} />
            <AvatarFallback className="text-base font-bold"
              style={{ background: 'var(--g-bg)', color: 'var(--text-secondary)' }}>
              {initials}
            </AvatarFallback>
          </Avatar>
          {isOnline && (
            <span
              className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full"
              style={{ background: '#22c55e', border: '2px solid var(--g-bg-mid)' }}
            />
          )}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {name}
                </h3>
                {isVerified && (
                  <BadgeCheck size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                )}
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                {category}
              </p>
            </div>

            {/* Price range */}
            {minRate && (
              <div className="text-right shrink-0">
                <p className="text-xs font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                  {minRate}{maxRate && maxRate !== minRate ? `–${maxRate}` : ''}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>/visit</p>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            {/* Rating */}
            <div className="flex items-center gap-1">
              <Star size={12} className="fill-amber-400 text-amber-400" />
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                {rating > 0 ? rating.toFixed(1) : 'New'}
              </span>
              {ratingCount > 0 && (
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>({ratingCount})</span>
              )}
            </div>

            {jobs > 0 && (
              <>
                <span style={{ color: 'var(--g-border)' }}>&#183;</span>
                <div className="flex items-center gap-1">
                  <Briefcase size={11} style={{ color: 'var(--text-muted)' }} />
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{jobs} jobs</span>
                </div>
              </>
            )}

            {area && (
              <>
                <span style={{ color: 'var(--g-border)' }}>&#183;</span>
                <div className="flex items-center gap-1">
                  <MapPin size={11} style={{ color: 'var(--text-muted)' }} />
                  <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)', maxWidth: '80px' }}>
                    {area}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer: service mode + instant badge */}
      <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--g-border)' }}>
        {isOnline && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
            <Zap size={9} /> Available now
          </span>
        )}
        {worker.accepts_instant && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
            Instant
          </span>
        )}
        {worker.service_mode === 'walkin' && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(168,85,247,0.08)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.15)' }}>
            <Home size={9} /> Walk-in
          </span>
        )}
        <div className="ml-auto">
          <span className="text-[10px] font-medium px-2.5 py-1 rounded-lg"
            style={{ background: 'var(--g-bg)', color: 'var(--text-secondary)', border: '1px solid var(--g-border)' }}>
            View profile &#8594;
          </span>
        </div>
      </div>
    </motion.div>
  )
}
