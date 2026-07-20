/**
 * MapLocationPicker — Mapbox map + Places autocomplete search + "use current
 * location" button, for any booking flow that needs the customer to set a
 * service address (not just the instant-job flow, which already has its own
 * copy of this pattern in NewJobPage.jsx).
 *
 * - Map: PuneMap (Mapbox GL, drag-to-set-pin, auto-geolocates on mount)
 * - Search: /geocode/autocomplete + /geocode/place (Google Places, proxied
 *   through our backend so the API key never reaches the client)
 * - Current location: browser geolocation → reverse-geocoded via
 *   /geocode/reverse, used both by PuneMap's own GPS button and the explicit
 *   "Use current location" button below the map
 */
import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Navigation, Loader2 } from 'lucide-react'
import { useGeoLocation } from '@/hooks/useGeoLocation'
import { useAddressAutocomplete, reverseGeocode } from '@/hooks/useGeocoding'
import { PuneMap } from '@/components/kaargar/PuneMap'

export function MapLocationPicker({ location, onLocationSelect, mapHeight = '240px' }) {
  const { getLocation, loading: geoLoading } = useGeoLocation()
  const { suggestions, loading: acLoading, search, resolvePlace, clear } = useAddressAutocomplete()
  const [addressInput, setAddressInput] = useState(location?.address || '')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [inputRect, setInputRect] = useState(null)
  const searchWrapRef = useRef(null)

  // This search box commonly sits inside a `.glass-card` (overflow:hidden,
  // for its rounded corners) — an absolutely-positioned suggestions list
  // nested inside gets clipped by that ancestor regardless of z-index (the
  // exact bug this session already hit and fixed for GlassSelect). Portaling
  // to <body> with `position: fixed` computed from the input's own rect
  // sidesteps any ancestor's overflow/stacking context entirely.
  const updateRect = useCallback(() => {
    if (searchWrapRef.current) setInputRect(searchWrapRef.current.getBoundingClientRect())
  }, [])

  useLayoutEffect(() => {
    if (showSuggestions) updateRect()
  }, [showSuggestions, updateRect])

  // Notify parent with lat/lon/address, and — when available — the
  // locality/area too (used to auto-fill the separate "Area" field).
  async function notify(lat, lon, address) {
    const geo = await reverseGeocode(lat, lon)
    onLocationSelect({
      lat, lon,
      address: address || geo?.formatted_address || '',
      area: geo?.area || null,
    })
  }

  async function handleGPS() {
    const loc = await getLocation()
    if (loc) {
      const geo = await reverseGeocode(loc.lat, loc.lon)
      const addr = geo?.formatted_address || loc.address || 'Current location'
      setAddressInput(addr)
      onLocationSelect({ lat: loc.lat, lon: loc.lon, address: addr, area: geo?.area || null })
    }
  }

  function handleAddressInput(val) {
    setAddressInput(val)
    search(val)
    setShowSuggestions(true)
  }

  async function handleSelectSuggestion(suggestion) {
    setAddressInput(suggestion.description)
    setShowSuggestions(false)
    clear()
    try {
      const place = await resolvePlace(suggestion.place_id)
      const geo = await reverseGeocode(place.lat, place.lon)
      onLocationSelect({
        lat: place.lat,
        lon: place.lon,
        address: place.formatted_address || suggestion.description,
        area: geo?.area || null,
      })
    } catch {
      onLocationSelect({ lat: location?.lat, lon: location?.lon, address: suggestion.description, area: null })
    }
  }

  return (
    <div>
      {/* Map with floating search bar on top.
          No overflow:hidden here — PuneMap already rounds its own corners
          internally, and this wrapper must stay unclipped so the address
          autocomplete dropdown (which is absolutely positioned below the
          search bar) isn't cut off once it extends past the map's height. */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <PuneMap
          onLocationSelect={(loc) => {
            notify(loc.lat, loc.lon, loc.address)
            if (loc.address) setAddressInput(loc.address)
          }}
          initialLat={location?.lat}
          initialLon={location?.lon}
          centerLat={location?.lat}
          centerLon={location?.lon}
          height={mapHeight}
        />

        <div style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 30 }}>
          <div ref={searchWrapRef} style={{ position: 'relative' }}>
            <MapPin
              size={16}
              style={{
                position: 'absolute', left: 12, top: '50%',
                transform: 'translateY(-50%)', color: 'var(--accent)', pointerEvents: 'none', zIndex: 1,
              }}
            />
            <input
              type="text"
              value={addressInput}
              onChange={e => handleAddressInput(e.target.value)}
              onFocus={() => addressInput && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
              placeholder="Search address in Pune…"
              style={{
                width: '100%', boxSizing: 'border-box',
                paddingLeft: 36, paddingRight: 36, paddingTop: 12, paddingBottom: 12,
                borderRadius: 14, border: 'none', outline: 'none',
                background: '#fff', color: '#1E293B',
                fontSize: 14, fontWeight: 500,
                boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
              }}
            />
            {acLoading && (
              <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--accent)' }} />
              </div>
            )}

            {showSuggestions && suggestions.length > 0 && inputRect && createPortal(
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  style={{
                    position: 'fixed',
                    top: inputRect.bottom + 6,
                    left: inputRect.left,
                    width: inputRect.width,
                    zIndex: 1000,
                    background: '#fff', borderRadius: 14, overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                  }}
                >
                  {suggestions.map((s, i) => (
                    <button
                      key={s.place_id || i}
                      type="button"
                      onMouseDown={() => handleSelectSuggestion(s)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '11px 14px',
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        borderBottom: i < suggestions.length - 1 ? '1px solid #F1F5F9' : 'none',
                        background: 'transparent', cursor: 'pointer', border: 'none',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <MapPin size={14} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: '#1E293B', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.main_text || s.description}
                        </p>
                        {s.secondary_text && (
                          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>{s.secondary_text}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </motion.div>
              </AnimatePresence>,
              document.body
            )}
          </div>
        </div>
      </div>

      {/* Explicit current-location button, in addition to PuneMap's own GPS pin button */}
      <button
        type="button"
        onClick={handleGPS}
        disabled={geoLoading}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderRadius: 12, width: '100%',
          background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}
      >
        {geoLoading
          ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite', color: '#22C55E' }} />
          : <Navigation size={15} color="#22C55E" />}
        {geoLoading ? 'Detecting…' : 'Use current location'}
      </button>
    </div>
  )
}
