import { cn } from '@/lib/utils'
import { cva } from 'class-variance-authority'
import { forwardRef } from 'react'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 btn-liquid active:scale-95',
  {
    variants: {
      variant: {
        default:     'btn-brand text-white font-semibold',
        instant:     'btn-instant text-white font-semibold',
        discovery:   'btn-discovery text-white font-semibold',
        // outline + ghost use CSS-variable utility classes defined in globals.css:
        outline:     'btn-outline-token',
        ghost:       'btn-ghost-token',
        destructive: 'bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30',
        link:        'text-brand underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-6 py-2',
        sm:      'h-9 px-4 text-xs',
        lg:      'h-13 px-8 text-base',
        icon:    'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

const Button = forwardRef(({ className, variant, size, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  />
))
Button.displayName = 'Button'

export { Button, buttonVariants }
