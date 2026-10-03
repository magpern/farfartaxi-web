import { useMemo, useState } from 'react'
import { Clock24hTimePicker } from '../Clock24hTimePicker'
import { useI18n } from '../i18n/context'
import { formatYmd, stockholmLocalToInstant, stockholmParts } from '../lib/time'
import { PICKUP_NOTE_MAX, type RideResponse } from '../lib/rideTypes'
import { AddressSearch, type PickedAddress } from './AddressSearch'
import { ConfirmDialog } from './ConfirmDialog'
import { PickupNoteField } from './PickupNoteField'

export type RidePatch = {
  scheduledAt?: string
  toAddress?: string
  toLat?: number
  toLon?: number
  pickupNote?: string
}

type Props = {
  open: boolean
  ride: Pick<RideResponse, 'scheduledAt' | 'toAddress' | 'pickupNote'>
  busy?: boolean
  onSave: (patch: RidePatch) => void
  onCancel: () => void
}

/** Edits time (Europe/Stockholm, rejects non-existent / flags ambiguous times), destination and pickup note. Sends only what changed. */
export function RideTimeEdit({ open, ride, busy, onSave, onCancel }: Props) {
  const initialIso = ride.scheduledAt
  const { t } = useI18n()
  const init = useMemo(() => stockholmParts(new Date(initialIso)), [initialIso])
  const [date, setDate] = useState(formatYmd(init))
  const [hour, setHour] = useState(init.hour)
  const [minute, setMinute] = useState(init.minute)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dest, setDest] = useState<PickedAddress | null>(null)
  const [note, setNote] = useState(ride.pickupNote ?? '')

  const timeText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const resolved = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    if (!m) return null
    return stockholmLocalToInstant(Number(m[1]), Number(m[2]), Number(m[3]), hour, minute)
  }, [date, hour, minute])
  const timeChanged = resolved?.ok === true && Date.parse(resolved.iso) !== Date.parse(initialIso)
  const noteChanged = note.trim() !== (ride.pickupNote ?? '').trim()
  const changed = timeChanged || dest !== null || noteChanged
  const inPast = timeChanged && resolved?.ok === true && new Date(resolved.iso).getTime() <= Date.now()

  return (
    <>
      <ConfirmDialog
        open={open}
        title={t('rides.editTitle')}
        confirmLabel={t('rides.editSave')}
        cancelLabel={t('common.cancel')}
        busy={busy}
        confirmDisabled={!resolved || !resolved.ok || inPast || !changed}
        onCancel={onCancel}
        onConfirm={() => {
          if (!resolved?.ok) return
          const patch: RidePatch = {}
          if (timeChanged) patch.scheduledAt = resolved.iso
          if (dest) Object.assign(patch, { toAddress: dest.address, toLat: dest.lat, toLon: dest.lon })
          if (noteChanged) patch.pickupNote = note.trim().slice(0, PICKUP_NOTE_MAX)
          onSave(patch)
        }}
      >
        <label className="tiny" htmlFor="ride-edit-date">
          {t('rides.editDate')}
        </label>
        <input
          id="ride-edit-date"
          type="date"
          className="sheet-input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <div className="time-row">
          <span>{t('prebook.time')}</span>
          <button
            type="button"
            className="time-24h-pill time-24h-pill-trigger"
            aria-label={t('prebook.timePickerOpen')}
            aria-haspopup="dialog"
            onClick={() => setPickerOpen(true)}
          >
            {timeText}
          </button>
        </div>
        {resolved && !resolved.ok && <p className="form-error">{t('booking.nonexistentTime', { time: timeText })}</p>}
        {resolved?.ok && resolved.ambiguous && <p className="tiny">{t('booking.ambiguousTime', { time: timeText })}</p>}
        {inPast && <p className="form-error">{t('rides.futureTime')}</p>}
        <p className="tiny">{t('rides.editDestination')}</p>
        <p>
          <strong>{dest ? dest.address : ride.toAddress}</strong>
        </p>
        <AddressSearch onPick={setDest} />
        {dest && (
          <button type="button" className="btn btn-touch" onClick={() => setDest(null)}>
            {t('rides.editClearDestination')}
          </button>
        )}
        <PickupNoteField value={note} onChange={setNote} />
        {!changed && <p className="tiny muted">{t('rides.editNothingChanged')}</p>}
      </ConfirmDialog>
      <Clock24hTimePicker
        open={open && pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={(h, m) => {
          setHour(h)
          setMinute(m)
        }}
        initialHour={hour}
        initialMinute={minute}
        title={t('prebook.timePickerTitle')}
        cancelLabel={t('prebook.timePickerCancel')}
        okLabel={t('common.ok')}
        keyboardAria={t('prebook.timePickerKeyboard')}
        keyboardHourLabel={t('prebook.timePickerHourField')}
        keyboardMinuteLabel={t('prebook.timePickerMinuteField')}
      />
    </>
  )
}
