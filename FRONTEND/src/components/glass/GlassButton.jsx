import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

/**
 * LiquidGlassButton — variants: brand (azure), instant (green),
 * discovery (amber), ghost (transparent glass), outline.
 * Uses CSS variables for theme compatibility (dark + light mode).
 */
export function GlassButton({
  children,
  className,
  variant = 'brand',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  iconPosition = 'left',
  onClick,
  type = 'button',
  ...props
}) {
  const variants = {
    brand:     'btn-brand text-white rounded-xl',
    instant:   'btn-instant text-white rounded-xl',
    discovery: 'btn-discovery text-white rounded-xl',
    ghost:     'btn-glass rounded-xl',
    outline:   'rounded-xl transition-all border',
    danger:    'bg-gradient-to-br from-red-500 to-red-700 text-white rounded-xl shadow-[0_4px_20px_rgba(239,68,68,0.4)] hover:shadow-[0_8px_32px_rgba(239,68,68,0.55)] transition-all',
  }

  const sizes = {
    xs: 'px-3 py-1.5 text-xs',
    sm: 'px-4 py-2 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
    xl: 'px-8 py-4 text-lg',
    icon: 'p-2.5',
  }

  const isDisabled = disabled || loading

  // outline variant needs CSS-variable inline styles to be theme-aware
  const outlineStyle = variant === 'outline' ? {
    borderColor: 'var(--g-border)',
    background: 'var(--g-bg)',
    color: 'var(--text-secondary)',
  } : undefined

  return (
    <motion.button
      type={type}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      whileHover={isDisabled ? {} : { scale: 1.02, y: -1 }}
      whileTap={isDisabled ? {} : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      style={outlineStyle}
      className={cn(
        'relative inline-flex items-center justify-center gap-2 font-semibold select-none overflow-hidden',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {/* Glare sweep on hover */}
      {!isDisabled && (
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 50%)',
            opacity: 0,
          }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      )}

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        Icon && iconPosition === 'left' && <Icon className="h-4 w-4 shrink-0" />
      )}

      {children && <span className="relative">{children}</span>}

      {!loading && Icon && iconPosition === 'right' && (
        <Icon className="h-4 w-4 shrink-0" />
      )}
    </motion.button>
  )
}
