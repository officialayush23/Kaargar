/**
 * PuneMap — Mapbox GL JS map component for location selection.
 * Uses react-map-gl v8 API.
 *
 * Requires VITE_MAPBOX_TOKEN in .env
 * If token is missing/invalid, renders a styled fallback.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import Map, { Marker, NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPin, Navigation } from 'lucide-react'
import { motion } from 'framer-motion'

const PUNE_CENTER = { longitude: 73.8567, latitude: 18.5204 }
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const VALID_TOKEN = MAPBOX_TOKEN && !MAPBOX_TOKEN.includes('placeholder')

// Dark 3D Mapbox style
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11'

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await res.json()
    const parts = [
      data.address?.road,
      data.address?.suburb || data.address?.neighbourhood,
      data.address?.city || data.address?.town,
    ].filter(Boolean)
    return parts.slice(0, 2).join(', ') || data.display_name || 'Selected location'
  } catch {
    return 'Selected location'
  }
}

export function PuneMap({ onLocationSelect, initialLat, initialLon, className = '' }) {
  const [viewState, setViewState] = useState({
    longitude: initialLon || PUNE_CENTER.longitude,
    latitude:  initialLat || PUNE_CENTER.latitude,
    zoom: 14,
    pitch: 45,
    bearing: -10,
  })
  const [marker, setMarker] = useState(
    initialLat ? { lng: initialLon, lat: initialLat } : null
  )
  const [resolving, setResolving] = useState(false)
  const [address, setAddress] = useState('')
  const resolveTimer = useRef(null)

  async function handleMapClick(e) {
    const { lng, lat } = e.lngLat
    setMarker({ lng, lat })
    setResolving(true)

    clearTimeout(resolveTimer.current)
    resolveTimer.current = setTimeout(async () => {
      const addr = await reverseGeocode(lat, lng)
      setAddress(addr)
      setResolving(false)
      onLocationSelect?.({ lat, lon: lng, address: addr })
    }, 400)
  }

  function handleDragEnd(e) {
    const { lng, lat } = e.lngLat
    setMarker({ lng, lat })
    setResolving(true)
    clearTimeout(resolveTimer.current)
    resolveTimer.current = setTimeout(async () => {
      const addr = await reverseGeocode(lat, lng)
      setAddress(addr)
      setResolving(false)
      onLocationSelect?.({ lat, lon: lng, address: addr })
    }, 400)
  }

  if (!VALID_TOKEN) {
    return <MapFallback onSelect={onLocationSelect} />
  }

  return (
    <div className={`relative rounded-2xl overflow-hidden ${className}`}>
      <Map
        {...viewState}
        onMove={e => setViewState(e.viewState)}
        onClick={handleMapClick}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle={MAP_STYLE}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {marker && (
          <Marker
            longitude={marker.lng}
            latitude={marker.lat}
            draggable
            onDragEnd={handleDragEnd}
            anchor="bottom"
          >
            <motion.div
              initial={{ scale: 0, y: -20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="flex flex-col items-center"
            >
              <div className="w-10 h-10 rounded-full bg-azure border-3 border-white shadow-[0_4px_20px_rgba(59,130,246,0.6)] flex items-center justify-center">
                <MapPin className="h-5 w-5 text-white" />
              </div>
              <div className="w-2 h-2 rounded-full bg-azure/60 mt-0.5" />
            </motion.div>
          </Marker>
        )}
      </Map>

      {/* Tap hint overlay when no marker */}
      {!marker && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="glass rounded-2xl px-4 py-2.5 flex items-center gap-2"
          >
            <MapPin className="h-4 w-4 text-azure" />
            <span className="text-sm text-white/80">Tap map to drop pin</span>
          </motion.div>
        </div>
      )}

      {/* Address overlay */}
      {(marker || resolving) && (
        <div className="absolute bottom-3 left-3 right-3 glass rounded-xl px-3 py-2.5 flex items-center gap-2">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${resolving ? 'bg-white/20' : 'bg-azure/30'}`}>
            <MapPin className="h-3 w-3 text-azure" />
          </div>
          <span className="text-xs text-white/80 truncate">
            {resolving ? 'Locating address…' : address || 'Address found'}
          </span>
        </div>
      )}
    </div>
  )
}

function MapFallback({ onSelect }) {
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
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-navy p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-400">
        <Navigation className="h-4 w-4" />
        <span className="text-xs font-medium">Select your area in Pune</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {AREAS.map(area => (
          <button
            key={area.name}
            onClick={() => pick(area)}
            className={`text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
              selected === area.name
                ? 'bg-azure/20 border-azure/40 text-azure'
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80'
            }`}
          >
            {area.name}
          </button>
        ))}
      </div>
      {!import.meta.env.VITE_MAPBOX_TOKEN?.includes('placeholder') ? null : (
        <p className="text-[10px] text-white/20 text-center">
          Add VITE_MAPBOX_TOKEN to .env for full map experience
        </p>
      )}
    </div>
  )
}
