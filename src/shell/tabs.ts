import { isDriverRole, type Role } from './types'

export type TabDef = { key: string; to: string; labelKey: string; match: (pathname: string) => boolean }

const startsWith = (...prefixes: string[]) => (p: string) => prefixes.some((x) => p === x || p.startsWith(`${x}/`))

/** Tabs per role: passengers Boka · Mina resor · Platser · Mer; drivers Förfrågningar · Boka · Mer. */
export function tabsForRole(role: Role): TabDef[] {
  const more: TabDef = { key: 'more', to: '/app/mer', labelKey: 'tabs.more', match: startsWith('/app/mer', '/app/hjalp', '/app/admin') }
  if (isDriverRole(role)) {
    return [
      { key: 'requests', to: '/app/forare', labelKey: 'tabs.requests', match: startsWith('/app/forare', '/app/resor') },
      { key: 'book', to: '/app/boka', labelKey: 'tabs.book', match: startsWith('/app/boka', '/app/forboka', '/app/bekraftelse', '/app/resa') },
      more
    ]
  }
  return [
    { key: 'book', to: '/app', labelKey: 'tabs.book', match: (p) => p === '/app' || startsWith('/app/forboka', '/app/bekraftelse', '/app/resa', '/app/boka')(p) },
    { key: 'rides', to: '/app/resor', labelKey: 'tabs.rides', match: startsWith('/app/resor') },
    { key: 'places', to: '/app/platser', labelKey: 'tabs.places', match: startsWith('/app/platser') },
    more
  ]
}

/** Full-screen flows where the tab bar would be in the way. */
export function tabBarHidden(pathname: string): boolean {
  return pathname.startsWith('/app/forare/kor/') || pathname.startsWith('/app/forboka') || pathname.startsWith('/app/bekraftelse')
}

