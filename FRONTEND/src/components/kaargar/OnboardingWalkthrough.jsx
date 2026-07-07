/**
 * OnboardingWalkthrough — first-time user tour.
 *
 * Shows once per user (keyed by user ID in localStorage).
 * Triggered from AppLayout on first login.
 *
 * Features:
 *  • Full-screen frosted overlay with animated page-by-page cards
 *  • Skip + Next / Done controls
 *  • Dot indicators
 *  • Framer Motion slide + scale transitions
 *  • Responsive, non-AI visual style — emoji + clean copy
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'

const SLIDES = [
  {
    emoji: '⚡',
    title: 'Instant Help',
    subtitle: 'Need someone right now?',
    body: 'Switch to Instant mode on the home screen and pick a category — electrician, plumber, cleaner and more. We find the best available worker near you in minutes.',
    hint: 'Tap the green "Instant" pill on the home screen to get started.',
  },
  {
    emoji: '🔍',
    title: 'Discover & Schedule',
    subtitle: 'Plan ahead, your way.',
    body: 'Browse the Discover tab to find top-rated workers and services. Pick up to 3 preferred days and a time window — we\'ll confirm the best worker and notify you before they arrive.',
    hint: 'Tap "Discover" in the bottom nav to explore.',
  },
  {
    emoji: '📋',
    title: 'Your Bookings',
    subtitle: 'Everything in one place.',
    body: 'The Bookings tab shows all your active jobs, past services, and any packages you\'ve purchased. Track status in real-time — from worker assigned to job completed.',
    hint: 'Tap "Bookings" in the bottom nav.',
  },
  {
    emoji: '💬',
    title: 'Private Chat',
    subtitle: 'Talk without sharing contacts.',
    body: 'Once a worker is assigned, a private chat opens automatically. No phone numbers are ever shared — all communication stays inside Kaargar.',
    hint: 'Chat unlocks after a worker is assigned to your job.',
  },
  {
    emoji: '🔒',
    title: 'Safe & Verified',
    subtitle: 'Trust, built in.',
    body: 'Every worker is verified by our team before they can accept jobs. A one-time OTP confirms the job start — your money stays in escrow until the work is done and you approve.',
    hint: 'Pay only after you\'re satisfied with the job.',
  },
]

export function OnboardingWalkthrough({ onDone }) {
  const [idx, setIdx] = useState(0)
  const [dir, setDir] = useState(1)

  function next() {
    if (idx < SLIDES.length - 1) {
      setDir(1)
      setIdx(i => i + 1)
    } else {
      onDone()
    }
  }

  function prev() {
    if (idx > 0) {
      setDir(-1)
      setIdx(i => i - 1)
    }
  }

  const slide = SLIDES[idx]
  const isLast = idx === SLIDES.length - 1

  const variants = {
    enter: d => ({ opacity: 0, x: d > 0 ? 60 : -60, scale: 0.97 }),
    center: { opacity: 1, x: 0, scale: 1 },
    exit: d => ({ opacity: 0, x: d > 0 ? -60 : 60, scale: 0.97 }),
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0 0 24px',
      }}
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
        }}
        onClick={onDone}
      />

      {/* Card */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '420px', padding: '0 16px' }}>

        {/* Skip button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
          <button
            onClick={onDone}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 12px', borderRadius: '20px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--text-muted)', fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Skip <X size={12} />
          </button>
        </div>

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={idx}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            style={{
              background: 'var(--elevated, #1C1C1E)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '24px',
              padding: '32px 28px 28px',
            }}
          >
            {/* Emoji */}
            <motion.div
              key={`emoji-${idx}`}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 20 }}
              style={{
                width: 72, height: 72,
                borderRadius: '20px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '36px',
                marginBottom: '20px',
              }}
            >
              {slide.emoji}
            </motion.div>

            {/* Subtitle */}
            <p style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '6px',
            }}>
              {slide.subtitle}
            </p>

            {/* Title */}
            <h2 style={{
              fontSize: '22px',
              fontWeight: 700,
              color: 'var(--text-primary, #F1F5F9)',
              marginBottom: '12px',
              lineHeight: 1.2,
              fontFamily: 'Poppins, Arial, sans-serif',
            }}>
              {slide.title}
            </h2>

            {/* Body */}
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary, #94A3B8)',
              lineHeight: 1.6,
              marginBottom: '16px',
            }}>
              {slide.body}
            </p>

            {/* Hint chip */}
            <div style={{
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              marginBottom: '28px',
            }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #475569)', lineHeight: 1.5 }}>
                💡 {slide.hint}
              </p>
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Dot indicators */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {SLIDES.map((_, i) => (
                  <motion.button
                    key={i}
                    onClick={() => { setDir(i > idx ? 1 : -1); setIdx(i) }}
                    animate={{
                      width: i === idx ? 20 : 6,
                      background: i === idx ? 'var(--accent)' : 'rgba(255,255,255,0.15)',
                    }}
                    transition={{ duration: 0.2 }}
                    style={{
                      height: 6,
                      borderRadius: '3px',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                ))}
              </div>

              {/* Prev + Next */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {idx > 0 && (
                  <button
                    onClick={prev}
                    style={{
                      width: 40, height: 40, borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: '18px',
                    }}
                  >
                    ←
                  </button>
                )}

                <motion.button
                  onClick={next}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '10px 20px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'var(--accent)',
                    color: '#000',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isLast ? "Let's go" : 'Next'}
                  {isLast ? ' 🚀' : <ChevronRight size={16} />}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Step counter */}
        <p style={{
          textAlign: 'center',
          fontSize: '11px',
          color: 'var(--text-muted)',
          marginTop: '12px',
        }}>
          {idx + 1} of {SLIDES.length}
        </p>
      </div>
    </motion.div>
  )
}


/**
 * useOnboarding — hook to manage first-time walkthrough visibility.
 * Returns [show, dismiss]. Call dismiss() when done.
 * Uses localStorage key: `kaargar_onboarded_${userId}`
 */
export function useOnboarding() {
  const { user } = useAuthStore()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    const key = `kaargar_onboarded_${user.id}`
    const seen = localStorage.getItem(key)
    if (!seen) {
      // Small delay so the home page renders first
      const t = setTimeout(() => setShow(true), 800)
      return () => clearTimeout(t)
    }
  }, [user?.id])

  function dismiss() {
    if (user?.id) {
      localStorage.setItem(`kaargar_onboarded_${user.id}`, '1')
    }
    setShow(false)
  }

  return [show, dismiss]
}

export default OnboardingWalkthrough
