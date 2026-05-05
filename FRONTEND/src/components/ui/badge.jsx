import { cn } from '@/lib/utils'
import { cva } from 'class-variance-authority'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-brand/20 text-brand border border-brand/20',
        instant:     'bg-instant/20 text-instant border border-instant/20',
        discovery:   'bg-discovery/20 text-discovery border border-discovery/20',
        success:     'bg-green-500/20 text-green-400 border border-green-500/20',
        warning:     'bg-yellow-500/20 text-yellow-400 border border-yellow-500/20',
        destructive: 'bg-red-500/20 text-red-400 border border-red-500/20',
        // Use CSS vars via inline style for theme-aware variants:
        outline:     'badge-outline',
        muted:       'badge-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
