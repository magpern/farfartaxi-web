import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n/context'
import { PendingApproval } from './PendingApproval'

function setup(onRecheck: () => Promise<boolean>, onLogout = vi.fn()) {
  render(
    <I18nProvider>
      <PendingApproval onRecheck={onRecheck} onLogout={onLogout} />
    </I18nProvider>
  )
  return { onLogout }
}

describe('PendingApproval', () => {
  it('renders recheck and logout buttons', () => {
    setup(async () => false)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('calls onLogout and onRecheck, showing the still-pending hint', async () => {
    const onRecheck = vi.fn().mockResolvedValue(false)
    const { onLogout } = setup(onRecheck)
    const [recheck, logout] = screen.getAllByRole('button')
    fireEvent.click(logout)
    expect(onLogout).toHaveBeenCalledOnce()
    fireEvent.click(recheck)
    await waitFor(() => expect(onRecheck).toHaveBeenCalledOnce())
    await waitFor(() => expect(document.querySelector('.tiny')).not.toBeNull())
  })
})
