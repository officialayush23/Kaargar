import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const STATUS_MESSAGES = {
  searching: 'Finding workers near you…',
  assigned: 'Worker found! Connecting…',
  failed: 'No workers available right now',
  cancelled: 'Job cancelled',
}

function RippleRing({ delay, scale }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-full border-2 border-instant/30"
      initial={{ scale: 1, opacity: 0.6 }}
      animate={{ scale: scale, opacity: 0 }}
      transition={{ duration: 2.5, delay, repeat: Infinity, ease: 'easeOut' }}
    />
  )
}

export default function SearchingPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    api.get(`/jobs/${jobId}`).then(({ data }) => setJob(data))

    const channel = supabase
      .channel(`job:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
        ({ new: updated }) => {
          setJob(updated)
          if (updated.status === 'assigned') {
            setTimeout(() => navigate(`/job/${jobId}/active`, { replace: true }), 1200)
          }
          if (updated.status === 'failed') {
            toast.error('No workers available. Try again later.')
            setTimeout(() => navigate('/', { replace: true }), 2000)
          }
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [jobId])

  const handleCancel = async () => {
    setCancelling(true)
    try {
      await api.post(`/jobs/${jobId}/cancel`, { reason: 'User cancelled' })
      navigate('/', { replace: true })
    } catch {
      toast.error('Failed to cancel')
      setCancelling(false)
    }
  }

  const status = job?.status || 'searching'
  const isAssigned = status === 'assigned'

  return (
    <div className="min-h-screen bg-[--bg-base] flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[120px] transition-all duration-1000 ${
          isAssigned ? 'bg-instant/15' : 'bg-brand/8'
        }`} />
      </div>

      <div className="relative flex flex-col items-center gap-8 text-center">
        {/* Ripple animation */}
        <div className="relative w-32 h-32 flex items-center justify-center">
          {!isAssigned && (
            <>
              <RippleRing delay={0} scale={2.5} />
              <RippleRing delay={0.8} scale={2.0} />
              <RippleRing delay={1.6} scale={1.5} />
            </>
          )}

          <motion.div
            animate={isAssigned ? { scale: [1, 1.1, 1] } : { scale: 1 }}
            transition={isAssigned ? { duration: 0.5 } : {}}
            className={`w-20 h-20 rounded-full flex items-center justify-center ${
              isAssigned ? 'bg-instant/20 border-2 border-instant' : 'bg-brand/15 border-2 border-brand/40'
            }`}
          >
            <Loader2
              size={32}
              className={`${isAssigned ? 'text-instant' : 'text-brand'} ${isAssigned ? '' : 'animate-spin'}`}
            />
          </motion.div>
        </div>

        {/* Status text */}
        <AnimatePresence mode="wait">
          <motion.div
            key={status}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-2"
          >
            <h2 className="font-syne font-bold text-2xl text-[--text-primary]">
              {isAssigned ? 'Worker found!' : 'Searching…'}
            </h2>
            <p className="text-[--text-muted] text-sm max-w-xs">
              {STATUS_MESSAGES[status] || 'Please wait…'}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Radius indicator */}
        {status === 'searching' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="glass-light rounded-full px-5 py-2"
          >
            <p className="text-xs text-[--text-muted]">Checking workers in your area…</p>
          </motion.div>
        )}

        {/* Job info */}
        {job?.category && (
          <div className="glass rounded-2xl px-5 py-3 w-full max-w-xs">
            <p className="text-sm text-[--text-secondary]">{job.category.name}</p>
            <p className="text-xs text-[--text-muted] mt-0.5">{job.location_address}</p>
          </div>
        )}

        {/* Cancel */}
        {status === 'searching' && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="flex items-center gap-2 text-sm text-[--text-muted] hover:text-[--text-secondary] transition-colors mt-4"
          >
            {cancelling ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            Cancel search
          </button>
        )}
      </div>
    </div>
  )
}
