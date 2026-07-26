/**
 * JobTrackingMap — read-only Mapbox view for an in-progress job.
 * Shows the destination pin (job.location_lat/lon) and, once a worker is
 * assigned, a live worker marker that moves as new GPS pings arrive.
 *
 * Data flow for the worker marker:
 *   1. Initial position: GET /jobs/{jobId}/worker-location
 *   2. Live pushes: Supabase Realtime UPDATE/INSERT on worker_locations,
 *      filtered by worker_id=eq.<job.worker_id> — the worker's own device
 *      posts pings via useLocationPublisher -> POST /workers/location.
 *
 * If there's no Mapbox token configured, falls back to a simple static
 * summary card instead of the interactive drag-pin fallback PuneMap uses
 * (that one's meant for picking a location, not displaying one).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Map, { Marker } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPin, Navigation2, Maximize2, Minimize2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const VALID_TOKEN  = MAPBOX_TOKEN && MAPBOX_TOKEN.startsWith('pk.')
const MAP_STYLE    = 'mapbox://styles/mapbox/streets-v12'

// Straight-line-distance/20kmh estimate — kept only as an INSTANT fallback
// while the real ETA (GET /jobs/{id}/eta, backed by Mapbox Directions,
// server-side) hasn't resolved yet, or if that call fails. The real ETA is
// polled on its own timer below rather than recomputed on every GPS
// Realtime tick — calling Directions on every ~3.5s ping would burn
// through Mapbox's free tier in minutes for a single active job.
const AVG_CITY_SPEED_KMH = 20
const ETA_POLL_MS = 25_000

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

function minutesToLabel(rawMinutes) {
  const minutes = Math.max(1, Math.round(rawMinutes))
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `~${h}h ${m}m away`
  }
  return `~${minutes} min away`
}

function etaLabel(distanceKm) {
  return minutesToLabel((distanceKm / AVG_CITY_SPEED_KMH) * 60)
}

// Job statuses where a worker location realistically exists and is worth polling/subscribing for.
// Kept in sync with backend's GET /jobs/{id}/worker-location trackable_statuses
// (routers/jobs.py) — 'worker_assigned' isn't a real job.status value the
// backend ever sets (only 'assigned' is), and 'confirmed' (Discovery/
// scheduled bookings with a pre-pinned worker) was missing here, which
// would desync from what the backend actually allows.
const TRACKABLE_STATUSES = new Set(['assigned', 'confirmed', 'en_route', 'arrived', 'started'])

export function JobTrackingMap({ job, height = '220px' }) {
  const mapRef = useRef(null)
  const [workerLoc, setWorkerLoc] = useState(null)
  const [expanded, setExpanded] = useState(false)

  const destLat = job?.location_lat != null ? Number(job.location_lat) : null
  const destLon = job?.location_lon != null ? Number(job.location_lon) : null
  const isTrackable = TRACKABLE_STATUSES.has(job?.status) && !!job?.worker_id
  const hasDest = destLat != null && destLon != null

  // Instant fallback shown the moment a worker position exists, before the
  // real ETA below has resolved (or if it errors).
  const fallbackEta = useMemo(() => {
    if (!workerLoc || !hasDest) return null
    const km = haversineKm(workerLoc.lat, workerLoc.lon, destLat, destLon)
    return etaLabel(km)
  }, [workerLoc?.lat, workerLoc?.lon, hasDest, destLat, destLon])

  // Real driving ETA, polled on a slow timer (not per Realtime GPS tick).
  const { data: etaData } = useQuery({
    queryKey: ['job-eta', job?.id],
    queryFn: () => api.get(`/jobs/${job.id}/eta`).then(r => r.data),
    enabled: isTrackable && !!job?.id && !!workerLoc,
    refetchInterval: ETA_POLL_MS,
    retry: false,
  })

  const eta = etaData?.duration_min != null
    ? minutesToLabel(etaData.duration_min)
    : fallbackEta

  // Initial fetch of the worker's last known position.
  useEffect(() => {
    if (!isTrackable || !job?.id) return
    let cancelled = false
    api.get(`/jobs/${job.id}/worker-location`)
      .then(({ data }) => { if (!cancelled) setWorkerLoc(data) })
      .catch(() => { /* no ping yet — marker just won't show until one arrives */ })
    return () => { cancelled = true }
  }, [isTrackable, job?.id])

  // Live pushes from the worker's device via Supabase Realtime.
  useEffect(() => {
    if (!isTrackable || !job?.worker_id) return
    const channel = supabase
      .channel(`worker-loc:${job.worker_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'worker_locations',
        filter: `worker_id=eq.${job.worker_id}`,
      }, ({ new: row }) => {
        if (row?.lat != null && row?.lon != null) {
          setWorkerLoc({ lat: Number(row.lat), lon: Number(row.lon), heading: row.heading, updated_at: row.updated_at })
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [isTrackable, job?.worker_id])

  // Keep both pins in view.
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !hasDest) return
    if (workerLoc) {
      const lats = [destLat, workerLoc.lat]
      const lons = [destLon, workerLoc.lon]
      map.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 60, maxZoom: 16, duration: 800 }
      )
    } else {
      map.flyTo({ center: [destLon, destLat], zoom: 15, duration: 500 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDest, destLat, destLon, workerLoc?.lat, workerLoc?.lon])

  // The map container's size changes when toggling fullscreen — Mapbox GL
  // needs an explicit nudge so its canvas resizes to fill the new bounds
  // (it doesn't reliably pick up size changes from a CSS-only class swap).
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    const t = setTimeout(() => map.resize(), 50)
    return () => clearTimeout(t)
  }, [expanded])

  if (!hasDest) return null

  if (!VALID_TOKEN) {
    return (
      <div className="rounded-2xl p-4 flex items-center gap-3"
        style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
        <MapPin className="h-5 w-5 shrink-0" style={{ color: 'var(--accent)' }} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {job.location_address || 'Service location'}
          </p>
          {isTrackable && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {eta ? `Worker is on the way · ${eta}` : workerLoc ? 'Worker is on the way' : 'Waiting for worker location…'}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={expanded ? 'fixed inset-0 z-[100]' : 'relative rounded-2xl overflow-hidden'}
      style={expanded ? { height: '100dvh', width: '100vw' } : { height }}
    >
      <Map
        ref={mapRef}
        initialViewState={{ longitude: destLon, latitude: destLat, zoom: 15 }}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAP_STYLE}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        reuseMaps
      >
        {/* Destination pin */}
        <Marker longitude={destLon} latitude={destLat} anchor="bottom">
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'var(--accent)', border: '3px solid #fff',
            boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MapPin size={16} color="#fff" strokeWidth={2.5} />
          </div>
        </Marker>

        {/* Live worker marker */}
        {workerLoc && (
          <Marker longitude={workerLoc.lon} latitude={workerLoc.lat} anchor="center">
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              style={{
                width: 30, height: 30, borderRadius: '50%',
                background: '#22C55E', border: '3px solid #fff',
                boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: workerLoc.heading != null ? `rotate(${workerLoc.heading}deg)` : undefined,
              }}
            >
              <Navigation2 size={14} color="#fff" strokeWidth={2.5} />
            </motion.div>
          </Marker>
        )}
      </Map>

      {/* Expand / collapse toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        title={expanded ? 'Exit fullscreen' : 'Enlarge map'}
        style={{
          position: 'absolute', top: 10, right: 10, zIndex: 20,
          width: 34, height: 34, borderRadius: 10,
          background: '#fff', border: 'none',
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {expanded
          ? <Minimize2 size={16} color="#1E293B" />
          : <Maximize2 size={16} color="#1E293B" />}
      </button>

      {/* Address chip */}
      <div style={{
        position: 'absolute', bottom: 10, left: 10, right: 10, zIndex: 10,
        background: '#fff', borderRadius: 12, padding: '8px 12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <MapPin size={13} color="var(--accent)" style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{
            fontSize: 12.5, fontWeight: 500, color: '#1E293B', margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {job.location_address || 'Service location'}
          </p>
          {eta && (
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', margin: 0 }}>
              {eta}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
