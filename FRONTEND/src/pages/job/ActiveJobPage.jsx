import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, MessageSquare, Phone, MapPin, Shield, Star, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { JobStatusTimeline } from '@/components/kaargar/JobStatusTimeline'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatCurrency, getInitials } from '@/lib/utils'
import { toast } from 'sonner'

function RatingModal({ jobId, onSubmit }) {
  const [rating, setRating] = useState(5)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    try {
      await api.post('/reviews', { job_id: jobId, rating, text: text.trim() || undefined })
      toast.success('Review submitted!')
      onSubmit()
    } catch {
      toast.error('Failed to submit review')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        className="w-full max-w-lg glass-strong rounded-t-3xl p-6 pb-10 space-y-5"
      >
        <h2 className="font-syne font-bold text-xl text-[--text-primary]">How was the service?</h2>
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} onClick={() => setRating(s)}>
              <Star
                size={36}
                className={s <= rating ? 'text-discovery fill-discovery' : 'text-[--text-muted]'}
              />
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Share your experience (optional)…"
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none resize-none"
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="btn-brand w-full py-4 rounded-2xl font-semibold flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : 'Submit review'}
        </button>
      </motion.div>
    </div>
  )
}

export default function ActiveJobPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [showRating, setShowRating] = useState(false)

  useEffect(() => {
    api.get(`/jobs/${jobId}`).then(({ data }) => setJob(data))

    const channel = supabase
      .channel(`job:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
        ({ new: updated }) => {
          setJob((prev) => ({ ...prev, ...updated }))
          if (updated.status === 'completed') {
            setTimeout(() => setShowRating(true), 800)
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [jobId])

  const worker = job?.worker
  const chatId = job?.chat_id

  return (
    <div className="min-h-screen bg-[--bg-base] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 glass border-b border-white/5 flex items-center gap-3 px-4 py-4">
        <button onClick={() => navigate('/')} className="p-1.5 rounded-xl hover:bg-white/5">
          <ArrowLeft size={20} className="text-[--text-secondary]" />
        </button>
        <h1 className="font-syne font-bold text-[--text-primary] flex-1">Active job</h1>
        <button className="p-2 rounded-xl glass-light">
          <Shield size={16} className="text-[--text-muted]" />
        </button>
      </div>

      <div className="flex-1 px-4 pt-5 pb-8 space-y-5">
        {!job ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-brand" />
          </div>
        ) : (
          <>
            {/* Worker card */}
            {worker && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-2xl p-4"
              >
                <div className="flex items-center gap-4">
                  <Avatar className="w-14 h-14 border-2 border-white/10">
                    <AvatarImage src={worker.avatar_url} />
                    <AvatarFallback className="bg-brand/20 text-brand font-bold">
                      {getInitials(worker.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold text-[--text-primary]">{worker.full_name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Star size={12} className="text-discovery fill-discovery" />
                      <span className="text-sm text-[--text-secondary]">{worker.avg_rating?.toFixed(1) || '—'}</span>
                      <span className="text-xs text-[--text-muted]">· {worker.total_jobs || 0} jobs</span>
                    </div>
                  </div>
                  {chatId && (
                    <Link
                      to={`/chat/${jobId}`}
                      className="w-10 h-10 rounded-xl glass-light flex items-center justify-center"
                    >
                      <MessageSquare size={18} className="text-brand" />
                    </Link>
                  )}
                </div>

                {job.location_address && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-[--text-muted]">
                    <MapPin size={12} className="text-brand" />
                    {job.location_address}
                  </div>
                )}
              </motion.div>
            )}

            {/* Status timeline */}
            <div className="glass-light rounded-2xl p-5">
              <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider mb-4">Job progress</p>
              <JobStatusTimeline status={job.status} />
            </div>

            {/* Pricing (visible after completion) */}
            {job.status === 'completed' && job.final_amount && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass rounded-2xl p-4 border border-instant/20 bg-instant/5"
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[--text-muted]">Total amount</span>
                  <span className="font-mono font-bold text-xl text-instant">{formatCurrency(job.final_amount)}</span>
                </div>
                <p className="text-xs text-[--text-muted] mt-1">Payment held in escrow — released in 48h</p>
              </motion.div>
            )}
          </>
        )}
      </div>

      {showRating && (
        <RatingModal jobId={jobId} onSubmit={() => { setShowRating(false); navigate('/bookings') }} />
      )}
    </div>
  )
}
