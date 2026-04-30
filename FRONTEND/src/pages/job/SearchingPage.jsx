/**
 * SearchingPage — Uber/Rapido-style live worker search screen.
 * Shows animated ripple, rotating status messages, and transitions
 * to a "Worker Found" card when a match is made.
 */
import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Star, Phone, MessageCircle, MapPin, Clock, ChevronRight, User } from 'lucide-react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const SEARCH_MESSAGES = [
  'Finding workers near you...',
  'Checking availability...',
  'Matching your requirements...',
  'Almost there...',
  'Connecting with nearby pros...',
]

function RippleRing({ delay = 0, size = 1 }) {
  return (
    <motion.div
      className="absolute rounded-full border border-azure/30"
      style={{
        width:  `${120 * size}px`,
        height: `${120 * size}px`,
        top:    '50%',
        left:   '50%',
        x:      '-50%',
        y:      '-50%',
      }}
      initial={{ scale: 0.6, opacity: 0.7 }}
      animate={{ scale: 2.6, opacity: 0 }}
      transition={{
        duration: 2.4,
        repeat: Infinity,
        delay,
        ease: 'easeOut',
      }}
    />
  )
}

function SearchingAnimation() {
  const [msgIdx, setMsgIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setMsgIdx(i => (i + 1) % SEARCH_MESSAGES.length), 2500)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center flex-1 py-16 relative">
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(59,130,246,0.08) 0%, transparent 70%)' }}
      />

      {/* Ripple rings */}
      <div className="relative flex items-center justify-center w-40 h-40 mb-8">
        <RippleRing delay={0}   size={1} />
        <RippleRing delay={0.6} size={1} />
        <RippleRing delay={1.2} size={1} />

        {/* Center pulse */}
        <motion.div
          className="w-20 h-20 rounded-full bg-gradient-to-br from-azure to-azure-dim flex items-center justify-center z-10"
          style={{ boxShadow: '0 0 40px rgba(59,130,246,0.5)' }}
          animate={{
            boxShadow: [
              '0 0 40px rgba(59,130,246,0.4)',
              '0 0 64px rgba(59,130,246,0.7)',
              '0 0 40px rgba(59,130,246,0.4)',
            ],
          }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <MapPin className="h-8 w-8 text-white" />
        </motion.div>

        {/* Orbiting worker dots */}
        {[0, 120, 240].map((deg, i) => (
          <motion.div
            key={i}
            className="absolute w-4 h-4 rounded-full bg-white/80 border border-azure/40"
            style={{ top: '50%', left: '50%', transformOrigin: '0 0' }}
            animate={{ rotate: 360 + deg }}
            initial={{ rotate: deg }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear', delay: i * 0.3 }}
          >
            <motion.div
              className="w-4 h-4 rounded-full bg-azure"
              style={{ transform: `translateX(${56}px) translateY(-50%)` }}
            />
          </motion.div>
        ))}
      </div>

      {/* Status message */}
      <AnimatePresence mode="wait">
        <motion.p
          key={msgIdx}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="text-lg font-semibold font-syne text-center"
          style={{ color: 'var(--text-primary)' }}
        >
          {SEARCH_MESSAGES[msgIdx]}
        </motion.p>
      </AnimatePresence>

      <p className="text-sm mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
        Searching within 5 km of your location
      </p>

      {/* Worker count hint */}
      <motion.div
        className="flex items-center gap-2 mt-6 px-4 py-2 rounded-full glass"
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        <div className="flex -space-x-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-6 h-6 rounded-full bg-azure/30 border border-navy flex items-center justify-center">
              <User className="h-3 w-3 text-azure" />
            </div>
          ))}
        </div>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>12 workers nearby</span>
      </motion.div>
    </div>
  )
}

function WorkerFoundCard({ worker, jobId, onChat, onCall }) {
  const navigate = useNavigate()

  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className="space-y-4"
    >
      {/* Success header */}
      <div className="text-center py-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 16, delay: 0.2 }}
          className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-4"
          style={{ boxShadow: '0 0 32px rgba(16,185,129,0.4)' }}
        >
          <span className="text-3xl">&#10003;</span>
        </motion.div>
        <h2 className="text-xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>Worker found!</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Your professional is on the way</p>
      </div>

      {/* Worker card */}
      <GlassCard glow glowColor="green" className="p-5">
        <div className="flex items-center gap-4">
          <Avatar className="w-16 h-16 border-2 border-emerald-500/30 shrink-0">
            <AvatarImage src={worker?.avatar_url} />
            <AvatarFallback className="text-lg font-bold">
              {worker?.full_name?.[0] || 'W'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>{worker?.full_name || 'Worker'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
              <span className="text-sm text-amber-400 font-medium">{worker?.avg_rating?.toFixed(1) || '4.8'}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>·</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{worker?.total_jobs_completed || 0} jobs</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-emerald-400">Verified pro</span>
            </div>
          </div>
        </div>

        {/* ETA */}
        <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--g-border)' }}>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-azure" />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Estimated arrival</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>30-45 min</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Distance</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>~2.3 km</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <GlassButton variant="ghost" icon={Phone} onClick={onCall} className="w-full">
            Call
          </GlassButton>
          <GlassButton variant="brand" icon={MessageCircle} onClick={onChat} className="w-full">
            Chat
          </GlassButton>
        </div>
      </GlassCard>

      <GlassButton
        variant="instant"
        size="lg"
        className="w-full"
        icon={ChevronRight}
        iconPosition="right"
        onClick={() => navigate(`/job/${jobId}/active`)}
      >
        Track job live
      </GlassButton>
    </motion.div>
  )
}

export default function SearchingPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [jobStatus, setJobStatus] = useState('searching')
  const [worker, setWorker] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const channelRef = useRef(null)

  useEffect(() => {
    if (!jobId) return

    api.get(`/jobs/${jobId}`).then(({ data }) => {
      setJobStatus(data.status)
      if (data.assigned_worker) setWorker(data.assigned_worker)
      if (['assigned', 'en_route', 'arrived', 'started'].includes(data.status)) {
        navigate(`/job/${jobId}/active`, { replace: true })
      }
    }).catch(() => {})

    channelRef.current = supabase
      .channel(`job:${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`,
      }, ({ new: updated }) => {
        setJobStatus(updated.status)
        if (updated.status === 'assigned') {
          api.get(`/jobs/${jobId}`).then(({ data }) => {
            if (data.assigned_worker) setWorker(data.assigned_worker)
          }).catch(() => {})
        }
        if (['en_route', 'arrived', 'started'].includes(updated.status)) {
          navigate(`/job/${jobId}/active`, { replace: true })
        }
        if (updated.status === 'failed') {
          toast.error('No workers available. Try again in a few minutes.')
        }
        if (updated.status === 'cancelled') {
          navigate('/', { replace: true })
        }
      })
      .subscribe()

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [jobId, navigate])

  async function handleCancel() {
    setCancelling(true)
    try {
      await api.post(`/jobs/${jobId}/cancel`, { reason: 'User cancelled' })
      navigate('/', { replace: true })
    } catch {
      toast.error('Could not cancel. Try again.')
    } finally {
      setCancelling(false)
    }
  }

  const workerFound = jobStatus === 'assigned' && worker

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between py-2 mb-2">
        <h1 className="text-lg font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>
          {workerFound ? 'Match found' : 'Searching...'}
        </h1>
        {!workerFound && (
          <GlassButton
            variant="ghost"
            size="sm"
            icon={X}
            loading={cancelling}
            onClick={handleCancel}
          >
            Cancel
          </GlassButton>
        )}
      </div>

      <AnimatePresence mode="wait">
        {workerFound ? (
          <WorkerFoundCard
            key="found"
            worker={worker}
            jobId={jobId}
            onChat={() => navigate(`/chat/${jobId}`)}
            onCall={() => toast.info('Calling feature coming soon')}
          />
        ) : jobStatus === 'failed' ? (
          <motion.div
            key="failed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 flex flex-col items-center justify-center py-16 text-center gap-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center text-3xl">
              &#128532;
            </div>
            <div>
              <h3 className="text-lg font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>No workers found</h3>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>All workers are busy. Please try again in a few minutes.</p>
            </div>
            <GlassButton variant="brand" onClick={() => navigate('/')}>
              Go back home
            </GlassButton>
          </motion.div>
        ) : (
          <SearchingAnimation key="searching" />
        )}
      </AnimatePresence>
    </div>
  )
}
