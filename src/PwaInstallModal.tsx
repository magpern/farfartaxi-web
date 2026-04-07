import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n/context'

export const FARFARTAXI_PWA_INSTALL_SESSION_KEY = 'farfartaxi-install-prompt'

export function schedulePwaInstallPrompt() {
  try {
    sessionStorage.setItem(FARFARTAXI_PWA_INSTALL_SESSION_KEY, '1')
  } catch {
    /* private mode */
  }
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return Boolean(nav.standalone)
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
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
              {isIosDevice() && <li>{t('pwa.manualIos')}</li>}
              {isAndroid() && <li>{t('pwa.manualAndroid')}</li>}
              {!isIosDevice() && !isAndroid() && (
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
