import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import * as LucideIcons from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

function CategoryIcon({ iconName, color }) {
  const Icon = LucideIcons[iconName] || LucideIcons.Wrench
  return <Icon size={22} color={color} />
}

function CategoryCard({ category, index, onClick }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      onClick={() => onClick(category)}
      className="glass-light rounded-2xl p-4 flex flex-col items-center gap-2.5 hover:scale-[1.03] active:scale-95 transition-transform card-hover"
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center"
        style={{ background: `${category.color_hex}20`, boxShadow: `0 0 16px ${category.color_hex}30` }}
      >
        <CategoryIcon iconName={category.icon_name} color={category.color_hex} />
      </div>
      <span className="text-xs font-medium text-[--text-secondary] text-center leading-tight">
        {category.name}
      </span>
    </motion.button>
  )
}

export function CategoryGrid({ categories, isLoading, mode }) {
  const navigate = useNavigate()

  const handleClick = (cat) => {
    navigate(`/new-job?category=${cat.id}&mode=${mode}`)
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      {categories?.map((cat, i) => (
        <CategoryCard key={cat.id} category={cat} index={i} onClick={handleClick} />
      ))}
    </div>
  )
}
