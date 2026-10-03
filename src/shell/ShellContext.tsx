import { createContext, useContext } from 'react'
import type { UserView } from './types'

export type ShellValue = {
  user: UserView
  token: string
  onToast: (message: string) => void
  largeText: boolean
  setLargeText: (on: boolean) => void
  showInstall: boolean
  openInstall: () => void
  logout: () => Promise<void>
}

export const ShellContext = createContext<ShellValue | null>(null)

export function useShell(): ShellValue {
  const v = useContext(ShellContext)
  if (!v) throw new Error('useShell must be used inside the app shell')
  return v
}
