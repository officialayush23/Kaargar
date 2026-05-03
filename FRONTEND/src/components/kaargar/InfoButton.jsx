/**
 * InfoButton — reusable "?" / "i" popover for contextual help.
 *
 * Usage:
 *   <InfoButton text="This section shows your total earnings for today." />
 *   <InfoButton title="Earnings" text="..." side="bottom" />
 *
 * Works with no extra dependencies — pure inline CSS + Framer Motion.
 */

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Info } from 'lucide-react'

export function InfoButton({ text, title, size = 16, side = 'top', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  const placement = {
    top:    { bottom: '130%', left: '50%', transform: 'translateX(-50%)' },
    bottom: { top: '130%',   left: '50%', transform: 'translateX(-50%)' },
    left:   { right: '130%', top: '50%',  transform: 'translateY(-50%)' },
    right:  { left:  '130%', top: '50%',  transform: 'translateY(-50%)' },
  }[side] || { bottom: '130%', left: '50%', transform: 'translateX(-50%)' }

  const arrowStyle = {
    top:    { top: '100%', left: '50%', transform: 'translateX(-50%)', borderTop: '5px solid var(--elevated, #1C1C1E)', borderLeft: '5px solid transparent', borderRight: '5px solid transparent' },
    bottom: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', borderBottom: '5px solid var(--elevated, #1C1C1E)', borderLeft: '5px solid transparent', borderRight: '5px solid transparent' },
    left:   { left: '100%', top: '50%', transform: 'translateY(-50%)', borderLeft: '5px solid var(--elevated, #1C1C1E)', borderTop: '5px solid transparent', borderBottom: '5px solid transparent' },
    right:  { right: '100%', top: '50%', transform: 'translateY(-50%)', borderRight: '5px solid var(--elevated, #1C1C1E)', borderTop: '5px solid transparent', borderBottom: '5px solid transparent' },
  }[side] || {}

  const anim = {
    top:    { initial: { opacity: 0, y: 6,  scale: 0.94 }, animate: { opacity: 1, y: 0,  scale: 1 } },
    bottom: { initial: { opacity: 0, y: -6, scale: 0.94 }, animate: { opacity: 1, y: 0,  scale: 1 } },
    left:   { initial: { opacity: 0, x: 8,  scale: 0.94 }, animate: { opacity: 1, x: 0,  scale: 1 } },
    right:  { initial: { opacity: 0, x: -8, scale: 0.94 }, animate: { opacity: 1, x: 0,  scale: 1 } },
  }[side] || { initial: { opacity: 0, y: 6, scale: 0.94 }, animate: { opacity: 1, y: 0, scale: 1 } }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }} className={className}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        style={{
          width: size + 4,
          height: size + 4,
          borderRadius: '50%',
          border: '1px solid var(--card-border, rgba(255,255,255,0.08))',
          background: open ? 'rgba(245,158,11,0.15)' : 'var(--card-bg, rgba(255,255,255,0.04))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s ease',
          outline: 'none',
        }}
        aria-label="More information"
      >
        <Info
          size={size - 2}
          style={{ color: open ? 'var(--amber, #F59E0B)' : 'var(--text-muted, #475569)', transition: 'color 0.15s' }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={anim.initial}
            animate={anim.animate}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              ...placement,
              width: '220px',
              background: 'var(--elevated, #1C1C1E)',
              border: '1px solid var(--card-border, rgba(255,255,255,0.08))',
              borderRadius: '12px',
              padding: '12px 14px',
              zIndex: 200,
              boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
              pointerEvents: 'none',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Arrow */}
            <div style={{
              position: 'absolute',
              width: 0, height: 0,
              ...arrowStyle,
            }} />

            {title && (
              <p style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--amber, #F59E0B)',
                marginBottom: '5px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {title}
              </p>
            )}
            <p style={{
              fontSize: '12px',
              color: 'var(--text-secondary, #94A3B8)',
              lineHeight: 1.55,
              margin: 0,
            }}>
              {text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default InfoButton
