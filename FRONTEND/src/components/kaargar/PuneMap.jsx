/**
 * PuneMap — Uber/Rapido-style location picker.
 *
 * Behavior:
 *  • Auto-geolocates on mount (silently flies to real location)
 *  • Fixed center crosshair — drag map under the pin
 *  • GPS button uses mapRef.flyTo() for smooth zoom animation
 *  • centerLat/centerLon prop change also triggers flyTo (for search results)
 *  • Reverse geocodes via backend /v1/geocode/reverse on drag-end
 *  • Colored streets-v12 style (not dark)
 *  • Falls back to area grid if no Mapbox token
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import Map, { NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPin, Navigation, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'

const PUNE_CENTER = { longitude: 73.8567, latitude: 18.5204 }
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const VALID_TOKEN  = MAPBOX_TOKEN && MAPBOX_TOKEN.startsWith('pk.')
const MAP_STYLE    = 'mapbox://styles/mapbox/streets-v12'
const API_BASE     = import.meta.env.VITE_API_URL || 'http://localhost:8000/v1'

async function backendReverseGeocode(lat, lon) {
  try {
    const token = localStorage.getItem('kaargar_token') || ''
    const res = await fetch(
      `${API_BASE}/geocode/reverse?lat=${lat}&lon=${lon}`,
      token ? { headers: { Authorization: `Bearer ${token}` } } : {}
    )
    if (!res.ok) throw new Error(`${res.status}`)
    const data = await res.json()
    return data.formatted_address || null
  } catch (e) {
    console.warn('[PuneMap] reverse geocode failed:', e.message)
    return null
  }
}

// ── Fixed center crosshair ────────────────────────────────────
function CenterPin({ dragging }) {
  return (
    <div style={{
      position: 'absolute',
      top: '50%', left: '50%',
      transform: 'translate(-50%, -100%)',
      pointerEvents: 'none', zIndex: 10,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      <motion.div
        animate={{ y: dragging ? -10 : 0, scale: dragging ? 1.1 : 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--accent)',
          border: '3px solid #fff',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        <MapPin size={22} color="#fff" strokeWidth={2.5} />
      </motion.div>
      <motion.div
        animate={{ scaleX: dragging ? 0.5 : 1, opacity: dragging ? 0.2 : 0.25 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        style={{
          width: 14, height: 4, borderRadius: 2,
          background: '#000', marginTop: 3, filter: 'blur(2px)',
        }}
      />
    </div>
  )
}

export function PuneMap({
  onLocationSelect,
  initialLat,
  initialLon,
  centerLat,   // fly to this when changed (e.g. autocomplete picks a place)
  centerLon,
  height = '360px',
  className = '',
}) {
  const mapRef = useRef(null)

  const [viewState, setViewState] = useState({
    longitude: initialLon || PUNE_CENTER.longitude,
    latitude:  initialLat || PUNE_CENTER.latitude,
    zoom: initialLat ? 17 : 14,
    pitch: 0, bearing: 0,
  })

  const [dragging, setDragging]   = useState(false)
  const [resolving, setResolving] = useState(false)
  const [address, setAddress]     = useState('')
  const [gpsLoading, setGpsLoading] = useState(false)
  const resolveTimer = useRef(null)

  // ── flyTo helper — uses Mapbox GL JS directly for smooth animation ──
  const flyTo = useCallback((lat, lon, zoom = 17) => {
    const map = mapRef.current?.getMap()
    if (map) {
      map.flyTo({ center: [lon, lat], zoom, speed: 1.6, curve: 1.4 })
    } else {
      // Map not yet loaded — fall back to setting viewState
      setViewState(v => ({ ...v, latitude: lat, longitude: lon, zoom }))
    }
  }, [])

  // ── Auto-geolocate on mount ─────────────────────────────────
  useEffect(() => {
    if (initialLat && initialLon) {
      // Already have a location — geocode it
      resolveAndNotify(initialLat, initialLon)
      return
    }
    // No initial location — ask browser silently
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lon = pos.coords.longitude
        flyTo(lat, lon, 17)
        resolveAndNotify(lat, lon)
      },
      (err) => console.warn('[PuneMap] auto-geolocation denied:', err.message),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 30000 }
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Fly to centerLat/centerLon when prop changes (autocomplete) ──
  useEffect(() => {
    if (centerLat && centerLon) {
      flyTo(centerLat, centerLon, 17)
    }
  }, [centerLat, centerLon, flyTo])

  // ── Reverse geocode + notify parent ────────────────────────
  async function resolveAndNotify(lat, lon) {
    setResolving(true)
    const addr = await backendReverseGeocode(lat, lon)
    setResolving(false)
    if (addr) {
      setAddress(addr)
      onLocationSelect?.({ lat, lon, address: addr })
    }
  }

  // ── Map drag handlers ───────────────────────────────────────
  function handleMoveStart() {
    setDragging(true)
    clearTimeout(resolveTimer.current)
  }

  function handleMoveEnd(e) {
    setDragging(false)
    const { latitude: lat, longitude: lon } = e.viewState
    clearTimeout(resolveTimer.current)
    resolveTimer.current = setTimeout(() => resolveAndNotify(lat, lon), 500)
  }

  // ── GPS button ──────────────────────────────────────────────
  function handleGPS() {
    if (!navigator.geolocation) return
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lon = pos.coords.longitude
        flyTo(lat, lon, 17)
        resolveAndNotify(lat, lon)
        setGpsLoading(false)
      },
      (err) => {
        console.warn('[PuneMap] GPS error:', err.message)
        setGpsLoading(false)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  if (!VALID_TOKEN) return <MapFallback onSelect={onLocationSelect} height={height} className={className} />

  return (
    <div className={`relative rounded-2xl overflow-hidden ${className}`} style={{ height }}>
      <Map
        ref={mapRef}
        {...viewState}
        onMove={e => setViewState(e.viewState)}
        onMoveStart={handleMoveStart}
        onMoveEnd={handleMoveEnd}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAP_STYLE}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />
      </Map>

      {/* Fixed center crosshair */}
      <CenterPin dragging={dragging} />

      {/* GPS button */}
      <button
        onClick={handleGPS}
        title="Use my location"
        style={{
          position: 'absolute', bottom: 72, right: 12, zIndex: 20,
          width: 40, height: 40, borderRadius: 10,
          background: '#fff', border: 'none',
          boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
        {gpsLoading
          ? <Loader2 size={18} color="var(--accent)" style={{ animation: 'spin 0.8s linear infinite' }} />
          : <Navigation size={18} color="var(--accent)" fill="var(--accent)" />
        }
      </button>

      {/* Address chip at bottom */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 20,
        background: '#fff', borderRadius: 14,
        padding: '10px 14px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: dragging ? '#FEF3C7' : 'var(--accent-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.2s',
        }}>
          {resolving || dragging
            ? <Loader2 size={15} color="var(--accent)" style={{ animation: 'spin 0.8s linear infinite' }} />
            : <MapPin size={15} color="var(--accent)" />
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11, color: '#94A3B8', margin: 0, fontWeight: 500 }}>
            {dragging ? 'Move map to adjust…' : resolving ? 'Finding address…' : 'Delivery address'}
          </p>
          <p style={{
            fontSize: 13, fontWeight: 600, margin: 0, lineHeight: 1.3,
            color: dragging ? '#94A3B8' : '#1E293B',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {resolving && !address ? 'Getting address…' : address || 'Drag map to set location'}
          </p>
        </div>
      </div>

      {/* First-load hint */}
      {!address && !resolving && !dragging && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.6)', borderRadius: 20,
          padding: '5px 14px', zIndex: 20, pointerEvents: 'none',
        }}>
          <p style={{ fontSize: 11, color: '#fff', margin: 0, whiteSpace: 'nowrap' }}>
            Drag map to set your location
          </p>
        </div>
      )}
    </div>
  )
}

// ── Fallback: area grid when no Mapbox token ──────────────────
function MapFallback({ onSelect, height, className }) {
  const [selected, setSelected] = useState(null)
  const AREAS = [
    { name: 'Baner',         lat: 18.5590, lon: 73.7847 },
    { name: 'Aundh',         lat: 18.5590, lon: 73.8076 },
    { name: 'Kothrud',       lat: 18.5074, lon: 73.8077 },
    { name: 'Hinjewadi',     lat: 18.5912, lon: 73.7389 },
    { name: 'Kharadi',       lat: 18.5512, lon: 73.9420 },
    { name: 'Viman Nagar',   lat: 18.5679, lon: 73.9143 },
    { name: 'Koregaon Park', lat: 18.5362, lon: 73.8936 },
    { name: 'Hadapsar',      lat: 18.5089, lon: 73.9260 },
    { name: 'Magarpatta',    lat: 18.5167, lon: 73.9278 },
    { name: 'Kalyani Nagar', lat: 18.5468, lon: 73.9012 },
  ]
  function pick(area) {
    setSelected(area.name)
    onSelect?.({ lat: area.lat, lon: area.lon, address: `${area.name}, Pune` })
  }
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}
      style={{ height, background: 'var(--bg-elevated)', padding: 16, boxSizing: 'border-box', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Navigation size={14} color="var(--accent)" />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)' }}>Select your area in Pune</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {AREAS.map(area => (
          <button key={area.name} onClick={() => pick(area)} style={{
            textAlign: 'left', padding: '10px 12px', borderRadius: 12, fontSize: 13,
            fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
            background: selected === area.name ? 'var(--accent-bg-md)' : 'rgba(255,255,255,0.05)',
            border: selected === area.name ? '1.5px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)',
            color: selected === area.name ? 'var(--accent)' : 'rgba(255,255,255,0.6)',
          }}>
            {area.name}
          </button>
        ))}
      </div>
    </div>
  )
}
