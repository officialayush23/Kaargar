import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * LiquidGlassCard — frosted glass card with specular highlight,
 * hover lift, and optional blue tint or glow.
 */
export function GlassCard({
  children,
  className,
  hover = true,
  blue = false,
  glow = false,
  glowColor = 'azure',
  onClick,
  as: Tag = 'div',
  ...props
}) {
  const glowMap = {
    azure:  'shadow-[0_0_32px_rgba(59,130,246,0.25)]',
    green:  'shadow-[0_0_32px_rgba(16,185,129,0.25)]',
    amber:  'shadow-[0_0_32px_rgba(245,158,11,0.25)]',
    violet: 'shadow-[0_0_32px_rgba(124,58,237,0.25)]',
  }

  const base = blue ? 'glass-blue' : 'glass-card'

  const inner = (
    <Tag
      onClick={onClick}
      className={cn(
        base,
        'rounded-2xl',
        hover && onClick && 'cursor-pointer select-none',
        glow && glowMap[glowColor],
        className
      )}
      {...props}
    >
      {/* Top-left specular corner highlight */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background: 'radial-gradient(ellipse 50% 40% at 15% 10%, rgba(255,255,255,0.09) 0%, transparent 70%)',
          zIndex: 0,
        }}
      />
      {/* Top edge shine line */}
      <div
        className="pointer-events-none absolute top-0 left-4 right-4 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)', zIndex: 1 }}
      />
      <div className="relative" style={{ zIndex: 2 }}>
        {children}
      </div>
    </Tag>
  )

  if (!hover || !onClick) return inner

  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.005 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
      onClick={onClick}
      className={cn(base, 'rounded-2xl cursor-pointer select-none', glow && glowMap[glowColor], className)}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ background: 'radial-gradient(ellipse 50% 40% at 15% 10%, rgba(255,255,255,0.09) 0%, transparent 70%)', zIndex: 0 }}
      />
      <div
        className="pointer-events-none absolute top-0 left-4 right-4 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)', zIndex: 1 }}
      />
      <div className="relative" style={{ zIndex: 2 }}>{children}</div>
    </motion.div>
  )
}
