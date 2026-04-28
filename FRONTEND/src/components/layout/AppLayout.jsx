import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Background } from '@/components/glass/Background'
import { GlassNavbar, MobileBottomNav } from '@/components/glass/GlassNavbar'
import { AddressModal } from '@/components/kaargar/AddressModal'

export function AppLayout() {
  const [locationOpen, setLocationOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <div className="min-h-screen">
      <Background />

      <GlassNavbar
        onLocationClick={() => setLocationOpen(true)}
        onSearchClick={() => setSearchOpen(true)}
      />

      {/* Page content — padded to clear floating navbar + bottom nav */}
      <motion.main
        className="pt-24 pb-28 px-4 max-w-3xl mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <Outlet />
      </motion.main>

      <MobileBottomNav />

      <AddressModal open={locationOpen} onClose={() => setLocationOpen(false)} />
    </div>
  )
}
