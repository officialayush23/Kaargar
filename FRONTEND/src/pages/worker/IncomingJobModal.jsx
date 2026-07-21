import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Clock, DollarSign, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

const TIMEOUT_SEC = 10

export default function IncomingJobModal({ job, onAccept, onDecline, onExpire }) {
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SEC)
  const [loading, setLoading] = useState(null) // 'accept' | 'decline'
  const timerRef = useRef()

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current)
          onExpire?.()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  const handleAccept = async () => {
    clearInterval(timerRef.current)
    setLoading('accept')
    try {
      await api.post(`/jobs/${job.id}/accept`)
      toast.success('Job accepted!')
      onAccept()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to accept')
      setLoading(null)
    }
  }

  const handleDecline = async () => {
    clearInterval(timerRef.current)
    setLoading('decline')
    try {
      await api.post(`/jobs/${job.id}/reject`, { reason: 'declined' })
      onDecline()
    } catch {
      onDecline()
    }
  }

  const progress = (secondsLeft / TIMEOUT_SEC) * 100

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative w-full max-w-lg glass-strong rounded-t-3xl p-6 pb-10 space-y-5"
      >
        {/* Timer ring + header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[--text-muted] uppercase tracking-wider font-semibold">New job request</p>
            <h2 className="font-syne font-bold text-xl text-[--text-primary] mt-0.5">
              {job.category?.name || 'Service'}
            </h2>
          </div>

          {/* Countdown */}
          <div className="relative w-16 h-16">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="24" fill="none" stroke="var(--g-border)" strokeWidth="4" />
              <circle
                cx="28" cy="28" r="24"
                fill="none"
                stroke={secondsLeft <= 3 ? '#ef4444' : '#F59E0B'}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 24}`}
                strokeDashoffset={`${2 * Math.PI * 24 * (1 - progress / 100)}`}
                style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
              />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center font-mono font-bold text-lg ${
              secondsLeft <= 3 ? 'text-red-400' : 'text-[--text-primary]'
            }`}>
              {secondsLeft}
            </span>
          </div>
        </div>

        {/* Job details */}
        <div className="glass-light rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <MapPin size={16} className="text-brand mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-[--text-primary]">{job.location_address}</p>
              {job.distance_km && (
                <p className="text-xs text-[--text-muted] mt-0.5">{job.distance_km.toFixed(1)} km away</p>
              )}
            </div>
          </div>
          {job.description && (
            <div className="flex items-start gap-3">
              <Clock size={16} className="text-[--text-muted] mt-0.5 shrink-0" />
              <p className="text-sm text-[--text-secondary]">{job.description}</p>
            </div>
          )}
          {job.budget_max && (
            <div className="flex items-center gap-3">
              <DollarSign size={16} className="text-instant shrink-0" />
              <p className="text-sm text-[--text-primary]">
                Budget up to <span className="font-semibold text-instant">{formatCurrency(job.budget_max)}</span>
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleDecline}
            disabled={!!loading}
            className="py-4 rounded-2xl glass-light text-[--text-secondary] font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
            style={{ border: '1px solid var(--g-border)' }}
          >
            {loading === 'decline' ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={18} />}
            Decline
          </button>
          <button
            onClick={handleAccept}
            disabled={!!loading}
            className="py-4 rounded-2xl bg-instant text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-instant/20 disabled:opacity-50"
          >
            {loading === 'accept' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={18} />}
            Accept
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
