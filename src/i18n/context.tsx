import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import en from '../locales/en.json'
import sv from '../locales/sv.json'

const catalogs = { sv, en } as const

export type AppLocale = keyof typeof catalogs

const STORAGE_KEY = 'farfartaxi-locale'

function getNested(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`))
}

/** Browser / saved preference; anything except `en` falls back to Swedish. */
export function detectInitialLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'sv') return stored
  } catch {
    /* private mode */
  }
  if (typeof navigator === 'undefined') return 'sv'
  const primary = (navigator.language || '').split('-')[0]?.toLowerCase() || ''
  if (primary === 'en') return 'en'
  return 'sv'
}

type I18nValue = {
  locale: AppLocale
  setLocale: (l: AppLocale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  /** String arrays from JSON (e.g. weekday letters, help bullets). */
  ta: (key: string) => string[]
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(detectInitialLocale)

  const setLocale = useCallback((l: AppLocale) => {
    setLocaleState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  const messages = catalogs[locale]

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = getNested(messages, key)
      const template = typeof raw === 'string' ? raw : key
      return interpolate(template, vars)
    },
    [messages]
  )

  const ta = useCallback(
    (key: string) => {
      const raw = getNested(messages, key)
      return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
    },
    [messages]
  )

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'sv'
    const title = getNested(messages, 'common.documentTitle')
    if (typeof title === 'string') document.title = title
  }, [locale, messages])

  const value = useMemo(
    () => ({ locale, setLocale, t, ta }),
    [locale, setLocale, t, ta]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
