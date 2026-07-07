import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import * as LucideIcons from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronRight } from 'lucide-react'

/* ── icon renderer ───────────────────────────────────────────── */
function CategoryIcon({ category }) {
  const { icon_url, icon_name, icon_emoji, color_hex } = category

  if (icon_url) {
    return (
      <img
        src={icon_url}
        alt={category.name}
        style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: 4 }}
        onError={e => { e.currentTarget.style.display = 'none' }}
      />
    )
  }

  if (icon_emoji) {
    return <span style={{ fontSize: 20, lineHeight: 1 }}>{icon_emoji}</span>
  }

  const Icon = LucideIcons[icon_name] || LucideIcons.Wrench
  return <Icon size={20} color="var(--text-secondary)" />
}

/* ── single card ─────────────────────────────────────────────── */
function CategoryCard({ category, index, onClick }) {
  const [hovered, setHovered] = useState(false)

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03, type: 'spring', stiffness: 300, damping: 24 }}
      onClick={() => onClick(category)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileTap={{ scale: 0.94 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '7px',
        padding: '10px 6px',
        borderRadius: '12px',
        border: `1px solid ${hovered ? 'var(--accent-border)' : 'var(--card-border)'}`,
        background: hovered ? 'var(--elevated)' : 'var(--card)',
        transition: 'background 0.15s ease, border-color 0.15s ease',
        cursor: 'pointer',
      }}
    >
      {/* Icon container — plain, no tinted bg */}
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--surface)',
          flexShrink: 0,
        }}
      >
        <CategoryIcon category={category} />
      </div>

      {/* Name */}
      <span
        style={{
          fontSize: '10px',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          textAlign: 'center',
          lineHeight: '1.25',
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

/* ── grid component ──────────────────────────────────────────── */
const VISIBLE = 8  // show first 8 on home, all on job/new

export function CategoryGrid({ categories, isLoading, mode, onSelect, showAll = false }) {
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
      <div className="grid grid-cols-4 gap-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            style={{ height: 76, borderRadius: 12, background: 'var(--card)' }}
          />
        ))}
      </div>
    )
  }

  if (!categories?.length) return null

  const visible = showAll ? categories : categories.slice(0, VISIBLE)
  const hasMore = !showAll && categories.length > VISIBLE

  return (
    <div>
      <div className="grid grid-cols-4 gap-2.5">
        {visible.map((cat, i) => (
          <CategoryCard key={cat.id} category={cat} index={i} onClick={handleClick} />
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => navigate('/job/new')}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-colors"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          All services <ChevronRight size={13} />
        </button>
      )}
    </div>
  )
}
