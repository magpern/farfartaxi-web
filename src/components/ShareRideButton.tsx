import { useState } from 'react'
import { api } from '../api/client'
import { useI18n } from '../i18n/context'
import { apiErrorMessage } from '../lib/apiErrors'
import { Button } from './ui'

const flagKey = (rideId: number) => `farfartaxi-shared-${rideId}`
const readFlag = (rideId: number) => {
  try {
    return localStorage.getItem(flagKey(rideId)) === '1'
  } catch {
    return false
  }
}
const writeFlag = (rideId: number, on: boolean) => {
  try {
    if (on) localStorage.setItem(flagKey(rideId), '1')
    else localStorage.removeItem(flagKey(rideId))
  } catch {
    /* ignore */
  }
}

/** "Dela resan" (native share sheet, clipboard fallback) and "Sluta dela" (revoke). */
export function ShareRideButton({ rideId, token, onToast }: { rideId: number; token: string; onToast: (m: string) => void }) {
  const { t } = useI18n()
  const [shared, setShared] = useState(() => readFlag(rideId))
  const [busy, setBusy] = useState(false)

  async function share() {
    setBusy(true)
    try {
      const res = await api<{ url: string }>(`/api/rides/${rideId}/share`, { method: 'POST', token })
      writeFlag(rideId, true)
      setShared(true)
      let done = false
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: t('common.brand'), text: t('live.shareText'), url: res.url })
          done = true
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return // user closed the sheet
        }
      }
      if (!done) {
        await navigator.clipboard.writeText(res.url)
        onToast(t('rides.shareCopiedToast'))
      }
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
      writeFlag(rideId, false)
      setShared(false)
      onToast(t('live.shareStopped'))
    } catch (err) {
      onToast(apiErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="lg" block disabled={busy} onClick={() => void share()}>
        {t('live.share')}
      </Button>
      {shared && (
        <Button size="lg" block variant="ghost" disabled={busy} onClick={() => void revoke()}>
          {t('live.stopSharing')}
        </Button>
      )}
    </>
  )
}
