import './App.css'
import React, { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import ScrollToTop from './components/ScrollToTop'

import Background from './components/Background'
import TabUW from './components/use_ui/TabUW'
import U_signup from './pages/U_signup'

import AuthCallback from './auth/AuthCallBack'
import Home from './pages/Home'
import Wregister from './pages/Wregister'
import Register from './pages/Register'
import Profile from './pages/Profile'
import JobPost from './pages/JobPost'
import UserPosted from './pages/UserPosted'
import Dashboard from './pages/Dashboard'
import JobStatus from './pages/JobStatus'
import User from './pages/User'
import Worker from './pages/Worker'
import Chat from './pages/Chats'
import Admin from './pages/Admin' // New Import
import AuthenticatedLayout from './components/use_ui/AuthenticatedLayout'
import Wallet from './pages/Wallets'
import AdminLayout from './components/use_ui/AdminLayout'
import AdminDashboard from './pages/AdminDashboard'
import AdminUsers from './pages/AdminUsers'
import AdminComplaints from './pages/AdminComplaints'
import AdminKYC from './pages/AdminKYC'
import AdminJobs from './pages/AdminJobs'

gsap.registerPlugin(ScrollTrigger);

const App = () => {
  const location = useLocation();

  useEffect(() => {
    const lenis = new Lenis();

    function raf(time) {
      lenis.raf(time);
      ScrollTrigger.update();
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      ScrollTrigger.refresh();
    });
  }, [location.pathname]);

  return (
    <>
      <div>
        <Background />

        <ScrollToTop />


        <Routes location={location} key={location.pathname}>
          {/* Auth */}
          <Route path='/login' element={<TabUW />} />
          <Route path='/signup' element={<U_signup />} />



          <Route path='/auth/callback' element={<AuthCallback />} />



          {/* Core */}
          <Route path='/' element={<User />} />
          <Route path='/worker' element={<Worker />} />
          <Route path='/home' element={<Home />} />

          {/* Profiles */}
          <Route path='/register' element={<Register />} />
          <Route path='/register_worker' element={<Wregister />} />
          <Route path='/profile' element={<Profile />} />

          {/* Job Flow */}
          <Route path='/post_job' element={<JobPost />} />
          <Route path='/my_postings' element={<UserPosted />} />
          <Route path='/dashboard' element={<Dashboard />} />
          <Route path='/wallet' element={<Wallet />} />

          {/* Job Actions */}
          <Route path='/status/:jobId' element={<JobStatus />} />
          <Route path='/chat/:jobId' element={<Chat />} />


          {/* Admin */}
        


          <Route path='/admin' element={<AdminLayout/>}>
            <Route index element={<AdminDashboard />} />
            <Route path='users' element={<AdminUsers />} />
            <Route path='kyc' element={<AdminKYC />} />
            <Route path='complaints' element={<AdminComplaints />} />
            <Route path='jobs' element={<AdminJobs />} />
          </Route>

        </Routes>

      </div>
    </>
  )
}

export default App