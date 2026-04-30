import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import * as LucideIcons from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

function CategoryIcon({ iconName, color }) {
  const Icon = LucideIcons[iconName] || LucideIcons.Wrench
  return <Icon size={18} color={color} />
}

function CategoryCard({ category, index, onClick }) {
  const [hovered, setHovered] = useState(false)

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03, type: 'spring', stiffness: 300, damping: 24 }}
      onClick={() => onClick(category)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileHover={{ scale: 1.07, y: -2 }}
      whileTap={{ scale: 0.94 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        padding: '10px',
        borderRadius: '12px',
        border: '1px solid var(--card-border)',
        background: hovered ? 'var(--card-hover)' : 'var(--card-bg)',
        transition: 'background 0.18s ease',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${category.color_hex}18`,
          boxShadow: `0 0 12px ${category.color_hex}22`,
          flexShrink: 0,
        }}
      >
        <CategoryIcon iconName={category.icon_name} color={category.color_hex} />
      </div>
      <span
        style={{
          fontSize: '10px',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          textAlign: 'center',
          lineHeight: '1.3',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {category.name}
      </span>
    </motion.button>
  )
}

export function CategoryGrid({ categories, isLoading, mode, onSelect }) {
  const navigate = useNavigate()

  const handleClick = (cat) => {
    if (onSelect) {
      onSelect(cat)
    } else {
      navigate('/job/new', { state: { category: cat, mode } })
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton
            key={i}
            className="aspect-square rounded-xl"
            style={{ background: 'var(--card-bg)' }}
          />
        ))}
      </div>
    )
  }

  if (!categories?.length) return null

  return (
    <div className="grid grid-cols-5 gap-2">
      {categories.map((cat, i) => (
        <CategoryCard key={cat.id} category={cat} index={i} onClick={handleClick} />
      ))}
    </div>
  )
}
