
import LogPop from './components/LogPop'
import './App.css'
import Worker from './pages/Worker'
import User from './pages/User'
import U_login from './pages/U_login'
import W_login from './pages/W_login'
import Worker_display from './pages/Worker_display'
import Job_display from './pages/Job_display'
import U_register from './pages/U_register'
import W_register from './pages/W_register'
import SideBar from './components/side_bar'

import React, { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import ScrollToTop from './components/ScrollToTop'
import Footer from './components/Footer'


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
        <ScrollToTop />
        <Routes location={location} key={location.pathname}>
          <Route path='/' element={<User />} />
          <Route path='/worker' element={<Worker />} />
          <Route path='/User' element={<User />} />
          <Route path='/U_register' element={<U_register />} />
          <Route path='/W_register' element={<W_register />} />
          <Route path='/U_login' element={<U_login />} />
          <Route path='/W_login' element={< W_login />} />
          <Route path='/Worker_display' element={<Worker_display />} />
          <Route path='/Job_display' element={<Job_display />} />
        </Routes>
      </div>

    </>
  )
}

export default App
