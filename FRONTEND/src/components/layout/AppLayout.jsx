import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Home, BookOpen, MessageSquare, User, Bell } from 'lucide-react'
import { useAppStore } from '@/stores/app'
import { NotificationDrawer } from '@/components/kaargar/NotificationDrawer'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/bookings', icon: BookOpen, label: 'Bookings' },
  { to: '/chat', icon: MessageSquare, label: 'Chat' },
  { to: '/profile', icon: User, label: 'Profile' },
]

export function AppLayout() {
  const { notifCount } = useAppStore()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[--bg-base] flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-5 py-3 glass border-b border-white/5">
        <span className="font-syne font-bold text-lg text-[--text-primary] tracking-tight">
          kaargar
        </span>
        <button
          onClick={() => setDrawerOpen(true)}
          className="relative p-2 rounded-xl hover:bg-white/5 transition-colors"
        >
          <Bell size={18} className="text-[--text-secondary]" />
          {notifCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-brand text-white text-[9px] font-bold flex items-center justify-center">
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </button>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-y-auto pb-32">
        <Outlet />
      </div>

      {/* Bottom nav — glass pill */}
      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4 safe-bottom">
        <nav className="glass rounded-2xl flex items-center justify-around py-2.5 px-3 shadow-xl">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors',
                  isActive
                    ? 'text-brand'
                    : 'text-[--text-muted] hover:text-[--text-secondary]'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    'w-8 h-8 rounded-xl flex items-center justify-center transition-all',
                    isActive ? 'bg-brand/15' : ''
                  )}>
                    <Icon size={18} />
                  </div>
                  <span className="text-[10px] font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <NotificationDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
