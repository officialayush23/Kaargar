/**
 * useGeocoding — wrapper around /v1/geocode endpoints.
 * Falls back gracefully when GOOGLE_MAPS_API_KEY is not configured.
 */
import { useState, useCallback, useRef } from 'react'
import { api } from '@/lib/api'

export function useAddressAutocomplete() {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)

  const search = useCallback((input) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!input || input.length < 2) { setSuggestions([]); return }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await api.get('/geocode/autocomplete', { params: { input } })
        setSuggestions(Array.isArray(data) ? data : [])
      } catch {
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 350)
  }, [])

  const resolvePlace = useCallback(async (placeId) => {
    const { data } = await api.get('/geocode/place', { params: { place_id: placeId } })
    return data // { lat, lon, formatted_address, name }
  }, [])

  const clear = useCallback(() => setSuggestions([]), [])

  return { suggestions, loading, search, resolvePlace, clear }
}

export async function reverseGeocode(lat, lon) {
  try {
    const { data } = await api.get('/geocode/reverse', { params: { lat, lon } })
    return data // { formatted_address, area, city }
  } catch {
    return null
  }
}

export async function forwardGeocode(address) {
  try {
    const { data } = await api.get('/geocode/forward', { params: { address } })
    return data // { lat, lon, formatted_address, place_id }
  } catch {
    return null
  }
}
