import { useCallback, useRef, useState } from 'react'

/** Runs async actions one at a time; `busy` drives disabled/pending buttons. Re-entrant calls are ignored. */
export function useBusy() {
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current) return undefined
    lock.current = true
    setBusy(true)
    try {
      return await fn()
    } finally {
      lock.current = false
      setBusy(false)
    }
  }, [])
  return { busy, run }
}
