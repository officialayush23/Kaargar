import { motion } from 'framer-motion'
import { Sun, Moon } from 'lucide-react'
import { useAppStore } from '@/stores/app'

export function ThemeToggle() {
  const { theme, toggleTheme } = useAppStore()
  const isDark = theme === 'dark'

  return (
    <motion.button
      onClick={toggleTheme}
      whileTap={{ scale: 0.9 }}
      className="liquid-glass w-11 h-11 rounded-full flex items-center justify-center relative overflow-hidden shadow-lg border border-white/10"
    >
      <motion.div
        initial={false}
        animate={{ y: isDark ? 0 : 35, opacity: isDark ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="absolute"
      >
        <Moon size={20} className="text-azure-light" />
      </motion.div>
      
      <motion.div
        initial={false}
        animate={{ y: isDark ? -35 : 0, opacity: isDark ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="absolute"
      >
        <Sun size={20} className="text-amber-400" />
      </motion.div>
    </motion.button>
  )
}