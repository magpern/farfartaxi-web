import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import L from 'leaflet'
import { registerSW } from 'virtual:pwa-register'
import 'leaflet/dist/leaflet.css'

registerSW({ immediate: true })

type Role = 'USER' | 'DRIVER' | 'ADMIN'

type UserView = {
  id: number
  email: string
  fullName: string
  role: Role
  mustChangePassword: boolean
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
  return (
    <main className="page page-center">
      <section className="card hero-card">
        <h1>Farfartaxi</h1>
        <p>Boka familjens tryggaste taxi. Enkel, snabb och mobilanpassad.</p>
        <Link className="btn btn-primary" to="/login">
          Starta
        </Link>
      </section>
    </main>
  )
}

function AuthPage() {
  const navigate = useNavigate()
  const [auth, setAuth] = useLocalAuth()
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    if (auth) {
      navigate('/app', { replace: true })
    }
  }, [auth, navigate])

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
        setAuth(res)
        navigate('/app', { replace: true })
      } else if (mode === 'register') {
        const res = await api<AuthResponse>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, fullName: name })
        })
        setAuth(res)
        navigate('/app', { replace: true })
      } else {
        await api('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email })
        })
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="page page-center">
      <section className="card auth-card">
        <h2>{mode === 'login' ? 'Logga in' : mode === 'register' ? 'Skapa konto' : 'Glomt losenord'}</h2>
        <form onSubmit={submit} className="stack">
          <label>
            E-post
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          {mode !== 'forgot' && (
            <label>
              Lösenord
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
            </label>
          )}
          {mode === 'register' && (
            <label>
              Namn
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? 'Vantar...' : mode === 'forgot' ? 'Skicka länk' : 'Fortsätt'}
          </button>
        </form>
        <div className="auth-links">
          <button onClick={() => setMode('login')} className="link-btn">Logga in</button>
          <button onClick={() => setMode('register')} className="link-btn">Skapa konto</button>
          <button onClick={() => setMode('forgot')} className="link-btn">Glomt losenord</button>
        </div>
      </section>
    </main>
  )
}

function Dashboard({ auth, setAuth }: { auth: AuthResponse; setAuth: (a: AuthResponse | null) => void }) {
  const [tab, setTab] = useState('booking')
  const [toast, setToast] = useState('')

  function logout() {
    setAuth(null)
  }

  return (
    <main className="page app-shell">
      <header className="topbar">
        <div>
          <strong>Farfartaxi</strong>
          <p>
            Hej {auth.user.fullName} ({auth.user.role})
          </p>
        </div>
        <button onClick={logout} className="btn">Logga ut</button>
      </header>
      <nav className="tabs">
        <button className={tab === 'booking' ? 'active' : ''} onClick={() => setTab('booking')}>Boka</button>
        <button className={tab === 'rides' ? 'active' : ''} onClick={() => setTab('rides')}>Mina resor</button>
        <button className={tab === 'help' ? 'active' : ''} onClick={() => setTab('help')}>Hjalp</button>
        {(auth.user.role === 'DRIVER' || auth.user.role === 'ADMIN') && (
          <button className={tab === 'driver' ? 'active' : ''} onClick={() => setTab('driver')}>Forare</button>
        )}
        {auth.user.role === 'ADMIN' && (
          <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>Admin</button>
        )}
      </nav>
      {toast && <div className="toast">{toast}</div>}
      <section className="content">
        {tab === 'booking' && <BookingPage token={auth.token} onToast={setToast} />}
        {tab === 'rides' && <MyRidesPage token={auth.token} onToast={setToast} />}
        {tab === 'help' && <HelpPage />}
        {tab === 'driver' && <DriverPage token={auth.token} onToast={setToast} />}
        {tab === 'admin' && auth.user.role === 'ADMIN' && <AdminPage token={auth.token} onToast={setToast} />}
      </section>
    </main>
  )
}

function BookingPage({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const mapRef = useRef<L.Map | null>(null)
  const mapNode = useRef<HTMLDivElement | null>(null)
  const [activeField, setActiveField] = useState<'from' | 'to'>('from')
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [fromLat, setFromLat] = useState(59.3293)
  const [fromLon, setFromLon] = useState(18.0686)
  const [toLat, setToLat] = useState(59.3346)
  const [toLon, setToLon] = useState(18.0632)
  const [dateTime, setDateTime] = useState(() => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16))
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([])

  const distanceKm = useMemo(() => haversine(fromLat, fromLon, toLat, toLon), [fromLat, fromLon, toLat, toLon])

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return
    const map = L.map(mapNode.current).setView([fromLat, fromLon], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)
    map.on('moveend', async () => {
      const center = map.getCenter()
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${center.lat}&lon=${center.lng}`
        const data = await fetch(url).then((r) => r.json())
        const address = data.display_name ?? `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`
        if (activeField === 'from') {
          setFromAddress(address)
          setFromLat(center.lat)
          setFromLon(center.lng)
        } else {
          setToAddress(address)
          setToLat(center.lat)
          setToLon(center.lng)
        }
      } catch {
        // no-op
      }
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [activeField, fromLat, fromLon])

  useEffect(() => {
    const id = setTimeout(async () => {
      if (query.length < 3) {
        setSearchResults([])
        return
      }
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`
      const data = await fetch(url).then((r) => r.json())
      setSearchResults(data)
    }, 350)
    return () => clearTimeout(id)
  }, [query])

  async function bookRide() {
    if (!fromAddress || !toAddress) {
      onToast('Valj bade start och destination.')
      return
    }
    await api('/api/rides', {
      method: 'POST',
      token,
      body: JSON.stringify({
        fromAddress,
        fromLat,
        fromLon,
        toAddress,
        toLat,
        toLon,
        scheduledAt: new Date(dateTime).toISOString()
      })
    })
    onToast('Resan ar bokad!')
  }

  return (
    <div className="stack">
      <div className="card">
        <h3>Planera din resa</h3>
        <label>
          Fran
          <input value={fromAddress} onFocus={() => setActiveField('from')} onChange={(e) => setFromAddress(e.target.value)} />
        </label>
        <label>
          Till
          <input value={toAddress} onFocus={() => setActiveField('to')} onChange={(e) => setToAddress(e.target.value)} />
        </label>
        <label>
          Sok adress
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Skriv och valj..."
            aria-label="Sok adress"
          />
        </label>
        {searchResults.length > 0 && (
          <ul className="search-list">
            {searchResults.map((item) => (
              <li key={`${item.lat}-${item.lon}`}>
                <button
                  onClick={() => {
                    const lat = Number(item.lat)
                    const lon = Number(item.lon)
                    mapRef.current?.setView([lat, lon], 15)
                    if (activeField === 'from') {
                      setFromAddress(item.display_name)
                      setFromLat(lat)
                      setFromLon(lon)
                    } else {
                      setToAddress(item.display_name)
                      setToLat(lat)
                      setToLon(lon)
                    }
                    setSearchResults([])
                    setQuery('')
                  }}
                >
                  {item.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <label>
          Datum och tid
          <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} />
        </label>
        <p>Uppskattad rak distans: {distanceKm.toFixed(2)} km</p>
        <button className="btn btn-primary" onClick={bookRide}>Boka (pre-booking)</button>
      </div>
      <div className="map-wrap">
        <div className="center-pin" aria-hidden />
        <div ref={mapNode} className="map" />
      </div>
    </div>
  )
}

function MyRidesPage({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const [upcoming, setUpcoming] = useState<RideResponse[]>([])
  const [history, setHistory] = useState<RideResponse[]>([])

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

  async function cancel(rideId: number) {
    await api(`/api/rides/${rideId}/cancel`, { method: 'POST', token, body: JSON.stringify({ reason: 'User cancelled' }) })
    onToast('Resan avbokad.')
    load()
  }

  async function share(rideId: number) {
    const res = await api<{ url: string }>(`/api/rides/${rideId}/share`, { method: 'POST', token })
    await navigator.clipboard.writeText(res.url)
    onToast('Share-lank kopierad.')
  }

  async function feedback(rideId: number) {
    await api(`/api/rides/${rideId}/feedback`, {
      method: 'POST',
      token,
      body: JSON.stringify({ stars: 5, comment: 'Basta farfar!' })
    })
    onToast('Tack for din feedback!')
  }

  return (
    <div className="stack">
      <div className="card">
        <h3>Kommande resor</h3>
        {upcoming.length === 0 && <p>Inga kommande resor än.</p>}
        {upcoming.map((ride) => (
          <article key={ride.id} className="ride-item">
            <p><strong>{ride.fromAddress}</strong> till <strong>{ride.toAddress}</strong></p>
            <p>{new Date(ride.scheduledAt).toLocaleString()} - {ride.status}</p>
            {ride.etaMinutes && <p>ETA: ~{ride.etaMinutes} min</p>}
            <div className="row">
              {ride.status === 'PENDING_OPEN' && <button onClick={() => cancel(ride.id)} className="btn">Avboka</button>}
              <button onClick={() => share(ride.id)} className="btn">Share trip</button>
            </div>
          </article>
        ))}
      </div>
      <div className="card">
        <h3>Historik</h3>
        {history.length === 0 && <p>Ingen historik än.</p>}
        {history.map((ride) => (
          <article key={ride.id} className="ride-item">
            <p>{ride.fromAddress} till {ride.toAddress}</p>
            <p>{new Date(ride.scheduledAt).toLocaleString()} - {ride.status}</p>
            {ride.status === 'COMPLETED' && <button className="btn" onClick={() => feedback(ride.id)}>Tack + 5★</button>}
          </article>
        ))}
      </div>
    </div>
  )
}

function DriverPage({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const [openRides, setOpenRides] = useState<RideResponse[]>([])
  const [stats, setStats] = useState<{ completedRides: number; acceptedRides: number } | null>(null)
  const watchId = useRef<number | null>(null)

  async function load() {
    const [rides, statsRes] = await Promise.all([
      api<RideResponse[]>('/api/driver/rides/open', { token }),
      api<{ completedRides: number; acceptedRides: number }>('/api/driver/stats', { token })
    ])
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
    onToast('Du accepterade resan.')
    load()
  }

  async function refuse(rideId: number) {
    await api(`/api/driver/rides/${rideId}/refuse`, {
      method: 'POST',
      token,
      body: JSON.stringify({ comment: 'Kan ej just nu' })
    })
    onToast('Resa nekad.')
  }

  async function startDriving(rideId: number) {
    await api(`/api/driver/rides/${rideId}/start`, { method: 'POST', token })
    onToast('Start driving aktiverad.')
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
  }

  async function complete(rideId: number) {
    await api(`/api/driver/rides/${rideId}/complete`, { method: 'POST', token })
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
    onToast('Resan ar klar.')
    load()
  }

  async function setupPush() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      onToast('Push stods inte i denna browser.')
      return
    }
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      onToast('Push tillatelse nekades.')
      return
    }
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    const { publicKey } = await api<{ publicKey: string }>('/api/public/push-config')
    if (!publicKey) {
      onToast('VAPID public key saknas i backend-konfigurationen.')
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
    onToast('Push aktiverad.')
  }

  return (
    <div className="stack">
      <div className="card">
        <h3>Forarpanel</h3>
        <div className="row">
          <button className="btn" onClick={load}>Uppdatera</button>
          <button className="btn" onClick={setupPush}>Aktivera push</button>
        </div>
        {stats && <p>Stats: {stats.completedRides} klara / {stats.acceptedRides} accepterade</p>}
      </div>
      <div className="card">
        <h3>Oppna resor</h3>
        {openRides.length === 0 && <p>Inga oppna resor just nu.</p>}
        {openRides.map((ride) => (
          <article key={ride.id} className="ride-item">
            <p><strong>{ride.fromAddress}</strong> till <strong>{ride.toAddress}</strong></p>
            <p>{new Date(ride.scheduledAt).toLocaleString()}</p>
            <div className="row">
              <button className="btn btn-primary" onClick={() => accept(ride.id)}>Acceptera</button>
              <button className="btn" onClick={() => refuse(ride.id)}>Neka</button>
              <button className="btn" onClick={() => startDriving(ride.id)}>Start driving</button>
              <button className="btn" onClick={() => complete(ride.id)}>Klar</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function AdminPage({ token, onToast }: { token: string; onToast: (m: string) => void }) {
  const [users, setUsers] = useState<Array<{ id: number; fullName: string; email: string; role: string }>>([])
  const [rideIdToDelete, setRideIdToDelete] = useState('')

  async function load() {
    const list = await api<Array<{ id: number; fullName: string; email: string; role: string }>>('/api/admin/users', { token })
    setUsers(list)
  }

  useEffect(() => {
    load()
  }, [])

  async function promote(userId: number) {
    await api(`/api/admin/users/${userId}/promote-driver`, { method: 'POST', token })
    onToast('User promoted to driver.')
    load()
  }

  async function demote(userId: number) {
    await api(`/api/admin/users/${userId}/demote-user`, { method: 'POST', token })
    onToast('Driver demoted to user.')
    load()
  }

  async function forcePassword(userId: number) {
    await api(`/api/admin/users/${userId}/force-password-change`, {
      method: 'POST',
      token,
      body: JSON.stringify({ mustChangePassword: true })
    })
    onToast('Forced password change set.')
  }

  async function deleteRide() {
    await api(`/api/admin/rides/${rideIdToDelete}`, { method: 'DELETE', token })
    onToast('Ride deleted.')
  }

  return (
    <div className="stack">
      <div className="card">
        <h3>Users</h3>
        {users.map((u) => (
          <article key={u.id} className="ride-item">
            <p>{u.fullName} ({u.email}) - {u.role}</p>
            <div className="row">
              <button className="btn" onClick={() => promote(u.id)}>Promote</button>
              <button className="btn" onClick={() => demote(u.id)}>Demote</button>
              <button className="btn" onClick={() => forcePassword(u.id)}>Force password</button>
            </div>
          </article>
        ))}
      </div>
      <div className="card">
        <h3>Delete ride (admin)</h3>
        <input value={rideIdToDelete} onChange={(e) => setRideIdToDelete(e.target.value)} placeholder="Ride ID" />
        <button className="btn btn-danger" onClick={deleteRide}>Delete future/historical ride</button>
      </div>
    </div>
  )
}

function HelpPage() {
  return (
    <section className="card">
      <h3>Hjalp & FAQ</h3>
      <ul>
        <li>Installera appen via "Add to Home Screen".</li>
        <li>Tillat notiser for att fa booking-uppdateringar.</li>
        <li>Forare maste ha appen oppen for battre live ETA via GPS.</li>
        <li>Anvand "Share trip" for att dela ETA med familj.</li>
      </ul>
      <p className="tiny">Farfartaxi ar familjevallig, snabb och rolig att anvanda.</p>
    </section>
  )
}

function useLocalAuth(): [AuthResponse | null, (next: AuthResponse | null) => void] {
  const [value, setValue] = useState<AuthResponse | null>(() => {
    const raw = localStorage.getItem('farfartaxi-auth')
    if (!raw) return null
    try {
      return JSON.parse(raw) as AuthResponse
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
  return 'Nagot gick fel'
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
