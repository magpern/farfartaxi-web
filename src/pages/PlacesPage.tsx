import { useI18n } from '../i18n/context'
import { Card } from '../components/ui'

/** M4 fills this in (favorites, recents, rename/reorder). Until then: a friendly empty state. */
export function PlacesPage() {
  const { t } = useI18n()
  return (
    <div className="subpage-wrap stack">
      <h1 className="page-title">{t('tabs.places')}</h1>
      <Card className="empty-state">
        <p className="empty-emoji" aria-hidden>
          📍
        </p>
        <h2>{t('places.comingTitle')}</h2>
        <p className="muted">{t('places.comingBody')}</p>
      </Card>
    </div>
  )
}
