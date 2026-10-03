import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n/context'
import { API_URL } from '../lib/session'
import { showAccuracyCircle, tweenPoint, TWEEN_MS, type EtaTarget, type LatLon } from '../lib/liveTracking'

export type LiveCar = LatLon & { accuracyM?: number | null }

type Props = {
  pickup: LatLon
  destination: LatLon
  car: LiveCar | null
  /** Which stop the car is heading for: drives the auto-fit and which pins show. */
  target: EtaTarget
}

const pin = (cls: string, text: string) =>
  L.divIcon({ className: `mini-pin ${cls}`, html: `<span>${text}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] })
const carIcon = L.divIcon({ className: 'live-car', html: '<span>🚗</span>', iconSize: [36, 36], iconAnchor: [18, 18] })

const tup = (p: LatLon): L.LatLngTuple => [p.lat, p.lon]

type RouteResponse = { code?: string; routes?: Array<{ geometry?: { coordinates?: number[][] } }> }

/** Live map: moving car, accuracy circle, pickup/destination pins, route line. Shared by the passenger and share pages. */
export function LiveRideMap({ pickup, destination, car, target }: Props) {
  const { t } = useI18n()
  const node = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const carMarker = useRef<L.Marker | null>(null)
  const circle = useRef<L.Circle | null>(null)
  const carPos = useRef<LatLon | null>(null)
  const anim = useRef(0)
  const userMoved = useRef(false)
  const latest = useRef({ car, target, pickup, destination })
  useEffect(() => {
    latest.current = { car, target, pickup, destination }
  })

  // Create the map once.
  useEffect(() => {
    if (!node.current) return
    const map = L.map(node.current, {
      zoomControl: true,
      attributionControl: true,
      // On touch screens one finger scrolls the page (pinch still pans/zooms the map); mouse users can drag.
      dragging: !L.Browser.mobile,
      tap: true,
      scrollWheelZoom: false, // do not hijack page scroll
      touchZoom: true
    } as L.MapOptions)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map)
    map.on('dragstart zoomstart', (e) => {
      // zoomstart also fires for our own fitBounds; only count gestures
      if (e.type === 'dragstart') userMoved.current = true
    })
    map.setView(tup(latest.current.pickup), 14)
    mapRef.current = map
    return () => {
      cancelAnimationFrame(anim.current)
      map.remove()
      mapRef.current = null
      carMarker.current = null
      circle.current = null
      carPos.current = null
    }
  }, [])

  // Pins.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const layers = [L.marker(tup(pickup), { icon: pin('mini-pin-a', 'A'), interactive: false, keyboard: false }).addTo(map)]
    if (target === 'DESTINATION') {
      layers.push(L.marker(tup(destination), { icon: pin('mini-pin-b', 'B'), interactive: false, keyboard: false }).addTo(map))
    }
    return () => layers.forEach((l) => l.remove())
  }, [pickup, destination, target])

  // Route line, fetched once per ride (stub-safe).
  const routeKey = `${pickup.lat},${pickup.lon},${destination.lat},${destination.lon}`
  useEffect(() => {
    const map = mapRef.current
    if (!map || (pickup.lat === destination.lat && pickup.lon === destination.lon)) return
    const ac = new AbortController()
    let line: L.Polyline | null = null
    void (async () => {
      try {
        const q = `fromLat=${pickup.lat}&fromLon=${pickup.lon}&toLat=${destination.lat}&toLon=${destination.lon}`
        const res = await fetch(`${API_URL}/api/public/route/driving?${q}`, { signal: ac.signal, headers: { Accept: 'application/json' } })
        if (!res.ok) return
        const data = (await res.json()) as RouteResponse
        const coords = data.routes?.[0]?.geometry?.coordinates
        if (data.code !== 'Ok' || !coords?.length || ac.signal.aborted) return
        line = L.polyline(
          coords.map((c) => [c[1], c[0]] as L.LatLngTuple),
          { color: '#38bdf8', weight: 5, opacity: 0.85, lineJoin: 'round', interactive: false }
        ).addTo(map)
      } catch {
        /* no route line is fine */
      }
    })()
    return () => {
      ac.abort()
      line?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- routeKey covers pickup/destination
  }, [routeKey])

  // Car marker: tween to each new position; accuracy circle follows.
  const carLat = car?.lat
  const carLon = car?.lon
  const carAcc = car?.accuracyM
  useEffect(() => {
    const map = mapRef.current
    if (!map || carLat == null || carLon == null) return
    const to: LatLon = { lat: carLat, lon: carLon }
    const place = (p: LatLon) => {
      carMarker.current?.setLatLng(tup(p))
      circle.current?.setLatLng(tup(p))
    }
    if (!carMarker.current) {
      carMarker.current = L.marker(tup(to), { icon: carIcon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map)
      carPos.current = to
    } else if (carPos.current) {
      const from = carPos.current
      carPos.current = to
      cancelAnimationFrame(anim.current)
      const start = performance.now()
      const step = (now: number) => {
        const p = tweenPoint(from, to, now - start, TWEEN_MS)
        place(p)
        if (now - start < TWEEN_MS) anim.current = requestAnimationFrame(step)
      }
      anim.current = requestAnimationFrame(step)
    }
    if (showAccuracyCircle(carAcc)) {
      if (!circle.current) {
        circle.current = L.circle(tup(to), { radius: carAcc!, color: '#38bdf8', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map)
      } else circle.current.setRadius(carAcc!)
    } else if (circle.current) {
      circle.current.remove()
      circle.current = null
    }
  }, [carLat, carLon, carAcc])

  // Auto-fit car + target. Refits when the stop changes or the car leaves the view; not after the user dragged.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const stop = target === 'DESTINATION' ? destination : pickup
    if (carLat == null || carLon == null) {
      map.setView(tup(stop), 15)
      return
    }
    const pts = L.latLngBounds([tup(stop), [carLat, carLon]])
    const view = map.getBounds()
    if (!userMoved.current || !view.contains(pts)) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 16, animate: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit on car/target change only
  }, [carLat, carLon, target])

  return (
    <div
      ref={node}
      className="live-map"
      data-testid="live-map"
      role="img"
      aria-label={t('live.mapLabel')}
    />
  )
}
