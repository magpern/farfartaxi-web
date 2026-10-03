import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { useI18n } from '../i18n/context'
import { apiErrorMessage } from '../lib/apiErrors'
import { Button } from './ui'

type Props = {
  rideId: number
  token: string
  onToast: (m: string) => void
  /** Server truth: a share link is active (drives "Sluta dela"). */
  shareActive?: boolean | null
}

/**
 * "Dela resan" (native share sheet, clipboard fallback) and "Sluta dela" (revoke).
 * Links are only created on an explicit tap (never on mount). iOS drops the user activation across an await, so the
 * first tap creates/fetches the link and a second explicit "Dela länken" button then shares it synchronously.
 */
export function ShareRideButton({ rideId, token, onToast, shareActive }: Props) {
  const { t } = useI18n()
  const [override, setOverride] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [needsTap, setNeedsTap] = useState(false)

  useEffect(() => setOverride(null), [shareActive])

  /** Must be called synchronously from a click handler. */
  function present(u: string) {
    if (typeof navigator.share === 'function') {
      navigator
        .share({ title: t('common.brand'), text: t('live.shareText'), url: u })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return // user closed the sheet
          return copy(u)
        })
    } else void copy(u)
  }
  async function copy(u: string) {
    try {
      await navigator.clipboard.writeText(u)
      onToast(t('rides.shareCopiedToast'))
    } catch (err) {
      onToast(apiErrorMessage(err, t))
    }
  }

  async function share() {
    setBusy(true)
    try {
      // POST creates the link, or returns the existing active one. Only ever on an explicit tap.
      const u = (await api<{ url: string }>(`/api/rides/${rideId}/share`, { method: 'POST', token })).url
      setUrl(u)
      setOverride(true)
      setNeedsTap(true)
    } catch (err) {
      onToast(apiErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    setBusy(true)
    try {
      await api(`/api/rides/${rideId}/share`, { method: 'DELETE', token })
      setUrl(null)
      setNeedsTap(false)
      setOverride(false)
      onToast(t('live.shareStopped'))
    } catch (err) {
      onToast(apiErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  const active = override ?? !!shareActive
  return (
    <>
      {needsTap && url ? (
        <Button
          size="lg"
          block
          variant="primary"
          onClick={() => {
            present(url)
            setNeedsTap(false)
          }}
        >
          {t('live.shareLink')}
        </Button>
      ) : (
        <Button size="lg" block disabled={busy} onClick={() => void share()}>
          {t('live.share')}
        </Button>
      )}
      {active && (
        <Button size="lg" block variant="ghost" disabled={busy} onClick={() => void revoke()}>
          {t('live.stopSharing')}
        </Button>
      )}
    </>
  )
}
