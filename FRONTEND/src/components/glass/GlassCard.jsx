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
  // glows disabled — no hue glow anywhere
  const glowMap = {
    azure:  '',
    green:  '',
    amber:  '',
    violet: '',
  }

  const base = blue ? 'glass-amber' : 'glass-card'

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
      {children}
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
      {children}
    </motion.div>
  )
}
