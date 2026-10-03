/** Navigation hand-off (Google Maps / Apple Maps by coordinates) and SMS links with a prefilled body. */

export type MapApp = 'apple' | 'google'

const KEY = 'farfartaxi-map-app'

/** Dot-decimal, 6 decimals, independent of the device locale. */
export function formatCoord(n: number): string {
  return n.toFixed(6)
}

export function googleMapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${formatCoord(lat)},${formatCoord(lon)}&travelmode=driving`
}

export function appleMapsUrl(lat: number, lon: number): string {
  return `https://maps.apple.com/?daddr=${formatCoord(lat)},${formatCoord(lon)}&dirflg=d`
}

export function navigationUrl(app: MapApp, lat: number, lon: number): string {
  return app === 'apple' ? appleMapsUrl(lat, lon) : googleMapsUrl(lat, lon)
}

type NavLike = { userAgent: string; platform?: string; maxTouchPoints?: number }

/** iPhone/iPod/iPad, including iPadOS 13+ which reports itself as a Mac with a touch screen. */
export function isIos(nav: NavLike = navigator): boolean {
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1
}

export function getMapChoice(): MapApp | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'apple' || v === 'google' ? v : null
  } catch {
    return null
  }
}

export function setMapChoice(app: MapApp | null): void {
  try {
    if (app) localStorage.setItem(KEY, app)
    else localStorage.removeItem(KEY)
  } catch {
    /* private mode: the choice is a convenience */
  }
}

/** The app to use right now: Google off iOS, the remembered choice on iOS (null = ask first). */
export function resolveMapApp(nav: NavLike = navigator): MapApp | null {
  return isIos(nav) ? getMapChoice() : 'google'
}

/** "Storgatan 5, Stockholm" -> "Storgatan 5". */
export function shortPlaceName(address: string): string {
  return address.split(',')[0].trim() || address.trim()
}

/** `sms:` link with a prefilled body; iOS wants `&body=`, everyone else `?body=`. */
export function smsHrefWithBody(phone: string, body: string, ios: boolean = isIos()): string {
  const n = phone.replace(/[^\d+]/g, '')
  return `sms:${n}${ios ? '&' : '?'}body=${encodeURIComponent(body)}`
}
