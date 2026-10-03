import { useEffect, useRef, useState } from 'react'
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
  /** Create the link up front so the tap can open the share sheet within the user gesture (iOS). */
  prefetch?: boolean
}

/**
 * "Dela resan" (native share sheet, clipboard fallback) and "Sluta dela" (revoke).
 * iOS drops the user activation across an await, so the URL is fetched ahead of the tap; when it is not ready yet the
 * link is created and a second explicit "Dela länken" button is shown instead of sharing automatically.
 */
export function ShareRideButton({ rideId, token, onToast, shareActive, prefetch }: Props) {
  const { t } = useI18n()
  const [override, setOverride] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [needsTap, setNeedsTap] = useState(false)
  const started = useRef(false)

  useEffect(() => setOverride(null), [shareActive])

  const createLink = () => api<{ url: string }>(`/api/rides/${rideId}/share`, { method: 'POST', token }).then((r) => r.url)

  useEffect(() => {
    if (started.current || !(prefetch || shareActive)) return
    started.current = true
    createLink()
      .then((u) => setUrl(u))
      .catch(() => {
        started.current = false // tap will create it and offer the second button
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, [prefetch, shareActive])

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
    if (url) {
      present(url)
      return
    }
    setBusy(true)
    try {
      const u = await createLink()
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
      started.current = true // do not silently re-create the link
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
