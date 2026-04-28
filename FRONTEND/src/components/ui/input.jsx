import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

const Input = forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-11 w-full rounded-xl glass-light px-4 py-2 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none focus:ring-1 focus:ring-brand/50 focus:border-brand/40 transition-all',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
