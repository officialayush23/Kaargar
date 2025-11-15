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
          <Route path='/U_register' element={<U_register />} />
          <Route path='/W_register' element={<W_register />} />
         <Route path='/login' element={<TabUW />} />
          <Route path='/Worker_display' element={<Worker_display />} />
          <Route path='/Job_display' element={<Job_display />} />
        </Routes>
      </div>

    </>
  )
}

export default App
