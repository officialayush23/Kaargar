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
    brand:     'btn-brand rounded-xl',
    instant:   'btn-brand rounded-xl',
    discovery: 'btn-brand rounded-xl',
    ghost:     'btn-glass rounded-xl',
    outline:   'rounded-xl transition-all border',
    danger:    'bg-red-600 text-white rounded-xl transition-all',
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

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className="h-4 w-4 flex-shrink-0" />}
          {children}
          {Icon && iconPosition === 'right' && <Icon className="h-4 w-4 flex-shrink-0" />}
        </>
      )}
    </motion.button>
  )
}
