import { useState } from 'react'
import { useI18n } from '../i18n/context'
import { getMapChoice, isIos, navigationUrl, setMapChoice, type MapApp } from '../lib/navigation'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'

/**
 * Big "Navigera till …" button. Opens Google Maps (or, on iOS, the remembered Apple/Google choice) in a new tab/app
 * by coordinates. On iOS the first tap asks "Vilken karta vill du använda?" once; Mer → Kartapp changes it later.
 */
export function NavigateButton({ lat, lon, label }: { lat: number; lon: number; label: string }) {
  const { t } = useI18n()
  const [asking, setAsking] = useState(false)
  const [choice, setChoice] = useState<MapApp | null>(() => (isIos() ? getMapChoice() : 'google'))

  const pick = (app: MapApp) => {
    setMapChoice(app)
    setChoice(app)
    setAsking(false)
  }

  return (
    <>
      {choice ? (
        <Button
          variant="primary"
          size="lg"
          block
          className="navigate-btn"
          href={navigationUrl(choice, lat, lon)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {label}
        </Button>
      ) : (
        <Button variant="primary" size="lg" block className="navigate-btn" onClick={() => setAsking(true)}>
          {label}
        </Button>
      )}
      <BottomSheet open={asking} title={t('navigate.chooseTitle')} onClose={() => setAsking(false)}>
        <div className="stack">
          {(['apple', 'google'] as const).map((app) => (
            <Button
              key={app}
              variant="primary"
              size="huge"
              block
              href={navigationUrl(app, lat, lon)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => pick(app)}
            >
              {t(`navigate.app.${app}`)}
            </Button>
          ))}
        </div>
      </BottomSheet>
    </>
  )
}
