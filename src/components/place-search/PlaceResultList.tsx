import type { PlaceResult } from '../../api/places'
import { useI18n } from '../../i18n/context'
import { KIND_ICON, formatDistance, optionId } from './format'
import type { PlaceSearchStatus } from '../../hooks/usePlaceSearch'

type Props = {
  id: string
  results: PlaceResult[]
  status: PlaceSearchStatus
  hasMore: boolean
  expanded: boolean
  activeIndex: number
  onPick: (p: PlaceResult) => void
  onShowMore: () => void
  /** Optional "⭐ Spara" action per result. */
  onSave?: (p: PlaceResult) => void
}

export function PlaceResultList({ id, results, status, hasMore, expanded, activeIndex, onPick, onShowMore, onSave }: Props) {
  const { t } = useI18n()
  return (
    <div className="place-results">
      {results.length > 0 && (
        <ul id={id} role="listbox" aria-label={t('placeSearch.results')} className="place-list">
          {results.map((p, i) => (
            <li
              key={`${p.provider}-${p.providerPlaceId ?? ''}-${p.lat}-${p.lon}-${i}`}
              id={optionId(id, i)}
              role="option"
              aria-selected={i === activeIndex}
              className={`place-row${i === activeIndex ? ' place-row-active' : ''}`}
              // keep focus in the input; the click itself still fires
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(p)}
            >
              <span className="place-icon" aria-hidden>
                {KIND_ICON[p.kind]}
              </span>
              <span className="place-text">
                <strong className="place-name">{p.name}</strong>
                {p.area && <span className="place-area">{p.area}</span>}
              </span>
              {p.distanceKm != null && <span className="place-dist">{formatDistance(p.distanceKm)}</span>}
              {onSave && p.kind !== 'FAVORITE' && (
                <button
                  type="button"
                  className="place-save"
                  aria-label={t('places.saveAria', { name: p.name })}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSave(p)
                  }}
                >
                  ⭐ {t('places.save')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div role="status" aria-live="polite">
        {status === 'loading' && <p className="place-note">{t('placeSearch.searching')}</p>}
        {status === 'ready' && results.length === 0 && (
          <p className="place-note place-empty">
            <strong>{t('placeSearch.empty')}</strong> {t('placeSearch.emptyHint')}
          </p>
        )}
        {status === 'error' && <p className="place-note form-error">{t('placeSearch.error')}</p>}
      </div>
      {hasMore && !expanded && results.length > 0 && (
        <button type="button" className="btn btn-touch place-more" onMouseDown={(e) => e.preventDefault()} onClick={onShowMore}>
          {t('placeSearch.showMore')}
        </button>
      )}
    </div>
  )
}
