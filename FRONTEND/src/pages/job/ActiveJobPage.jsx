import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Phone, MapPin, Shield, Star, CheckCircle, Clock, Zap, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { JobStatusTimeline } from '@/components/kaargar/JobStatusTimeline'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassModal } from '@/components/glass/GlassModal'
import { GlassTextarea } from '@/components/glass/GlassInput'
import { formatCurrency, getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const STATUS_CONFIG = {
  assigned: { label: 'Worker assigned',  color: 'text-azure',      dot: 'bg-azure',         icon: Zap },
  en_route: { label: 'On the way',       color: 'text-violet-400', dot: 'bg-violet-400',    icon: MapPin },
  arrived:  { label: 'Worker arrived',   color: 'text-amber-400',  dot: 'bg-amber-400',     icon: Clock },
  started:  { label: 'Work in progress', color: 'text-emerald-400',dot: 'bg-emerald-400',   icon: Zap },
  completed:{ label: 'Job completed',    color: 'text-emerald-400',dot: 'bg-emerald-400',   icon: CheckCircle },
}

function RatingModal({ open, jobId, onSubmit, onClose }) {
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setLoading(true)
    try {
      await api.post('/reviews', { job_id: jobId, rating, text: text.trim() || undefined })
      toast.success('Review submitted — thank you!')
      onSubmit()
    } catch {
      toast.error('Failed to submit review')
    } finally {
      setLoading(false)
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="Rate your experience"
      size="sm"
      footer={
        <GlassButton variant="brand" size="lg" className="w-full" loading={loading} onClick={handleSubmit}>
          Submit review
        </GlassButton>
      }
    >
      <div className="space-y-5">
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map(s => (
            <motion.button
              key={s}
              onClick={() => setRating(s)}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
            >
              <Star
                className={cn(
                  'h-9 w-9 transition-colors',
                  s <= rating ? 'text-amber-400 fill-amber-400' : 'text-white/20'
                )}
              />
            </motion.button>
          ))}
        </div>
        <GlassTextarea
          placeholder="Share your experience (optional)…"
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
        />
      </div>
    </GlassModal>
  )
}

export default function ActiveJobPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [showRating, setShowRating] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/jobs/${jobId}`)
      .then(({ data }) => { setJob(data); setLoading(false) })
      .catch(() => setLoading(false))

    const channel = supabase
      .channel(`job:${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}`,
      }, ({ new: updated }) => {
        setJob(prev => ({ ...prev, ...updated }))
        if (updated.status === 'completed') {
          setTimeout(() => setShowRating(true), 1000)
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [jobId])

  const worker = job?.worker
  const cfg = STATUS_CONFIG[job?.status] || STATUS_CONFIG.assigned
  const finalAmount = job?.final_amount ?? job?.final_price

  return (
    <div className="space-y-5">
      {/* Status banner */}
      {job && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlassCard className={cn('p-4', job.status === 'completed' && 'border-emerald-500/25 bg-emerald-500/5')}>
            <div className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', `bg-${cfg.dot.replace('bg-', '')}/15`)}>
                <cfg.icon className={cn('h-5 w-5', cfg.color)} />
              </div>
              <div className="flex-1">
                <p className={cn('font-semibold text-sm', cfg.color)}>{cfg.label}</p>
                <p className="text-xs text-white/40 mt-0.5">{job.category?.name} · {job.location_address}</p>
              </div>
              <motion.div
                className={cn('w-2.5 h-2.5 rounded-full', cfg.dot)}
                animate={job.status !== 'completed' ? { scale: [1, 1.4, 1] } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
              />
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 rounded-full border-2 border-azure/30 border-t-azure animate-spin" />
        </div>
      )}

      {/* Worker card */}
      {worker && (
        <GlassCard className="p-5">
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14 border-2 border-white/15 shrink-0">
              <AvatarImage src={worker.avatar_url} />
              <AvatarFallback className="font-bold text-base">{getInitials(worker.full_name)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white/90 font-syne">{worker.full_name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                <span className="text-sm text-amber-400 font-medium">{worker.avg_rating?.toFixed(1) || '4.8'}</span>
                <span className="text-xs text-white/25">·</span>
                <span className="text-xs text-white/40">{worker.total_jobs || 0} jobs</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <Shield className="h-3 w-3 text-azure" />
                <span className="text-[11px] text-azure">Verified</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Link to={`/chat/${jobId}`}>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 rounded-xl bg-azure/15 border border-azure/25 flex items-center justify-center"
                >
                  <MessageSquare className="h-4 w-4 text-azure" />
                </motion.div>
              </Link>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-10 h-10 rounded-xl bg-white/8 border border-white/15 flex items-center justify-center"
                onClick={() => toast.info('Call feature coming soon')}
              >
                <Phone className="h-4 w-4 text-white/50" />
              </motion.button>
            </div>
          </div>

          {job?.location_address && (
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-azure shrink-0" />
              <span className="text-xs text-white/50">{job.location_address}</span>
            </div>
          )}
        </GlassCard>
      )}

      {/* Job timeline */}
      {job && (
        <GlassCard className="p-5">
          <p className="text-xs text-white/30 uppercase tracking-widest font-medium mb-5">Job progress</p>
          <JobStatusTimeline status={job.status} />
        </GlassCard>
      )}

      {/* Final amount */}
      <AnimatePresence>
        {job?.status === 'completed' && finalAmount && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
          >
            <GlassCard glow glowColor="green" className="p-5 border-emerald-500/25 bg-emerald-500/5">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-white/40">Total charged</p>
                  <p className="font-mono font-bold text-2xl text-emerald-400 mt-0.5">
                    {formatCurrency(finalAmount)}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-emerald-400" />
              </div>
              <p className="text-xs text-white/30 mt-3">
                Payment held in escrow — released to worker in 48 hours
              </p>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SOS */}
      {job && !['completed', 'cancelled'].includes(job.status) && (
        <GlassButton
          variant="danger"
          size="sm"
          className="w-full"
          icon={Shield}
          onClick={async () => {
            try {
              await api.post(`/jobs/${jobId}/sos`)
              toast.error('SOS alert sent. Help is on the way.')
            } catch {
              toast.error('Failed to send SOS')
            }
          }}
        >
          Emergency SOS
        </GlassButton>
      )}

      <RatingModal
        open={showRating}
        jobId={jobId}
        onSubmit={() => { setShowRating(false); navigate('/bookings') }}
        onClose={() => setShowRating(false)}
      />
    </div>
  )
}
