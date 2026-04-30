/**
 * AdminLayout — persistent sidebar + top bar for all admin pages.
 * Hidden on /admin/login.
 */
import { useState } from 'react'
import { Outlet, NavLink, useNavigate, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Users, Briefcase, MessageSquare,
  Settings, LogOut, Menu, X, ShieldCheck,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth'

const NAV = [
  { to: '/admin',          label: 'Dashboard',  icon: LayoutDashboard, exact: true },
  { to: '/admin/workers',  label: 'Workers',    icon: Users },
  { to: '/admin/jobs',     label: 'Jobs',       icon: Briefcase },
  { to: '/admin/support',  label: 'Support',    icon: MessageSquare },
  { to: '/admin/config',   label: 'Config',     icon: Settings },
]

export default function AdminLayout() {
  const { isAuthenticated, user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (!isAuthenticated || user?.role !== 'admin') {
    return <Navigate to="/admin/login" replace />
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#07090F', color: '#F1F5F9' }}>
      {/* ── Sidebar ── */}
      <aside
        className="hidden md:flex flex-col w-60 flex-shrink-0 py-6 px-3"
        style={{
          background: 'rgba(13,17,23,0.95)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setSidebarOpen(false)}
          />
          <motion.div
            initial={{ x: -240 }}
            animate={{ x: 0 }}
            exit={{ x: -240 }}
            className="relative z-10 w-60 flex flex-col py-6 px-3"
            style={{ background: 'rgba(13,17,23,0.98)', borderRight: '1px solid rgba(255,255,255,0.07)' }}
          >
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 p-1"
            >
              <X className="h-5 w-5" style={{ color: '#475569' }} />
            </button>
            <SidebarContent onNav={() => setSidebarOpen(false)} />
          </motion.div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="h-14 flex items-center justify-between px-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <button className="md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" style={{ color: '#94A3B8' }} />
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm" style={{ color: '#475569' }}>{user?.email}</span>
            <button
              onClick={() => { logout(); navigate('/admin/login') }}
              className="p-2 rounded-lg transition-colors"
              style={{ color: '#475569' }}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function SidebarContent({ onNav }) {
  return (
    <>
      {/* Logo */}
      <div className="px-3 mb-8 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5" style={{ color: '#f59e0b' }} />
        <span
          className="text-xl font-bold"
          style={{ fontFamily: '"Playwrite NO", cursive', color: '#F1F5F9' }}
        >
          Kaargar
        </span>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded ml-1"
          style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}
        >
          ADMIN
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            onClick={onNav}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'text-amber-400'
                  : 'hover:bg-white/5'
              }`
            }
            style={({ isActive }) => ({
              background: isActive ? 'rgba(245,158,11,0.1)' : undefined,
              color: isActive ? '#f59e0b' : '#94A3B8',
            })}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
