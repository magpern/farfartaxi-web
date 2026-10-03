import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from './useWakeLock'

function sentinel() {
  const s = { released: false, release: vi.fn(() => ((s.released = true), Promise.resolve())), addEventListener: vi.fn() }
  return s
}
const flush = () => act(async () => {})
const setVisibility = (v: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: v })
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).wakeLock
  setVisibility('visible')
})

describe('useWakeLock', () => {
  it('acquires, re-acquires when visible again, and releases on deactivate', async () => {
    const sentinels: ReturnType<typeof sentinel>[] = []
    const request = vi.fn(() => {
      const s = sentinel()
      sentinels.push(s)
      return Promise.resolve(s)
    })
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
    const { result, rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } })
    await flush()
    expect(request).toHaveBeenCalledWith('screen')
    expect(result.current).toEqual({ supported: true, held: true })

    // browser drops the lock when the tab is hidden
    sentinels[0].released = true
    setVisibility('hidden')
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await flush()
    expect(request).toHaveBeenCalledTimes(2)

    rerender({ on: false })
    await flush()
    expect(sentinels[1].release).toHaveBeenCalled()
    expect(result.current.held).toBe(false)
  })

  it('does not request when inactive and reports unsupported', async () => {
    const request = vi.fn(() => Promise.resolve(sentinel()))
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
    renderHook(() => useWakeLock(false))
    await flush()
    expect(request).not.toHaveBeenCalled()
    delete (navigator as unknown as Record<string, unknown>).wakeLock
    const { result } = renderHook(() => useWakeLock(true))
    expect(result.current).toEqual({ supported: false, held: false })
  })

  it('keeps a single request in flight and releases a lock that resolves after unmount', async () => {
    let resolve: (s: ReturnType<typeof sentinel>) => void = () => {}
    const request = vi.fn(() => new Promise<ReturnType<typeof sentinel>>((r) => (resolve = r)))
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
    const { unmount } = renderHook(() => useWakeLock(true))
    setVisibility('visible')
    setVisibility('visible')
    expect(request).toHaveBeenCalledTimes(1)
    unmount()
    const s = sentinel()
    await act(async () => resolve(s))
    expect(s.release).toHaveBeenCalled()
  })
})
