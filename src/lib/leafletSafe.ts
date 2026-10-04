import type L from 'leaflet'

const disposed = new WeakSet<object>()

/** True while the map can still be moved: not removed and its container is attached to the document. */
export function isMapAlive(map: L.Map | null | undefined): map is L.Map {
  if (!map || disposed.has(map)) return false
  try {
    if (typeof map.getContainer !== 'function') return true // partial test doubles
    const m = map as unknown as { _mapPane?: unknown }
    return !!m._mapPane && map.getContainer().isConnected
  } catch {
    return false
  }
}

/** Stops in-flight pan/zoom animations, detaches listeners and removes the map; safe to call twice. */
export function disposeMap(map: L.Map): void {
  if (disposed.has(map)) return
  disposed.add(map)
  try {
    map.stop?.()
  } catch {
    /* map already torn down */
  }
  try {
    map.off?.()
    map.remove()
  } catch {
    /* already removed */
  }
}
