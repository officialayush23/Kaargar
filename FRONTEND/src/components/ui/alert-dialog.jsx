import * as React from 'react'
import { cn } from '@/lib/utils'

const AlertDialog = ({ open, onOpenChange, children }) => {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange?.(false)}
      />
      {children}
    </div>
  )
}

const AlertDialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative z-50 w-full max-w-lg rounded-2xl p-6 shadow-2xl',
      className
    )}
    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
    {...props}
  >
    {children}
  </div>
))
AlertDialogContent.displayName = 'AlertDialogContent'

const AlertDialogHeader = ({ className, ...props }) => (
  <div className={cn('flex flex-col space-y-2 mb-4', className)} {...props} />
)

const AlertDialogFooter = ({ className, ...props }) => (
  <div className={cn('flex justify-end gap-3 mt-6', className)} {...props} />
)

const AlertDialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn('text-lg font-semibold', className)}
    style={{ color: 'var(--text-primary)' }}
    {...props}
  />
))
AlertDialogTitle.displayName = 'AlertDialogTitle'

const AlertDialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm', className)}
    style={{ color: 'var(--text-muted)' }}
    {...props}
  />
))
AlertDialogDescription.displayName = 'AlertDialogDescription'

const AlertDialogAction = React.forwardRef(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors',
      className
    )}
    {...props}
  />
))
AlertDialogAction.displayName = 'AlertDialogAction'

const AlertDialogCancel = React.forwardRef(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-white/5',
      className
    )}
    style={{ color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border)' }}
    {...props}
  />
))
AlertDialogCancel.displayName = 'AlertDialogCancel'

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
