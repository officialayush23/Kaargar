import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('rounded-lg shimmer', className)}
      style={{ background: 'var(--g-bg-mid)' }}
      {...props}
    />
  )
}

export { Skeleton }
