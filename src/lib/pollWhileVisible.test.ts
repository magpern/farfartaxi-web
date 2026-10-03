import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pollWhileVisible } from './pollWhileVisible'

function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: v })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
  setVisibility('visible')
})
afterEach(() => vi.useRealTimers())

describe('pollWhileVisible', () => {
  it('polls only while visible', () => {
    const fn = vi.fn()
    const stop = pollWhileVisible(fn, 15000)
    vi.advanceTimersByTime(15000)
    expect(fn).toHaveBeenCalledTimes(1)
    setVisibility('hidden')
    vi.advanceTimersByTime(60000)
    expect(fn).toHaveBeenCalledTimes(1)
    stop()
  })

  it('refreshes once on becoming visible, collapsing duplicate events', () => {
    const fn = vi.fn()
    const stop = pollWhileVisible(fn, 15000)
    setVisibility('hidden')
    vi.advanceTimersByTime(5000)
    setVisibility('visible')
    window.dispatchEvent(new Event('online'))
    expect(fn).toHaveBeenCalledTimes(1)
    stop()
  })
})
