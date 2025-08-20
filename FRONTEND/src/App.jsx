import React from 'react'
import LogPop from './components/LogPop'
import './App.css'
import { Route, Router, Routes } from 'react-router-dom'
import Worker from './pages/Worker'
import User from './pages/User'
import U_login from './pages/U_login'
import W_login from './pages/W_login'
import Worker_display from './pages/Worker_display'
import Job_display from './pages/Job_display'
import U_register from './pages/U_register'
import W_register from './pages/W_register'
import SideBar from './components/side_bar'
import { useEffect } from 'react';
import Lenis from 'lenis'
import { useLocation } from 'react-router-dom';
import Footer from './components/Footer'
import ScrollToTop from './components/ScrollToTop'

const App = () => {

  useEffect(() => {
    // Initialize Lenis
    const lenis = new Lenis();

    // Use requestAnimationFrame to continuously update the scroll
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);


  }, [])




  return (
    <>
      <div>
        <ScrollToTop />
        <Routes location={location} key={location.pathname}>
          <Route path='/' element={<LogPop />} />
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
