import './App.css'
import Worker from './pages/Worker'
import User from './pages/User'
import Worker_display from './pages/Worker_display'
import Job_display from './pages/Job_display'
import U_register from './pages/U_register'
import W_register from './pages/W_register'
import React, { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import ScrollToTop from './components/ScrollToTop'

import Background from './components/Background'
import TabUW from './components/use_ui/TabUW'
import U_forgot from './pages/U_forgot'
import U_signup from './pages/U_signup'
import AuthCallback from './auth/AuthCallBack'
import Home from './pages/Home'
import Wregister from './pages/Wregister'
import Register from './pages/Register'


gsap.registerPlugin(ScrollTrigger);

const App = () => {
  const location = useLocation();

  useEffect(() => {
    const lenis = new Lenis();

    function raf(time) {
      lenis.raf(time);
      ScrollTrigger.update();       // <-- CRUCIAL for Lenis + ScrollTrigger
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  // When the route changes: refresh ScrollTrigger after layout settles
  useEffect(() => {
    // give React a tick to mount the new page, then refresh
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
          <Route path='/' element={<User />} />
          <Route path='/worker' element={<Worker />} />
          <Route path='/User' element={<User />} />
          <Route path='/login' element={<TabUW />} />
          <Route path='/signup' element={<U_signup />} />
          <Route path='/forgot-password' element={<U_forgot />} />
          <Route path='/Worker_display' element={<Worker_display />} />
          <Route path='/Job_display' element={<Job_display />} />
          <Route path='/auth/callback' element={<AuthCallback />} />
          <Route path='/home' element={<Home />} />
          <Route path='/register_worker' element={<Wregister />} />
          <Route path='/register' element={<Register />} />
        </Routes>
      </div>

    </>
  )
}

export default App
