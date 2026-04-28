import { useState, useCallback } from 'react'

const PUNE_AREAS = [
  'Hinjewadi', 'Kothrud', 'Aundh', 'Baner', 'Wakad',
  'Pimpri-Chinchwad', 'Hadapsar', 'Kharadi', 'Viman Nagar',
  'Kalyani Nagar', 'Koregaon Park', 'Camp', 'Shivajinagar',
  'Deccan', 'Katraj', 'Kondhwa', 'Magarpatta',
  'Sinhagad Road', 'Warje', 'Bavdhan',
]

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await res.json()
    const parts = [
      data.address?.suburb || data.address?.neighbourhood,
      data.address?.city || data.address?.town,
      data.address?.state,
    ].filter(Boolean)
    return parts.join(', ') || data.display_name || 'Current Location'
  } catch {
    return 'Current Location'
  }
}

export function useGeoLocation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const getCurrentPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'))
        return
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 60_000,
      })
    })
  }, [])

  const getLocation = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const pos = await getCurrentPosition()
      const { latitude: lat, longitude: lon } = pos.coords
      const address = await reverseGeocode(lat, lon)
      return { lat, lon, address, label: 'Current Location' }
    } catch (err) {
      const msg = err.code === 1
        ? 'Location permission denied'
        : err.code === 2
        ? 'Location unavailable'
        : 'Could not get location'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [getCurrentPosition])

  return { getLocation, loading, error, puneAreas: PUNE_AREAS }
}
