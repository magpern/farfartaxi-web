import { useEffect, useState } from 'react'

/** Floating message; fades after ~3.6 s. Same behaviour as the old inline toast in Dashboard. */
export function Toast({ message, onGone }: { message: string; onGone: () => void }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!message) {
      setVisible(false)
      return
    }
    setVisible(true)
    const hideId = window.setTimeout(() => setVisible(false), 3600)
    const clearId = window.setTimeout(onGone, 4000)
    return () => {
      window.clearTimeout(hideId)
      window.clearTimeout(clearId)
    }
  }, [message, onGone])
  if (!message) return null
  return (
    <div className={`toast toast-floating ${visible ? 'toast-floating-visible' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  )
}
