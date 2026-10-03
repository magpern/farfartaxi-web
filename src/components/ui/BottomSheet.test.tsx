import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/render'
import { BottomSheet } from './BottomSheet'
import { ConfirmDialog } from './ConfirmDialog'
import { resetOverlayRegistry } from './overlayRegistry'

afterEach(() => resetOverlayRegistry())

function Host({ onBump }: { onBump?: (bump: () => void) => void }) {
  const [n, setN] = useState(0)
  const [open, setOpen] = useState(false)
  onBump?.(() => setN((x) => x + 1))
  return (
    <div>
      <button onClick={() => setOpen(true)}>opener</button>
      <span>renders {n}</span>
      <BottomSheet open={open} title="T" onClose={() => setOpen(false)}>
        <textarea aria-label="note" />
        <button>last</button>
      </BottomSheet>
    </div>
  )
}

describe('BottomSheet focus', () => {
  it('keeps focus in a textarea when the parent re-renders with a new onClose', async () => {
    let bump = () => {}
    renderApp(<Host onBump={(b) => (bump = b)} />)
    await userEvent.click(screen.getByText('opener'))
    const ta = screen.getByLabelText('note')
    ta.focus()
    expect(ta).toHaveFocus()
    act(() => bump())
    act(() => bump())
    expect(screen.getByText('renders 2')).toBeInTheDocument()
    expect(ta).toHaveFocus()
  })

  it('closes on Escape, returns focus to the opener and traps Tab', async () => {
    renderApp(<Host />)
    const opener = screen.getByText('opener')
    await userEvent.click(opener)
    const last = screen.getByText('last')
    last.focus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: /stäng|close/i })).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(last).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })
})

describe('ConfirmDialog', () => {
  it('focuses on open and Escape cancels', () => {
    const onCancel = vi.fn()
    renderApp(<ConfirmDialog open title="Sure?" confirmLabel="Ja" cancelLabel="Nej" onConfirm={() => {}} onCancel={onCancel} />)
    expect(screen.getByRole('dialog').querySelector('.install-modal-card')).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })
})
