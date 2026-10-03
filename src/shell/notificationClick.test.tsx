import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __queueSnapshot, __resetTelemetry } from '../lib/telemetry'
import { useNotificationClickRouting } from '../lib/push/useNotificationClickRouting'

let listener: ((e: MessageEvent) => void) | null = null
beforeEach(() => {
  listener = null
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      addEventListener: (_: string, l: (e: MessageEvent) => void) => (listener = l),
      removeEventListener: () => (listener = null)
    }
  })
})
afterEach(() => {
  cleanup()
  delete (navigator as unknown as Record<string, unknown>).serviceWorker
})

function Probe() {
  useNotificationClickRouting()
  return <span data-testid="loc">{useLocation().pathname}</span>
}
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>
  )

describe('useNotificationClickRouting', () => {
  it('emits push_opened', () => {
    __resetTelemetry()
    mount()
    act(() => listener?.({ data: { type: 'NOTIFICATION_CLICK', url: '/app/resa/7' } } as MessageEvent))
    expect(__queueSnapshot().map((e) => e.name)).toEqual(['push_opened'])
  })
  it('routes in-app on NOTIFICATION_CLICK', () => {
    const { getByTestId } = mount()
    act(() => listener?.({ data: { type: 'NOTIFICATION_CLICK', url: '/app/resa/7' } } as MessageEvent))
    expect(getByTestId('loc')).toHaveTextContent('/app/resa/7')
  })
  it('rejects external urls and other messages', () => {
    const { getByTestId } = mount()
    act(() => listener?.({ data: { type: 'NOTIFICATION_CLICK', url: '//evil.example' } } as MessageEvent))
    expect(getByTestId('loc')).toHaveTextContent('/app')
    act(() => listener?.({ data: { type: 'OTHER', url: '/app/x' } } as MessageEvent))
    expect(getByTestId('loc')).toHaveTextContent(/^\/app$/)
    vi.restoreAllMocks()
  })
})
