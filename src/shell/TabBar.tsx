import type { ReactElement } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useI18n } from '../i18n/context'
import type { Role } from './types'
import { tabBarHidden, tabsForRole } from './tabs'

const ICONS: Record<string, ReactElement> = {
  book: <path d="M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16M4 16h16v3h-2.5v-1.5h-11V19H4zM7.5 13.5h.01M16.5 13.5h.01" />,
  requests: <path d="M4 6h16M4 12h16M4 18h10" />,
  rides: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />,
  places: <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3.5" />
}

export function TabBar({ role }: { role: Role }) {
  const { t } = useI18n()
  const { pathname } = useLocation()
  if (tabBarHidden(pathname)) return null
  return (
    <nav className="tabbar" aria-label={t('tabs.aria')}>
      {tabsForRole(role).map((tab) => {
        const current = tab.match(pathname)
        return (
          <Link
            key={tab.key}
            to={tab.to}
            className={`tabbar-item ${current ? 'tabbar-item-active' : ''}`}
            aria-current={current ? 'page' : undefined}
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {ICONS[tab.key]}
            </svg>
            <span>{t(tab.labelKey)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
