import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Background } from '@/components/glass/Background'
import { MobileBottomNav } from '@/components/glass/GlassNavbar'

export function AppLayout() {
  return (
    <div className="min-h-screen">
      <Background />

      <motion.main
        className="pb-28 max-w-3xl mx-auto"
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
