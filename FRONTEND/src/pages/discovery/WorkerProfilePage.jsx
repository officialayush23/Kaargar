import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Star, MapPin, Briefcase, CheckCircle, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { MediaGrid } from '@/components/kaargar/MediaUpload'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, getInitials } from '@/lib/utils'

function ReviewItem({ review }) {
  const rating = Number(review.rating || 0)
  return (
    <div className="glass-light rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex">
          {[...Array(5)].map((_, i) => (
            <Star key={i} size={12} className={i < rating ? 'text-discovery fill-discovery' : 'text-[--text-muted]'} />
          ))}
        </div>
        <span className="text-xs text-[--text-muted]">{new Date(review.created_at).toLocaleDateString('en-IN')}</span>
      </div>
      {review.text && <p className="text-sm text-[--text-secondary]">{review.text}</p>}
      {review.reviewer_name && (
        <p className="text-xs text-[--text-muted] mt-2">— {review.reviewer_name}</p>
      )}
    </div>
  )
}

export default function WorkerProfilePage() {
  const { workerId } = useParams()
  const navigate = useNavigate()

  const { data: worker, isLoading } = useQuery({
    queryKey: ['worker', workerId],
    queryFn: () => api.get(`/workers/${workerId}`).then(r => r.data),
  })
  const { data: services = [] } = useQuery({
    queryKey: ['worker-services', workerId],
    queryFn: () => api.get(`/workers/${workerId}/services`).then(r => r.data),
    enabled: !!workerId,
  })
  const { data: media = [] } = useQuery({
    queryKey: ['worker-media', workerId],
    queryFn: () => api.get(`/workers/${workerId}/media`).then(r => r.data),
    enabled: !!workerId,
  })
  const { data: reviews = [] } = useQuery({
    queryKey: ['worker-reviews', workerId],
    queryFn: async () => {
      try {
        const { data } = await api.get(`/reviews/worker/${workerId}`)
        return data
      } catch {
        const { data } = await api.get(`/workers/${workerId}/reviews`)
        return data
      }
    },
    enabled: !!workerId,
  })

  if (isLoading) return (
    <div className="min-h-screen bg-[--bg-base] flex items-center justify-center">
      <Loader2 size={28} className="animate-spin text-brand" />
    </div>
  )

  const wp = worker

  return (
    <div className="min-h-screen bg-[--bg-base]">
      {/* Back button */}
      <div className="sticky top-0 z-20 glass border-b border-white/5 flex items-center gap-3 px-4 py-4">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-white/5">
          <ArrowLeft size={20} className="text-[--text-secondary]" />
        </button>
        <h1 className="font-syne font-bold text-[--text-primary]">{worker?.full_name || 'Worker'}</h1>
      </div>

      <div className="px-4 pt-5 pb-28 space-y-6">
        {/* Profile header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <Avatar className="w-20 h-20 border-2 border-white/10">
              <AvatarImage src={worker?.avatar_url} />
              <AvatarFallback className="bg-brand/20 text-brand font-bold text-xl">
                {getInitials(worker?.full_name || '')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="font-syne font-bold text-xl text-[--text-primary]">{worker?.full_name}</h2>
              {wp?.bio && <p className="text-sm text-[--text-secondary] mt-1">{wp.bio}</p>}
              <div className="flex flex-wrap gap-2 mt-2">
                {wp?.avg_rating > 0 && (
                  <Badge variant="outline" className="gap-1 text-discovery border-discovery/30">
                    <Star size={10} className="fill-discovery" /> {Number(wp.avg_rating || 0).toFixed(1)}
                  </Badge>
                )}
                {wp?.total_jobs_completed > 0 && (
                  <Badge variant="outline" className="gap-1 text-[--text-muted] border-white/10">
                    <Briefcase size={10} /> {wp.total_jobs_completed} jobs
                  </Badge>
                )}
                {wp?.verification_status === 'approved' && (
                  <Badge variant="outline" className="gap-1 text-instant border-instant/30">
                    <CheckCircle size={10} /> Verified
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Services */}
        {services.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider mb-3">Services</p>
            <div className="space-y-2">
              {services.map((service) => (
                <div key={service.id} className="glass-light rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[--text-primary]">{service.title}</p>
                    {service.description && (
                      <p className="text-xs text-[--text-muted] mt-0.5 line-clamp-1">{service.description}</p>
                    )}
                  </div>
                  {service.price && (
                    <p className="text-sm font-semibold text-brand">{formatCurrency(service.price)}/hr</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Portfolio */}
        {media.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider mb-3">Portfolio</p>
            <MediaGrid items={media.map(m => ({ id: m.id, url: m.url || m.cloudinary_url, type: m.type, caption: m.caption }))} />
          </div>
        )}

        {/* Reviews */}
        {reviews.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider mb-3">
              Reviews ({reviews.length})
            </p>
            <div className="space-y-3">
              {reviews.map((r) => <ReviewItem key={r.id} review={r} />)}
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 glass border-t border-white/5">
        <button
          onClick={() => navigate('/job/new', { state: { workerId } })}
          className="btn-discovery w-full py-4 rounded-2xl font-semibold text-base"
        >
          Book {worker?.full_name?.split(' ')[0] || 'worker'}
        </button>
      </div>
    </div>
  )
}
