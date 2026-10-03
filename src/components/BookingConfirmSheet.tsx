import { useEffect, type ReactNode } from 'react'
import { useI18n } from '../i18n/context'
import type { BookingUserOption } from '../lib/useBookingUsers'
import { formatWeekdayDateTime } from '../lib/time'
import { getBookingSource, track } from '../lib/telemetry'
import type { BookingEditField } from './bookingFocus'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'

type Props = {
  open: boolean
  busy: boolean
  onClose: () => void
  onConfirm: () => void
  /** `forName` set means "booking on behalf of" someone. */
  who: { name: string; forName?: string | null }
  /** Drivers pick the passenger here instead of a separate dialog. */
  whoPicker?: ReactNode
  /** `now`: "Åka nu" (iso is the moment of booking); otherwise a scheduled instant. */
  when: { now: boolean; iso: string }
  from: string
  to: string
  note: string
  onEdit: (field: BookingEditField) => void
}

function Row({
  label,
  children,
  editLabel,
  editText,
  onEdit
}: {
  label: string
  children: ReactNode
  editLabel?: string
  editText?: string
  onEdit?: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="confirm-row">
      <div className="confirm-row-main">
        <span className="confirm-row-label">{label}</span>
        <div className="confirm-row-value">{children}</div>
      </div>
      {onEdit && (
        <button type="button" className="confirm-row-edit" onClick={onEdit} aria-label={editLabel}>
          {editText ?? t('bookingConfirm.edit')}
        </button>
      )}
    </div>
  )
}

export function BookingConfirmSheet({ open, busy, onClose, onConfirm, who, whoPicker, when, from, to, note, onEdit }: Props) {
  const { t, locale } = useI18n()
  const dateLocale = locale === 'en' ? 'en-GB' : 'sv-SE'
  const whenText = formatWeekdayDateTime(when.iso, dateLocale)
  const nowKind = when.now
  useEffect(() => {
    if (open) track('booking_started', { kind: nowKind ? 'NOW' : 'SCHEDULED', source: getBookingSource() })
  }, [open, nowKind])
  const edit = (labelKey: string) => t('bookingConfirm.editAria', { what: t(labelKey) })
  return (
    <BottomSheet
      open={open}
      title={t('bookingConfirm.title')}
      onClose={onClose}
      footer={
        <Button variant="primary" size="lg" block disabled={busy} aria-busy={busy} onClick={onConfirm}>
          {busy ? t('booking.submitting') : when.now ? t('bookingConfirm.confirmNow') : t('bookingConfirm.confirmLater')}
        </Button>
      }
    >
      <div className="confirm-rows">
        <Row
          label={t('bookingConfirm.who')}
          editLabel={whoPicker ? edit('bookingConfirm.who') : undefined}
          onEdit={whoPicker ? () => onEdit('who') : undefined}
        >
          {who.forName ? (
            <>
              <strong>{t('bookingConfirm.forName', { name: who.forName })}</strong>
              <div className="tiny muted">{t('bookingConfirm.bookedBy', { name: who.name })}</div>
            </>
          ) : (
            <strong>{who.name}</strong>
          )}
          {whoPicker}
        </Row>
        <Row
          label={t('bookingConfirm.when')}
          editLabel={when.now ? t('bookingConfirm.chooseTimeAria') : edit('bookingConfirm.when')}
          editText={when.now ? t('bookingConfirm.chooseTime') : undefined}
          onEdit={() => onEdit('when')}
        >
          <strong>{when.now ? t('bookingConfirm.now') : whenText}</strong>
          {when.now && <div className="tiny muted">{whenText}</div>}
        </Row>
        <Row label={t('bookingConfirm.pickup')} editLabel={edit('bookingConfirm.pickup')} onEdit={() => onEdit('from')}>
          <strong>{from}</strong>
        </Row>
        <Row label={t('bookingConfirm.destination')} editLabel={edit('bookingConfirm.destination')} onEdit={() => onEdit('to')}>
          <strong>{to}</strong>
        </Row>
        <Row label={t('bookingConfirm.note')} editLabel={edit('bookingConfirm.note')} onEdit={() => onEdit('note')}>
          {note.trim() ? <strong>{note}</strong> : <span className="muted">{t('bookingConfirm.noNote')}</span>}
        </Row>
      </div>
    </BottomSheet>
  )
}

/** Driver-only: choose who the ride is for ("Mig själv" = the driver). */
export function PassengerPicker({
  users,
  value,
  onChange
}: {
  users: BookingUserOption[] | null
  value: number | undefined
  onChange: (id: number | undefined) => void
}) {
  const { t } = useI18n()
  if (users === null) return <p className="tiny muted">{t('booking.behalfLoading')}</p>
  return (
    <select
      className="sheet-input confirm-picker"
      aria-label={t('booking.onBehalfOf')}
      value={value != null ? String(value) : ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    >
      <option value="">{t('booking.behalfSelf')}</option>
      {users.map((u) => (
        <option key={u.id} value={String(u.id)}>
          {u.fullName}
        </option>
      ))}
    </select>
  )
}
