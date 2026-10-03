import { useState } from 'react'
import { useI18n } from '../i18n/context'
import { isIos, getMapChoice, setMapChoice, type MapApp } from '../lib/navigation'
import { enablePush } from '../lib/pushSetup'
import { apiErrorMessage } from '../lib/apiErrors'
import { Button, ButtonLink, Card } from '../components/ui'
import { useShell } from '../shell/ShellContext'
import { isDriverRole } from '../shell/types'

export function MorePage() {
  const { t, locale, setLocale } = useI18n()
  const { user, token, onToast, largeText, setLargeText, showInstall, openInstall, logout } = useShell()

  const [mapApp, setMapApp] = useState<MapApp | null>(() => getMapChoice())
  const chooseMap = (a: MapApp | null) => {
    setMapChoice(a)
    setMapApp(a)
  }

  async function push() {
    try {
      onToast(await enablePush(token, t))
    } catch (err) {
      onToast(apiErrorMessage(err, t))
    }
  }

  return (
    <div className="subpage-wrap stack">
      <h1 className="page-title">{t('tabs.more')}</h1>
      <Card>
        <strong>{user.fullName}</strong>
        <div className="muted tiny">{user.email}</div>
      </Card>

      <Card>
        <h2 className="section-title">{t('menu.language')}</h2>
        <div className="segmented" role="group" aria-label={t('menu.language')}>
          <Button variant={locale === 'sv' ? 'primary' : 'secondary'} aria-pressed={locale === 'sv'} onClick={() => setLocale('sv')}>
            {t('languages.sv')}
          </Button>
          <Button variant={locale === 'en' ? 'primary' : 'secondary'} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>
            {t('languages.en')}
          </Button>
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={largeText} onChange={(e) => setLargeText(e.target.checked)} />
          <span>
            {t('more.largeText')}
            <span className="tiny muted block">{t('more.largeTextHint')}</span>
          </span>
        </label>
      </Card>

      {isDriverRole(user.role) && isIos() && (
        <Card>
          <h2 className="section-title">{t('navigate.settingTitle')}</h2>
          <p className="muted tiny">{t('navigate.settingHint')}</p>
          <div className="segmented" role="group" aria-label={t('navigate.settingTitle')}>
            {(['apple', 'google'] as const).map((a) => (
              <Button key={a} variant={mapApp === a ? 'primary' : 'secondary'} aria-pressed={mapApp === a} onClick={() => chooseMap(a)}>
                {t(`navigate.app.${a}`)}
              </Button>
            ))}
            <Button variant={mapApp === null ? 'primary' : 'secondary'} aria-pressed={mapApp === null} onClick={() => chooseMap(null)}>
              {t('navigate.ask')}
            </Button>
          </div>
        </Card>
      )}

      <div className="stack">
        {showInstall && (
          <Button size="lg" block onClick={openInstall}>
            {t('menu.installApp')}
          </Button>
        )}
        {isDriverRole(user.role) && (
          <Button size="lg" block onClick={() => void push()}>
            {t('driver.enablePush')}
          </Button>
        )}
        {isDriverRole(user.role) && (
          <ButtonLink size="lg" block to="/app/platser">
            {t('places.forPlaces')}
          </ButtonLink>
        )}
        <ButtonLink size="lg" block to="/app/hjalp">
          {t('menu.help')}
        </ButtonLink>
        {user.role === 'ADMIN' && (
          <ButtonLink size="lg" block to="/app/admin">
            {t('menu.admin')}
          </ButtonLink>
        )}
        <Button size="lg" block variant="danger" onClick={() => void logout()}>
          {t('menu.logout')}
        </Button>
      </div>
    </div>
  )
}
