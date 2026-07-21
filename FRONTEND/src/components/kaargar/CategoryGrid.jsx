import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import * as LucideIcons from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronRight, ChevronLeft, Wrench } from 'lucide-react'

/* ── icon / photo renderer ──────────────────────────────────────
   Preference order: icon_url (real photo/PNG/SVG) → icon_emoji →
   lucide icon_name → generic wrench fallback.
   NOTE: icon_url is served straight through an <img> tag — there is
   no Lottie player wired up anywhere in this app (no lottie-react /
   lottie-web dependency in package.json), so a .json Lottie file
   uploaded via the admin icon uploader will simply fail to render
   and fall through to the emoji/icon fallback below. Photos
   (png/jpg/webp) are the only icon_url format that actually renders. */
export function CategoryPhoto({ category, iconSize = 48 }) {
  const { icon_url, icon_name, icon_emoji, color_hex } = category
  const [imgFailed, setImgFailed] = useState(false)

  if (icon_url && !imgFailed) {
    return (
      <img
        src={icon_url}
        alt={category.name}
        className="w-full h-full object-cover"
        // Inline style as a belt-and-suspenders fix on top of the Tailwind
        // classes above: a plain <img> defaults to display:inline, which
        // leaves a few px of baseline whitespace under the image even
        // inside a fixed-height, overflow:hidden container — the classic
        // "photo doesn't quite cover the card, there's a sliver of the
        // card background visible at the bottom" bug. display:block plus
        // explicit width/height:100% + objectFit:cover here guarantees the
        // image fills its container regardless of whether Tailwind's own
        // utilities got purged/overridden anywhere.
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
        onError={() => setImgFailed(true)}
        loading="lazy"
      />
    )
  }

  if (icon_emoji) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--surface)' }}>
        <span style={{ fontSize: iconSize * 1.08, lineHeight: 1 }}>{icon_emoji}</span>
      </div>
    )
  }

  const Icon = LucideIcons[icon_name] || Wrench
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--surface)' }}>
      <Icon size={iconSize} color={color_hex || 'var(--text-secondary)'} strokeWidth={1.5} />
    </div>
  )
}

/* ── single big card (Urban-Company-style) — Discovery mode only ── */
function CategoryCard({ category, index, onClick }) {
  const [hovered, setHovered] = useState(false)

  return (
    <motion.button
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, type: 'spring', stiffness: 300, damping: 26 }}
      onClick={() => onClick(category)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileTap={{ scale: 0.96 }}
      className="flex-shrink-0 text-center overflow-hidden"
      style={{
        width: 124,
        height: 150,
        position: 'relative',
        borderRadius: '18px',
        border: `1px solid ${hovered ? 'var(--accent-border)' : 'var(--card-border)'}`,
        background: 'var(--card)',
        scrollSnapAlign: 'start',
        transition: 'border-color 0.15s ease, transform 0.15s ease',
        transform: hovered ? 'translateY(-2px)' : 'none',
        cursor: 'pointer',
        // A plain <button> carries browser default padding (Chrome's UA
        // stylesheet gives it ~1px 6px) unless explicitly zeroed — that's
        // what was leaving a thin sliver of the card's own background
        // visible around the photo instead of the photo reaching flush to
        // the card's top/side edges.
        padding: 0,
        margin: 0,
        display: 'block',
      }}
    >
      {/* Photo — pinned to the top 80% of the card via absolute positioning
          (not a fixed px height) so it always fills its share of the card
          regardless of card size, instead of leaving any sliver of the
          card's own background visible around it. */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '80%',
        overflow: 'hidden', background: 'var(--surface)',
        borderTopLeftRadius: 17, borderTopRightRadius: 17,
      }}>
        <CategoryPhoto category={category} />
      </div>

      {/* Name — pinned to the bottom 20% of the card via bottom:0, so it
          always occupies exactly "the rest of the space" underneath the
          photo instead of pushing the card's total height around. */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 8px',
      }}>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 400,
            color: 'var(--text-primary)',
            textAlign: 'center',
            lineHeight: '1.25',
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {category.name}
        </span>
      </div>
    </motion.button>
  )
}

/* ── small compact tile — Instant mode (unchanged size/layout) ──── */
function CategoryTile({ category, index, onClick }) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03, type: 'spring', stiffness: 300, damping: 26 }}
      onClick={() => onClick(category)}
      whileTap={{ scale: 0.94 }}
      className="flex flex-col items-center gap-1.5"
      style={{ cursor: 'pointer' }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: '16px',
          overflow: 'hidden',
          background: 'var(--surface)',
          border: '1px solid var(--card-border)',
        }}
      >
        <CategoryPhoto category={category} />
      </div>
      <span
        style={{
          fontSize: '11px',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          textAlign: 'center',
          lineHeight: '1.25',
          maxWidth: 68,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {category.name}
      </span>
    </motion.button>
  )
}

/* ── "See all" tile — Instant mode only ───────────────────────────
   Instant's home-page preview only renders the first VISIBLE tiles
   (a full wrapping grid of every category would push the rest of the
   page below the fold). Without this tile there was no way to reach
   any category past #10 — clicking through to the full picker
   (NewJobPage's CategoryStep, which always renders with showAll) is
   the only place that lists everything, so this tile is the bridge. */
function CategoryMoreTile({ index, onClick }) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03, type: 'spring', stiffness: 300, damping: 26 }}
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      className="flex flex-col items-center gap-1.5"
      style={{ cursor: 'pointer' }}
    >
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--accent)',
          border: '1px solid var(--card-border)',
        }}
      >
        <ChevronRight size={22} style={{ color: '#000' }} />
      </div>
      <span
        style={{
          fontSize: '11px',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          textAlign: 'center',
          lineHeight: '1.25',
        }}
      >
        See all
      </span>
    </motion.button>
  )
}

/* ── horizontally scrollable row ─────────────────────────────────── */
const VISIBLE = 10  // show first 10 on home, all on job/new

export function CategoryGrid({ categories, isLoading, mode, onSelect, showAll = false }) {
  const navigate = useNavigate()
  const scrollRef = useRef(null)

  const handleClick = (cat) => {
    if (onSelect) {
      onSelect(cat)
    } else {
      navigate('/job/new', { state: { category: cat, mode } })
    }
  }

  // Unconditional — always opens the full picker (NewJobPage's category
  // step renders with showAll), regardless of whether this grid's own
  // tiles report selections via onSelect or via the default navigate-with-
  // category behavior above.
  const handleSeeAll = () => navigate('/job/new', { state: { mode } })

  const scrollBy = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' })
  }

  const isInstant = mode === 'instant'

  if (isLoading) {
    return isInstant ? (
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Skeleton style={{ width: 60, height: 60, borderRadius: 16, background: 'var(--card)' }} />
          </div>
        ))}
      </div>
    ) : (
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-shrink-0"
            style={{ width: 124, height: 150, borderRadius: 18, background: 'var(--card)' }}
          />
        ))}
      </div>
    )
  }

  if (!categories?.length) return null

  const visible = showAll ? categories : categories.slice(0, VISIBLE)
  const hasMore = !showAll && categories.length > VISIBLE

  // Instant mode keeps its original compact wrapping icon grid — unchanged
  // size/layout, still supports a photo via icon_url whenever one is added.
  // A "See all" tile is appended only when the caller truncated the list
  // (showAll=false and there are more categories than VISIBLE) so the full
  // grid on NewJobPage never shows a redundant "see all" pointing at itself.
  if (isInstant) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {visible.map((cat, i) => (
          <CategoryTile key={cat.id} category={cat} index={i} onClick={handleClick} />
        ))}
        {hasMore && (
          <CategoryMoreTile index={visible.length} onClick={handleSeeAll} />
        )}
      </div>
    )
  }

  return (
    <div className="relative group">
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto no-scrollbar pb-1"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {visible.map((cat, i) => (
          <CategoryCard key={cat.id} category={cat} index={i} onClick={handleClick} />
        ))}

        {hasMore && (
          <button
            onClick={() => navigate('/job/new')}
            className="flex-shrink-0 flex flex-col items-center justify-center gap-1.5"
            style={{
              width: 124,
              height: 150,
              borderRadius: '18px',
              border: '1px solid var(--accent-border)',
              background: 'var(--accent)',
              color: '#000',
              scrollSnapAlign: 'start',
              cursor: 'pointer',
            }}
          >
            <ChevronRight size={20} color="#000" />
            <span className="text-xs font-semibold">All services</span>
          </button>
        )}
      </div>

      {/* Desktop scroll arrows — hidden on touch, shown on hover */}
      <button
        onClick={() => scrollBy(-1)}
        className="hidden md:flex absolute left-0 top-[52px] -translate-x-2 z-10 w-8 h-8 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'var(--accent)', border: '1px solid var(--accent-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
      >
        <ChevronLeft className="h-4 w-4" style={{ color: '#000' }} />
      </button>
      <button
        onClick={() => scrollBy(1)}
        className="hidden md:flex absolute right-0 top-[52px] translate-x-2 z-10 w-8 h-8 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'var(--accent)', border: '1px solid var(--accent-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
      >
        <ChevronRight className="h-4 w-4" style={{ color: '#000' }} />
      </button>
    </div>
  )
}
