import { useState } from 'react'
import { useI18n } from '../i18n/context'

export function PendingApproval({
  onRecheck,
  onLogout
}: {
  onRecheck: () => Promise<boolean>
  onLogout: () => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [stillPending, setStillPending] = useState(false)

  async function recheck() {
    setBusy(true)
    setStillPending(false)
    try {
      const approved = await onRecheck()
      if (!approved) setStillPending(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page page-center">
      <section className="card hero-card pending-approval" role="status" aria-live="polite">
        <h1>{t('pending.title')}</h1>
        <p className="pending-approval-lead">{t('pending.body')}</p>
        {stillPending && <p className="tiny">{t('pending.stillPending')}</p>}
        <div className="pending-approval-actions">
          <button type="button" className="btn btn-primary" onClick={recheck} disabled={busy}>
            {t('pending.recheck')}
          </button>
          <button type="button" className="btn" onClick={onLogout}>
            {t('pending.logout')}
          </button>
        </div>
      </section>
    </main>
  )
}
