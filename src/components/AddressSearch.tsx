import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/context'
import { API_URL } from '../lib/session'
import { dedupeNominatimResults, formatNominatimAddress, type NominatimResult } from '../lib/nominatim'

export type PickedAddress = { address: string; lat: number; lon: number }

/** Small address search against the backend geocoder: 350 ms debounce, in-flight requests aborted. */
export function AddressSearch({ onPick }: { onPick: (a: PickedAddress) => void }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])

  useEffect(() => {
    const q = query.normalize('NFC').trim()
    if (q.length < 3) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/public/geocode/search?q=${encodeURIComponent(q)}&limit=10&countrycodes=se`,
          { headers: { Accept: 'application/json' }, signal: ctrl.signal }
        )
        if (!res.ok) return setResults([])
        const data = (await res.json()) as NominatimResult[]
        setResults(Array.isArray(data) ? dedupeNominatimResults(data).slice(0, 5) : [])
      } catch {
        if (!ctrl.signal.aborted) setResults([])
      }
    }, 350)
    return () => {
      clearTimeout(id)
      ctrl.abort()
    }
  }, [query])

  return (
    <div className="address-search">
      <input
        type="search"
        className="sheet-input"
        value={query}
        aria-label={t('rides.editSearchLabel')}
        placeholder={t('rides.editSearchPlaceholder')}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="address-results">
          {results.map((r, i) => {
            const label = formatNominatimAddress(r) || r.display_name
            return (
              <li key={`${r.lat},${r.lon},${i}`}>
                <button
                  type="button"
                  className="btn btn-touch"
                  onClick={() => {
                    onPick({ address: label, lat: Number(r.lat), lon: Number(r.lon) })
                    setQuery('')
                    setResults([])
                  }}
                >
                  {label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
