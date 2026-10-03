import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useI18n } from './i18n/context'
import { PendingApproval } from './components/PendingApproval'
import { schedulePwaInstallPrompt } from './PwaInstallModal'
import { api, registerPendingApprovalHandler } from './api/client'
import {
  REFRESH_AHEAD_MS,
  ensureFreshSession,
  logoutRemote,
  readStoredAuth,
  registerSessionExpiredHandler,
  subscribeAuthChange,
  tokenExpiresWithin,
  AUTH_STORAGE_KEY
} from './lib/session'
import { AppShell } from './shell/AppShell'
import type { AuthResponse, UserView } from './shell/types'
import { registerSW } from 'virtual:pwa-register'

// NOTE (M2 integration): the network/PWA worker moves service-worker registration into main.tsx
// (registerType 'prompt'); remove this call when merging their branch.
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

/** One-shot flag so /login can show session-expired copy after proactive logout. */
const SESSION_EXPIRED_LOGIN_FLASH = 'farfartaxi-session-expired-flash'

function markSessionExpiredLoginFlash() {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_LOGIN_FLASH, '1')
  } catch {
    /* ignore */
  }
}

function notifySessionExpiredLogin(setAuth: Dispatch<SetStateAction<AuthResponse | null>>) {
  markSessionExpiredLoginFlash()
  setAuth(null)
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
  const { t } = useI18n()
  const [auth, setAuth] = useLocalAuth()
  // An expired/expiring stored access token is not a dead session: try the refresh cookie before rendering.
  const [booting, setBooting] = useState(() => {
    const stored = readStoredAuth()
    return !!stored && tokenExpiresWithin(stored.token, REFRESH_AHEAD_MS)
  })

  useEffect(() => {
    registerSessionExpiredHandler(() => notifySessionExpiredLogin(setAuth))
    return () => registerSessionExpiredHandler(undefined)
  }, [setAuth])

  useEffect(() => {
    if (!booting) return
    let cancelled = false
    void ensureFreshSession().finally(() => {
      if (!cancelled) setBooting(false)
    })
    return () => {
      cancelled = true
    }
  }, [booting])

  // Any 403 PENDING_APPROVAL from api() flips the stored user to unapproved.
  useEffect(() => {
    registerPendingApprovalHandler(() =>
      setAuth((prev) =>
        prev && prev.user.approved !== false ? { ...prev, user: { ...prev.user, approved: false } } : prev
      )
    )
    return () => registerPendingApprovalHandler(undefined)
  }, [setAuth])

  const token = auth?.token
  const refreshMe = useCallback(async (): Promise<boolean> => {
    if (!token) return true
    try {
      const me = await api<UserView>('/api/auth/me', { token })
      const approved = me.approved !== false
      setAuth((prev) => (prev ? { ...prev, user: { ...prev.user, ...me, approved } } : prev))
      return approved
    } catch {
      return false
    }
  }, [token, setAuth])

  // Refresh the approval flag when the app starts (stored sessions may be stale).
  useEffect(() => {
    void refreshMe()
  }, [refreshMe])

  if (!auth) {
    return <Navigate to="/login" replace />
  }
  if (booting) {
    return (
      <main className="page page-center" role="status" aria-live="polite">
        <p className="muted">{t('common.signingIn')}</p>
      </main>
    )
  }
  if (auth.user.approved === false) {
    return (
      <PendingApproval
        onRecheck={refreshMe}
        onLogout={async () => {
          await logoutRemote(auth.token)
          setAuth(null)
        }}
      />
    )
  }
  return <AppShell auth={auth} setAuth={setAuth} />
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

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_EXPIRED_LOGIN_FLASH) === '1') {
        sessionStorage.removeItem(SESSION_EXPIRED_LOGIN_FLASH)
        setError(t('errors.sessionExpired'))
      }
    } catch {
      /* ignore */
    }
  }, [t])

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

function normalizeStoredAuth(parsed: AuthResponse): AuthResponse {
  return {
    ...parsed,
    user: {
      ...parsed.user,
      hasLocalPassword:
        typeof parsed.user.hasLocalPassword === 'boolean' ? parsed.user.hasLocalPassword : true,
      approved: typeof parsed.user.approved === 'boolean' ? parsed.user.approved : true
    }
  }
}

function readAuthFromStorage(): AuthResponse | null {
  const stored = readStoredAuth()
  if (!stored) return null
  try {
    return normalizeStoredAuth(stored as unknown as AuthResponse)
  } catch {
    return null
  }
}

function useLocalAuth(): [AuthResponse | null, Dispatch<SetStateAction<AuthResponse | null>>] {
  // An expired access token is kept: the refresh cookie may still be valid (see ProtectedApp / lib/session).
  const [value, setValue] = useState<AuthResponse | null>(readAuthFromStorage)
  // Pick up tokens refreshed by this tab's session logic or by another tab (storage event).
  useEffect(() => subscribeAuthChange(() => setValue(readAuthFromStorage())), [])
  const set = useCallback((next: SetStateAction<AuthResponse | null>) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: AuthResponse | null) => AuthResponse | null)(prev) : next
      if (!resolved) localStorage.removeItem(AUTH_STORAGE_KEY)
      else localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(resolved))
      return resolved
    })
  }, [])
  return [value, set]
}

export default App
