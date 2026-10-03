/**
 * Calls `fn` every `ms` while the page is visible, and once when it becomes visible again or the browser
 * comes back online. Bursts (e.g. several events in the same moment) collapse into one call.
 * Does NOT call `fn` immediately: the caller does the initial load. Returns a teardown function.
 */
export function pollWhileVisible(fn: () => void | Promise<unknown>, ms: number, minGapMs = 1000): () => void {
  let last = Date.now()
  const run = () => {
    if (document.visibilityState !== 'visible') return
    const now = Date.now()
    if (now - last < minGapMs) return
    last = now
    void fn()
  }
  const timer = window.setInterval(run, ms)
  document.addEventListener('visibilitychange', run)
  window.addEventListener('online', run)
  return () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', run)
    window.removeEventListener('online', run)
  }
}
