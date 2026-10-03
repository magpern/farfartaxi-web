import { useMemo, useState } from 'react'
import { Clock24hTimePicker } from '../Clock24hTimePicker'
import { useI18n } from '../i18n/context'
import { formatYmd, stockholmLocalToInstant, stockholmParts } from '../lib/time'
import { ConfirmDialog } from './ConfirmDialog'

type Props = {
  open: boolean
  initialIso: string
  busy?: boolean
  onSave: (iso: string) => void
  onCancel: () => void
}

/** Date + 24h time editor in Europe/Stockholm; rejects non-existent and flags ambiguous local times. */
export function RideTimeEdit({ open, initialIso, busy, onSave, onCancel }: Props) {
  const { t } = useI18n()
  const init = useMemo(() => stockholmParts(new Date(initialIso)), [initialIso])
  const [date, setDate] = useState(formatYmd(init))
  const [hour, setHour] = useState(init.hour)
  const [minute, setMinute] = useState(init.minute)
  const [pickerOpen, setPickerOpen] = useState(false)

  const timeText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const resolved = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    if (!m) return null
    return stockholmLocalToInstant(Number(m[1]), Number(m[2]), Number(m[3]), hour, minute)
  }, [date, hour, minute])
  const inPast = resolved?.ok === true && new Date(resolved.iso).getTime() <= Date.now()

  return (
    <>
      <ConfirmDialog
        open={open}
        title={t('rides.editTitle')}
        confirmLabel={t('rides.editSave')}
        cancelLabel={t('common.cancel')}
        busy={busy}
        confirmDisabled={!resolved || !resolved.ok || inPast}
        onCancel={onCancel}
        onConfirm={() => resolved?.ok && onSave(resolved.iso)}
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
