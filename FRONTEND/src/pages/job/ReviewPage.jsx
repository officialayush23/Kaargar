import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Send, ChevronLeft, MessageSquare } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { Background } from '@/components/glass/Background'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassTextarea } from '@/components/glass/GlassInput'
import { api } from '@/lib/api'
import { toast } from 'sonner'

const SUB_RATINGS = [
  { key: 'quality',       label: 'Quality',       emoji: '✨' },
  { key: 'punctuality',   label: 'Punctuality',   emoji: '⏱️' },
  { key: 'communication', label: 'Communication', emoji: '💬' },
  { key: 'value',         label: 'Value for money', emoji: '💰' },
]

const RATING_LABELS = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Excellent']

function StarRow({ value, onChange, size = 32 }) {
  const [hovered, setHovered] = useState(0)
  const display = hovered || value

  return (
    <div className="flex gap-2" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <motion.button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer' }}
        >
          <Star
            size={size}
            style={{
              fill: n <= display ? 'var(--amber)' : 'transparent',
              color: n <= display ? 'var(--amber)' : 'var(--text-muted)',
              transition: 'all 0.12s ease',
              filter: n <= display ? 'drop-shadow(0 0 6px rgba(var(--accent-rgb,245,158,11),0.6))' : 'none',
            }}
          />
        </motion.button>
      ))}
    </div>
  )
}

function SmallStarRow({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  const display = hovered || value

  return (
    <div className="flex gap-1.5" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <motion.button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          whileTap={{ scale: 0.85 }}
          style={{ background: 'none', border: 'none', padding: '1px', cursor: 'pointer' }}
        >
          <Star
            size={20}
            style={{
              fill: n <= display ? 'var(--amber)' : 'transparent',
              color: n <= display ? 'var(--amber)' : 'var(--text-muted)',
              transition: 'all 0.1s ease',
            }}
          />
        </motion.button>
      ))}
    </div>
  )
}

export default function ReviewPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()

  const [rating, setRating] = useState(0)
  const [subRatings, setSubRatings] = useState({ quality: 0, punctuality: 0, communication: 0, value: 0 })
  const [reviewText, setReviewText] = useState('')

  function setSubRating(key, val) {
    setSubRatings(prev => ({ ...prev, [key]: val }))
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/reviews', {
        job_id: jobId,
        rating,
        text: reviewText.trim() || undefined,
        quality_rating: subRatings.quality || undefined,
        punctuality_rating: subRatings.punctuality || undefined,
        communication_rating: subRatings.communication || undefined,
        value_rating: subRatings.value || undefined,
      }),
    onSuccess: () => {
      toast.success('Review submitted. Thank you!')
      navigate('/')
    },
    onError: (e) => {
      toast.error(e.response?.data?.detail || 'Failed to submit review')
    },
  })

  const canSubmit = rating > 0

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--page-bg)' }}>
      <Background />

      <div className="max-w-sm mx-auto px-4 py-6 pb-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(-1)}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <ChevronLeft size={18} style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div>
            <h1 className="text-lg font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
              Rate your experience
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Your feedback helps workers improve
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Main star rating */}
          <GlassCard className="p-6">
            <div className="flex flex-col items-center gap-4">
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '18px',
                  background: 'var(--accent-deep)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Star size={32} style={{ color: 'var(--amber)', fill: rating > 0 ? 'var(--amber)' : 'transparent' }} />
              </div>

              <StarRow value={rating} onChange={setRating} size={34} />

              <AnimatePresence mode="wait">
                {rating > 0 && (
                  <motion.p
                    key={rating}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="font-semibold"
                    style={{ color: 'var(--amber)', fontSize: '15px' }}
                  >
                    {RATING_LABELS[rating]}
                  </motion.p>
                )}
                {!rating && (
                  <motion.p
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Tap to rate
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </GlassCard>

          {/* Sub-ratings */}
          <GlassCard className="p-5">
            <h3 className="text-sm font-semibold mb-4 font-syne" style={{ color: 'var(--text-primary)' }}>
              Rate specific aspects
            </h3>
            <div className="space-y-4">
              {SUB_RATINGS.map(({ key, label, emoji }) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{ fontSize: '16px', flexShrink: 0 }}>{emoji}</span>
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  </div>
                  <SmallStarRow value={subRatings[key]} onChange={(v) => setSubRating(key, v)} />
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Written review */}
          <GlassCard className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare size={16} style={{ color: 'var(--text-muted)' }} />
              <h3 className="text-sm font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>
                Written review <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
              </h3>
            </div>
            <GlassTextarea
              placeholder="Share your experience with this worker…"
              value={reviewText}
              onChange={e => setReviewText(e.target.value)}
              rows={4}
              style={{ minHeight: '96px' }}
            />
            <p className="text-xs mt-2 text-right" style={{ color: 'var(--text-muted)' }}>
              {reviewText.length}/500
            </p>
          </GlassCard>

          {/* Submit */}
          <GlassButton
            variant="discovery"
            size="lg"
            className="w-full"
            loading={mutation.isPending}
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
            icon={Send}
            iconPosition="right"
          >
            Submit Review
          </GlassButton>

          <button
            onClick={() => navigate('/')}
            className="w-full text-center text-sm py-2"
            style={{ color: 'var(--text-muted)' }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
