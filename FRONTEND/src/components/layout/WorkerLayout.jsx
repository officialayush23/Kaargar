import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Background } from '@/components/glass/Background'
import { GlassNavbar, MobileBottomNav } from '@/components/glass/GlassNavbar'

export function WorkerLayout() {
  return (
    <div className="min-h-screen">
      <Background />

      <GlassNavbar />

      <motion.main
        className="pt-24 pb-28 px-4 max-w-3xl mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <Outlet />
      </motion.main>

      <MobileBottomNav />
    </div>
  )
}
