import { useEffect } from 'react'
import { useI18n } from '../../i18n/context'
import { syncLocale } from './prefs'

/** Push texts follow the app language: sync on start (login / refresh-start) and on every language switch. */
export function useLocaleSync(token: string, userId: number): void {
  const { locale } = useI18n()
  useEffect(() => {
    syncLocale(token, locale)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync on language/user change only, not on every token refresh
  }, [locale, userId])
}
