import {
  createContext,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from './i18n/context'
import { Clock24hTimePicker } from './Clock24hTimePicker'
import {
  FARFARTAXI_PWA_INSTALL_SESSION_KEY,
  isStandalonePwa,
  PwaInstallModal,
  schedulePwaInstallPrompt
} from './PwaInstallModal'
import L from 'leaflet'
import { registerSW } from 'virtual:pwa-register'
import 'leaflet/dist/leaflet.css'

registerSW({ immediate: true })

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string
            callback: (resp: { credential: string }) => void
            auto_select?: boolean
          }) => void
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
          cancel: () => void
        }
      }
    }
  }
}

type Role = 'USER' | 'DRIVER' | 'ADMIN'

type UserView = {
  id: number
  email: string
  fullName: string
  role: Role
  mustChangePassword: boolean
  hasLocalPassword: boolean
}

type AuthResponse = {
  token: string
  user: UserView
}

type RideResponse = {
  id: number
  status: string
  fromAddress: string
  fromLat: number
  fromLon: number
  toAddress: string
  toLat: number
  toLon: number
  scheduledAt: string
  passengerId: number
  acceptedByDriverId: number | null
  acceptedByDriverName: string | null
  etaMinutes: number | null
  lastDriverLat: number | null
  lastDriverLon: number | null
  lastLocationAt: string | null
}

// In dev, always use same-origin `/api/...` so Vite's proxy reaches the backend.
// A set VITE_API_URL (e.g. http://localhost:8080) bypasses the proxy and often causes
// net::ERR_CONNECTION_REFUSED if the browser cannot reach that host:port.
const API_URL = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/** Nominatim reverse zoom: keep fixed for stable labels. */
const REVERSE_GEOCODE_DETAIL_ZOOM = 18

/** Geocoding is proxied by the backend (`/api/public/geocode/*`) so the browser avoids CORS and shared rate limits. */

type NominatimResult = {
  display_name: string
  lat: string
  lon: string
  /** POI / place name from Nominatim (shops, stations, etc.). */
  name?: string
  class?: string
  type?: string
  address?: Record<string, string | undefined>
}

/** OSRM route response (subset; geometries=geojson). */
type OsrmRouteResponse = {
  code: string
  routes?: Array<{
    distance: number
    duration: number
    geometry: { type: string; coordinates: number[][] }
  }>
}

/** Local area (kommun-level): "Järfälla kommun" → "Järfälla", not län/county (e.g. Stockholm). */
function stripKommunSuffix(raw: string): string {
  return raw.replace(/\s+kommun$/i, '').trim()
}

/** Län/county fallback when no municipality field exists (rural). */
function formatCountyFallback(raw: string): string {
  return raw
    .replace(/\s+County$/i, '')
    .replace(/\s+län$/i, '')
    .trim()
}

/**
 * Street + locality ("…väg 10, Järfälla") or POI + locality ("ICA Maxi Barkarby, Järfälla").
 * Uses Nominatim `name` when there is no road (POI / landmark search). Sweden-only on search API.
 */
function formatNominatimAddress(payload: NominatimResult | { display_name?: string; address?: Record<string, string | undefined> }): string {
  const full = payload as NominatimResult
  const a = payload.address
  const poiName = (full.name?.trim() || a?.name?.trim() || '').trim()

  const road =
    a?.road ||
    a?.pedestrian ||
    a?.footway ||
    a?.path ||
    a?.cycleway ||
    a?.residential
  const housenumber = a?.house_number || a?.house_name
  const streetLine =
    road && housenumber
      ? `${road} ${housenumber}`.trim()
      : road
        ? road.trim()
        : housenumber
          ? housenumber.trim()
          : ''

  const localityRaw =
    a?.municipality ||
    a?.city ||
    a?.town ||
    a?.village ||
    a?.suburb ||
    a?.neighbourhood ||
    a?.hamlet
  let area = localityRaw ? stripKommunSuffix(localityRaw) : ''
  if (!area && a) {
    const countyRaw = a.county || a.state || a.region
    if (countyRaw) area = formatCountyFallback(countyRaw)
  }

  let lead = streetLine
  if (poiName) {
    if (!streetLine) lead = poiName
    else {
      const pl = poiName.toLowerCase()
      const sl = streetLine.toLowerCase()
      lead = sl.includes(pl) || pl.includes(sl) ? streetLine : `${poiName}, ${streetLine}`
    }
  }

  const parts = [lead, area].filter(Boolean)
  const joined = parts.join(', ')
  if (joined) return joined
  if (poiName && !area) return poiName
  return payload.display_name ?? ''
}

/** Nominatim often returns several OSM hits for the same street (segments); same formatted label → one row. */
function dedupeNominatimResults(items: NominatimResult[]): NominatimResult[] {
  const seen = new Set<string>()
  const out: NominatimResult[] = []
  for (const item of items) {
    const label = (formatNominatimAddress(item) || item.display_name)
      .normalize('NFC')
      .trim()
      .replace(/\s+/g, ' ')
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function formatYmdHm(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Lists and booking-related timestamps: always 24-hour clock. */
function formatLocaleDateTime24h(iso: string, dateLocale: string) {
  return new Date(iso).toLocaleString(dateLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

type BookingDraft = {
  fromAddress: string
  fromLat: number
  fromLon: number
  toAddress: string
  toLat: number
  toLon: number
}

const defaultDraft: BookingDraft = {
  fromAddress: '',
  toAddress: '',
  fromLat: 59.3293,
  fromLon: 18.0686,
  toLat: 59.3346,
  toLon: 18.0632
}

const BOOKING_DRAFT_STORAGE_KEY = 'farfartaxi-booking-draft'

function readBookingDraftFromStorage(): BookingDraft | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(BOOKING_DRAFT_STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Record<string, unknown>
    if (typeof o.fromAddress !== 'string' || typeof o.toAddress !== 'string') return null
    const fromLat = Number(o.fromLat)
    const fromLon = Number(o.fromLon)
    const toLat = Number(o.toLat)
    const toLon = Number(o.toLon)
    if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) return null
    return {
      fromAddress: o.fromAddress,
      toAddress: o.toAddress,
      fromLat,
      fromLon,
      toLat,
      toLon
    }
  } catch {
    return null
  }
}

function writeBookingDraftToStorage(d: BookingDraft) {
  try {
    sessionStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(d))
  } catch {
    /* quota / private mode */
  }
}

const BookingDraftContext = createContext<{
  draft: BookingDraft
  setDraft: Dispatch<SetStateAction<BookingDraft>>
  clearBookingDraft: () => void
} | null>(null)

function useBookingDraft() {
  const ctx = useContext(BookingDraftContext)
  if (!ctx) throw new Error('useBookingDraft')
  return ctx
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/app/*" element={<ProtectedApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function ProtectedApp() {
  const [auth, setAuth] = useLocalAuth()
  if (!auth) {
    return <Navigate to="/login" replace />
  }
  return <Dashboard auth={auth} setAuth={setAuth} />
}

function LandingPage() {
  const { t } = useI18n()
  return (
    <main className="page page-center">
      <section className="card hero-card">
        <h1>{t('common.brand')}</h1>
        <p>{t('landing.subtitle')}</p>
        <Link className="btn btn-primary" to="/login">
          {t('landing.cta')}
        </Link>
      </section>
    </main>
  )
}

function AuthPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const [auth, setAuth] = useLocalAuth()
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [googleClientId, setGoogleClientId] = useState('')
  const [emailFallbackOpen, setEmailFallbackOpen] = useState(false)
  const googleBtnRef = useRef<HTMLDivElement>(null)
  const googleInitRef = useRef(false)

  const showGooglePrimary = Boolean(googleClientId) && mode !== 'forgot'
  const showEmailPanel = !googleClientId || mode === 'forgot' || emailFallbackOpen

  useEffect(() => {
    if (mode === 'forgot') setEmailFallbackOpen(true)
  }, [mode])

  useEffect(() => {
    if (auth) {
      navigate('/app', { replace: true })
    }
  }, [auth, navigate])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const envRaw = import.meta.env.VITE_GOOGLE_CLIENT_ID
        const envId = typeof envRaw === 'string' ? envRaw.trim() : ''
        const cfg = await api<{ googleClientId?: string }>('/api/public/oauth-config')
        const id = envId || (cfg.googleClientId ?? '').trim()
        if (!cancelled) setGoogleClientId(id)
      } catch {
        if (!cancelled) setGoogleClientId('')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!googleClientId) return
    const src = 'https://accounts.google.com/gsi/client'
    if (document.querySelector(`script[src="${src}"]`)) return
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.defer = true
    document.body.appendChild(script)
  }, [googleClientId])

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setPending(true)
      setError('')
      try {
        const res = await api<AuthResponse>('/api/auth/google', {
          method: 'POST',
          body: JSON.stringify({ credential })
        })
        schedulePwaInstallPrompt()
        setAuth(res)
        navigate('/app', { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.generic'))
      } finally {
        setPending(false)
      }
    },
    [navigate, setAuth, t]
  )

  useEffect(() => {
    if (!googleClientId) return
    let intervalId = 0
    let cancelled = false

    const tryRender = () => {
      const el = googleBtnRef.current
      if (cancelled || !el || !window.google?.accounts?.id) return false
      if (googleInitRef.current) return true
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (r) => {
          if (r.credential) void handleGoogleCredential(r.credential)
        }
      })
      window.google.accounts.id.renderButton(el, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        width: 280,
        locale: locale === 'en' ? 'en' : 'sv'
      })
      googleInitRef.current = true
      return true
    }

    intervalId = window.setInterval(() => {
      if (tryRender()) window.clearInterval(intervalId)
    }, 50)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      try {
        window.google?.accounts?.id?.cancel()
      } catch {
        /* ignore */
      }
      googleInitRef.current = false
    }
  }, [googleClientId, locale, handleGoogleCredential])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError('')
    try {
      if (mode === 'login') {
        const res = await api<AuthResponse>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        })
        schedulePwaInstallPrompt()
        setAuth(res)
        navigate('/app', { replace: true })
      } else if (mode === 'register') {
        const res = await api<AuthResponse>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, fullName: name })
        })
        schedulePwaInstallPrompt()
        setAuth(res)
        navigate('/app', { replace: true })
      } else {
        await api('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email })
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="page page-center">
      <section className="card auth-card">
        <h2>
          {mode === 'login'
            ? t('auth.loginTitle')
            : mode === 'register'
              ? t('auth.registerTitle')
              : t('auth.forgotTitle')}
        </h2>
        {showGooglePrimary && (
          <>
            <div className="auth-oauth-wrap">
              <div ref={googleBtnRef} aria-label={t('auth.continueWithGoogle')} />
            </div>
            {!emailFallbackOpen && (
              <button
                type="button"
                className="auth-fallback-toggle"
                aria-expanded={false}
                onClick={() => setEmailFallbackOpen(true)}
              >
                {t('auth.emailPasswordFallback')}
              </button>
            )}
          </>
        )}
        {showEmailPanel && (
          <>
            {showGooglePrimary && emailFallbackOpen && (
              <div className="auth-email-panel">
                <p className="auth-hint">{t('auth.adminPasswordHint')}</p>
                <div className="auth-divider">{t('auth.orEmail')}</div>
              </div>
            )}
            <form onSubmit={submit} className="stack">
              <label>
                {t('auth.email')}
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
              </label>
              {mode !== 'forgot' && (
                <label>
                  {t('auth.password')}
                  <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
                </label>
              )}
              {mode === 'register' && (
                <label>
                  {t('auth.name')}
                  <input value={name} onChange={(e) => setName(e.target.value)} required />
                </label>
              )}
              {error && <p className="error">{error}</p>}
              <button className="btn btn-primary" type="submit" disabled={pending}>
                {pending
                  ? t('auth.waiting')
                  : mode === 'forgot'
                    ? t('auth.sendResetLink')
                    : t('auth.continue')}
              </button>
            </form>
            <div className="auth-links">
              {mode !== 'login' && (
                <button type="button" onClick={() => setMode('login')} className="link-btn">
                  {t('auth.linkLogin')}
                </button>
              )}
              {mode !== 'register' && (
                <button type="button" onClick={() => setMode('register')} className="link-btn">
                  {t('auth.linkRegister')}
                </button>
              )}
              {mode !== 'forgot' && (
                <button type="button" onClick={() => setMode('forgot')} className="link-btn">
                  {t('auth.linkForgot')}
                </button>
              )}
            </div>
            {showGooglePrimary && emailFallbackOpen && (
              <button
                type="button"
                className="auth-fallback-toggle auth-fallback-toggle-close"
                onClick={() => {
                  setEmailFallbackOpen(false)
                  setMode('login')
                  setError('')
                }}
              >
                {t('auth.hideEmailLogin')}
              </button>
            )}
          </>
        )}
      </section>
    </main>
  )
}

function Dashboard({ auth, setAuth }: { auth: AuthResponse; setAuth: (a: AuthResponse | null) => void }) {
  const { t } = useI18n()
  const [toast, setToast] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pwaInstallOpen, setPwaInstallOpen] = useState(false)
  const showPwaInstallMenu = !isStandalonePwa()
  const [draft, setDraft] = useState<BookingDraft>(() => readBookingDraftFromStorage() ?? defaultDraft)
  const location = useLocation()
  const hideTopBar = location.pathname.includes('/forboka') || location.pathname.includes('/bekraftelse')

  useEffect(() => {
    writeBookingDraftToStorage(draft)
  }, [draft])

  useEffect(() => {
    if (isStandalonePwa()) return
    try {
      if (sessionStorage.getItem(FARFARTAXI_PWA_INSTALL_SESSION_KEY) === '1') {
        setPwaInstallOpen(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!toast) {
      setToastVisible(false)
      return
    }
    setToastVisible(true)
    const hideId = window.setTimeout(() => setToastVisible(false), 3600)
    const clearId = window.setTimeout(() => setToast(''), 4000)
    return () => {
      window.clearTimeout(hideId)
      window.clearTimeout(clearId)
    }
  }, [toast])

  const clearBookingDraft = useCallback(() => {
    setDraft(defaultDraft)
    try {
      sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const draftContextValue = useMemo(
    () => ({ draft, setDraft, clearBookingDraft }),
    [draft, clearBookingDraft]
  )

  return (
    <BookingDraftContext.Provider value={draftContextValue}>
      <div className="dashboard-shell">
        {toast && (
          <div className={`toast toast-floating ${toastVisible ? 'toast-floating-visible' : ''}`}>{toast}</div>
        )}
        <PwaInstallModal open={pwaInstallOpen} onClose={() => setPwaInstallOpen(false)} />
        {!hideTopBar && (
          <header className="booking-topbar">
            <button type="button" className="icon-btn" onClick={() => setMenuOpen(true)} aria-label={t('topbar.menuAria')}>
              ☰
            </button>
            <span className="brand">{t('common.brand')}</span>
            <span className="topbar-user" title={auth.user.email}>
              {auth.user.fullName}
            </span>
          </header>
        )}
        {/* Paths are relative to parent `/app/*`: remaining URL after `/app` is matched (e.g. `/` → index). */}
        <Routes>
          <Route index element={<BookingPage token={auth.token} onToast={setToast} />} />
          <Route path="forboka" element={<PreBookPage token={auth.token} onToast={setToast} />} />
          <Route path="bekraftelse" element={<BookingConfirmPage />} />
          <Route path="resor" element={<MyRidesPage token={auth.token} onToast={setToast} />} />
          <Route path="hjalp" element={<HelpPage />} />
          {(auth.user.role === 'DRIVER' || auth.user.role === 'ADMIN') && (
            <Route path="forare" element={<DriverPage token={auth.token} onToast={setToast} />} />
          )}
          {auth.user.role === 'ADMIN' && (
            <Route
              path="admin"
              element={<AdminPage token={auth.token} currentUserId={auth.user.id} onToast={setToast} />}
            />
          )}
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
        {menuOpen && (
          <SideMenu
            auth={auth}
            showPwaInstall={showPwaInstallMenu}
            onOpenPwaInstall={() => setPwaInstallOpen(true)}
            onClose={() => setMenuOpen(false)}
            onLogout={() => {
              try {
                sessionStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY)
              } catch {
                /* ignore */
              }
              setAuth(null)
            }}
          />
        )}
      </div>
    </BookingDraftContext.Provider>
  )
}

function SideMenu({
  auth,
  showPwaInstall,
  onOpenPwaInstall,
  onClose,
  onLogout
}: {
  auth: AuthResponse
  showPwaInstall: boolean
  onOpenPwaInstall: () => void
  onClose: () => void
  onLogout: () => void
}) {
  const { t, locale, setLocale } = useI18n()
  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <nav className="drawer" onClick={(e) => e.stopPropagation()} aria-label={t('menu.ariaMain')}>
        <div className="drawer-head">
          <strong>{t('common.brand')}</strong>
          <button type="button" className="drawer-close" onClick={onClose} aria-label={t('menu.close')}>
            ×
          </button>
        </div>
        <p className="drawer-sub">{auth.user.fullName}</p>
        <Link className="drawer-link drawer-link-book" to="/app" onClick={onClose}>
          {t('menu.book')}
        </Link>
        <Link className="drawer-link" to="/app/resor" onClick={onClose}>
          {t('menu.myRides')}
        </Link>
        {showPwaInstall && (
          <button
            type="button"
            className="drawer-link"
            onClick={() => {
              onOpenPwaInstall()
              onClose()
            }}
          >
            {t('menu.installApp')}
          </button>
        )}
        <Link className="drawer-link" to="/app/hjalp" onClick={onClose}>
          {t('menu.help')}
        </Link>
        {(auth.user.role === 'DRIVER' || auth.user.role === 'ADMIN') && (
          <Link className="drawer-link" to="/app/forare" onClick={onClose}>
            {t('menu.driver')}
          </Link>
        )}
        {auth.user.role === 'ADMIN' && (
          <Link className="drawer-link" to="/app/admin" onClick={onClose}>
            {t('menu.admin')}
          </Link>
        )}
        <p className="drawer-lang-label">{t('menu.language')}</p>
        <div className="drawer-lang-row">
          <button
            type="button"
            className={`drawer-link drawer-lang-btn ${locale === 'sv' ? 'drawer-lang-btn-active' : ''}`}
            onClick={() => setLocale('sv')}
          >
            {t('languages.sv')}
          </button>
          <button
            type="button"
            className={`drawer-link drawer-lang-btn ${locale === 'en' ? 'drawer-lang-btn-active' : ''}`}
            onClick={() => setLocale('en')}
          >
            {t('languages.en')}
          </button>
        </div>
        <button
          type="button"
          className="drawer-link drawer-link-btn"
          onClick={() => {
            onLogout()
            onClose()
          }}
        >
          {t('menu.logout')}
        </button>
      </nav>
    </div>
  )
}

/** Dev-only diagnostics for Leaflet zoom / recenter (filter console by `[booking-map]`). */
function logBookingMap(...args: unknown[]) {
  if (import.meta.env.DEV) console.debug('[booking-map]', ...args)
}

function BookingPage({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { draft, setDraft, clearBookingDraft } = useBookingDraft()
  const draftRef = useRef(draft)
  draftRef.current = draft
  const mapRef = useRef<L.Map | null>(null)
  const routeLineRef = useRef<L.Polyline | null>(null)
  /** Geographic pin for the active field (not a fixed screen overlay — stays on lat/lng when zooming). */
  const addressPinRef = useRef<L.Marker | null>(null)
  /** Skip one moveend handler side-effects after programmatic setView (consumed on next moveend). */
  const skipReverseOnMoveEndRef = useRef(false)
  /** True while the map is being moved by code (fitBounds, search pick, field recenter, GPS). */
  const programmaticCameraRef = useRef(false)
  const reverseGeocodeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastStableMapCenterRef = useRef<{ lat: number; lng: number } | null>(null)
  /** Endpoint whose coordinates were last set (search pick, drag/reverse, or recenter) — used after route fitBounds. */
  const lastLocationSetRef = useRef<'from' | 'to'>('from')
  const mapNode = useRef<HTMLDivElement | null>(null)
  const activeFieldRef = useRef<'from' | 'to'>('from')
  const [activeField, setActiveField] = useState<'from' | 'to'>('from')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([])

  activeFieldRef.current = activeField

  const distanceKm = useMemo(
    () => haversine(draft.fromLat, draft.fromLon, draft.toLat, draft.toLon),
    [draft.fromLat, draft.fromLon, draft.toLat, draft.toLon]
  )
  const [roadRoute, setRoadRoute] = useState<{ km: number; min: number } | null>(null)

  // One Leaflet map per BookingPage mount; draft is from this mount (restored via sessionStorage when returning from Förboka).
  useEffect(() => {
    if (!mapNode.current || mapRef.current) return
    const {
      fromAddress,
      toAddress,
      fromLat: initFromLat,
      fromLon: initFromLon
    } = draft
    const skipFirstMoveEnd = fromAddress.trim().length > 0 && toAddress.trim().length > 0
    const bothAddressesEmpty = !fromAddress.trim() && !toAddress.trim()
    skipReverseOnMoveEndRef.current = skipFirstMoveEnd || bothAddressesEmpty
    const map = L.map(mapNode.current).setView([initFromLat, initFromLon], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)
    {
      const c0 = map.getCenter()
      lastStableMapCenterRef.current = { lat: c0.lat, lng: c0.lng }
    }
    map.on('moveend', () => {
      const cNow = map.getCenter()
      if (skipReverseOnMoveEndRef.current) {
        skipReverseOnMoveEndRef.current = false
        lastStableMapCenterRef.current = { lat: cNow.lat, lng: cNow.lng }
      }
    })
    const scheduleReverseAfterPan = () => {
      if (reverseGeocodeDebounceRef.current != null) clearTimeout(reverseGeocodeDebounceRef.current)
      reverseGeocodeDebounceRef.current = window.setTimeout(() => {
        reverseGeocodeDebounceRef.current = null
        void (async () => {
          const center = map.getCenter()
          const field = activeFieldRef.current
          try {
            const url =
              `${API_URL}/api/public/geocode/reverse?lat=${center.lat}&lon=${center.lng}` +
              `&zoom=${REVERSE_GEOCODE_DETAIL_ZOOM}`
            const res = await fetch(url, { headers: { Accept: 'application/json' } })
            if (!res.ok) return
            const data = (await res.json()) as NominatimResult
            const address =
              formatNominatimAddress(data) ||
              data.display_name ||
              `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`
            lastStableMapCenterRef.current = { lat: center.lat, lng: center.lng }
            lastLocationSetRef.current = field
            if (field === 'from') {
              setDraft((d) => ({
                ...d,
                fromAddress: address,
                fromLat: center.lat,
                fromLon: center.lng
              }))
            } else {
              setDraft((d) => ({
                ...d,
                toAddress: address,
                toLat: center.lat,
                toLon: center.lng
              }))
            }
          } catch {
            // no-op
          }
        })()
      }, 550)
    }
    map.on('dragend', () => {
      scheduleReverseAfterPan()
    })

    const addressPinIcon = L.divIcon({
      className: 'booking-pin-leaflet',
      html: '<div class="booking-pin-wrap"><div class="booking-pin-shape"></div></div>',
      iconSize: [28, 40],
      iconAnchor: [14, 40],
      popupAnchor: [0, -36]
    })
    addressPinRef.current = L.marker([initFromLat, initFromLon], {
      icon: addressPinIcon,
      interactive: false,
      keyboard: false,
      zIndexOffset: 600
    }).addTo(map)

    mapRef.current = map

    if (bothAddressesEmpty && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const m = mapRef.current
          if (!m) return
          const { latitude, longitude } = pos.coords
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
          programmaticCameraRef.current = true
          skipReverseOnMoveEndRef.current = true
          m.setView([latitude, longitude], 17)
          window.setTimeout(() => {
            programmaticCameraRef.current = false
          }, 80)
        },
        () => {
          /* keep default map center; permission denied or timeout */
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 }
      )
    }

    return () => {
      if (reverseGeocodeDebounceRef.current != null) clearTimeout(reverseGeocodeDebounceRef.current)
      reverseGeocodeDebounceRef.current = null
      addressPinRef.current = null
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map init only on mount; do not recreate when draft updates
  }, [setDraft])

  useEffect(() => {
    const marker = addressPinRef.current
    if (!marker) return
    const lat = activeField === 'from' ? draft.fromLat : draft.toLat
    const lon = activeField === 'from' ? draft.fromLon : draft.toLon
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      marker.setOpacity(0)
      return
    }
    marker.setLatLng([lat, lon])
    marker.setOpacity(1)
  }, [activeField, draft.fromLat, draft.fromLon, draft.toLat, draft.toLon])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const clearRouteLine = () => {
      if (routeLineRef.current) {
        map.removeLayer(routeLineRef.current)
        routeLineRef.current = null
      }
    }

    if (!draft.fromAddress.trim() || !draft.toAddress.trim()) {
      clearRouteLine()
      setRoadRoute(null)
      return
    }

    const { fromLat, fromLon, toLat, toLon } = draft
    if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) {
      clearRouteLine()
      setRoadRoute(null)
      return
    }
    if (haversine(fromLat, fromLon, toLat, toLon) < 0.02) {
      clearRouteLine()
      setRoadRoute(null)
      return
    }

    const ac = new AbortController()
    const debounceId = window.setTimeout(() => {
      void (async () => {
        try {
          const url =
            `${API_URL}/api/public/route/driving?fromLat=${encodeURIComponent(String(fromLat))}` +
            `&fromLon=${encodeURIComponent(String(fromLon))}&toLat=${encodeURIComponent(String(toLat))}` +
            `&toLon=${encodeURIComponent(String(toLon))}`
          const res = await fetch(url, {
            signal: ac.signal,
            headers: { Accept: 'application/json' }
          })
          if (!res.ok) {
            clearRouteLine()
            setRoadRoute(null)
            return
          }
          const data = (await res.json()) as OsrmRouteResponse
          const rte = data.routes?.[0]
          const coords = rte?.geometry?.coordinates
          if (data.code !== 'Ok' || !rte || !coords?.length) {
            clearRouteLine()
            setRoadRoute(null)
            return
          }
          const latlngs: L.LatLngExpression[] = coords.map((c) => [c[1], c[0]] as L.LatLngTuple)
          clearRouteLine()
          const line = L.polyline(latlngs, {
            color: '#38bdf8',
            weight: 5,
            opacity: 0.9,
            lineJoin: 'round'
          }).addTo(map)
          routeLineRef.current = line
          setRoadRoute({ km: rte.distance / 1000, min: Math.max(1, Math.round(rte.duration / 60)) })
          const d = draftRef.current
          if (d.fromAddress.trim().length > 0 && d.toAddress.trim().length > 0) {
            if (reverseGeocodeDebounceRef.current != null) clearTimeout(reverseGeocodeDebounceRef.current)
            reverseGeocodeDebounceRef.current = null
            programmaticCameraRef.current = true
            skipReverseOnMoveEndRef.current = true
            logBookingMap('route fitBounds start; zoom recenter suppressed until fit + pan complete')
            map.fitBounds(line.getBounds(), { padding: [32, 32], maxZoom: 15 })
            let routeCameraDone = false
            const finishRouteCamera = () => {
              if (routeCameraDone) return
              routeCameraDone = true
              const field = lastLocationSetRef.current
              const cur = draftRef.current
              const lat = field === 'from' ? cur.fromLat : cur.toLat
              const lon = field === 'from' ? cur.fromLon : cur.toLon
              logBookingMap(
                `route camera: moveend/fallback — pan to lastLocationSet=${field} → [${Number.isFinite(lat) ? lat.toFixed(5) : '?'},${Number.isFinite(lon) ? lon.toFixed(5) : '?'}]`
              )
              if (Number.isFinite(lat) && Number.isFinite(lon)) {
                skipReverseOnMoveEndRef.current = true
                map.panTo([lat, lon], { animate: false, noMoveStart: true })
                lastStableMapCenterRef.current = { lat, lng: lon }
              }
              window.setTimeout(() => {
                programmaticCameraRef.current = false
                logBookingMap('programmaticCamera cleared — user zoom will recenter again')
              }, 80)
            }
            map.once('moveend', finishRouteCamera)
            window.setTimeout(finishRouteCamera, 700)
          }
        } catch (e) {
          const name = e instanceof Error ? e.name : ''
          if (name === 'AbortError') return
          clearRouteLine()
          setRoadRoute(null)
        }
      })()
    }, 450)

    return () => {
      window.clearTimeout(debounceId)
      ac.abort()
      const m = mapRef.current
      if (m && routeLineRef.current) {
        m.removeLayer(routeLineRef.current)
        routeLineRef.current = null
      }
    }
  }, [draft.fromAddress, draft.toAddress, draft.fromLat, draft.fromLon, draft.toLat, draft.toLon])

  useEffect(() => {
    const id = setTimeout(async () => {
      const q = query.normalize('NFC').trim()
      if (q.length < 3) {
        setSearchResults([])
        return
      }
      const url = `${API_URL}/api/public/geocode/search?q=${encodeURIComponent(q)}&limit=10&countrycodes=se`
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } })
        if (!res.ok) {
          setSearchResults([])
          return
        }
        const data = (await res.json()) as NominatimResult[]
        const list = Array.isArray(data) ? dedupeNominatimResults(data).slice(0, 5) : []
        setSearchResults(list)
      } catch {
        setSearchResults([])
      }
    }, 350)
    return () => clearTimeout(id)
  }, [query])

  function recenterMapOnField(field: 'from' | 'to') {
    const m = mapRef.current
    if (!m) return
    const d = draftRef.current
    const lat = field === 'from' ? d.fromLat : d.toLat
    const lon = field === 'from' ? d.fromLon : d.toLon
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    if (reverseGeocodeDebounceRef.current != null) {
      clearTimeout(reverseGeocodeDebounceRef.current)
      reverseGeocodeDebounceRef.current = null
    }
    programmaticCameraRef.current = true
    skipReverseOnMoveEndRef.current = true
    m.setView([lat, lon], m.getZoom())
    lastStableMapCenterRef.current = { lat, lng: lon }
    lastLocationSetRef.current = field
    window.setTimeout(() => {
      programmaticCameraRef.current = false
    }, 80)
  }

  function applySearchResult(item: NominatimResult) {
    const lat = Number(item.lat)
    const lon = Number(item.lon)
    if (reverseGeocodeDebounceRef.current != null) clearTimeout(reverseGeocodeDebounceRef.current)
    reverseGeocodeDebounceRef.current = null
    programmaticCameraRef.current = true
    skipReverseOnMoveEndRef.current = true
    mapRef.current?.setView([lat, lon], 15)
    lastStableMapCenterRef.current = { lat, lng: lon }
    lastLocationSetRef.current = activeField
    window.setTimeout(() => {
      programmaticCameraRef.current = false
    }, 80)
    const label = formatNominatimAddress(item) || item.display_name
    if (activeField === 'from') {
      setDraft((d) => ({ ...d, fromAddress: label, fromLat: lat, fromLon: lon }))
    } else {
      setDraft((d) => ({ ...d, toAddress: label, toLat: lat, toLon: lon }))
    }
    setSearchResults([])
    setQuery('')
  }

  function goForboka() {
    if (!draft.fromAddress.trim() || !draft.toAddress.trim()) {
      onToast(t('booking.fillBoth'))
      return
    }
    navigate('/app/forboka')
  }

  async function bookAkaNu() {
    if (!draft.fromAddress.trim() || !draft.toAddress.trim()) {
      onToast(t('booking.fillBoth'))
      return
    }
    const scheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    try {
      const ride = await api<RideResponse>('/api/rides', {
        method: 'POST',
        token,
        body: JSON.stringify({
          fromAddress: draft.fromAddress,
          fromLat: draft.fromLat,
          fromLon: draft.fromLon,
          toAddress: draft.toAddress,
          toLat: draft.toLat,
          toLon: draft.toLon,
          scheduledAt
        })
      })
      clearBookingDraft()
      navigate('/app/bekraftelse', { state: { ride } })
    } catch (err) {
      onToast(bookingApiErrorMessage(err, t))
    }
  }

  return (
    <div className="booking-layout">
      <div className="map-hero">
        <div ref={mapNode} className="map map-hero-map" />
      </div>
      <div className="booking-sheet">
        <h2 className="sheet-title">{t('booking.planTrip')}</h2>
        <div className="address-flow">
          <div className="address-line" aria-hidden />
          <div className="address-fields">
            <div className="field-wrap">
              <input
                className="sheet-input"
                value={draft.fromAddress}
                placeholder={t('booking.pickupPlaceholder')}
                aria-label={t('booking.pickupAria')}
                onFocus={() => {
                  setActiveField('from')
                  setQuery(draft.fromAddress)
                  recenterMapOnField('from')
                }}
                onChange={(e) => {
                  setActiveField('from')
                  const v = e.target.value
                  setDraft((d) => ({ ...d, fromAddress: v }))
                  setQuery(v)
                }}
              />
              {draft.fromAddress && (
                <button
                  type="button"
                  className="field-clear"
                  aria-label={t('booking.clearPickup')}
                  onClick={() => setDraft((d) => ({ ...d, fromAddress: '' }))}
                >
                  ×
                </button>
              )}
            </div>
            <div className="field-wrap">
              <input
                className="sheet-input"
                value={draft.toAddress}
                placeholder={t('booking.destinationPlaceholder')}
                aria-label={t('booking.destinationAria')}
                onFocus={() => {
                  setActiveField('to')
                  setQuery(draft.toAddress)
                  recenterMapOnField('to')
                }}
                onChange={(e) => {
                  setActiveField('to')
                  const v = e.target.value
                  setDraft((d) => ({ ...d, toAddress: v }))
                  setQuery(v)
                }}
              />
              {draft.toAddress && (
                <button
                  type="button"
                  className="field-clear"
                  aria-label={t('booking.clearDestination')}
                  onClick={() => setDraft((d) => ({ ...d, toAddress: '' }))}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>
        {searchResults.length > 0 && query.normalize('NFC').trim().length >= 3 && (
          <ul className="search-list sheet-search">
            {searchResults.map((item, idx) => (
              <li key={`${item.lat}-${item.lon}-${idx}`}>
                <button type="button" onClick={() => applySearchResult(item)}>
                  {formatNominatimAddress(item) || item.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="dist-hint">
          {roadRoute
            ? t('booking.roadRoute', { km: roadRoute.km.toFixed(1), min: roadRoute.min })
            : t('booking.distanceKm', { km: distanceKm.toFixed(2) })}
        </p>
        {roadRoute && <p className="dist-hint dist-hint-sub">{t('booking.routingAttribution')}</p>}
        <div className="booking-actions">
          <button type="button" className="btn btn-outline" onClick={goForboka}>
            {t('booking.forboka')}
          </button>
          <button type="button" className="btn btn-aka-nu" onClick={bookAkaNu}>
            {t('booking.akaNu')}
          </button>
        </div>
      </div>
    </div>
  )
}

function PreBookPage({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const { t, locale, ta } = useI18n()
  const navigate = useNavigate()
  const { draft, clearBookingDraft } = useBookingDraft()
  const [cursor, setCursor] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  })
  const [pickHour, setPickHour] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000)
    return d.getHours()
  })
  const [pickMinute, setPickMinute] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000)
    return d.getMinutes()
  })
  const [timePickerOpen, setTimePickerOpen] = useState(false)

  const selectedDay = useMemo(() => cursor.getDate(), [cursor])

  const dateLocale = locale === 'en' ? 'en-GB' : 'sv-SE'
  const monthLabel = cursor.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })
  const bigLabel = cursor.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })

  const { daysInMonth, startPad, year, month } = useMemo(() => {
    const y = cursor.getFullYear()
    const m = cursor.getMonth()
    const first = new Date(y, m, 1)
    const dim = new Date(y, m + 1, 0).getDate()
    const start = (first.getDay() + 6) % 7
    return { daysInMonth: dim, startPad: start, year: y, month: m }
  }, [cursor])

  function prevMonth() {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
  }

  function nextMonth() {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
  }

  function pickDay(day: number) {
    setCursor(new Date(year, month, day))
  }

  async function onFortsatt() {
    if (!draft.fromAddress.trim() || !draft.toAddress.trim()) {
      onToast(t('prebook.missingAddresses'))
      navigate('/app')
      return
    }
    const when = new Date(year, month, selectedDay, pickHour, pickMinute, 0, 0)
    if (when.getTime() <= Date.now()) {
      onToast(t('prebook.futureTime'))
      return
    }
    try {
      const ride = await api<RideResponse>('/api/rides', {
        method: 'POST',
        token,
        body: JSON.stringify({
          fromAddress: draft.fromAddress,
          fromLat: draft.fromLat,
          fromLon: draft.fromLon,
          toAddress: draft.toAddress,
          toLat: draft.toLat,
          toLon: draft.toLon,
          scheduledAt: when.toISOString()
        })
      })
      clearBookingDraft()
      navigate('/app/bekraftelse', { state: { ride } })
    } catch (err) {
      onToast(bookingApiErrorMessage(err, t))
    }
  }

  const sweDays = ta('prebook.weekdayLetters')

  return (
    <div className="prebook-screen">
      <header className="prebook-header">
        <button type="button" className="link-back" onClick={() => navigate('/app')}>
          {t('prebook.back')}
        </button>
        <h1 className="prebook-title">{t('prebook.title')}</h1>
        <p className="prebook-sub">{t('prebook.subtitle')}</p>
      </header>
      <p className="prebook-bigdate">{bigLabel}</p>
      <div className="calendar-nav">
        <span className="calendar-month">{monthLabel}</span>
        <div className="calendar-arrows">
          <button type="button" onClick={prevMonth} aria-label={t('prebook.prevMonthAria')}>
            ‹
          </button>
          <button type="button" onClick={nextMonth} aria-label={t('prebook.nextMonthAria')}>
            ›
          </button>
        </div>
      </div>
      <div className="calendar-grid-head">
        {sweDays.map((d, i) => (
          <span key={`dow-${i}`}>{d}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {Array.from({ length: startPad }).map((_, i) => (
          <span key={`pad-${i}`} className="cal-cell empty" />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
          <button
            key={day}
            type="button"
            className={`cal-cell day ${day === selectedDay ? 'selected' : ''}`}
            onClick={() => pickDay(day)}
          >
            {day}
          </button>
        ))}
      </div>
      <div className="time-row">
        <span>{t('prebook.time')}</span>
        <button
          type="button"
          className="time-24h-pill time-24h-pill-trigger"
          aria-label={t('prebook.timePickerOpen')}
          aria-haspopup="dialog"
          aria-expanded={timePickerOpen}
          onClick={() => setTimePickerOpen(true)}
        >
          <span className="time-trigger-h">{String(pickHour).padStart(2, '0')}</span>
          <span className="time-sep" aria-hidden>
            :
          </span>
          <span className="time-trigger-m">{String(pickMinute).padStart(2, '0')}</span>
        </button>
      </div>
      <Clock24hTimePicker
        open={timePickerOpen}
        onClose={() => setTimePickerOpen(false)}
        onConfirm={(h, m) => {
          setPickHour(h)
          setPickMinute(m)
        }}
        initialHour={pickHour}
        initialMinute={pickMinute}
        title={t('prebook.timePickerTitle')}
        cancelLabel={t('prebook.timePickerCancel')}
        okLabel={t('common.ok')}
        keyboardAria={t('prebook.timePickerKeyboard')}
        keyboardHourLabel={t('prebook.timePickerHourField')}
        keyboardMinuteLabel={t('prebook.timePickerMinuteField')}
      />
      <button type="button" className="btn btn-fortsatt" onClick={onFortsatt}>
        {t('prebook.continue')}
      </button>
    </div>
  )
}

function BookingConfirmPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { state } = useLocation()
  const ride = (state as { ride?: RideResponse } | null)?.ride

  useEffect(() => {
    if (!ride) navigate('/app', { replace: true })
  }, [ride, navigate])

  if (!ride) return null

  return (
    <div className="confirm-screen">
      <h1 className="confirm-title">{t('confirm.title')}</h1>
      <div className="confirm-card">
        <p>
          <strong>{t('confirm.from')}</strong> {ride.fromAddress}
        </p>
        <p>
          <strong>{t('confirm.to')}</strong> {ride.toAddress}
        </p>
        <p>
          <strong>{t('confirm.time')}</strong> {formatYmdHm(ride.scheduledAt)}
        </p>
        <p className="tiny">
          {t('confirm.rideId')} {ride.id}
        </p>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => navigate('/app')}>
        {t('common.ok')}
      </button>
    </div>
  )
}

function MyRidesPage({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const { t, locale } = useI18n()
  const [upcoming, setUpcoming] = useState<RideResponse[]>([])
  const [history, setHistory] = useState<RideResponse[]>([])
  const dateLocale = locale === 'en' ? 'en-GB' : 'sv-SE'

  async function load() {
    const up = await api<RideResponse[]>('/api/rides/my?history=false', { token })
    const hist = await api<RideResponse[]>('/api/rides/my?history=true', { token })
    setUpcoming(up)
    setHistory(hist)
  }

  useEffect(() => {
    load()
    const id = window.setInterval(load, 15000)
    return () => window.clearInterval(id)
  }, [])

  async function cancel(rideId: number, status: string) {
    const reason =
      status === 'PENDING_OPEN' ? t('rides.cancelReason') : t('rides.cancelReasonAfterAccept')
    try {
      await api(`/api/rides/${rideId}/cancel`, {
        method: 'POST',
        token,
        body: JSON.stringify({ reason })
      })
      onToast(t('rides.cancelledToast'))
    } catch (err) {
      onToast(getErrorMessage(err) || t('errors.generic'))
    } finally {
      await load()
    }
  }

  async function share(rideId: number) {
    const res = await api<{ url: string }>(`/api/rides/${rideId}/share`, { method: 'POST', token })
    await navigator.clipboard.writeText(res.url)
    onToast(t('rides.shareCopiedToast'))
  }

  async function feedback(rideId: number) {
    await api(`/api/rides/${rideId}/feedback`, {
      method: 'POST',
      token,
      body: JSON.stringify({ stars: 5, comment: t('rides.feedbackComment') })
    })
    onToast(t('rides.feedbackThanksToast'))
  }

  async function deleteRide(rideId: number) {
    await api(`/api/rides/${rideId}`, { method: 'DELETE', token })
    onToast(t('rides.deletedToast'))
    load()
  }

  const canDeleteFromList = (ride: RideResponse) =>
    ride.status === 'CANCELLED' || ride.status === 'REJECTED'

  const canPassengerCancel = (ride: RideResponse) =>
    ride.status === 'PENDING_OPEN' ||
    ride.status === 'ACCEPTED' ||
    ride.status === 'IN_PROGRESS'

  const canShareLiveTrip = (ride: RideResponse) =>
    ride.status === 'PENDING_OPEN' ||
    ride.status === 'ACCEPTED' ||
    ride.status === 'IN_PROGRESS'

  return (
    <div className="subpage-wrap stack">
      <Link className="link-back" to="/app">
        {t('rides.backToBooking')}
      </Link>
      <div className="card">
        <h3>{t('rides.upcoming')}</h3>
        <p className="rides-share-hint">{t('rides.shareTripHint')}</p>
        {upcoming.length === 0 && <p>{t('rides.noUpcoming')}</p>}
        {upcoming.map((ride) => (
          <article key={ride.id} className="ride-item">
            <p>
              <strong>{ride.fromAddress}</strong> {t('rides.toWord')} <strong>{ride.toAddress}</strong>
            </p>
            <p>
              {formatLocaleDateTime24h(ride.scheduledAt, dateLocale)} - {ride.status}
            </p>
            {ride.etaMinutes && <p>{t('rides.eta', { min: ride.etaMinutes })}</p>}
            <div className="row">
              {canPassengerCancel(ride) && (
                <button type="button" onClick={() => cancel(ride.id, ride.status)} className="btn btn-danger">
                  {t('rides.cancel')}
                </button>
              )}
              {canDeleteFromList(ride) && (
                <button type="button" onClick={() => deleteRide(ride.id)} className="btn btn-danger">
                  {t('rides.delete')}
                </button>
              )}
              {canShareLiveTrip(ride) && (
                <button type="button" title={t('rides.shareTripHint')} onClick={() => share(ride.id)} className="btn">
                  {t('rides.shareTrip')}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="card">
        <h3>{t('rides.history')}</h3>
        {history.length === 0 && <p>{t('rides.noHistory')}</p>}
        {history.map((ride) => (
          <article key={ride.id} className="ride-item">
            <p>
              {ride.fromAddress} {t('rides.toWord')} {ride.toAddress}
            </p>
            <p>
              {formatLocaleDateTime24h(ride.scheduledAt, dateLocale)} - {ride.status}
            </p>
            <div className="row">
              {ride.status === 'COMPLETED' && (
                <button type="button" className="btn" onClick={() => feedback(ride.id)}>
                  {t('rides.thanksStars')}
                </button>
              )}
              {canDeleteFromList(ride) && (
                <button type="button" onClick={() => deleteRide(ride.id)} className="btn btn-danger">
                  {t('rides.delete')}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function DriverPage({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const { t, locale } = useI18n()
  const [myRides, setMyRides] = useState<RideResponse[]>([])
  const [openRides, setOpenRides] = useState<RideResponse[]>([])
  const [stats, setStats] = useState<{ completedRides: number; acceptedRides: number } | null>(null)
  const watchId = useRef<number | null>(null)
  const dateLocale = locale === 'en' ? 'en-GB' : 'sv-SE'

  async function load() {
    const [mine, rides, statsRes] = await Promise.all([
      api<RideResponse[]>('/api/driver/rides/mine', { token }),
      api<RideResponse[]>('/api/driver/rides/open', { token }),
      api<{ completedRides: number; acceptedRides: number }>('/api/driver/stats', { token })
    ])
    setMyRides(mine)
    setOpenRides(rides)
    setStats(statsRes)
  }

  useEffect(() => {
    load()
    const id = window.setInterval(load, 10000)
    return () => {
      window.clearInterval(id)
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  async function accept(rideId: number) {
    await api(`/api/driver/rides/${rideId}/accept`, { method: 'POST', token })
    onToast(t('driver.toastAccepted'))
    load()
  }

  async function refuse(rideId: number) {
    await api(`/api/driver/rides/${rideId}/refuse`, {
      method: 'POST',
      token,
      body: JSON.stringify({ comment: t('driver.refuseComment') })
    })
    onToast(t('driver.toastRefused'))
    load()
  }

  async function unaccept(rideId: number) {
    await api(`/api/driver/rides/${rideId}/unaccept`, { method: 'POST', token })
    onToast(t('driver.toastUnaccept'))
    load()
  }

  async function startDriving(rideId: number) {
    await api(`/api/driver/rides/${rideId}/start`, { method: 'POST', token })
    onToast(t('driver.toastStartDriving'))
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = navigator.geolocation.watchPosition(async (pos) => {
      await api(`/api/driver/rides/${rideId}/location`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        })
      })
    })
    load()
  }

  async function complete(rideId: number) {
    await api(`/api/driver/rides/${rideId}/complete`, { method: 'POST', token })
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    onToast(t('driver.toastComplete'))
    load()
  }

  async function setupPush() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      onToast(t('driver.pushNotSupported'))
      return
    }
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      onToast(t('driver.pushDenied'))
      return
    }
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const { publicKey } = await api<{ publicKey: string }>('/api/public/push-config')
    if (!publicKey) {
      onToast(t('driver.pushMissingKey'))
      return
    }
    const sub = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    })
    const json = sub.toJSON()
    await api('/api/push/subscriptions', {
      method: 'POST',
      token,
      body: JSON.stringify({
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        userAgent: navigator.userAgent
      })
    })
    onToast(t('driver.pushEnabled'))
  }

  return (
    <div className="subpage-wrap stack">
      <div className="card">
        <h3>{t('driver.panel')}</h3>
        <div className="row">
          <button className="btn" onClick={load}>
            {t('driver.refresh')}
          </button>
          <button className="btn" onClick={setupPush}>
            {t('driver.enablePush')}
          </button>
        </div>
        {stats && (
          <p>
            {t('driver.stats', { completed: stats.completedRides, accepted: stats.acceptedRides })}
          </p>
        )}
      </div>
      <div className="card">
        <h3>{t('driver.myRides')}</h3>
        {myRides.length === 0 && <p>{t('driver.noMyRides')}</p>}
        {myRides.map((ride) => (
          <article key={ride.id} className="ride-item">
            <p>
              <strong>{ride.fromAddress}</strong> {t('rides.toWord')} <strong>{ride.toAddress}</strong>
            </p>
            <p>
              {formatLocaleDateTime24h(ride.scheduledAt, dateLocale)} — {ride.status}
            </p>
            {ride.etaMinutes != null && ride.etaMinutes > 0 && (
              <p>{t('rides.eta', { min: ride.etaMinutes })}</p>
            )}
            <div className="row">
              {ride.status === 'ACCEPTED' && (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => startDriving(ride.id)}>
                    {t('driver.startDriving')}
                  </button>
                  <button type="button" className="btn" onClick={() => unaccept(ride.id)}>
                    {t('driver.unaccept')}
                  </button>
                </>
              )}
              {ride.status === 'IN_PROGRESS' && (
                <button type="button" className="btn btn-primary" onClick={() => complete(ride.id)}>
                  {t('driver.complete')}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="card">
        <h3>{t('driver.openRides')}</h3>
        {openRides.length === 0 && <p>{t('driver.noOpenRides')}</p>}
        {openRides.map((ride) => (
          <article key={ride.id} className="ride-item">
            <p>
              <strong>{ride.fromAddress}</strong> {t('rides.toWord')} <strong>{ride.toAddress}</strong>
            </p>
            <p>{formatLocaleDateTime24h(ride.scheduledAt, dateLocale)}</p>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => accept(ride.id)}>
                {t('driver.accept')}
              </button>
              <button type="button" className="btn" onClick={() => refuse(ride.id)}>
                {t('driver.refuse')}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

type AdminUserRow = {
  id: number
  fullName: string
  email: string
  role: string
  mustChangePassword: boolean
  hasLocalPassword: boolean
  enabled: boolean
}

function AdminPage({
  token,
  currentUserId,
  onToast
}: {
  token: string
  currentUserId: number
  onToast: (m: string) => void
}) {
  const { t } = useI18n()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [rideIdToDelete, setRideIdToDelete] = useState('')

  async function load() {
    const list = await api<AdminUserRow[]>('/api/admin/users', { token })
    setUsers(list)
  }

  useEffect(() => {
    load()
  }, [])

  async function promoteDriver(userId: number) {
    await api(`/api/admin/users/${userId}/promote-driver`, { method: 'POST', token })
    onToast(t('admin.toastPromoted'))
    load()
  }

  async function promoteAdmin(userId: number) {
    await api(`/api/admin/users/${userId}/promote-admin`, { method: 'POST', token })
    onToast(t('admin.toastPromotedAdmin'))
    load()
  }

  async function demoteAdminToDriver(userId: number) {
    await api(`/api/admin/users/${userId}/demote-admin-to-driver`, { method: 'POST', token })
    onToast(t('admin.toastDemotedAdminToDriver'))
    load()
  }

  async function demoteToUser(userId: number) {
    await api(`/api/admin/users/${userId}/demote-user`, { method: 'POST', token })
    onToast(t('admin.toastDemoted'))
    load()
  }

  async function forcePassword(userId: number) {
    await api(`/api/admin/users/${userId}/force-password-change`, {
      method: 'POST',
      token,
      body: JSON.stringify({ mustChangePassword: true })
    })
    onToast(t('admin.toastForcePw'))
    load()
  }

  async function setBlocked(userId: number, enabled: boolean) {
    await api(`/api/admin/users/${userId}/enabled`, {
      method: 'POST',
      token,
      body: JSON.stringify({ enabled })
    })
    onToast(enabled ? t('admin.toastUnblocked') : t('admin.toastBlocked'))
    load()
  }

  async function deleteUser(userId: number) {
    if (!window.confirm(t('admin.deleteUserConfirm'))) return
    await api(`/api/admin/users/${userId}`, { method: 'DELETE', token })
    onToast(t('admin.toastUserDeleted'))
    load()
  }

  async function deleteRide() {
    await api(`/api/admin/rides/${rideIdToDelete}`, { method: 'DELETE', token })
    onToast(t('admin.toastRideDeleted'))
  }

  return (
    <div className="subpage-wrap stack">
      <div className="card">
        <h3>{t('admin.users')}</h3>
        {users.map((u) => {
          const isSelf = u.id === currentUserId
          return (
            <article key={u.id} className="ride-item">
              <p>
                <strong>{u.fullName}</strong> ({u.email}) — {u.role}
                {!u.enabled && <span className="admin-badge-blocked"> {t('admin.blocked')}</span>}
                {u.mustChangePassword && u.hasLocalPassword && (
                  <span className="admin-badge-pw"> {t('admin.mustChangePwBadge')}</span>
                )}
              </p>
              <div className="row admin-user-actions">
                {u.role === 'USER' && (
                  <button type="button" className="btn" onClick={() => promoteDriver(u.id)}>
                    {t('admin.promote')}
                  </button>
                )}
                {u.role !== 'ADMIN' && (
                  <button type="button" className="btn" onClick={() => promoteAdmin(u.id)}>
                    {t('admin.promoteAdmin')}
                  </button>
                )}
                {u.role === 'ADMIN' && (
                  <button type="button" className="btn" onClick={() => demoteAdminToDriver(u.id)} disabled={isSelf}>
                    {t('admin.demoteAdminToDriver')}
                  </button>
                )}
                {(u.role === 'DRIVER' || u.role === 'ADMIN') && (
                  <button type="button" className="btn" onClick={() => demoteToUser(u.id)} disabled={isSelf}>
                    {t('admin.demote')}
                  </button>
                )}
                {u.hasLocalPassword && (
                  <button type="button" className="btn" onClick={() => forcePassword(u.id)}>
                    {t('admin.forcePassword')}
                  </button>
                )}
                {u.enabled ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setBlocked(u.id, false)}
                    disabled={isSelf}
                  >
                    {t('admin.blockUser')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => setBlocked(u.id, true)}>
                    {t('admin.unblockUser')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => deleteUser(u.id)}
                  disabled={isSelf}
                >
                  {t('admin.deleteUser')}
                </button>
              </div>
            </article>
          )
        })}
      </div>
      <div className="card">
        <h3>{t('admin.deleteRideTitle')}</h3>
        <input
          value={rideIdToDelete}
          onChange={(e) => setRideIdToDelete(e.target.value)}
          placeholder={t('admin.rideIdPlaceholder')}
        />
        <button className="btn btn-danger" onClick={deleteRide}>
          {t('admin.deleteRideBtn')}
        </button>
      </div>
    </div>
  )
}

function HelpPage() {
  const { t, ta } = useI18n()
  return (
    <section className="card subpage-wrap">
      <div className="help-install-callout">
        <h3 className="help-install-callout-title">{t('pwa.helpCalloutTitle')}</h3>
        <p className="help-install-callout-lead">{t('pwa.helpCalloutLead')}</p>
        <ul className="install-modal-steps">
          <li>{t('pwa.manualIos')}</li>
          <li>{t('pwa.manualAndroid')}</li>
          <li>{t('pwa.manualDesktop')}</li>
        </ul>
      </div>
      <h3>{t('help.title')}</h3>
      <ul>
        {ta('help.items').map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <p className="tiny">{t('help.footer')}</p>
    </section>
  )
}

function normalizeStoredAuth(parsed: AuthResponse): AuthResponse {
  return {
    ...parsed,
    user: {
      ...parsed.user,
      hasLocalPassword:
        typeof parsed.user.hasLocalPassword === 'boolean' ? parsed.user.hasLocalPassword : true
    }
  }
}

function useLocalAuth(): [AuthResponse | null, (next: AuthResponse | null) => void] {
  const [value, setValue] = useState<AuthResponse | null>(() => {
    const raw = localStorage.getItem('farfartaxi-auth')
    if (!raw) return null
    try {
      return normalizeStoredAuth(JSON.parse(raw) as AuthResponse)
    } catch {
      return null
    }
  })
  const set = (next: AuthResponse | null) => {
    setValue(next)
    if (!next) localStorage.removeItem('farfartaxi-auth')
    else localStorage.setItem('farfartaxi-auth', JSON.stringify(next))
  }
  return [value, set]
}

async function api<T = unknown>(
  path: string,
  opts: { method?: string; token?: string; body?: string } = {}
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`
  const response = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {})
    },
    body: opts.body
  })
  if (!response.ok) {
    let text = `Request failed (${response.status})`
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) text = payload.error
    } catch {
      // ignored
    }
    throw new Error(text)
  }
  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return undefined as T
  return (await response.json()) as T
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message
  return ''
}

/** Maps backend validation text to localized toast copy for booking. */
function bookingApiErrorMessage(
  err: unknown,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  const msg = getErrorMessage(err)
  if (!msg) return t('errors.generic')
  const lower = msg.toLowerCase()
  if (lower.includes('future') || lower.includes('scheduledat')) {
    return t('errors.bookingFuture')
  }
  return t('errors.bookingFailed', { message: msg })
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = deg2rad(lat2 - lat1)
  const dLon = deg2rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function deg2rad(v: number) {
  return v * (Math.PI / 180)
}

export default App
