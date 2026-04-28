import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

import { AppLayout } from '@/components/layout/AppLayout'
import { WorkerLayout } from '@/components/layout/WorkerLayout'

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
import WorkerDashboard from '@/pages/worker/WorkerDashboard'
import WorkerServices from '@/pages/worker/WorkerServices'
import WorkerMedia from '@/pages/worker/WorkerMedia'
import WorkerProfile from '@/pages/worker/WorkerProfile'
import WorkerAnalytics from '@/pages/worker/WorkerAnalytics'

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
  return isAuthenticated ? <Navigate to="/" replace /> : children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />

      {/* Main app */}
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<HomePage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:jobId" element={<ChatPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="job/new" element={<NewJobPage />} />
        <Route path="job/:jobId/searching" element={<SearchingPage />} />
        <Route path="job/:jobId/active" element={<ActiveJobPage />} />
        <Route path="discover" element={<DiscoveryPage />} />
        <Route path="worker/:workerId" element={<WorkerProfilePage />} />
      </Route>

      {/* Worker portal */}
      <Route path="worker" element={<RequireWorker><WorkerLayout /></RequireWorker>}>
        <Route index element={<WorkerDashboard />} />
        <Route path="services" element={<WorkerServices />} />
        <Route path="media" element={<WorkerMedia />} />
        <Route path="profile" element={<WorkerProfile />} />
        <Route path="analytics" element={<WorkerAnalytics />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
