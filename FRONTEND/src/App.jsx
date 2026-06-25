import { useEffect, useState, useCallback } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'

import { AppLayout } from '@/components/layout/AppLayout'
import { WorkerLayout } from '@/components/layout/WorkerLayout'
import LoadingScreen from '@/components/kaargar/LoadingScreen'

import LoginPage from '@/pages/auth/LoginPage'
import HomePage from '@/pages/home/HomePage'
import NewJobPage from '@/pages/job/NewJobPage'
import SearchingPage from '@/pages/job/SearchingPage'
import ActiveJobPage from '@/pages/job/ActiveJobPage'
import DiscoveryPage from '@/pages/discovery/DiscoveryPage'
import WorkerProfilePage from '@/pages/discovery/WorkerProfilePage'
import BookingsPage from '@/pages/bookings/BookingsPage'
import ChatPage from '@/pages/chat/ChatPage'
import ProfilePage from '@/pages/profile/ProfilePage'
import SupportPage from '@/pages/profile/SupportPage'
import ReviewPage from '@/pages/job/ReviewPage'
import JobDetailPage from '@/pages/job/JobDetailPage'
import BookDiscoveryPage from '@/pages/discovery/BookDiscoveryPage'
import WorkerOnboardPage from '@/pages/onboarding/WorkerOnboardPage'

import WorkerDashboard from '@/pages/worker/WorkerDashboard'
import WorkerServices from '@/pages/worker/WorkerServices'
import WorkerPackages from '@/pages/worker/WorkerPackages'
import WorkerOffers from '@/pages/worker/WorkerOffers'
import WorkerMedia from '@/pages/worker/WorkerMedia'
import WorkerProfile from '@/pages/worker/WorkerProfile'
import WorkerAnalytics from '@/pages/worker/WorkerAnalytics'
import WorkerSupport from '@/pages/worker/WorkerSupport'

import AdminLogin from '@/pages/admin/AdminLogin'
import AdminLayout from '@/pages/admin/AdminLayout'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import AdminWorkers from '@/pages/admin/AdminWorkers'
import AdminJobs from '@/pages/admin/AdminJobs'
import AdminSupport from '@/pages/admin/AdminSupport'
import AdminConfig from '@/pages/admin/AdminConfig'
import AdminCategories from '@/pages/admin/AdminCategories'
import AdminPayouts from '@/pages/admin/AdminPayouts'
import AdminUsers from '@/pages/admin/AdminUsers'

function getDefaultRoute(user) {
  if (!user) return '/login'
  if (user.role === 'admin') return '/admin'
  if (user.role === 'worker') return '/worker'
  return '/'
}

function RequireAuth({ children }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function RequireWorker({ children }) {
  const { isAuthenticated, isWorker, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!isWorker()) return <Navigate to={getDefaultRoute(user)} replace />
  return children
}

function RequireUser({ children }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.role !== 'user') return <Navigate to={getDefaultRoute(user)} replace />
  return children
}

function RequireAdmin({ children }) {
  const { isAuthenticated, isAdmin, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />
  if (!isAdmin()) return <Navigate to={getDefaultRoute(user)} replace />
  return children
}

function RoleRedirect() {
  const { user } = useAuthStore()
  return <Navigate to={getDefaultRoute(user)} replace />
}

function GuestOnly({ children }) {
  const { isAuthenticated, user } = useAuthStore()
  return !isAuthenticated ? children : <Navigate to={getDefaultRoute(user)} replace />
}

// Soft React Router navigation on 401 — no full page reload.
function UnauthorizedListener() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  useEffect(() => {
    const handler = (e) => {
      const target = (e.detail?.adminPath || user?.role === 'admin') ? '/admin/login' : '/login'
      navigate(target, { replace: true })
    }
    window.addEventListener('kaargar:unauthorized', handler)
    return () => window.removeEventListener('kaargar:unauthorized', handler)
  }, [navigate, user])

  return null
}

/**
 * Supabase session bridge.
 *
 * Listens to supabase.auth.onAuthStateChange and:
 *  - Writes the current JWT to localStorage (api.js reads it)
 *  - Calls /auth/provision to create/sync the DB user row
 *  - Sets user in auth store so the rest of the app knows who is logged in
 *
 * Handles both normal sign-in and email confirmation redirects.
 */
function SupabaseAuthSync() {
  const { setSession, setUser, logout } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    // On mount: restore session from Supabase's own localStorage persistence
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setSession(session)
        try {
          const { data } = await api.post('/auth/provision', {})
          setUser(data)
        } catch {
          logout()
        }
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)

        if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          try {
            const { data } = await api.post('/auth/provision', {})
            setUser(data)

            if (event === 'SIGNED_IN') {
              const role = data?.role
              const currentPath = window.location.pathname
              // Only auto-navigate from login/root (e.g. email confirmation redirect)
              if (currentPath === '/login' || currentPath === '/') {
                if (role === 'admin') navigate('/admin', { replace: true })
                else if (role === 'worker') navigate('/worker', { replace: true })
                else navigate('/', { replace: true })
              }
            }
          } catch {
            // provision failed — stay on current page
          }
        } else if (event === 'SIGNED_OUT') {
          logout()
          navigate('/login', { replace: true })
        }
      }
    )

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export default function App() {
  const [loading, setLoading] = useState(true)
  const handleDone = useCallback(() => setLoading(false), [])

  if (loading) {
    return <LoadingScreen onDone={handleDone} />
  }

  return (
    <>
      <SupabaseAuthSync />
      <UnauthorizedListener />
      <Routes>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/onboard/worker" element={<RequireAuth><WorkerOnboardPage /></RequireAuth>} />

        {/* Public worker profiles — MUST come before the worker portal so React
            Router resolves /worker/:workerId here, not in the portal tree. */}
        <Route path="/worker/:workerId" element={<RequireAuth><WorkerProfilePage /></RequireAuth>} />
        <Route path="/worker/:workerId/book" element={<RequireAuth><BookDiscoveryPage /></RequireAuth>} />

        {/* Main user app */}
        <Route element={<RequireUser><AppLayout /></RequireUser>}>
          <Route index element={<HomePage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:jobId" element={<ChatPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="job/new" element={<NewJobPage />} />
          <Route path="job/:jobId" element={<JobDetailPage />} />
          <Route path="job/:jobId/searching" element={<SearchingPage />} />
          <Route path="job/:jobId/active" element={<ActiveJobPage />} />
          <Route path="job/:jobId/review" element={<ReviewPage />} />
          <Route path="discover" element={<DiscoveryPage />} />
        </Route>

        {/* Worker portal */}
        <Route path="worker" element={<RequireWorker><WorkerLayout /></RequireWorker>}>
          <Route index element={<WorkerDashboard />} />
          <Route path="services" element={<WorkerServices />} />
          <Route path="packages" element={<WorkerPackages />} />
          <Route path="offers" element={<WorkerOffers />} />
          <Route path="media" element={<WorkerMedia />} />
          <Route path="profile" element={<WorkerProfile />} />
          <Route path="analytics" element={<WorkerAnalytics />} />
          <Route path="support" element={<WorkerSupport />} />
        </Route>

        {/* Admin portal */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<AdminDashboard />} />
          <Route path="workers" element={<AdminWorkers />} />
          <Route path="jobs" element={<AdminJobs />} />
          <Route path="support" element={<AdminSupport />} />
          <Route path="config" element={<AdminConfig />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="payouts" element={<AdminPayouts />} />
          <Route path="users" element={<AdminUsers />} />
        </Route>

        <Route path="*" element={<RequireAuth><RoleRedirect /></RequireAuth>} />
      </Routes>
    </>
  )
}
