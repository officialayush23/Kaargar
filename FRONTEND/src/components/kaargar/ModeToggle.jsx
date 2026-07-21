/**
 * ModeToggle — shared Instant/Discovery pill, used at the top of both
 * HomePage (Instant) and DiscoveryPage (Discovery).
 *
 * This used to be two separate things: HomePage had its own local
 * `InlineModeToggle` that just flipped a `mode` value in-place and
 * rendered different content on the SAME page (so picking "Discover" on
 * Home never actually navigated anywhere — it just swapped in a
 * recommendations feed on top of the Home route), and this file existed
 * separately, unused, as a leftover fixed-floating pill from an earlier
 * pass. Neither matched what Discovery bookings actually need: Discovery
 * always ends in the customer picking a specific worker (see
 * DiscoveryPage's search flow), which lives on its own route (`/discover`),
 * not inline on Home.
 *
 * Now the toggle is one component that's genuinely navigation-aware:
 * picking "Instant" takes you to `/` and picking "Discover" takes you to
 * `/discover`, syncing the global `mode` store either way so whichever
 * page you land on already reflects the right toggle state and the right
 * content (Home no longer renders a Discovery feed of its own).
 */
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Zap, Compass } from 'lucide-react'
import { useAppStore } from '@/stores/app'

const MODES = [
  { id: 'instant',   label: 'Instant',  icon: Zap,     path: '/' },
  { id: 'discovery', label: 'Discover', icon: Compass, path: '/discover' },
]

export function ModeToggle({ className = '' }) {
  const { mode, setMode } = useAppStore()
  const navigate = useNavigate()

  const handleSelect = (m) => {
    if (m.id === mode) return
    setMode(m.id)
    navigate(m.path)
  }

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        padding: '3px',
        gap: '3px',
        borderRadius: '9999px',
        background: 'var(--card)',
        border: '1px solid var(--card-border)',
      }}
    >
      {MODES.map((m) => {
        const active = mode === m.id
        const Icon = m.icon
        return (
          <button
            key={m.id}
            onClick={() => handleSelect(m)}
            className="relative flex items-center gap-2 px-5 py-2 select-none"
            style={{
              borderRadius: '9999px',
              WebkitTapHighlightColor: 'transparent',
              cursor: 'pointer',
              border: '1px solid transparent',
              background: 'transparent',
            }}
          >
            {/* Animated sliding active background — a single shared
                layoutId means framer-motion animates it smoothly from
                whichever button it was on to the newly-active one,
                instead of the two buttons just abruptly swapping colors. */}
            {active && (
              <motion.div
                layoutId="mode-toggle-active-bg"
                className="absolute inset-0"
                style={{ borderRadius: '9999px', background: 'var(--accent)' }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            {/* Outline-only, never filled — a solid black fill on top of
                a black stroke (both driven by currentColor) made the icon's
                own line detail disappear into itself, especially on
                Compass's thin needle, leaving what looked like a plain
                black dot instead of a recognizable icon. */}
            <Icon
              size={15}
              className="relative"
              fill="none"
              style={{ color: active ? '#000' : 'var(--text-muted)' }}
              strokeWidth={2}
            />
            <span
              className="relative text-sm font-semibold font-clean"
              style={{ color: active ? '#000' : 'var(--text-muted)' }}
            >
              {m.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
