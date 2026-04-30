import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

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
import BookDiscoveryPage from '@/pages/discovery/BookDiscoveryPage'
import WorkerOnboardPage from '@/pages/onboarding/WorkerOnboardPage'

import WorkerDashboard from '@/pages/worker/WorkerDashboard'
import WorkerServices from '@/pages/worker/WorkerServices'
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

function RequireAuth({ children }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function RequireWorker({ children }) {
  const { isAuthenticated, isWorker } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!isWorker()) return <Navigate to="/" replace />
  return children
}

function GuestOnly({ children }) {
  const { isAuthenticated } = useAuthStore()
  return !isAuthenticated ? children : <Navigate to="/" replace />
}

export default function App() {
  const [loading, setLoading] = useState(true)

  if (loading) {
    return <LoadingScreen onDone={() => setLoading(false)} />
  }

  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/onboard/worker" element={<RequireAuth><WorkerOnboardPage /></RequireAuth>} />

      {/* Main app */}
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<HomePage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:jobId" element={<ChatPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="job/new" element={<NewJobPage />} />
        <Route path="job/:jobId/searching" element={<SearchingPage />} />
        <Route path="job/:jobId/active" element={<ActiveJobPage />} />
        <Route path="job/:jobId/review" element={<ReviewPage />} />
        <Route path="discover" element={<DiscoveryPage />} />
        <Route path="worker/:workerId" element={<WorkerProfilePage />} />
        <Route path="worker/:workerId/book" element={<BookDiscoveryPage />} />
      </Route>

      {/* Worker portal */}
      <Route path="worker" element={<RequireWorker><WorkerLayout /></RequireWorker>}>
        <Route index element={<WorkerDashboard />} />
        <Route path="services" element={<WorkerServices />} />
        <Route path="media" element={<WorkerMedia />} />
        <Route path="profile" element={<WorkerProfile />} />
        <Route path="analytics" element={<WorkerAnalytics />} />
        <Route path="support" element={<WorkerSupport />} />
      </Route>

      {/* Admin portal — separate auth, no main layout */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="workers" element={<AdminWorkers />} />
        <Route path="jobs" element={<AdminJobs />} />
        <Route path="support" element={<AdminSupport />} />
        <Route path="config" element={<AdminConfig />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}