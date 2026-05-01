/**
 * WorkerProfilePage — public-facing worker profile.
 * Sections: hero, media carousel, services, packages, reviews.
 */
import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, Star, BadgeCheck, MapPin, Briefcase, Clock,
  ChevronLeft, ChevronRight, Play, Package, Wrench, MessageCircle,
  Zap, Home, Building2, Phone,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { GlassButton } from '@/components/glass/GlassButton'
import { Background } from '@/components/glass/Background'
import { MobileBottomNav } from '@/components/glass/GlassNavbar'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import { toast } from 'sonner'

/* ── Media carousel ─────────────────────────────────────── */
function MediaCarousel({ items = [] }) {
  const [idx, setIdx] = useState(0)
  const [lightbox, setLightbox] = useState(null)

  if (!items.length) return null

  const prev = () => setIdx(i => (i - 1 + items.length) % items.length)
  const next = () => setIdx(i => (i + 1) % items.length)
  const current = items[idx]
  const isVideo = current?.type === 'video' || current?.type === 'reel'

  return (
    <>
      <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', aspectRatio: '16/9', background: 'var(--g-bg)' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            {isVideo ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', cursor: 'pointer' }}
                onClick={() => setLightbox(current)}>
                {current.thumbnail_url
                  ? <img src={current.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
                  : <div style={{ width: '100%', height: '100%', background: '#141B26' }} />}
                <div style={{ position: 'absolute', width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Play size={22} style={{ color: '#fff', marginLeft: 3 }} />
                </div>
              </div>
            ) : (
              <img
                src={current.cloudinary_url || current.url}
                alt={current.caption || ''}
                style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                onClick={() => setLightbox(current)}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {items.length > 1 && (
          <>
            <button onClick={prev}
              style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}>
              <ChevronLeft size={18} style={{ color: '#fff' }} />
            </button>
            <button onClick={next}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}>
              <ChevronRight size={18} style={{ color: '#fff' }} />
            </button>
            <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4 }}>
              {items.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)}
                  style={{ width: i === idx ? 20 : 6, height: 6, borderRadius: 3, background: i === idx ? '#fff' : 'rgba(255,255,255,0.4)', border: 'none', cursor: 'pointer', transition: 'width 0.2s' }} />
              ))}
            </div>
          </>
        )}

        {current.caption && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '24px 14px 10px', background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{current.caption}</p>
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {items.length > 1 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }} className="hide-scrollbar">
          {items.map((item, i) => (
            <button key={i} onClick={() => setIdx(i)}
              style={{
                width: 52, height: 52, borderRadius: 10, overflow: 'hidden', flexShrink: 0, cursor: 'pointer',
                border: i === idx ? '2px solid #4B7BFF' : '1.5px solid var(--g-border)',
                background: 'var(--g-bg)', padding: 0,
              }}>
              {(item.thumbnail_url || item.cloudinary_url || item.url) && (
                <img src={item.thumbnail_url || item.cloudinary_url || item.url} alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: i === idx ? 1 : 0.55 }} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          >
            {lightbox.type === 'video' || lightbox.type === 'reel'
              ? <video src={lightbox.cloudinary_url || lightbox.url} controls autoPlay style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12 }} onClick={e => e.stopPropagation()} />
              : <img src={lightbox.cloudinary_url || lightbox.url} alt="" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12, objectFit: 'contain' }} />
            }
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/* ── Rating breakdown ───────────────────────────────────── */
function RatingBar({ label, value, max = 5 }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="flex items-center gap-2 text-xs">
      <span style={{ color: 'var(--text-muted)', width: 90, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--g-bg)' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: 0.1 }}
          style={{ height: '100%', borderRadius: 3, background: '#f59e0b' }}
        />
      </div>
      <span className="font-mono" style={{ color: 'var(--text-secondary)', width: 24, textAlign: 'right' }}>
        {value ? value.toFixed(1) : '—'}
      </span>
    </div>
  )
}

/* ── Section wrapper ────────────────────────────────────── */
function Section({ title, icon: Icon, children, action }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} style={{ color: 'var(--text-muted)' }} />}
          <h2 className="text-sm font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

/* ── Main page ──────────────────────────────────────────── */
export default function WorkerProfilePage() {
  const { workerId } = useParams()
  const navigate = useNavigate()

  const { data: worker, isLoading } = useQuery({
    queryKey: ['worker-public', workerId],
    queryFn: () => api.get(`/workers/${workerId}`).then(r => r.data),
    enabled: !!workerId,
  })

  const { data: media = [] } = useQuery({
    queryKey: ['worker-media', workerId],
    queryFn: () => api.get(`/workers/${workerId}/media`).then(r => r.data),
    enabled: !!workerId,
  })

  const { data: services = [] } = useQuery({
    queryKey: ['worker-services', workerId],
    queryFn: () => api.get(`/workers/${workerId}/services`).then(r => r.data),
    enabled: !!workerId,
  })

  const { data: reviewsData } = useQuery({
    queryKey: ['worker-reviews', workerId],
    queryFn: () => api.get(`/reviews/worker/${workerId}`).then(r => r.data),
    enabled: !!workerId,
  })

  const reviews = Array.isArray(reviewsData) ? reviewsData : reviewsData?.reviews || []
  const packages = services.filter(s => s._type === 'package') // or fetch separately
  const name = worker?.full_name || 'Worker'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const isVerified = worker?.verification_status === 'approved'
  const rating = Number(worker?.avg_rating || 0)

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
        <Background />
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 space-y-4">
          <Skeleton className="h-10 w-32" style={{ background: 'var(--g-bg)' }} />
          <Skeleton className="h-40 w-full rounded-2xl" style={{ background: 'var(--g-bg)' }} />
          <Skeleton className="h-56 w-full rounded-2xl" style={{ background: 'var(--g-bg)' }} />
        </div>
      </div>
    )
  }

  if (!worker) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--page-bg)' }}>
        <Background />
        <div className="text-center">
          <p style={{ color: 'var(--text-muted)' }}>Worker not found</p>
          <GlassButton onClick={() => navigate(-1)} className="mt-4">Go back</GlassButton>
        </div>
      </div>
    )
  }

  const modeIcon = worker.service_mode === 'walkin' ? Home : worker.service_mode === 'onsite' ? Building2 : null
  const modeLabel = worker.service_mode === 'walkin' ? 'Walk-in' : worker.service_mode === 'onsite' ? 'On-site' : 'Walk-in & On-site'

  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <Background />

      <div className="max-w-2xl mx-auto px-4 pt-5 pb-44 space-y-6">

        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft size={16} /> Back
        </button>

        {/* ── Hero ── */}
        <div style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)', borderRadius: 20, padding: '20px' }}>
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <Avatar className="h-20 w-20" style={{ border: '2px solid var(--g-border)' }}>
                <AvatarImage src={worker.avatar_url} alt={name} />
                <AvatarFallback className="text-2xl font-bold" style={{ background: 'var(--g-bg)', color: 'var(--text-secondary)' }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              {worker.status === 'online' && (
                <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full" style={{ background: '#22c55e', border: '2px solid var(--g-bg-mid)' }} />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold font-syne" style={{ color: 'var(--text-primary)' }}>{name}</h1>
                {isVerified && <BadgeCheck size={18} style={{ color: '#4B7BFF' }} />}
              </div>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {worker.bio || worker.primary_category || 'Professional service provider'}
              </p>

              <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                {rating > 0 && (
                  <div className="flex items-center gap-1">
                    <Star size={13} className="fill-amber-400 text-amber-400" />
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{rating.toFixed(1)}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({worker.total_reviews || reviews.length})</span>
                  </div>
                )}
                {worker.total_jobs_completed > 0 && (
                  <div className="flex items-center gap-1">
                    <Briefcase size={12} style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{worker.total_jobs_completed} jobs done</span>
                  </div>
                )}
                {worker.pune_area && (
                  <div className="flex items-center gap-1">
                    <MapPin size={12} style={{ color: 'var(--text-muted)' }} />
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{worker.pune_area}</span>
                  </div>
                )}
              </div>

              {/* Badges */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {worker.status === 'online' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                    <Zap size={9} /> Available now
                  </span>
                )}
                {modeLabel && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--g-bg)', color: 'var(--text-secondary)', border: '1px solid var(--g-border)' }}>
                    {modeIcon && <modeIcon.type size={9} />} {modeLabel}
                  </span>
                )}
                {isVerified && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(75,123,255,0.08)', color: '#4B7BFF', border: '1px solid rgba(75,123,255,0.2)' }}>
                    Verified pro
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 mt-5">
            <GlassButton
              variant="brand"
              className="w-full"
              onClick={() => navigate(`/worker/${workerId}/book`)}
            >
              Book Now
            </GlassButton>
            <GlassButton
              variant="ghost"
              icon={Phone}
              className="w-full"
              onClick={() => toast.info('Contact visible after booking')}
            >
              Contact
            </GlassButton>
          </div>
        </div>

        {/* ── Media portfolio ── */}
        {media.length > 0 && (
          <Section title="Portfolio" icon={null}>
            <div className="space-y-3">
              <MediaCarousel items={media} />
            </div>
          </Section>
        )}

        {/* ── Services ── */}
        {services.length > 0 && (
          <Section title="Services" icon={Wrench}>
            <div className="space-y-2">
              {services.map(svc => (
                <div key={svc.id}
                  style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)', borderRadius: 14, padding: '14px 16px' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{svc.name}</p>
                      {svc.description && (
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{svc.description}</p>
                      )}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {svc.service_mode && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: 'var(--g-bg)', color: 'var(--text-muted)', border: '1px solid var(--g-border)' }}>
                            {svc.service_mode === 'walkin' ? 'Walk-in' : svc.service_mode === 'onsite' ? 'On-site' : 'Walk-in & On-site'}
                          </span>
                        )}
                        {svc.duration_minutes && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1"
                            style={{ background: 'var(--g-bg)', color: 'var(--text-muted)', border: '1px solid var(--g-border)' }}>
                            <Clock size={9} /> {svc.duration_minutes} min
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                        {formatCurrency(svc.price)}
                      </p>
                      {svc.visit_fee > 0 && (
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          +{formatCurrency(svc.visit_fee)} travel
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Packages ── */}
        {packages.length > 0 && (
          <Section title="Packages" icon={Package}>
            <div className="space-y-2">
              {packages.map(pkg => (
                <div key={pkg.id}
                  style={{ background: 'var(--g-bg-mid)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 14, padding: '14px 16px' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{pkg.title}</p>
                        {pkg.original_price > pkg.discounted_price && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                            {Math.round((1 - pkg.discounted_price / pkg.original_price) * 100)}% OFF
                          </span>
                        )}
                      </div>
                      {pkg.description && (
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{pkg.description}</p>
                      )}
                      {pkg.validity_days && (
                        <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>Valid for {pkg.validity_days} days</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold font-mono" style={{ color: '#f59e0b' }}>
                        {formatCurrency(pkg.discounted_price)}
                      </p>
                      {pkg.original_price > pkg.discounted_price && (
                        <p className="text-xs line-through" style={{ color: 'var(--text-muted)' }}>
                          {formatCurrency(pkg.original_price)}
                        </p>
                      )}
                    </div>
                  </div>
                  <GlassButton
                    variant="discovery"
                    size="sm"
                    className="w-full mt-3"
                    onClick={() => navigate(`/worker/${workerId}/book?package=${pkg.id}`)}
                  >
                    Get Package
                  </GlassButton>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Reviews ── */}
        <Section title={`Reviews${reviews.length ? ` (${reviews.length})` : ''}`} icon={Star}>
          {/* Rating summary */}
          {rating > 0 && (
            <div style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-4xl font-bold font-mono" style={{ color: 'var(--text-primary)' }}>{rating.toFixed(1)}</p>
                  <div className="flex gap-0.5 mt-1 justify-center">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} size={11} style={{ color: s <= Math.round(rating) ? '#f59e0b' : 'var(--g-border)' }}
                        className={s <= Math.round(rating) ? 'fill-amber-400' : ''} />
                    ))}
                  </div>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{reviews.length} reviews</p>
                </div>
                <div className="flex-1 space-y-1.5">
                  <RatingBar label="Quality" value={worker.quality_rating} />
                  <RatingBar label="Punctuality" value={worker.punctuality_rating} />
                  <RatingBar label="Communication" value={worker.communication_rating} />
                  <RatingBar label="Value" value={worker.value_rating} />
                </div>
              </div>
            </div>
          )}

          {/* Review list */}
          {reviews.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No reviews yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reviews.slice(0, 6).map(rv => (
                <div key={rv.id} style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)', borderRadius: 14, padding: '12px 14px' }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: 'var(--g-bg)', color: 'var(--text-secondary)', border: '1px solid var(--g-border)' }}>
                        {rv.reviewer?.full_name?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                          {rv.reviewer?.full_name || 'User'}
                        </p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{formatRelativeTime(rv.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {[1,2,3,4,5].map(s => (
                        <Star key={s} size={10} style={{ color: s <= rv.rating ? '#f59e0b' : 'var(--g-border)' }}
                          className={s <= rv.rating ? 'fill-amber-400' : ''} />
                      ))}
                    </div>
                  </div>
                  {rv.review_text && (
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{rv.review_text}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Sticky CTA — sits above the bottom nav pill (bottom-4 + ~56px pill height) */}
      <div
        className="fixed left-0 right-0 px-4 pt-3"
        style={{
          bottom: 88,   /* clears the 56px nav pill + bottom-4 gap */
          background: 'linear-gradient(transparent, var(--page-bg) 40%)',
          zIndex: 20,
        }}
      >
        <div className="max-w-2xl mx-auto">
          <GlassButton
            variant="brand"
            size="lg"
            className="w-full font-semibold"
            onClick={() => navigate(`/worker/${workerId}/book`)}
          >
            Book {name.split(' ')[0]}
          </GlassButton>
        </div>
      </div>

      {/* Role-aware bottom nav — workers see worker links, users see user links */}
      <MobileBottomNav />
    </div>
  )
}
