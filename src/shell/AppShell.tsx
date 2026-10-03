import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { FARFARTAXI_PWA_INSTALL_SESSION_KEY, isStandalonePwa, PwaInstallModal } from '../PwaInstallModal'
import { Toast } from '../components/ui'
import { ensureSubscribed, shouldShowIosInstallGuide, unsubscribeOnLogout, useLocaleSync } from '../lib/push'
import {
  BOOKING_DRAFT_STORAGE_KEY,
  defaultDraft,
  readBookingDraftFromStorage,
  writeBookingDraftToStorage,
  type BookingDraft
} from '../lib/bookingDraft'
import { claimRideCacheFor, clearRideCaches } from '../lib/rideCache'
import { logoutRemote } from '../lib/session'
import { useDriverTracking } from '../lib/useDriverTracking'
import { AdminPage } from '../pages/AdminPage'
import { ActiveRidePage } from '../pages/ActiveRidePage'
import { BookingConfirmPage } from '../pages/BookingConfirmPage'
import { DriverHomePage } from '../pages/DriverHomePage'
import { DriverRidesPage } from '../pages/DriverRidesPage'
import { DrivingModePage } from '../pages/DrivingModePage'
import { HelpPage } from '../pages/HelpPage'
import { HomePage } from '../pages/HomePage'
import { MorePage } from '../pages/MorePage'
import { PlacesPage } from '../pages/PlacesPage'
import { PreBookPage } from '../pages/PreBookPage'
import { RidesPage } from '../pages/RidesPage'
import { ActiveRideProvider, useActiveRide } from './ActiveRide'
import { BookingDraftContext } from './BookingDraftContext'
import { NetworkBanner } from '../lib/network'
import { UpdateBanner } from '../pwa'
import { ShellContext } from './ShellContext'
import { TabBar } from './TabBar'
import { isDriverRole, type AuthResponse } from './types'
import { useLargeText } from './textSize'
import { useUpdateGuard } from './updateGuard'
import { useSessionKeepAlive } from './useSessionKeepAlive'

/** Authenticated app: shell chrome (banners, toast, tab bar), providers and the route table. */
export function AppShell({
  auth,
  setAuth
}: {
  auth: AuthResponse
  setAuth: Dispatch<SetStateAction<AuthResponse | null>>
}) {
  useSessionKeepAlive()
  const { user, token } = auth
  // Before any child reads the ride cache: wipe it if it belongs to another user (runs again when the id changes).
  useState(() => claimRideCacheFor(user.id))
  useEffect(() => claimRideCacheFor(user.id), [user.id])
  const [toast, setToast] = useState('')
  const [pwaInstallOpen, setPwaInstallOpen] = useState(false)
  const [draft, setDraft] = useState<BookingDraft>(() => readBookingDraftFromStorage() ?? defaultDraft)
  const { large, setLarge } = useLargeText(user.id, user.role)
  useLocaleSync(token, user.id)

  // Permission already granted: make sure this device still has a valid subscription and the server knows it.
  useEffect(() => {
    void ensureSubscribed(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per app start / user
  }, [user.id])

  useEffect(() => {
    writeBookingDraftToStorage(draft)
  }, [draft])

  useEffect(() => {
    if (isStandalonePwa()) return
    if (shouldShowIosInstallGuide()) {
      setPwaInstallOpen(true)
      return
    }
    try {
      if (sessionStorage.getItem(FARFARTAXI_PWA_INSTALL_SESSION_KEY) === '1') setPwaInstallOpen(true)
    } catch {
      /* ignore */
    }
  }, [])

  const clearBookingDraft = useCallback(() => {
    setDraft(defaultDraft)
    try {
      sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const draftValue = useMemo(() => ({ draft, setDraft, clearBookingDraft }), [draft, clearBookingDraft])
  const clearToast = useCallback(() => setToast(''), [])
  const logout = useCallback(async () => {
    try {
      sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    clearRideCaches()
    await unsubscribeOnLogout(token) // best effort, bounded; must run while the token is still valid
    await logoutRemote(token)
    setAuth(null)
  }, [token, setAuth])

  const shellValue = useMemo(
    () => ({
      user,
      token,
      onToast: setToast,
      largeText: large,
      setLargeText: setLarge,
      showInstall: !isStandalonePwa(),
      openInstall: () => setPwaInstallOpen(true),
      logout
    }),
    [user, token, large, setLarge, logout]
  )

  return (
    <ShellContext.Provider value={shellValue}>
      <BookingDraftContext.Provider value={draftValue}>
        <ActiveRideProvider token={token} userId={user.id}>
          <ShellFrame draft={draft} userId={user.id} role={user.role} token={token} toast={toast} onToastGone={clearToast}>
            <PwaInstallModal open={pwaInstallOpen} onClose={() => setPwaInstallOpen(false)} />
            <AppRoutes role={user.role} />
          </ShellFrame>
        </ActiveRideProvider>
      </BookingDraftContext.Provider>
    </ShellContext.Provider>
  )
}

function ShellFrame({
  draft,
  userId,
  role,
  token,
  toast,
  onToastGone,
  children
}: {
  draft: BookingDraft
  userId: number
  role: AuthResponse['user']['role']
  token: string
  toast: string
  onToastGone: () => void
  children: React.ReactNode
}) {
  const { active } = useActiveRide()
  useUpdateGuard(active !== null, draft, userId)
  // GPS follows the driver's ride status from anywhere in the app, not only on one screen.
  useDriverTracking(token, active?.role === 'DRIVER' ? [active.ride] : [])
  return (
    <div className="dashboard-shell">
      <NetworkBanner />
      <UpdateBanner />
      <Toast message={toast} onGone={onToastGone} />
      <main className="app-main">{children}</main>
      <TabBar role={role} />
    </div>
  )
}

function AppRoutes({ role }: { role: AuthResponse['user']['role'] }) {
  const driver = isDriverRole(role)
  // Paths are relative to the parent `/app/*`.
  return (
    <Routes>
      <Route index element={driver ? <Navigate to="/app/forare" replace /> : <HomePage />} />
      <Route path="boka" element={<HomePage />} />
      <Route path="forboka" element={<PreBookPage />} />
      <Route path="bekraftelse" element={<BookingConfirmPage />} />
      <Route path="resa/:id" element={<ActiveRidePage />} />
      <Route path="resor" element={driver ? <DriverRidesPage /> : <RidesPage />} />
      <Route path="platser" element={<PlacesPage />} />
      <Route path="mer" element={<MorePage />} />
      <Route path="hjalp" element={<HelpPage />} />
      {driver && <Route path="forare" element={<DriverHomePage />} />}
      {driver && <Route path="forare/kor/:id" element={<DrivingModePage />} />}
      {role === 'ADMIN' && <Route path="admin" element={<AdminPage />} />}
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
