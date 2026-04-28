import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, ChevronDown, MapPin, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useNotifications } from '@/hooks/useNotifications'

/**
 * GlassNavbar — floating centered pill, NOT edge-to-edge.
 * Sits at top-4 with horizontal margin so it floats over the content.
 */
export function GlassNavbar({ onLocationClick, onSearchClick }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { unreadCount } = useNotifications()
  const [notifOpen, setNotifOpen] = useState(false)

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? 'K'

  const isWorker = user?.role === 'worker'

  return (
    <motion.header
      className="fixed top-4 inset-x-0 z-50 flex justify-center px-4 pointer-events-none"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26, delay: 0.1 }}
    >
      <nav className="glass-navbar rounded-2xl px-4 py-2.5 flex items-center gap-3 w-full max-w-3xl pointer-events-auto">

        {/* Logo */}
        <Link
          to={isWorker ? '/worker' : '/'}
          className="flex items-center gap-2 shrink-0 group"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-azure to-azure-dim flex items-center justify-center shadow-[0_0_12px_rgba(59,130,246,0.4)]">
            <span className="text-white font-bold text-xs font-syne">K</span>
          </div>
          <span className="font-bold text-white text-sm font-syne tracking-tight hidden sm:block">
            Kaargar
          </span>
        </Link>

        {/* Location pill */}
        <button
          onClick={onLocationClick}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-left min-w-0 shrink"
        >
          <MapPin className="h-3.5 w-3.5 text-azure shrink-0" />
          <span className="text-xs text-white/70 truncate max-w-[100px] sm:max-w-[140px]">
            Pune, Maharashtra
          </span>
          <ChevronDown className="h-3 w-3 text-white/40 shrink-0" />
        </button>

        {/* Search bar — center, grows */}
        <button
          onClick={onSearchClick}
          className="flex-1 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-left min-w-0"
        >
          <Search className="h-3.5 w-3.5 text-white/40 shrink-0" />
          <span className="text-xs text-white/30 truncate">Search services…</span>
        </button>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0 relative">
          {/* Notification bell */}
          <div className="relative">
            <NotifBell count={unreadCount} onClick={() => setNotifOpen(v => !v)} />
            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  className="absolute right-0 top-full mt-2 w-80 glass-strong rounded-2xl overflow-hidden z-50 pointer-events-auto"
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                >
                  <NotifPopover onClose={() => setNotifOpen(false)} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Avatar */}
          <Link to={isWorker ? '/worker/profile' : '/profile'}>
            <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}>
              <Avatar className="h-8 w-8 border border-white/20 shadow-[0_0_12px_rgba(59,130,246,0.18)]">
                <AvatarImage src={user?.avatar_url} alt={user?.full_name} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </motion.div>
          </Link>
        </div>
      </nav>

    </motion.header>
  )
}

function NotifBell({ count, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className="relative p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
    >
      <Bell className="h-4 w-4 text-white/60" />
      {count > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-azure text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(59,130,246,0.5)]"
        >
          {count > 9 ? '9+' : count}
        </motion.span>
      )}
    </motion.button>
  )
}

function NotifPopover({ onClose }) {
  const { notifications, markAllRead } = useNotifications()
  const navigate = useNavigate()

  return (
    <div>
      {/* Top specular */}
      <div
        className="absolute top-0 left-6 right-6 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)' }}
      />

      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-semibold text-white/90 font-syne">Notifications</span>
        <button
          onClick={() => { markAllRead(); onClose() }}
          className="text-xs text-azure hover:text-azure-light transition-colors"
        >
          Mark all read
        </button>
      </div>

      <div className="max-h-72 overflow-y-auto">
        {(!notifications || notifications.length === 0) ? (
          <div className="py-8 text-center text-sm text-white/30">
            No notifications yet
          </div>
        ) : (
          notifications.slice(0, 8).map((n) => (
            <NotifItem key={n.id} notif={n} onClose={onClose} navigate={navigate} />
          ))
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/10">
        <button
          onClick={() => { navigate('/notifications'); onClose() }}
          className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          View all notifications →
        </button>
      </div>
    </div>
  )
}

function NotifItem({ notif, onClose, navigate }) {
  const typeColors = {
    job_assigned:  'bg-azure/20 text-azure',
    job_completed: 'bg-emerald-500/20 text-emerald-400',
    payment:       'bg-amber-500/20 text-amber-400',
    review:        'bg-violet-500/20 text-violet-400',
  }

  return (
    <motion.button
      whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
      onClick={() => {
        if (notif.job_id) navigate(`/job/${notif.job_id}`)
        onClose()
      }}
      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors"
    >
      <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', notif.is_read ? 'bg-white/10' : 'bg-azure')} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 leading-snug">{notif.message}</p>
        <p className="text-xs text-white/30 mt-0.5">
          {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </motion.button>
  )
}

/**
 * MobileBottomNav — glass bottom nav pill for mobile.
 */
export function MobileBottomNav() {
  const { pathname } = useLocation()
  const { user } = useAuthStore()
  const isWorker = user?.role === 'worker'

  const userLinks = [
    { to: '/',          label: 'Home',     icon: '⊞' },
    { to: '/bookings',  label: 'Bookings', icon: '📋' },
    { to: '/chat',      label: 'Chat',     icon: '💬' },
    { to: '/profile',   label: 'Profile',  icon: '👤' },
  ]

  const workerLinks = [
    { to: '/worker',           label: 'Dashboard', icon: '⊞' },
    { to: '/worker/services',  label: 'Services',  icon: '🛠' },
    { to: '/worker/media',     label: 'Media',     icon: '📸' },
    { to: '/worker/profile',   label: 'Profile',   icon: '👤' },
  ]

  const links = isWorker ? workerLinks : userLinks

  return (
    <motion.nav
      className="fixed bottom-4 inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 26 }}
    >
      <div className="glass-navbar rounded-2xl px-2 py-1.5 flex items-center gap-1 pointer-events-auto">
        {links.map((link) => {
          const active = pathname === link.to || (link.to !== '/' && pathname.startsWith(link.to))
          return (
            <Link key={link.to} to={link.to}>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.93 }}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all relative',
                  active ? 'text-white' : 'text-white/40 hover:text-white/70'
                )}
              >
                {active && (
                  <motion.div
                    layoutId="mobile-nav-pill"
                    className="absolute inset-0 rounded-xl bg-white/10 border border-white/15"
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  />
                )}
                <span className="text-base relative">{link.icon}</span>
                <span className="text-[10px] font-medium relative">{link.label}</span>
              </motion.div>
            </Link>
          )
        })}
      </div>
    </motion.nav>
  )
}
