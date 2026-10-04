import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock24hTimePicker } from '../Clock24hTimePicker'
import { useI18n } from '../i18n/context'
import { PickupNoteField } from '../components/PickupNoteField'
import { api } from '../api/client'
import { buildRideBookPayload, UnresolvedPickupError } from '../lib/bookingDraft'
import type { RideResponse } from '../lib/rideTypes'
import { createIdempotencyHolder } from '../lib/idempotency'
import { stockholmLocalToInstant, stockholmParts } from '../lib/time'
import { useBusy } from '../lib/useBusy'
import { bookingApiErrorMessage } from '../lib/bookingErrors'
import { useBookingDraft } from '../shell/BookingDraftContext'
import { useShell } from '../shell/ShellContext'
import { useActiveRide } from '../shell/ActiveRide'
import { bookPath, isDriverRole } from '../shell/types'
import { getBookingSource, setBookingSource, track } from '../lib/telemetry'
import { useBookingUsers } from '../lib/useBookingUsers'
import { BookingConfirmSheet, PassengerPicker } from '../components/BookingConfirmSheet'
import { focusBookingField, type BookingEditField } from '../components/bookingFocus'

export function PreBookPage() {
  const { token, user: currentUser, onToast } = useShell()
  const { refresh: refreshActive } = useActiveRide()
  const { t, locale, ta } = useI18n()
  const navigate = useNavigate()
  const { draft, setDraft, clearBookingDraft } = useBookingDraft()
  const isDriver = isDriverRole(currentUser.role)
  const [sheetOpen, setSheetOpen] = useState(false)
  const bookingUsers = useBookingUsers(token, isDriver && (draft.passengerUserId != null || sheetOpen))

  // Default to one hour from now, as Stockholm wall-clock time (the booking time zone).
  const [initialParts] = useState(() => stockholmParts(new Date(Date.now() + 60 * 60 * 1000)))
  const [cursor, setCursor] = useState(
    () => new Date(initialParts.year, initialParts.month - 1, initialParts.day)
  )
  const [pickHour, setPickHour] = useState(initialParts.hour)
  const [pickMinute, setPickMinute] = useState(initialParts.minute)
  const { busy: booking, run: runBooking } = useBusy()
  const [timePickerOpen, setTimePickerOpen] = useState(false)

  const selectedDay = useMemo(() => cursor.getDate(), [cursor])
  const idempotency = useRef(createIdempotencyHolder())

  const dateLocale = locale === 'en' ? 'en-GB' : 'sv-SE'
  const monthLabel = cursor.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })
  const bigLabel = cursor.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })

  const { daysInMonth, startPad, year, month } = useMemo(() => {
    const y = cursor.getFullYear()
    const m = cursor.getMonth()
    const first = new Date(y, m, 1)
    const dim = new Date(y, m + 1, 0).getDate()
    const start = (first.getDay() + 6) % 7
    return { daysInMonth: dim, startPad: start, year: y, month: m }
  }, [cursor])

  function prevMonth() {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
  }

  function nextMonth() {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
  }

  function pickDay(day: number) {
    setCursor(new Date(year, month, day))
  }

  const resolvedTime = useMemo(
    () => stockholmLocalToInstant(year, month + 1, selectedDay, pickHour, pickMinute),
    [year, month, selectedDay, pickHour, pickMinute]
  )
  const pickTimeText = `${String(pickHour).padStart(2, '0')}:${String(pickMinute).padStart(2, '0')}`

  function onFortsatt() {
    if (!draft.fromAddress.trim() || !draft.toAddress.trim()) {
      onToast(t('prebook.missingAddresses'))
      navigate(bookPath(currentUser.role))
      return
    }
    if (!resolvedTime.ok) {
      onToast(t('booking.nonexistentTime', { time: pickTimeText }))
      return
    }
    if (new Date(resolvedTime.iso).getTime() <= Date.now()) {
      onToast(t('prebook.futureTime'))
      return
    }
    setSheetOpen(true)
  }

  async function submit() {
    if (!resolvedTime.ok) return
    const iso = resolvedTime.iso
    await runBooking(async () => {
      let payload: Record<string, unknown>
      try {
        payload = buildRideBookPayload(draft, 'SCHEDULED', iso)
      } catch (err) {
        if (!(err instanceof UnresolvedPickupError)) throw err
        setSheetOpen(false)
        onToast(t('booking.pickupUnresolved'))
        navigate(bookPath(currentUser.role))
        return
      }
      try {
        const ride = await api<RideResponse>('/api/rides', {
          method: 'POST',
          token,
          headers: { 'Idempotency-Key': idempotency.current.keyFor(payload) },
          body: JSON.stringify(payload)
        })
        idempotency.current.reset()
        clearBookingDraft()
        track('booking_created', { kind: 'SCHEDULED', source: getBookingSource() })
        setBookingSource('home')
        setSheetOpen(false)
        void refreshActive()
        navigate('/app/bekraftelse', { state: { ride } })
      } catch (err) {
        onToast(bookingApiErrorMessage(err, t))
      }
    })
  }

  function editFromSheet(field: BookingEditField) {
    setSheetOpen(false)
    if (field === 'when') setTimePickerOpen(true)
    else if (field === 'note') focusBookingField('note')
    else navigate(bookPath(currentUser.role))
  }

  const bookedFor =
    isDriver && draft.passengerUserId != null
      ? (bookingUsers?.find((u) => u.id === draft.passengerUserId)?.fullName ?? null)
      : null

  const sweDays = ta('prebook.weekdayLetters')

  return (
    <div className="prebook-screen">
      <header className="prebook-header">
        <button type="button" className="link-back" onClick={() => navigate(bookPath(currentUser.role))}>
          {t('prebook.back')}
        </button>
        <h1 className="prebook-title">{t('prebook.title')}</h1>
        <p className="prebook-sub">{t('prebook.subtitle')}</p>
      </header>
      <p className="prebook-bigdate">{bigLabel}</p>
      <div className="calendar-nav">
        <span className="calendar-month">{monthLabel}</span>
        <div className="calendar-arrows">
          <button type="button" onClick={prevMonth} aria-label={t('prebook.prevMonthAria')}>
            ‹
          </button>
          <button type="button" onClick={nextMonth} aria-label={t('prebook.nextMonthAria')}>
            ›
          </button>
        </div>
      </div>
      <div className="calendar-grid-head">
        {sweDays.map((d, i) => (
          <span key={`dow-${i}`}>{d}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {Array.from({ length: startPad }).map((_, i) => (
          <span key={`pad-${i}`} className="cal-cell empty" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
          <button
            key={day}
            type="button"
            className={`cal-cell day ${day === selectedDay ? 'selected' : ''}`}
            onClick={() => pickDay(day)}
          >
            {day}
          </button>
        ))}
      </div>
      <div className="time-row">
        <span>{t('prebook.time')}</span>
        <button
          type="button"
          className="time-24h-pill time-24h-pill-trigger"
          aria-label={t('prebook.timePickerOpen')}
          aria-haspopup="dialog"
          aria-expanded={timePickerOpen}
          onClick={() => setTimePickerOpen(true)}
        >
          <span className="time-trigger-h">{String(pickHour).padStart(2, '0')}</span>
          <span className="time-sep" aria-hidden>
            :
          </span>
          <span className="time-trigger-m">{String(pickMinute).padStart(2, '0')}</span>
        </button>
      </div>
      <Clock24hTimePicker
        open={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        onConfirm={(h, m) => {
          setPickHour(h)
          setPickMinute(m)
        }}
        initialHour={pickHour}
        initialMinute={pickMinute}
        title={t('prebook.timePickerTitle')}
        cancelLabel={t('prebook.timePickerCancel')}
        okLabel={t('common.ok')}
        keyboardAria={t('prebook.timePickerKeyboard')}
        keyboardHourLabel={t('prebook.timePickerHourField')}
        keyboardMinuteLabel={t('prebook.timePickerMinuteField')}
      />
      {!resolvedTime.ok && <p className="form-error">{t('booking.nonexistentTime', { time: pickTimeText })}</p>}
      {resolvedTime.ok && resolvedTime.ambiguous && (
        <p className="tiny">{t('booking.ambiguousTime', { time: pickTimeText })}</p>
      )}
      <PickupNoteField
        value={draft.pickupNote ?? ''}
        onChange={(v) => setDraft((d) => ({ ...d, pickupNote: v }))}
      />
      <button
        type="button"
        className="btn btn-fortsatt"
        onClick={onFortsatt}
        disabled={!resolvedTime.ok}
      >
        {t('prebook.continue')}
      </button>
      <BookingConfirmSheet
        open={sheetOpen}
        busy={booking}
        onClose={() => setSheetOpen(false)}
        onConfirm={() => void submit()}
        who={{ name: currentUser.fullName, forName: bookedFor }}
        whoPicker={
          isDriver ? (
            <PassengerPicker
              users={bookingUsers}
              value={draft.passengerUserId}
              onChange={(id) =>
                setDraft((d) => {
                  const next = { ...d }
                  if (id == null) delete next.passengerUserId
                  else next.passengerUserId = id
                  return next
                })
              }
            />
          ) : undefined
        }
        when={{ now: false, iso: resolvedTime.ok ? resolvedTime.iso : new Date().toISOString() }}
        from={draft.fromAddress}
        to={draft.toAddress}
        note={draft.pickupNote ?? ''}
        onEdit={editFromSheet}
      />
    </div>
  )
}
