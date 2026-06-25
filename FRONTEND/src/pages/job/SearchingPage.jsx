/**
 * SearchingPage — Rapido/Uber-style live search with a real Mapbox map.
 *
 * Layout:
 *  • Full Mapbox dark map (takes 55-60% of screen)
 *  • User location pin at center with pulsing orange ripple rings
 *  • Simulated worker markers scattered around (animate in, float)
 *  • Bottom info panel: animated status text while searching,
 *    worker found card slides up on match
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useParams }                    from 'react-router-dom'
import { motion, AnimatePresence }                   from 'framer-motion'
import Map, { Marker }                               from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { X, Star, MessageCircle, ChevronRight, Clock } from 'lucide-react'
import { api }                             from '@/lib/api'
import { supabase }                        from '@/lib/supabase'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { toast }                           from 'sonner'

// ─── Config ──────────────────────────────────────────────────────────────────
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const MAP_STYLE    = 'mapbox://styles/mapbox/dark-v11'
const PUNE_CENTER  = { longitude: 73.8567, latitude: 18.5204 }

// Offsets (degrees) for simulated worker positions around user
const WORKER_OFFSETS = [
  { dx: -0.0042, dy:  0.0028 },
  { dx:  0.0058, dy:  0.0038 },
  { dx:  0.0065, dy: -0.0025 },
  { dx:  0.0028, dy: -0.0055 },
  { dx: -0.0048, dy: -0.0032 },
  { dx: -0.0015, dy:  0.0065 },
]

const SEARCH_MESSAGES = [
  'Finding workers near you…',
  'Checking availability…',
  'Matching your requirements…',
  'Almost there…',
  'Connecting with nearby pros…',
]

// ─── User location pin + ripple rings (rendered as a Mapbox Marker) ──────────
function UserPin() {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Expanding ripple rings */}
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            borderRadius: '50%',
            border: '1.5px solid rgba(245,158,11,0.3)',
            pointerEvents: 'none',
          }}
          initial={{ width: 0, height: 0, opacity: 0.85 }}
          animate={{ width: 220, height: 220, opacity: 0 }}
          transition={{ duration: 2.9, repeat: Infinity, delay: i * 0.97, ease: 'easeOut' }}
        />
      ))}


      {/* Pin body */}
      <div style={{
        width: 22, height: 22,
        borderRadius: '50%',
        background: '#F59E0B',
        border: '3px solid #fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        position: 'relative',
        zIndex: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
      </div>
    </div>
  )
}

// ─── Simulated worker marker ──────────────────────────────────────────────────
function WorkerPin({ delay, highlight }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22, delay }}
    >
      <motion.div
        animate={highlight
          ? { scale: [1, 1.3, 1] }
          : { y: [-2, 2, -2] }
        }
        transition={{ duration: highlight ? 0.5 : 3.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div style={{
          width: 36, height: 36,
          borderRadius: '50%',
          background: highlight ? '#F59E0B' : 'rgba(255,255,255,0.12)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: `1.5px solid ${highlight ? '#F59E0B' : 'rgba(255,255,255,0.22)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15,
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          transition: 'all 0.35s ease',
          cursor: 'default',
        }}>
          🔧
        </div>
        {/* Ground shadow */}
        <div style={{
          width: 10, height: 3, margin: '2px auto 0',
          background: 'rgba(0,0,0,0.25)',
          borderRadius: '50%', filter: 'blur(2px)',
        }} />
      </motion.div>
    </motion.div>
  )
}

// ─── Bottom: animated status while searching ──────────────────────────────────
function SearchingStatus() {
  const [msgIdx, setMsgIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setMsgIdx(i => (i + 1) % SEARCH_MESSAGES.length), 2600)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="space-y-3">
      <AnimatePresence mode="wait">
        <motion.p
          key={msgIdx}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="text-base font-semibold font-syne"
          style={{ color: 'var(--text-primary)' }}
        >
          {SEARCH_MESSAGES[msgIdx]}
        </motion.p>
      </AnimatePresence>

      <div className="flex items-center gap-2.5">
        <div className="flex -space-x-1.5">
          {[0, 1, 2, 3].map(i => (
            <motion.div
              key={i}
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--g-bg-mid)',
                border: '1px solid var(--g-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11,
              }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.35 }}
            >
              🔧
            </motion.div>
          ))}
        </div>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {WORKER_OFFSETS.length} workers nearby
        </span>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Usually matched in under 2 min
      </p>
    </div>
  )
}

// ─── Worker found card ────────────────────────────────────────────────────────
function WorkerFoundCard({ worker, jobId, onChat }) {
  const navigate = useNavigate()

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24 }}
      className="space-y-4"
    >
      {/* Success row */}
      <div className="flex items-center gap-3">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.1 }}
          style={{
            width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(34,197,94,0.14)',
            border: '2px solid rgba(34,197,94,0.38)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(34,197,94,0.28)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>
        <div>
          <h2 className="text-lg font-bold font-syne" style={{ color: 'var(--text-primary)' }}>Worker found!</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Your professional is on the way</p>
        </div>
      </div>

      {/* Worker card */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Avatar className="w-14 h-14 shrink-0" style={{ border: '2px solid rgba(34,197,94,0.28)' }}>
            <AvatarImage src={worker?.avatar_url} />
            <AvatarFallback className="font-bold text-base">
              {worker?.full_name?.[0] || 'W'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {worker?.full_name || 'Professional'}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="text-sm text-amber-400 font-medium">
                {worker?.avg_rating?.toFixed(1) || '4.8'}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                · {worker?.total_jobs_completed || 0} jobs
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-emerald-400">Verified professional</span>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--g-border)', paddingTop: 12 }}
          className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>ETA</p>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                30–45 min
              </p>
            </div>
          </div>
          <button
            onClick={onChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium"
            style={{
              background: 'var(--card)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--card-border)',
            }}
          >
            <MessageCircle size={13} />
            Chat
          </button>
        </div>
      </div>

      <button
        onClick={() => navigate(`/job/${jobId}/active`)}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-base transition-all active:scale-95"
        style={{
          background: '#F59E0B',
          color: '#000',
        }}
      >
        Track job live
        <ChevronRight size={18} />
      </button>
    </motion.div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SearchingPage() {
  const { jobId } = useParams()
  const navigate  = useNavigate()

  const [jobStatus,  setJobStatus]  = useState('searching')
  const [worker,     setWorker]     = useState(null)
  const [matchedIdx, setMatchedIdx] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  // User's real geo position (falls back to Pune center)
  const [userCoords, setUserCoords] = useState({
    longitude: PUNE_CENTER.longitude,
    latitude:  PUNE_CENTER.latitude,
  })
  const [viewState, setViewState] = useState({
    longitude: PUNE_CENTER.longitude,
    latitude:  PUNE_CENTER.latitude,
    zoom: 14.5,
    pitch: 30,
    bearing: 0,
  })

  const channelRef = useRef(null)

  // Geolocate user on mount
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pos = { longitude: coords.longitude, latitude: coords.latitude }
        setUserCoords(pos)
        setViewState(v => ({ ...v, ...pos, zoom: 14.5 }))
      },
      () => {}, // silently fall back to Pune center
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
    )
  }, [])

  // Job status subscription
  useEffect(() => {
    if (!jobId) return

    api.get(`/jobs/${jobId}`).then(({ data }) => {
      setJobStatus(data.status)
      if (data.assigned_worker) setWorker(data.assigned_worker)
      if (['assigned', 'en_route', 'arrived', 'started'].includes(data.status)) {
        navigate(`/job/${jobId}/active`, { replace: true })
      }
    }).catch(() => {})

    channelRef.current = supabase
      .channel(`job:${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'jobs',
        filter: `id=eq.${jobId}`,
      }, ({ new: updated }) => {
        setJobStatus(updated.status)
        if (updated.status === 'assigned') {
          setMatchedIdx(Math.floor(Math.random() * WORKER_OFFSETS.length))
          api.get(`/jobs/${jobId}`).then(({ data }) => {
            if (data.assigned_worker) setWorker(data.assigned_worker)
          }).catch(() => {})
        }
        if (['en_route', 'arrived', 'started'].includes(updated.status)) {
          navigate(`/job/${jobId}/active`, { replace: true })
        }
        if (updated.status === 'failed') {
          toast.error('No workers available right now. Please try again.')
        }
        if (updated.status === 'cancelled') {
          navigate('/', { replace: true })
        }
      })
      .subscribe()

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [jobId, navigate])

  async function handleCancel() {
    setCancelling(true)
    try {
      await api.post(`/jobs/${jobId}/cancel`, { reason: 'User cancelled' })
      navigate('/', { replace: true })
    } catch (e) {
      // 409 = job already in terminal state — just go home
      if (e?.response?.status === 409) navigate('/', { replace: true })
      else toast.error('Could not cancel. Try again.')
    } finally {
      setCancelling(false)
    }
  }

  // Compute worker geo positions relative to user
  const workerPositions = WORKER_OFFSETS.map(({ dx, dy }) => ({
    longitude: userCoords.longitude + dx,
    latitude:  userCoords.latitude  + dy,
  }))

  const workerFound = jobStatus === 'assigned' && worker

  return (
    <div className="min-h-full flex flex-col gap-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-lg font-bold font-syne" style={{ color: 'var(--text-primary)' }}>
          {workerFound ? 'Match found! 🎉' : 'Finding your pro…'}
        </h1>
        {!workerFound && jobStatus !== 'failed' && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-all"
            style={{
              background: 'var(--g-bg)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--g-border)',
              opacity: cancelling ? 0.5 : 1,
            }}
          >
            {cancelling ? (
              <motion.div
                className="w-3.5 h-3.5 rounded-full border-2"
                style={{ borderColor: 'currentColor', borderTopColor: 'transparent' }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
              />
            ) : (
              <X size={14} />
            )}
            Cancel
          </button>
        )}
      </div>

      {/* ── Mapbox map ──────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{ height: 300, borderRadius: 20, flexShrink: 0 }}
      >
        <Map
          {...viewState}
          onMove={e => setViewState(e.viewState)}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle={MAP_STYLE}
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
          reuseMaps
        >
          {/* User location — ripple rings + orange pin */}
          <Marker
            longitude={userCoords.longitude}
            latitude={userCoords.latitude}
            anchor="center"
          >
            <UserPin />
          </Marker>

          {/* Simulated worker markers */}
          {workerPositions.map((pos, i) => (
            <Marker
              key={i}
              longitude={pos.longitude}
              latitude={pos.latitude}
              anchor="bottom"
            >
              <WorkerPin delay={0.2 + i * 0.1} highlight={matchedIdx === i} />
            </Marker>
          ))}
        </Map>

        {/* "You" label chip — fixed at bottom-center of map area */}
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: 14, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.62)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderRadius: 20,
            padding: '3px 12px',
            border: '1px solid rgba(255,255,255,0.1)',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: '#F59E0B', fontSize: 11, fontWeight: 600 }}>
            📍 Your location
          </span>
        </div>
      </div>

      {/* ── Bottom content ──────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {workerFound ? (
          <WorkerFoundCard
            key="found"
            worker={worker}
            jobId={jobId}
            onChat={() => navigate(`/chat/${jobId}`)}
          />
        ) : jobStatus === 'failed' ? (
          <motion.div
            key="failed"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center py-8 gap-4 text-center"
          >
            <div
              style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26,
              }}
            >
              😔
            </div>
            <div>
              <p className="font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>
                No workers available
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                All pros are busy right now. Try again in a few minutes.
              </p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 rounded-2xl font-semibold text-sm"
              style={{
                background: '#F59E0B',
                color: '#000',
              }}
            >
              Back to home
            </button>
          </motion.div>
        ) : (
          <SearchingStatus key="searching" />
        )}
      </AnimatePresence>
    </div>
  )
}
