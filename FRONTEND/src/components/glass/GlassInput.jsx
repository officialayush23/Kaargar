import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * LiquidGlassInput — frosted glass text input with optional icon,
 * label, helper text, and error state.
 */
export const GlassInput = forwardRef(function GlassInput(
  {
    className,
    label,
    helper,
    error,
    icon: Icon,
    iconPosition = 'left',
    suffix,
    type = 'text',
    wrapperClassName,
    ...props
  },
  ref
) {
  return (
    <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
      {label && (
        <label className="text-sm font-medium text-white/70 tracking-wide">
          {label}
        </label>
      )}

      <div className="relative flex items-center">
        {Icon && iconPosition === 'left' && (
          <span className="pointer-events-none absolute left-3.5 text-white/40">
            <Icon className="h-4 w-4" />
          </span>
        )}

        <input
          ref={ref}
          type={type}
          className={cn(
            'glass-input w-full rounded-xl py-2.5 text-sm text-white',
            'placeholder:text-white/30',
            Icon && iconPosition === 'left'  && 'pl-10 pr-4',
            Icon && iconPosition === 'right' && 'pr-10 pl-4',
            !Icon && 'px-4',
            suffix && 'pr-12',
            error && 'border-red-500/50 focus:border-red-500/70 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.12)]',
            className
          )}
          {...props}
        />

        {Icon && iconPosition === 'right' && (
          <span className="pointer-events-none absolute right-3.5 text-white/40">
            <Icon className="h-4 w-4" />
          </span>
        )}

        {suffix && (
          <span className="absolute right-3.5 text-sm text-white/40 select-none">
            {suffix}
          </span>
        )}
      </div>

      {(helper || error) && (
        <p className={cn('text-xs', error ? 'text-red-400' : 'text-white/40')}>
          {error || helper}
        </p>
      )}
    </div>
  )
})

/**
 * GlassTextarea — same aesthetic for multi-line input.
 */
export const GlassTextarea = forwardRef(function GlassTextarea(
  { className, label, helper, error, wrapperClassName, ...props },
  ref
) {
  return (
    <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
      {label && (
        <label className="text-sm font-medium text-white/70 tracking-wide">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        className={cn(
          'glass-input w-full rounded-xl px-4 py-3 text-sm text-white resize-none',
          'placeholder:text-white/30 min-h-[80px]',
          error && 'border-red-500/50',
          className
        )}
        {...props}
      />
      {(helper || error) && (
        <p className={cn('text-xs', error ? 'text-red-400' : 'text-white/40')}>
          {error || helper}
        </p>
      )}
    </div>
  )
})
