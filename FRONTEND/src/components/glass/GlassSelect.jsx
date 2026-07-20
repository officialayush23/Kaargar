import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * GlassSelect — themed dropdown to replace native <select> everywhere.
 * Native selects render as an unstyleable OS popup that ignores the app's
 * dark/light glass theme; this renders its own panel so it always matches.
 *
 * Usage mirrors a controlled <select>, but onChange receives the raw value
 * directly (not an event):
 *
 *   <GlassSelect
 *     value={status}
 *     onChange={(v) => setStatus(v)}
 *     options={[{ value: 'a', label: 'A' }, 'b', 'c']}
 *     placeholder="Select..."
 *   />
 *
 * `options` entries may be plain strings/numbers or { value, label } objects.
 */
export function GlassSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  disabled = false,
  className,
  style,
  size = 'md',
  align = 'left', // 'left' | 'right' — which edge the panel hugs
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null) // trigger's bounding rect while open
  const containerRef = useRef()
  const panelRef = useRef()

  // The trigger commonly sits inside a `.glass-card` (overflow:hidden, for its
  // rounded-corner clipping) — an absolutely-positioned dropdown panel nested
  // inside that card gets clipped by the ancestor regardless of z-index. So
  // instead the panel is portaled to <body> and placed with `position: fixed`
  // using the trigger's own viewport rect, which sidesteps any ancestor's
  // overflow/stacking context entirely.
  const updateRect = useCallback(() => {
    if (containerRef.current) setRect(containerRef.current.getBoundingClientRect())
  }, [])

  useLayoutEffect(() => {
    if (open) updateRect()
  }, [open, updateRect])

  useEffect(() => {
    function onClickOutside(e) {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    if (open) {
      window.addEventListener('scroll', updateRect, true)
      window.addEventListener('resize', updateRect)
    }
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [open, updateRect])

  const normalized = options.map(o =>
    (o !== null && typeof o === 'object') ? o : { value: o, label: String(o) }
  )
  const selected = normalized.find(o => String(o.value) === String(value))

  const sizes = {
    sm: { padY: '7px', padX: '10px', font: '13px' },
    md: { padY: '10px', padX: '14px', font: '14px' },
  }
  const s = sizes[size] || sizes.md

  return (
    <div ref={containerRef} className={cn('relative', className)} style={{ ...style, zIndex: open ? 60 : undefined }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        className="w-full flex items-center justify-between transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          padding: `${s.padY} ${s.padX}`,
          borderRadius: '12px',
          border: open ? '1.5px solid var(--accent)' : '1px solid var(--g-border)',
          background: 'var(--g-bg)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span
          className="truncate text-left"
          style={{
            fontSize: s.font,
            color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
          }}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          style={{
            color: 'var(--text-muted)',
            flexShrink: 0,
            marginLeft: '8px',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.18s ease',
          }}
        />
      </button>

      {open && rect && createPortal(
        <AnimatePresence>
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'fixed',
              top: rect.bottom + 6,
              ...(align === 'right'
                ? { right: Math.max(8, window.innerWidth - rect.right) }
                : { left: rect.left }),
              minWidth: rect.width,
              maxWidth: `calc(100vw - 16px)`,
              zIndex: 1000,
              borderRadius: '14px',
              background: 'var(--elevated)',
              border: '1px solid var(--card-border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              overflow: 'hidden',
            }}
          >
            <div style={{ maxHeight: '260px', overflowY: 'auto', padding: '6px' }}>
              {normalized.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No options
                </p>
              ) : normalized.map(opt => {
                const isSelected = String(opt.value) === String(value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => { onChange?.(opt.value); setOpen(false) }}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: isSelected ? 'var(--accent-deep)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      cursor: opt.disabled ? 'not-allowed' : 'pointer',
                      opacity: opt.disabled ? 0.5 : 1,
                      transition: 'background 0.1s ease',
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { if (!isSelected && !opt.disabled) e.currentTarget.style.background = 'var(--card-hover)' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{
                      fontSize: '13px',
                      color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: isSelected ? 600 : 400,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {opt.label}
                    </span>
                    {isSelected && <Check size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
