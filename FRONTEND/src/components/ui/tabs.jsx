import { cn } from '@/lib/utils'
import { forwardRef, createContext, useContext, useState } from 'react'

const TabsCtx = createContext({})

function Tabs({ value, onValueChange, defaultValue, children, className, ...props }) {
  const [internal, setInternal] = useState(defaultValue || '')
  const active = value !== undefined ? value : internal
  const setActive = onValueChange || setInternal
  return (
    <TabsCtx.Provider value={{ active, setActive }}>
      <div className={cn('', className)} {...props}>{children}</div>
    </TabsCtx.Provider>
  )
}

const TabsList = forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="tablist"
    className={cn('inline-flex items-center gap-1 rounded-xl p-1', className)}
    style={{ background: 'rgba(13,17,23,0.6)', border: '1px solid rgba(255,255,255,0.07)' }}
    {...props}
  />
))
TabsList.displayName = 'TabsList'

const TabsTrigger = forwardRef(({ className, value, children, ...props }, ref) => {
  const { active, setActive } = useContext(TabsCtx)
  const isActive = active === value
  return (
    <button
      ref={ref}
      role="tab"
      aria-selected={isActive}
      onClick={() => setActive(value)}
      className={cn(
        'inline-flex items-center justify-center px-4 py-1.5 text-sm font-medium rounded-lg transition-all',
        className
      )}
      style={{
        background: isActive ? '#2D1A06' : 'transparent',
        color: isActive ? '#f59e0b' : '#94A3B8',
        border: isActive ? '1px solid #7C4A12' : '1px solid transparent',
      }}
      {...props}
    >
      {children}
    </button>
  )
})
TabsTrigger.displayName = 'TabsTrigger'

const TabsContent = forwardRef(({ className, value, children, ...props }, ref) => {
  const { active } = useContext(TabsCtx)
  if (active !== value) return null
  return <div ref={ref} role="tabpanel" className={cn('mt-4', className)} {...props}>{children}</div>
})
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }
