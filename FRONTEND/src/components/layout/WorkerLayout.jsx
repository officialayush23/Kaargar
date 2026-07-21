import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LogOut, Moon, Sun, Bell, ChevronRight, X,
  LayoutDashboard, Wrench, ImageIcon, TrendingUp, HelpCircle, Package, Tag
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Background } from '@/components/glass/Background'
import { MobileBottomNav } from '@/components/glass/GlassNavbar'
import { NotificationDrawer } from '@/components/kaargar/NotificationDrawer'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useNotifications } from '@/hooks/useNotifications'
import { supabase } from '@/lib/supabase'
import { setWorkerLanguage } from '@/i18n/index.js'

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'hi', label: 'हि' },
  { code: 'mr', label: 'म' },
]

/* ── Language selector pill ─────────────────────────────────────── */
function LangPill() {
  const { i18n } = useTranslation()
  const current = i18n.language || 'en'

  function switchLang(code) {
    setWorkerLanguage(code)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        borderRadius: '10px',
        padding: '2px',
        background: 'var(--g-bg)',
        border: '1px solid var(--g-border)',
        gap: 1,
      }}
    >
      {LANGS.map(({ code, label }) => {
        const active = current === code
        return (
          <motion.button
            key={code}
            onClick={() => switchLang(code)}
            layout
            style={{
              padding: '3px 7px',
              borderRadius: '7px',
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              border: 'none',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#000' : 'var(--text-muted)',
              transition: 'all 0.15s',
              lineHeight: 1.4,
            }}
            whileTap={{ scale: 0.93 }}
          >
            {label}
          </motion.button>
        )
      })}
    </div>
  )
}

/* ── Worker profile menu drawer ─────────────────────────────────── */
function WorkerMenu({ open, onClose }) {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useAppStore()
  const { t } = useTranslation()
  const isDark = theme === 'dark'

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : (user?.email?.[0]?.toUpperCase() ?? 'W')

  const menuItems = [
    { label: t('nav.dashboard'),  icon: LayoutDashboard, path: '/worker' },
    { label: t('nav.services'),   icon: Wrench,          path: '/worker/services' },
    { label: t('nav.packages'),   icon: Package,         path: '/worker/packages' },
    { label: t('nav.offers'),     icon: Tag,             path: '/worker/offers' },
    { label: t('nav.portfolio'),  icon: ImageIcon,       path: '/worker/media' },
    { label: t('nav.analytics'),  icon: TrendingUp,      path: '/worker/analytics' },
    { label: t('nav.profile'),    icon: ChevronRight,    path: '/worker/profile' },
    { label: t('nav.support'),    icon: HelpCircle,      path: '/worker/support' },
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
            // Stops well above the floating bottom nav (which sits at
            // max(1.25rem, safe-area + 0.75rem) with its own height on top of
            // that) instead of running the full viewport height — leaves a
            // clear visible margin between the sheet and the nav pill.
            className="fixed inset-x-0 top-0 z-50 flex flex-col"
            style={{ bottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))' }}
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          >
            <div
              className="mx-4 mt-4 rounded-3xl overflow-hidden flex flex-col min-h-0"
              style={{
                background: isDark ? 'rgba(15,15,15,0.97)' : 'rgba(255,255,255,0.97)',
                backdropFilter: 'blur(40px) saturate(180%)',
                WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                border: '1px solid var(--g-border)',
              }}
            >
              {/* Profile header — fixed, doesn't scroll */}
              <div className="px-5 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid var(--g-border)' }}>
                <div className="flex items-center gap-3">
                  <Avatar
                    className="h-14 w-14"
                    style={{ border: '1px solid var(--card-border)' }}
                  >
                    <AvatarImage src={user?.avatar_url} />
                    <AvatarFallback
                      className="text-lg font-bold"
                      style={{ background: 'var(--accent-muted)', color: 'var(--accent-hover)' }}
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
                      className="inline-block text-[12px] font-semibold px-2 py-0.5 rounded-full mt-1"
                      style={{ background: 'var(--accent-deep)', color: 'var(--accent-hover)' }}
                    >
                      ⚡ Worker
                    </span>
                  </div>
                  {/* Language pill inside menu */}
                  <LangPill />
                  {/* Close button — top-right of the sheet header */}
                  <button
                    onClick={onClose}
                    aria-label="Close menu"
                    className="shrink-0 flex items-center justify-center"
                    style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: 'var(--g-bg)', border: '1px solid var(--g-border)',
                      cursor: 'pointer',
                    }}
                  >
                    <X className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                  </button>
                </div>
              </div>

              {/* Menu items — the only part that scrolls */}
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-0.5">
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
                    ? <Sun className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                    : <Moon className="h-4 w-4 flex-shrink-0" style={{ color: '#6b7280' }} />
                  }
                  <span className="text-sm font-medium">
                    {isDark ? t('common.lightMode') : t('common.darkMode')}
                  </span>
                </button>
              </div>

              {/* Sign out — pinned at the bottom of the sheet, never scrolls away */}
              <div className="px-4 pb-4 pt-3 shrink-0" style={{ borderTop: '1px solid var(--g-border)' }}>
                <button
                  onClick={async () => { await supabase.auth.signOut(); logout(); navigate('/login'); onClose() }}
                  className="w-full py-3 rounded-2xl text-sm font-medium transition-colors"
                  style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(248,113,113,0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <LogOut className="h-4 w-4 inline mr-2" />
                  {t('auth.signOut')}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ── Floating inline page header ────────────────────────────────── */
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

          {/* Right: lang + bell + avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Language selector */}
            <LangPill />

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
                    background: 'var(--accent)',
                    color: '#000',
                    fontSize: '11px',
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
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <Avatar
                className="h-9 w-9"
                style={{ border: '1px solid var(--card-border)' }}
              >
                <AvatarImage src={user?.avatar_url} />
                <AvatarFallback
                  className="text-sm font-bold"
                  style={{ background: 'var(--accent-deep)', color: 'var(--accent-hover)' }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </div>
        </div>
      </div>

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
        className="pb-28 sm:pb-36 max-w-3xl mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22 }}
      >
        <WorkerPageHeader />

        <div className="px-4">
          <Outlet />
        </div>
      </motion.div>

      {/* Active-job indicator now lives inline inside MobileBottomNav itself
          (between its regular links) instead of floating as a separate
          pill above it — see GlassNavbar.jsx's MobileBottomNav. */}
      <MobileBottomNav />
    </div>
  )
}
