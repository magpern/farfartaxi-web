export type NominatimResult = {
  display_name: string
  lat: string
  lon: string
  /** POI / place name from Nominatim (shops, stations, etc.). */
  name?: string
  class?: string
  type?: string
  address?: Record<string, string | undefined>
}

/** Local area (kommun-level): "Järfälla kommun" → "Järfälla", not län/county (e.g. Stockholm). */
export function stripKommunSuffix(raw: string): string {
  return raw.replace(/\s+kommun$/i, '').trim()
}

/** Län/county fallback when no municipality field exists (rural). */
export function formatCountyFallback(raw: string): string {
  return raw
    .replace(/\s+County$/i, '')
    .replace(/\s+län$/i, '')
    .trim()
}

/**
 * Street + locality ("…väg 10, Järfälla") or POI + locality ("ICA Maxi Barkarby, Järfälla").
 * Uses Nominatim `name` when there is no road (POI / landmark search). Sweden-only on search API.
 */
export function formatNominatimAddress(payload: NominatimResult | { display_name?: string; address?: Record<string, string | undefined> }): string {
  const full = payload as NominatimResult
  const a = payload.address
  const poiName = (full.name?.trim() || a?.name?.trim() || '').trim()

  const road =
    a?.road ||
    a?.pedestrian ||
    a?.footway ||
    a?.path ||
    a?.cycleway ||
    a?.residential
  const housenumber = a?.house_number || a?.house_name
  const streetLine =
    road && housenumber
      ? `${road} ${housenumber}`.trim()
      : road
        ? road.trim()
        : housenumber
          ? housenumber.trim()
          : ''

  const localityRaw =
    a?.municipality ||
    a?.city ||
    a?.town ||
    a?.village ||
    a?.suburb ||
    a?.neighbourhood ||
    a?.hamlet
  let area = localityRaw ? stripKommunSuffix(localityRaw) : ''
  if (!area && a) {
    const countyRaw = a.county || a.state || a.region
    if (countyRaw) area = formatCountyFallback(countyRaw)
  }

  let lead = streetLine
  if (poiName) {
    if (!streetLine) lead = poiName
    else {
      const pl = poiName.toLowerCase()
      const sl = streetLine.toLowerCase()
      lead = sl.includes(pl) || pl.includes(sl) ? streetLine : `${poiName}, ${streetLine}`
    }
  }

  const parts = [lead, area].filter(Boolean)
  const joined = parts.join(', ')
  if (joined) return joined
  if (poiName && !area) return poiName
  return payload.display_name ?? ''
}

/** Nominatim often returns several OSM hits for the same street (segments); same formatted label → one row. */
export function dedupeNominatimResults(items: NominatimResult[]): NominatimResult[] {
  const seen = new Set<string>()
  const out: NominatimResult[] = []
  for (const item of items) {
    const label = (formatNominatimAddress(item) || item.display_name)
      .normalize('NFC')
      .trim()
      .replace(/\s+/g, ' ')
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

