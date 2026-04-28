import { motion } from 'framer-motion'
import { Zap, Compass } from 'lucide-react'
import { useAppStore } from '@/stores/app'
import { cn } from '@/lib/utils'

export function ModeToggle() {
  const { mode, setMode } = useAppStore()

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40">
      <div className="glass-strong rounded-full p-1.5 flex gap-1 shadow-2xl">
        {[
          { id: 'instant', label: 'Instant', icon: Zap, color: 'text-instant' },
          { id: 'discovery', label: 'Discover', icon: Compass, color: 'text-discovery' },
        ].map(({ id, label, icon: Icon, color }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={cn(
              'relative rounded-full px-5 py-2.5 text-sm font-semibold transition-colors duration-200 flex items-center gap-2',
              mode === id ? 'text-white' : 'text-[--text-muted] hover:text-[--text-secondary]'
            )}
          >
            {mode === id && (
              <motion.div
                layoutId="mode-pill"
                className={cn(
                  'absolute inset-0 rounded-full',
                  id === 'instant'
                    ? 'bg-gradient-to-r from-instant/80 to-instant/60'
                    : 'bg-gradient-to-r from-discovery/80 to-discovery/60'
                )}
                style={{ boxShadow: id === 'instant' ? '0 0 20px rgba(34,197,94,0.4)' : '0 0 20px rgba(245,158,11,0.4)' }}
                transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon size={14} />
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
