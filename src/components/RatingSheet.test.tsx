import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'
import { RatingSheet } from './RatingSheet'

describe('RatingSheet', () => {
  it('needs a star before sending, then submits stars and comment', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderApp(<RatingSheet open onClose={onClose} onSubmit={onSubmit} />)
    const send = screen.getByRole('button', { name: 'Skicka' })
    expect(send).toBeDisabled()
    expect(screen.getAllByRole('radio')).toHaveLength(5)
    await userEvent.click(screen.getByRole('radio', { name: '4 av 5 stjärnor' }))
    expect(screen.getByRole('radio', { name: '4 av 5 stjärnor' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.type(screen.getByRole('textbox'), 'Trevlig förare')
    await userEvent.click(send)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(4, 'Trevlig förare'))
    expect(onClose).toHaveBeenCalled()
  })

  it('stays open when saving fails so nothing is lost', async () => {
    const onClose = vi.fn()
    renderApp(<RatingSheet open onClose={onClose} onSubmit={() => Promise.reject(new Error('x'))} />)
    await userEvent.click(screen.getByRole('radio', { name: '5 av 5 stjärnor' }))
    await userEvent.click(screen.getByRole('button', { name: 'Skicka' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Skicka' })).not.toBeDisabled())
    expect(onClose).not.toHaveBeenCalled()
  })
})
