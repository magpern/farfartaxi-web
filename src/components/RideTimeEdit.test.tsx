import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n/context'
import { RideTimeEdit } from './RideTimeEdit'

function setup(scheduledAt: string) {
  localStorage.setItem('farfartaxi-locale', 'sv')
  const onSave = vi.fn()
  render(
    <I18nProvider>
      <RideTimeEdit open token="t" ride={{ scheduledAt, toAddress: 'B', pickupNote: null }} onSave={onSave} onCancel={() => {}} />
    </I18nProvider>
  )
  return onSave
}

describe('RideTimeEdit', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z')) // every ride below is in the past
  })
  afterEach(() => vi.useRealTimers())

  it('ignores seconds in the original time: a past NOW ride can still have its note edited, without scheduledAt', () => {
    const onSave = setup('2026-10-03T08:00:42Z')
    const save = screen.getByRole('button', { name: 'Spara ändringen' })
    expect(save).toBeDisabled() // nothing changed yet
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Ring på' } })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(onSave).toHaveBeenCalledWith({ pickupNote: 'Ring på' })
  })

  it('does not treat the second occurrence of the ambiguous DST hour as a time change', () => {
    // 2026-10-25 02:30 happens twice; 01:30:10Z is the second one (CET)
    const onSave = setup('2026-10-25T01:30:10Z')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Vid porten' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara ändringen' }))
    expect(onSave).toHaveBeenCalledWith({ pickupNote: 'Vid porten' })
  })

  it('a changed date is a time change (rejected while in the past)', () => {
    setup('2026-10-03T08:00:42Z')
    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-10-04' } })
    expect(screen.getByRole('button', { name: 'Spara ändringen' })).toBeDisabled()
  })
})
