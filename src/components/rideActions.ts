import { useState } from 'react'
import { api, ApiError } from '../api/client'
import { useI18n } from '../i18n/context'
import { apiErrorMessage, isApiCode } from '../lib/apiErrors'
import type { RideResponse } from '../lib/rideTypes'
import { shortPlaceName } from '../lib/navigation'
import { formatHm } from '../lib/time'
import { useBusy } from '../lib/useBusy'
import type { RidePatch } from './RideTimeEdit'

type Common = {
  ride: RideResponse
  token: string
  onToast: (m: string) => void
  /** Reload ride data (called after every action, success or failure). */
  onChanged: () => Promise<void> | void
}

/** Passenger ride actions (cancel / keep waiting / edit / quick message) shared by the list card and the ride screen. */
export function usePassengerRideActions({ ride, token, onToast, onChanged }: Common) {
  const { t } = useI18n()
  const { busy, run } = useBusy()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [editing, setEditing] = useState(false)
  const [materialNotice, setMaterialNotice] = useState(false)

  const act = (fn: () => Promise<void>) =>
    run(async () => {
      try {
        await fn()
      } catch (err) {
        if (isApiCode(err, 'CONFIRM_REQUIRED')) setConfirmCancel(true)
        else onToast(apiErrorMessage(err, t))
      } finally {
        try {
          await onChanged()
        } catch {
          /* list refresh failures are surfaced by the page's own polling */
        }
      }
    })

  const cancelRide = (confirm: boolean) =>
    act(async () => {
      const reason = ride.acceptedByDriverId ? t('rides.cancelReasonAfterAccept') : t('rides.cancelReason')
      await api(`/api/rides/${ride.id}/cancel`, {
        method: 'POST',
        token,
        body: JSON.stringify(confirm ? { reason, confirm: true } : { reason })
      })
      setConfirmCancel(false)
      onToast(t('rides.cancelledToast'))
    })

  const keepWaiting = () =>
    act(async () => {
      await api(`/api/rides/${ride.id}/keep-waiting`, { method: 'POST', token })
      onToast(t('rides.keepWaitingToast'))
    })

  const saveEdit = (patch: RidePatch) =>
    act(async () => {
      const updated = await api<RideResponse>(`/api/rides/${ride.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(patch)
      })
      setEditing(false)
      if (updated?.lastEditMaterial) {
        setMaterialNotice(true)
        onToast(t('rides.editMaterial'))
      } else {
        onToast(t('rides.editSavedToast'))
      }
    })

  const sendMessage = (code: string) =>
    act(async () => {
      await api(`/api/rides/${ride.id}/messages`, { method: 'POST', token, body: JSON.stringify({ code }) })
      onToast(t('messages.sentToast'))
    })

  return {
    busy,
    confirmCancel,
    setConfirmCancel,
    editing,
    setEditing,
    materialNotice,
    cancelRide,
    keepWaiting,
    saveEdit,
    sendMessage
  }
}

/** Driver ride actions shared by the request card and driving mode. */
export function useDriverRideActions({ ride, token, onToast, onChanged }: Common) {
  const { t } = useI18n()
  const { busy, run } = useBusy()
  const [proximity, setProximity] = useState<{ time: string | null } | null>(null)
  const [returning, setReturning] = useState(false)
  const [reason, setReason] = useState('')

  const act = (fn: () => Promise<void>) =>
    run(async () => {
      try {
        await fn()
      } catch (err) {
        if (err instanceof ApiError && err.code === 'PROXIMITY_WARNING') {
          const conflicting = err.body?.conflictingRide as { scheduledAt?: string } | undefined
          setProximity({ time: conflicting?.scheduledAt ? formatHm(conflicting.scheduledAt) : null })
        } else {
          onToast(apiErrorMessage(err, t))
        }
      } finally {
        try {
          await onChanged()
        } catch {
          /* the page's polling will retry */
        }
      }
    })

  const post = (path: string, body?: unknown) =>
    api(`/api/driver/rides/${ride.id}/${path}`, {
      method: 'POST',
      token,
      body: body === undefined ? undefined : JSON.stringify(body)
    })

  const accept = (confirmProximity: boolean) =>
    act(async () => {
      await post('accept', confirmProximity ? { confirmProximity: true } : undefined)
      setProximity(null)
      onToast(t('driver.toastAccepted'))
    })

  const simple = (path: string, toastKey?: string) =>
    act(async () => {
      await post(path)
      if (toastKey) {
        onToast(t(toastKey, { name: ride.passengerName?.split(' ')[0] || t('driver.passengerFallback'), destination: shortPlaceName(ride.toAddress) }))
      }
    })

  const decline = () =>
    act(async () => {
      await post('decline', { comment: t('driver.refuseComment') })
      onToast(t('driver.toastRefused'))
    })

  const giveBack = () =>
    act(async () => {
      const text = reason.trim()
      await post('return', text ? { reason: text } : {})
      setReturning(false)
      setReason('')
      onToast(t('driver.toastReturned'))
    })

  const sendMessage = (code: string) =>
    act(async () => {
      await api(`/api/rides/${ride.id}/messages`, { method: 'POST', token, body: JSON.stringify({ code }) })
      onToast(t('messages.sentToast'))
    })

  return {
    busy,
    proximity,
    setProximity,
    returning,
    setReturning,
    reason,
    setReason,
    reasonRequired: ride.status === 'EN_ROUTE',
    accept,
    simple,
    decline,
    giveBack,
    sendMessage
  }
}

/** Progress actions in the order a driver meets them, mapped to endpoint + label + toast. */
export const DRIVER_STEPS: Array<{ action: import('../lib/rideTypes').RideAction; path: string; labelKey: string; toastKey?: string }> = [
  { action: 'ACCEPT', path: 'accept', labelKey: 'driver.takeRide', toastKey: 'driver.toastAccepted' },
  { action: 'START', path: 'start', labelKey: 'driver.driveNow', toastKey: 'driver.toastStartDriving' },
  { action: 'ARRIVE', path: 'arrive', labelKey: 'driver.arrived', toastKey: 'driver.toastArrived' },
  { action: 'PICKUP', path: 'pickup', labelKey: 'driver.pickedUp', toastKey: 'driver.toastPickedUp' },
  { action: 'COMPLETE', path: 'complete', labelKey: 'driver.complete', toastKey: 'driver.toastComplete' }
]
