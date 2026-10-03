import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n/context'
import { isIos, isStandalone, snoozeIosInstallGuide } from './lib/push'

export const FARFARTAXI_PWA_INSTALL_SESSION_KEY = 'farfartaxi-install-prompt'

// eslint-disable-next-line react-refresh/only-export-components -- exports non-component helpers alongside components (pre-existing); splitting is deferred to gradual refactor
export function schedulePwaInstallPrompt() {
  try {
    sessionStorage.setItem(FARFARTAXI_PWA_INSTALL_SESSION_KEY, '1')
  } catch {
    /* private mode */
  }
}

// eslint-disable-next-line react-refresh/only-export-components -- exports non-component helpers alongside components (pre-existing); splitting is deferred to gradual refactor
export function isStandalonePwa(): boolean {
  return isStandalone()
}

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

function ShareIcon({ label }: { label: string }) {
  return (
    <svg className="share-icon" role="img" aria-label={label} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  )
}

type Props = {
  open: boolean
  onClose: () => void
}

export function PwaInstallModal({ open, onClose }: Props) {
  const { t } = useI18n()
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [canPrompt, setCanPrompt] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
      setCanPrompt(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  const dismiss = useCallback(() => {
    if (isIos()) snoozeIosInstallGuide()
    try {
      sessionStorage.removeItem(FARFARTAXI_PWA_INSTALL_SESSION_KEY)
    } catch {
      /* ignore */
    }
    onClose()
  }, [onClose])

  const runInstall = async () => {
    const ev = deferredRef.current
    if (!ev) return
    setBusy(true)
    try {
      await ev.prompt()
      await ev.userChoice
    } catch {
      /* ignore */
    } finally {
      deferredRef.current = null
      setCanPrompt(false)
      setBusy(false)
      dismiss()
    }
  }

  if (!open) return null

  if (isIos() && !isStandalone()) {
    return (
      <div
        className="install-modal-layer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) dismiss()
        }}
      >
        <div className="card install-modal-card" onClick={(e) => e.stopPropagation()}>
          <h3 id="pwa-install-title">{t('pwa.iosTitle')}</h3>
          <p className="install-modal-lead">{t('pwa.iosLead')}</p>
          <ol className="install-modal-steps install-ios-steps">
            <li>
              <ShareIcon label={t('pwa.shareIcon')} /> {t('pwa.iosStep1')}
            </li>
            <li>{t('pwa.iosStep2')}</li>
            <li>{t('pwa.iosStep3')}</li>
          </ol>
          <div className="install-modal-actions">
            <button type="button" className="btn btn-primary" onClick={dismiss}>
              {t('common.ok')}
            </button>
            <button type="button" className="btn" onClick={dismiss}>
              {t('pwa.notNow')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="install-modal-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      <div className="card install-modal-card" onClick={(e) => e.stopPropagation()}>
        <h3 id="pwa-install-title">{t('pwa.installTitle')}</h3>
        <p className="install-modal-lead">{t('pwa.installLead')}</p>

        {canPrompt ? (
          <>
            <p className="tiny muted">{t('pwa.installBodyChrome')}</p>
            <div className="install-modal-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void runInstall()}>
                {t('pwa.installNow')}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={dismiss}>
                {t('pwa.notNow')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="tiny muted">{t('pwa.manualIntro')}</p>
            <ul className="install-modal-steps">
              {isIos() && <li>{t('pwa.manualIos')}</li>}
              {isAndroid() && <li>{t('pwa.manualAndroid')}</li>}
              {!isIos() && !isAndroid() && (
                <>
                  <li>{t('pwa.manualDesktop')}</li>
                  <li>{t('pwa.manualIos')}</li>
                  <li>{t('pwa.manualAndroid')}</li>
                </>
              )}
            </ul>
            <div className="install-modal-actions">
              <button type="button" className="btn btn-primary" onClick={dismiss}>
                {t('common.ok')}
              </button>
              <button type="button" className="btn" onClick={dismiss}>
                {t('pwa.notNow')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
