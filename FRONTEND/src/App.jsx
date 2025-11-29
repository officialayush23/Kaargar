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
import U_forgot from './pages/U_forgot'
import AuthCallback from './auth/AuthCallBack'
import Home from './pages/Home'
import Wregister from './pages/Wregister'
import Register from './pages/Register'
import Profile from './pages/Profile'
import JobPost from './pages/JobPost'
import UserPosted from './pages/UserPosted'
import Dashboard from './pages/Dashboard'
import JobStatus from './pages/JobStatus'
// import Chat from './pages/Chat' // Create this later

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
          <Route path='/forgot-password' element={<U_forgot />} />
          <Route path='/auth/callback' element={<AuthCallback />} />

          {/* Core */}
          <Route path='/' element={<Home />} /> {/* Default to Home if auth */}
          <Route path='/home' element={<Home />} />
          
          {/* Profiles */}
          <Route path='/register' element={<Register />} />
          <Route path='/register_worker' element={<Wregister />} />
          <Route path='/profile' element={<Profile />} />

          {/* Job Flow */}
          <Route path='/post_job' element={<JobPost />} />
          <Route path='/my_postings' element={<UserPosted />} /> {/* Fixed typo my_posting -> my_postings */}
          <Route path='/dashboard' element={<Dashboard />} />
          
          {/* Specific Job Pages */}
          <Route path='/status/:jobId' element={<JobStatus />} /> {/* FIXED: Added :jobId */}
          {/* <Route path='/chat/:jobId' element={<Chat />} /> */}

        </Routes>
      </div>
    </>
  )
}

export default App