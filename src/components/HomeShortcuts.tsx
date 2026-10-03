import type { PlaceResult } from '../api/places'
import { SAVED_KIND_ICON, type SavedPlace } from '../api/savedPlaces'
import { useI18n } from '../i18n/context'

/** The top of "Vart ska du?": the big Åk hem button, favourite chips and recents. */
export function HomeShortcuts({
  places,
  recents,
  hasHome,
  disabled,
  onGoHome,
  onPlace,
  onRecent
}: {
  places: SavedPlace[]
  recents: PlaceResult[]
  hasHome: boolean
  disabled?: boolean
  onGoHome: () => void
  onPlace: (p: SavedPlace) => void
  onRecent: (p: PlaceResult) => void
}) {
  const { t } = useI18n()
  const chips = places.filter((p) => p.kind !== 'HOME')
  return (
    <div className="home-shortcuts">
      <button type="button" className="go-home-btn" onClick={onGoHome} disabled={disabled}>
        {hasHome ? t('home.goHome') : t('home.saveHome')}
      </button>
      {places.length > 0 && (
        <div className="fav-chips" role="group" aria-label={t('home.favorites')}>
          {chips.map((p) => (
            <button key={p.id} type="button" className="fav-chip" onClick={() => onPlace(p)}>
              <span aria-hidden>{SAVED_KIND_ICON[p.kind] ?? '⭐'}</span> {p.label}
            </button>
          ))}
        </div>
      )}
      {recents.length > 0 && (
        <div className="recent-list" role="group" aria-label={t('home.recents')}>
          {recents.slice(0, 4).map((p, i) => (
            <button key={`${p.lat}-${p.lon}-${i}`} type="button" className="recent-row" onClick={() => onRecent(p)}>
              <span aria-hidden>🕘</span> <span className="recent-name">{p.name}</span>
              {p.area && <span className="muted tiny"> {p.area}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
