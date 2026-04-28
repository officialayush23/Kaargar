import { cn } from '@/lib/utils'

function Avatar({ className, children, ...props }) {
  return (
    <div
      className={cn('relative flex shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    >
      {children}
    </div>
  )
}

function AvatarImage({ className, src, alt = '', ...props }) {
  if (!src) return null
  return (
    <img
      src={src}
      alt={alt}
      className={cn('aspect-square h-full w-full object-cover', className)}
      {...props}
    />
  )
}

function AvatarFallback({ className, children, ...props }) {
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center rounded-full bg-brand/20 text-brand font-semibold font-syne',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { Avatar, AvatarImage, AvatarFallback }
