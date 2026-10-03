import { useEffect } from 'react'
import { ensureFreshSession } from '../lib/session'

/** Keep the access token fresh: refresh silently when it is expired or expires within 5 minutes. */
export function useSessionKeepAlive() {
  useEffect(() => {
    const run = () => {
      void ensureFreshSession()
    }
    const id = window.setInterval(run, 30_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', run)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', run)
    }
  }, [])
}
