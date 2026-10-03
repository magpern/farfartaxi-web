import { useState } from 'react'
import { useI18n } from '../i18n/context'
import { getMapChoice, isIos, navigationUrl, setMapChoice, type MapApp } from '../lib/navigation'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'

function PinIcon() {
  return (
    <svg className="navigate-pin" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
    </svg>
  )
}

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
          variant="secondary"
          size="lg"
          block
          className="navigate-btn"
          href={navigationUrl(choice, lat, lon)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <PinIcon />
          {label}
        </Button>
      ) : (
        <Button variant="secondary" size="lg" block className="navigate-btn" onClick={() => setAsking(true)}>
          <PinIcon />
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
