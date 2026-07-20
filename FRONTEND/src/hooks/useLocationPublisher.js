/**
 * useLocationPublisher — while `active` is true, watches the browser's GPS
 * and pushes pings to POST /workers/location so:
 *   1. the matching engine (services/matching.py) can find this worker for
 *      new instant jobs, and
 *   2. customers on an active job can see the worker moving on the tracking
 *      map (ActiveJobPage + JobTrackingMap, via Supabase Realtime on the
 *      worker_locations table).
 *
 * Before this hook, nothing on the frontend ever called /workers/location —
 * the endpoint existed but the browser's GPS was never actually read, so
 * live tracking had no data to show. Throttled to match the backend's own
 * 3s rate limit (loc_limit:{worker_id} in workers.py).
 */
import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'

export function useLocationPublisher(active) {
  const watchIdRef = useRef(null)
  const lastSentRef = useRef(0)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!active || !navigator.geolocation) return

    function send(pos) {
      const now = Date.now()
      if (now - lastSentRef.current < 3500) return // matches backend's 3s rate limit
      if (inFlightRef.current) return
      lastSentRef.current = now
      inFlightRef.current = true

      const { latitude: lat, longitude: lon, accuracy, heading } = pos.coords
      api.post('/workers/location', {
        lat, lon,
        accuracy_m: accuracy ?? undefined,
        heading: heading ?? undefined,
      }).catch(() => {
        // best-effort — a dropped ping just means the tracking map is a
        // few seconds stale, not worth surfacing to the worker
      }).finally(() => {
        inFlightRef.current = false
      })
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      send,
      (err) => console.warn('[useLocationPublisher] geolocation error:', err.message),
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 10000 }
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [active])
}
