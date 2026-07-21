import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Textarea = forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex w-full rounded-xl glass-light px-4 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none focus:ring-1 focus:ring-brand/50 focus:border-brand/40 transition-all resize-none',
      className
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export { Textarea }
