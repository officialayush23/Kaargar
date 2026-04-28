import { cn, getInitials } from '@/lib/utils'

function Avatar({ src, name, size = 'md', className }) {
  const sizes = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-20 h-20 text-xl',
  }

  if (src) {
    return (
      <img
        src={src}
        alt={name || 'avatar'}
        className={cn('rounded-full object-cover', sizes[size], className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'rounded-full bg-brand/20 flex items-center justify-center font-semibold text-brand font-syne',
        sizes[size],
        className
      )}
    >
      {getInitials(name)}
    </div>
  )
}

export { Avatar }
