import { cn } from '@/lib/utils'
import { forwardRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

function Dialog({ open, onOpenChange, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => onOpenChange?.(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onClick={e => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const DialogContent = forwardRef(({ className, children, onClose, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('relative rounded-2xl p-6 w-full max-w-md shadow-2xl', className)}
    style={{
      background: 'var(--bg-surface, #0D1117)',
      border: '1px solid var(--g-border)',
    }}
    {...props}
  >
    {onClose && (
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-1 rounded-lg transition-colors btn-ghost-token"
      >
        <X size={16} />
      </button>
    )}
    {children}
  </div>
))
DialogContent.displayName = 'DialogContent'

const DialogHeader = forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('mb-4', className)} {...props} />
))
DialogHeader.displayName = 'DialogHeader'

const DialogTitle = forwardRef(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn('text-base font-semibold', className)}
    style={{ color: 'var(--text-primary)' }}
    {...props}
  />
))
DialogTitle.displayName = 'DialogTitle'

const DialogFooter = forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex justify-end gap-3 mt-5', className)} {...props} />
))
DialogFooter.displayName = 'DialogFooter'


const DialogDescription = forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm', className)} style={{ color: 'var(--text-muted)' }} {...props} />
))
DialogDescription.displayName = 'DialogDescription'

export { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription }
