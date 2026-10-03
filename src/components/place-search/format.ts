import type { PlaceKind } from '../../api/places'

export const KIND_ICON: Record<PlaceKind, string> = {
  STOP: '🚏',
  ADDRESS: '🏠',
  POI: '📍',
  FAVORITE: '⭐',
  RECENT: '🕘'
}

/** "850 m" under a kilometre, otherwise "1,2 km" (Swedish decimal comma). */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
  return `${km.toFixed(1).replace('.', ',')} km`
}

export function formatDistanceM(m: number): string {
  return formatDistance(m / 1000)
}

export function optionId(listId: string, i: number) {
  return `${listId}-opt-${i}`
}
