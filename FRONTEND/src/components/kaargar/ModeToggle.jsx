import { motion } from 'framer-motion'
import { Zap, Compass } from 'lucide-react'
import { useAppStore } from '@/stores/app'
import { cn } from '@/lib/utils'

const MODES = [
  {
    id: 'instant',
    label: 'Instant',
    icon: Zap,
    gradient: 'from-emerald-500/90 to-emerald-600/70',
    glow: '0 0 24px rgba(16,185,129,0.5)',
    dot: 'bg-emerald-400',
  },
  {
    id: 'discovery',
    label: 'Discover',
    icon: Compass,
    gradient: 'from-amber-400/90 to-amber-600/70',
    glow: '0 0 24px rgba(245,158,11,0.5)',
    dot: 'bg-amber-400',
  },
]

export function ModeToggle() {
  const { mode, setMode } = useAppStore()

  return (
    <motion.div
      className="fixed bottom-[5.5rem] left-1/2 -translate-x-1/2 z-40"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 24 }}
    >
      <div className="glass-strong rounded-full p-1.5 flex gap-0.5 shadow-2xl border border-white/15">
        {MODES.map(({ id, label, icon: Icon, gradient, glow, dot }) => {
          const active = mode === id
          return (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={cn(
                'relative rounded-full px-5 py-2.5 text-sm font-semibold transition-colors duration-200 flex items-center gap-2 select-none',
                active ? 'text-white' : 'text-white/40 hover:text-white/70'
              )}
            >
              {active && (
                <motion.div
                  layoutId="mode-pill"
                  className={cn('absolute inset-0 rounded-full bg-gradient-to-r', gradient)}
                  style={{ boxShadow: glow }}
                  transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {active && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={cn('w-1.5 h-1.5 rounded-full', dot)}
                  />
                )}
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </motion.div>
  )
}
