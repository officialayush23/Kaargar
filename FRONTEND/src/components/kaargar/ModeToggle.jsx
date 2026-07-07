import { motion } from 'framer-motion'
import { Zap, Compass } from 'lucide-react'
import { useAppStore } from '@/stores/app'

const MODES = [
  {
    id: 'instant',
    label: 'Instant',
    // icon: Zap,
    activeBg: 'var(--accent)',
    activeBorder: 'var(--accent)',
    activeColor: '#000',
    dotColor: '#000',
  },
  {
    id: 'discovery',
    label: 'Discover',
    icon: Compass,
    activeBg: 'var(--accent-dim)',
    activeBorder: 'var(--accent-dim)',
    activeColor: 'var(--accent-soft)',
    dotColor: 'var(--accent-soft)',
  },
]

export function ModeToggle() {
  const { mode, setMode } = useAppStore()

  return (
    <motion.div
      className="fixed bottom-24 inset-x-0 z-40 flex justify-center"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, type: 'spring', stiffness: 300, damping: 26 }}
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          padding: '4px',
          borderRadius: '9999px',
          background: 'var(--card)',
          border: '1px solid var(--card-border)',
          pointerEvents: 'auto',
        }}
      >
        {MODES.map(({ id, label, icon: Icon, activeBg, activeBorder, activeColor, dotColor }) => {
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
                border: active ? `1px solid ${activeBorder}` : '1px solid transparent',
                background: active ? activeBg : 'transparent',
                cursor: 'pointer',
                outline: 'none',
                userSelect: 'none',
                WebkitTapHighlightColor: 'transparent',
                transition: 'background 0.2s ease, color 0.2s ease',
                color: active ? activeColor : 'var(--text-muted)',
                fontWeight: active ? 600 : 400,
                fontSize: '13px',
                fontFamily: "'Poppins', 'DM Sans', sans-serif",
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}
