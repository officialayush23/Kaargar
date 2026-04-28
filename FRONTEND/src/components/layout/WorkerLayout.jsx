import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Briefcase, Image, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const WORKER_NAV = [
  { to: '/worker', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/worker/services', icon: Briefcase, label: 'Services' },
  { to: '/worker/media', icon: Image, label: 'Portfolio' },
  { to: '/worker/profile', icon: User, label: 'Profile' },
]

export function WorkerLayout() {
  return (
    <div className="min-h-screen bg-[--bg-base] flex flex-col">
      <div className="sticky top-0 z-30 flex items-center px-5 py-3 glass border-b border-white/5">
        <span className="font-syne font-bold text-lg text-[--text-primary]">
          kaargar <span className="text-xs font-normal text-[--text-muted] ml-1">worker</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pb-28">
        <Outlet />
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4 safe-bottom">
        <nav className="glass rounded-2xl flex items-center justify-around py-2.5 px-3 shadow-xl">
          {WORKER_NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/worker'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-colors',
                  isActive ? 'text-brand' : 'text-[--text-muted] hover:text-[--text-secondary]'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center transition-all', isActive ? 'bg-brand/15' : '')}>
                    <Icon size={18} />
                  </div>
                  <span className="text-[10px] font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
