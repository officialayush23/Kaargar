/**
 * InfoButton — "ⓘ" contextual help popover.
 *
 * Renders via React portal at document.body level so it is never clipped
 * by ancestor containers that have overflow:hidden / overflow:scroll.
 *
 * Usage:
 *   <InfoButton text="This shows your total earnings today." />
 *   <InfoButton title="Earnings" text="..." side="bottom" />
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Info } from 'lucide-react'

const POPUP_W   = 220   // px — fixed width of the popup
const GAP       =  8    // px — gap between button edge and popup edge
const EDGE_PAD  =  8    // px — minimum distance from viewport edge

export function InfoButton({ text, title, size = 16, side = 'top', className = '' }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect]  = useState(null)   // DOMRect of the button (at click time)
  const btnRef = useRef(null)

  // Compute and cache the button's viewport rect whenever it opens
  const openPopup = useCallback((e) => {
    e.stopPropagation()
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(v => !v)
  }, [])

  // Close on outside click / scroll
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return
      setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  // ── Compute fixed-position coords from the saved DOMRect ──────────────────
  function computeStyle() {
    if (!rect) return { top: 0, left: 0, transform: 'none' }

    let top, left, transform = 'none'

    switch (side) {
      case 'bottom':
        top  = rect.bottom + GAP
        left = rect.left + rect.width / 2 - POPUP_W / 2
        break
      case 'left':
        top  = rect.top + rect.height / 2
        left = rect.left - POPUP_W - GAP
        transform = 'translateY(-50%)'
        break
      case 'right':
        top  = rect.top + rect.height / 2
        left = rect.right + GAP
        transform = 'translateY(-50%)'
        break
      case 'top':
      default:
        top  = rect.top - GAP
        left = rect.left + rect.width / 2 - POPUP_W / 2
        transform = 'translateY(-100%)'
        break
    }

    // Clamp horizontal so popup never overflows viewport
    left = Math.max(EDGE_PAD, Math.min(left, window.innerWidth - POPUP_W - EDGE_PAD))

    return { top, left, transform }
  }

  // ── Animation variants ────────────────────────────────────────────────────
  const motionVariants = {
    top:    { initial: { opacity: 0, y:  6, scale: 0.93 }, animate: { opacity: 1, y: 0, scale: 1 } },
    bottom: { initial: { opacity: 0, y: -6, scale: 0.93 }, animate: { opacity: 1, y: 0, scale: 1 } },
    left:   { initial: { opacity: 0, x:  8, scale: 0.93 }, animate: { opacity: 1, x: 0, scale: 1 } },
    right:  { initial: { opacity: 0, x: -8, scale: 0.93 }, animate: { opacity: 1, x: 0, scale: 1 } },
  }[side] ?? { initial: { opacity: 0, y: 6, scale: 0.93 }, animate: { opacity: 1, y: 0, scale: 1 } }

  // ── Portal content ────────────────────────────────────────────────────────
  const { top, left, transform } = computeStyle()

  const popup = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="info-popup"
          initial={motionVariants.initial}
          animate={motionVariants.animate}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.13, ease: 'easeOut' }}
          style={{
            position:  'fixed',
            top,
            left,
            transform,
            width:     POPUP_W,
            zIndex:    99999,
            background: '#141B26',
            border:    '1px solid rgba(255,255,255,0.10)',
            borderRadius: 12,
            padding:   '12px 14px',
            boxShadow: '0 16px 48px rgba(0,0,0,0.70)',
            pointerEvents: 'none',   // tooltip is read-only
          }}
        >
          {title && (
            <p style={{
              fontSize: 11, fontWeight: 700, color: '#F59E0B',
              marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {title}
            </p>
          )}
          <p style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.55, margin: 0 }}>
            {text}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* The trigger button — stays in the normal document flow */}
      <div
        ref={btnRef}
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
        className={className}
      >
        <button
          onClick={openPopup}
          style={{
            width:  size + 4,
            height: size + 4,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.08)',
            background: open ? '#2D1A06' : 'rgba(255,255,255,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.15s ease',
            outline: 'none',
          }}
          aria-label="More information"
          aria-expanded={open}
        >
          <Info
            size={size - 2}
            style={{
              color: open ? '#F59E0B' : '#475569',
              transition: 'color 0.15s',
            }}
          />
        </button>
      </div>

      {/* Popup rendered at body level — never clipped by any ancestor */}
      {typeof document !== 'undefined' && createPortal(popup, document.body)}
    </>
  )
}

export default InfoButton
