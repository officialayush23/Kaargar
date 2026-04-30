import { motion } from 'framer-motion'
import { Zap, Compass } from 'lucide-react'
import { useAppStore } from '@/stores/app'

const MODES = [
  {
    id: 'instant',
    label: 'Instant',
    icon: Zap,
    activeBg: 'rgba(34,197,94,0.18)',
    activeBorder: 'rgba(34,197,94,0.45)',
    activeGlow: '0 0 20px rgba(34,197,94,0.35)',
    activeColor: '#4ade80',
    dotColor: '#22c55e',
  },
  {
    id: 'discovery',
    label: 'Discover',
    icon: Compass,
    activeBg: 'rgba(245,158,11,0.18)',
    activeBorder: 'rgba(245,158,11,0.45)',
    activeGlow: '0 0 20px rgba(245,158,11,0.35)',
    activeColor: '#fbbf24',
    dotColor: '#f59e0b',
  },
]

export function ModeToggle() {
  const { mode, setMode } = useAppStore()

  return (
    <motion.div
      className="fixed bottom-20 inset-x-0 z-40 flex justify-center"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, type: 'spring', stiffness: 300, damping: 26 }}
      style={{ pointerEvents: 'none' }}
    >
      {/* Pill container — solid background, no backdrop-filter to avoid blob artifacts */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          padding: '5px',
          borderRadius: '9999px',
          background: 'var(--g-bg-hi)',
          border: '1.5px solid var(--g-border)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.28), inset 0 1px 0 var(--g-shine)',
          pointerEvents: 'auto',
        }}
      >
        {MODES.map(({ id, label, icon: Icon, activeBg, activeBorder, activeGlow, activeColor, dotColor }) => {
          const active = mode === id

          return (
            <button
              key={id}
              onClick={() => setMode(id)}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '9px 18px',
                borderRadius: '9999px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                outline: 'none',
                userSelect: 'none',
                WebkitTapHighlightColor: 'transparent',
                transition: 'color 0.2s ease',
                color: active ? activeColor : 'var(--text-muted)',
                fontWeight: active ? 600 : 400,
                fontSize: '13px',
              }}
            >
              {/* Active pill background */}
              {active && (
                <motion.div
                  layoutId="mode-active-pill"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '9999px',
                    background: activeBg,
                    border: `1.5px solid ${activeBorder}`,
                    boxShadow: activeGlow,
                  }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                />
              )}

              {/* Content */}
              <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {active && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: dotColor,
                      boxShadow: `0 0 6px ${dotColor}`,
                      flexShrink: 0,
                    }}
                  />
                )}
                <Icon size={14} />
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}
