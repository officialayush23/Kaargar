import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LogOut, Moon, Sun, Bell, ChevronRight,
  LayoutDashboard, Wrench, ImageIcon, TrendingUp, HelpCircle, Package, Tag
} from 'lucide-react'
import { Background } from '@/components/glass/Background'
import { MobileBottomNav } from '@/components/glass/GlassNavbar'
import { NotificationDrawer } from '@/components/kaargar/NotificationDrawer'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useNotifications } from '@/hooks/useNotifications'

/* ── Worker profile menu drawer ─────────────────────────────────── */
function WorkerMenu({ open, onClose }) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useAppStore()
  const isDark = theme === 'dark'

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : (user?.email?.[0]?.toUpperCase() ?? 'W')

  const menuItems = [
    { label: 'Dashboard',  icon: LayoutDashboard, path: '/worker' },
    { label: 'Services',   icon: Wrench,          path: '/worker/services' },
    { label: 'Packages',   icon: Package,         path: '/worker/packages' },
    { label: 'Offers',     icon: Tag,              path: '/worker/offers' },
    { label: 'Portfolio',  icon: ImageIcon,        path: '/worker/media' },
    { label: 'Analytics',  icon: TrendingUp,       path: '/worker/analytics' },
    { label: 'Profile',    icon: ChevronRight,     path: '/worker/profile' },
    { label: 'Support',    icon: HelpCircle,       path: '/worker/support' },
  ]

  function go(path) {
    navigate(path)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 top-0 z-50"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          >
            <div
              className="mx-4 mt-4 rounded-3xl overflow-hidden"
              style={{
                background: isDark
                  ? 'linear-gradient(160deg, rgba(255,255,255,0.12) 0%, rgba(15,15,15,0.96) 100%)'
                  : 'linear-gradient(160deg, rgba(255,255,255,0.98) 0%, rgba(240,242,248,0.98) 100%)',
                backdropFilter: 'blur(40px) saturate(200%)',
                WebkitBackdropFilter: 'blur(40px) saturate(200%)',
                border: '1.5px solid var(--g-border)',
                boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
              }}
            >
              {/* Profile header */}
              <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--g-border)' }}>
                <div className="flex items-center gap-3">
                  <Avatar
                    className="h-14 w-14"
                    style={{ border: '2px solid rgba(245,158,11,0.35)', boxShadow: '0 0 18px rgba(245,158,11,0.18)' }}
                  >
                    <AvatarImage src={user?.avatar_url} />
                    <AvatarFallback
                      className="text-lg font-bold"
                      style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}
                    >
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold font-syne truncate" style={{ color: 'var(--text-primary)' }}>
                      {user?.full_name || 'Worker'}
                    </p>
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {user?.email}
                    </p>
                    <span
                      className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
                    >
                      ⚡ Worker
                    </span>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div className="p-3 space-y-0.5">
                {menuItems.map(({ label, icon: Icon, path }) => (
                  <button
                    key={path}
                    onClick={() => go(path)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-left"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--g-bg)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                ))}

                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-left"
                  style={{ color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--g-bg)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {isDark
                    ? <Sun className="h-4 w-4 flex-shrink-0" style={{ color: '#f59e0b' }} />
                    : <Moon className="h-4 w-4 flex-shrink-0" style={{ color: '#6b7280' }} />
                  }
                  <span className="text-sm font-medium">
                    {isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  </span>
                </button>
              </div>

              {/* Sign out */}
              <div className="px-4 pb-4">
                <button
                  onClick={() => { logout(); navigate('/login'); onClose() }}
                  className="w-full py-3 rounded-2xl text-sm font-medium transition-colors"
                  style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(248,113,113,0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <LogOut className="h-4 w-4 inline mr-2" />
                  Sign Out
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ── Floating inline page header (NOT a fixed navbar) ──────────── */
function WorkerPageHeader() {
  const [menuOpen, setMenuOpen]   = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const { user } = useAuthStore()
  const { unreadCount } = useNotifications()

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : (user?.email?.[0]?.toUpperCase() ?? 'W')

  return (
    <>
      {/* Inline floating header — part of the scrollable page content */}
      <div className="px-4 pt-5 pb-3">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderRadius: '18px',
            background: 'var(--g-bg-mid)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid var(--g-border)',
            boxShadow: '0 2px 16px rgba(0,0,0,0.12), inset 0 1px 0 var(--g-shine)',
          }}
        >
          {/* Kaargar logo */}
          <span
            style={{
              fontFamily: '"Playwrite NO", cursive',
              fontSize: '22px',
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              lineHeight: 1,
              userSelect: 'none',
            }}
          >
            Kaargar
          </span>

          {/* Right: bell + avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Notification bell */}
            <button
              onClick={() => setNotifOpen(true)}
              style={{
                position: 'relative',
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'var(--g-bg)',
                border: '1px solid var(--g-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Bell size={16} style={{ color: 'var(--text-secondary)' }} />
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    minWidth: '16px',
                    height: '16px',
                    borderRadius: '8px',
                    padding: '0 3px',
                    background: '#f59e0b',
                    color: '#000',
                    fontSize: '9px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Avatar → open menu */}
            <button
              onClick={() => setMenuOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              <Avatar
                className="h-9 w-9"
                style={{ border: '2px solid rgba(245,158,11,0.4)', boxShadow: '0 0 12px rgba(245,158,11,0.15)' }}
              >
                <AvatarImage src={user?.avatar_url} />
                <AvatarFallback
                  className="text-sm font-bold"
                  style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </div>
        </div>
      </div>

      {/* Drawers */}
      <WorkerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}

/* ── Layout ──────────────────────────────────────────────────────── */
export function WorkerLayout() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--page-bg)' }}>
      <Background />

      <motion.div
        className="pb-28 max-w-3xl mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22 }}
      >
        {/* Floating header is the first element in the scroll flow */}
        <WorkerPageHeader />

        {/* Page content with horizontal padding */}
        <div className="px-4">
          <Outlet />
        </div>
      </motion.div>

      <MobileBottomNav />
    </div>
  )
}
