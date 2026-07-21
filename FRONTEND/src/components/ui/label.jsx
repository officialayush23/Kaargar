import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

const Label = forwardRef(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('text-xs font-medium block mb-1.5', className)}
    style={{ color: 'var(--text-muted)' }}
    {...props}
  />
))
Label.displayName = 'Label'

export { Label }
