import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'
import { BookingConfirmSheet } from './BookingConfirmSheet'

const base = {
  open: true,
  busy: false,
  onClose: () => {},
  onConfirm: () => {},
  who: { name: 'Anna Berg' },
  when: { now: false, iso: '2026-10-24T12:30:00Z' }, // Saturday 14:30 Stockholm
  from: 'Storgatan 1',
  to: 'Skolan',
  note: 'Blå dörr',
  onEdit: () => {}
}

describe('BookingConfirmSheet', () => {
  it('summarizes who, when (weekday + Stockholm time), pickup, destination and note', () => {
    renderApp(<BookingConfirmSheet {...base} />)
    expect(screen.getByText('Anna Berg')).toBeInTheDocument()
    expect(screen.getByText(/lördag.*14:30/)).toBeInTheDocument()
    expect(screen.getByText('Storgatan 1')).toBeInTheDocument()
    expect(screen.getByText('Skolan')).toBeInTheDocument()
    expect(screen.getByText('Blå dörr')).toBeInTheDocument()
  })

  it('shows "För Lisa" when booking on behalf', () => {
    renderApp(<BookingConfirmSheet {...base} who={{ name: 'Folke Berg', forName: 'Lisa Berg' }} />)
    expect(screen.getByText('För Lisa Berg')).toBeInTheDocument()
    expect(screen.getByText('Bokas av Folke Berg')).toBeInTheDocument()
  })

  it('has an edit shortcut per line', async () => {
    const onEdit = vi.fn()
    renderApp(<BookingConfirmSheet {...base} onEdit={onEdit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ändra Hämtas' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ändra Åker till' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ändra När' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ändra Meddelande' }))
    expect(onEdit.mock.calls.map((c) => c[0])).toEqual(['from', 'to', 'when', 'note'])
  })

  it('"Åka nu" says Nu and the confirm button is disabled while submitting', () => {
    renderApp(<BookingConfirmSheet {...base} when={{ now: true, iso: base.when.iso }} busy />)
    expect(screen.getByText(/^Nu –/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bokar…' })).toBeDisabled()
  })

  it('confirm calls onConfirm', async () => {
    const onConfirm = vi.fn()
    renderApp(<BookingConfirmSheet {...base} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ja, boka resan' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
