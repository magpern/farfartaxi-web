import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

const pin = (cls: string, text: string) =>
  L.divIcon({ className: `mini-pin ${cls}`, html: `<span>${text}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] })

/** Small static (non-interactive) map with the pickup (A) and destination (B) markers. */
export function MiniMap({ fromLat, fromLon, toLat, toLon, label }: { fromLat: number; fromLon: number; toLat: number; toLon: number; label: string }) {
  const node = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!node.current) return
    const map = L.map(node.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map)
    const a: L.LatLngTuple = [fromLat, fromLon]
    const b: L.LatLngTuple = [toLat, toLon]
    L.marker(a, { icon: pin('mini-pin-a', 'A'), interactive: false, keyboard: false }).addTo(map)
    L.marker(b, { icon: pin('mini-pin-b', 'B'), interactive: false, keyboard: false }).addTo(map)
    if (a[0] === b[0] && a[1] === b[1]) map.setView(a, 15)
    else map.fitBounds(L.latLngBounds([a, b]), { padding: [24, 24], maxZoom: 16 })
    return () => {
      map.remove()
    }
  }, [fromLat, fromLon, toLat, toLon])
  return (
    <>
      <div ref={node} className="mini-map" data-testid="mini-map" role="img" aria-label={label} />
      <p className="mini-map-credit">© OpenStreetMap</p>
    </>
  )
}
