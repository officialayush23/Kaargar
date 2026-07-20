/**
 * AdminLayout — professional CRM sidebar + topbar.
 */
import { useState } from 'react'
import { Outlet, NavLink, useNavigate, Navigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Users, Briefcase, MessageSquare,
  Settings, LogOut, Menu, X, ShieldCheck, Layers,
  Wallet, UserCog, ChevronRight, Bell,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

const NAV = [
  { to: '/admin',            label: 'Dashboard',   icon: LayoutDashboard, exact: true },
  { to: '/admin/workers',    label: 'Workers',     icon: Users,       badgeKey: 'pending_verifications' },
  { to: '/admin/users',      label: 'Users',       icon: UserCog },
  { to: '/admin/jobs',       label: 'Jobs',        icon: Briefcase },
  { to: '/admin/payouts',    label: 'Payouts',     icon: Wallet },
  { to: '/admin/support',    label: 'Support',     icon: MessageSquare, badgeKey: 'open_tickets' },
  { to: '/admin/categories', label: 'Professions', icon: Layers },
  { to: '/admin/config',     label: 'Config',      icon: Settings },
]

const SIDEBAR_W = 220

function Badge({ n }) {
  if (!n) return null
  return (
    <span
      className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: 'rgba(248,113,113,0.2)', color: '#f87171', minWidth: 18, textAlign: 'center' }}
    >
      {n > 99 ? '99+' : n}
    </span>
  )
}

function SidebarContent({ onNav, dashData }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    logout()
    navigate('/admin/login')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--card-bg)' }}
        >
          <ShieldCheck size={16} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <div>
          <p className="font-bold text-sm leading-none" style={{ fontFamily: '"Playwrite NO", cursive', color: 'var(--text-primary)' }}>
            Kaargar
          </p>
          <p className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>Admin Console</p>
        </div>
      </div>

      <div className="mx-3 mb-3" style={{ height: 1, background: 'var(--card-bg)' }} />

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, label, icon: Icon, exact, badgeKey }) => {
          const badgeCount = badgeKey ? dashData?.[badgeKey] : null
          return (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={onNav}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive ? '' : 'hover:bg-white/[0.04]'
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? 'var(--card-bg)' : undefined,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                borderLeft: isActive ? '2px solid var(--g-border)' : '2px solid transparent',
              })}
            >
              <Icon size={15} className="shrink-0" />
              <span>{label}</span>
              <Badge n={badgeCount} />
            </NavLink>
          )
        })}
      </nav>

      <div className="mx-3 mb-3 mt-2" style={{ height: 1, background: 'var(--card-bg)' }} />

      {/* User row */}
      <div className="px-3 pb-4">
        <div
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
          style={{ background: 'var(--card-bg)' }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
            style={{ background: 'var(--card-hover)', color: 'var(--text-secondary)' }}
          >
            {user?.email?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            title="Sign out"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const { isAuthenticated, user } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()

  const { data: dashData } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.get('/admin/dashboard/live').then(r => r.data),
    refetchInterval: 30_000,
    enabled: isAuthenticated && user?.role === 'admin',
  })

  if (!isAuthenticated || user?.role !== 'admin') {
    return <Navigate to="/admin/login" replace />
  }

  // Current page title
  const currentNav = NAV.find(n => n.exact ? pathname === n.to : pathname.startsWith(n.to))

  return (
    <div
      className="min-h-screen flex"
      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      {/* ── Desktop Sidebar ── */}
      <aside
        className="hidden md:flex flex-col flex-shrink-0"
        style={{
          width: SIDEBAR_W,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--card-border)',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <SidebarContent dashData={dashData} />
      </aside>

      {/* ── Mobile sidebar overlay ── */}
      <AnimatePresence>
        {sidebarOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -SIDEBAR_W }}
              animate={{ x: 0 }}
              exit={{ x: -SIDEBAR_W }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              className="relative z-10 flex flex-col"
              style={{ width: SIDEBAR_W, background: 'var(--bg-surface)', borderRight: '1px solid var(--card-border)' }}
            >
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-xl hover:bg-white/5"
                style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={15} />
              </button>
              <SidebarContent onNav={() => setSidebarOpen(false)} dashData={dashData} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header
          className="flex items-center justify-between px-6 flex-shrink-0"
          style={{
            height: 56,
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--card-border)',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
        >
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-1.5 rounded-xl hover:bg-white/5"
              onClick={() => setSidebarOpen(true)}
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <Menu size={18} />
            </button>
            {currentNav && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{currentNav.label}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Live indicator */}
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', color: '#4ade80' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--bg-base)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
