import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('rounded-lg shimmer bg-white/5', className)}
      {...props}
    />
  )
}

export { Skeleton }
