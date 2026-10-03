import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useI18n } from '../i18n/context'
import { PickupNoteField } from '../components/PickupNoteField'
import { api } from '../api/client'
import { API_URL } from '../lib/session'
import { buildRideBookPayload, defaultDraft } from '../lib/bookingDraft'
import { haversine } from '../lib/geo'
import type { RideResponse } from '../lib/rideTypes'
import { createIdempotencyHolder } from '../lib/idempotency'
import { useBusy } from '../lib/useBusy'
import { bookingApiErrorMessage } from '../lib/bookingErrors'
import { nearestStop, reversePlace, type NearestStop, type PlaceResult } from '../api/places'
import { PlaceSearchInput } from '../components/place-search/PlaceSearchInput'
import { formatDistanceM } from '../components/place-search/format'
import { useBookingDraft } from '../shell/BookingDraftContext'
import { useShell } from '../shell/ShellContext'
import { useActiveRide } from '../shell/ActiveRide'
import { isDriverRole } from '../shell/types'
import { BookingConfirmSheet, PassengerPicker } from '../components/BookingConfirmSheet'
import { focusBookingField, type BookingEditField } from '../components/bookingFocus'
import { useBookingUsers } from '../lib/useBookingUsers'

type Gps = { lat: number; lon: number; accuracy?: number }

/** OSRM route response (subset; geometries=geojson). */
type OsrmRouteResponse = {
  code: string
  routes?: Array<{
    distance: number
    duration: number
    geometry: { type: string; coordinates: number[][] }
  }>
}

/** Dev-only diagnostics for Leaflet zoom / recenter (filter console by `[booking-map]`). */
function logBookingMap(...args: unknown[]) {
  if (import.meta.env.DEV) console.debug('[booking-map]', ...args)
}

export function BookingPage() {
  const { token, user: currentUser, onToast } = useShell()
  const { refresh: refreshActive } = useActiveRide()
  const { t } = useI18n()
  const tokenRef = useRef(token)
  tokenRef.current = token
  const tRef = useRef(t)
  tRef.current = t
  const navigate = useNavigate()
  const { draft, setDraft, clearBookingDraft } = useBookingDraft()
  const isDriver = isDriverRole(currentUser.role)
  const [sheetOpen, setSheetOpen] = useState(false)
  const { busy: booking, run: runBooking } = useBusy()
  const idempotency = useRef(createIdempotencyHolder())
  const bookingUsers = useBookingUsers(token, isDriver && sheetOpen)
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
  /** Aborts in-flight map-click reverse geocode when search pick or similar replaces coordinates. */
  const mapClickReverseAbortRef = useRef<AbortController | null>(null)
  const lastStableMapCenterRef = useRef<{ lat: number; lng: number } | null>(null)
  /** Endpoint whose coordinates were last set (search pick, drag/reverse, or recenter) — used after route fitBounds. */
  const lastLocationSetRef = useRef<'from' | 'to'>('from')
  const mapNode = useRef<HTMLDivElement | null>(null)
  const activeFieldRef = useRef<'from' | 'to'>('from')
  const [activeField, setActiveField] = useState<'from' | 'to'>('from')
  const [gps, setGps] = useState<Gps | null>(null)
  const [stop, setStop] = useState<NearestStop | null>(null)

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
    /** Drag only pans; pick-up / destination is set by clicking the map (avoids fighting the Leaflet marker). */
    map.on('click', (e: L.LeafletMouseEvent) => {
      const latlng = e.latlng
      const field = activeFieldRef.current
      lastStableMapCenterRef.current = { lat: latlng.lat, lng: latlng.lng }
      lastLocationSetRef.current = field
      mapClickReverseAbortRef.current?.abort()
      const ac = new AbortController()
      mapClickReverseAbortRef.current = ac
      if (field === 'from') {
        setDraft((d) => ({ ...d, fromLat: latlng.lat, fromLon: latlng.lng }))
      } else {
        setDraft((d) => ({ ...d, toLat: latlng.lat, toLon: latlng.lng }))
      }
      void (async () => {
        let address: string
        try {
          const place = await reversePlace(tokenRef.current, latlng.lat, latlng.lng, ac.signal)
          address = place?.formattedAddress || tRef.current('placeSearch.selectedPlace')
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return
          // 429 / network / anything else: keep the tapped coordinates, just label them generically
          address = tRef.current('placeSearch.selectedPlace')
        }
        if (ac.signal.aborted || field !== activeFieldRef.current) return
        if (field === 'from') {
          setDraft((d) => ({ ...d, fromAddress: address, fromLat: latlng.lat, fromLon: latlng.lng }))
        } else {
          setDraft((d) => ({ ...d, toAddress: address, toLat: latlng.lat, toLon: latlng.lng }))
        }
      })()
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

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
          setGps({ lat: latitude, lon: longitude, accuracy: Number.isFinite(accuracy) ? accuracy : undefined })
          const m = mapRef.current
          if (!m || !bothAddressesEmpty) return
          const cur = draftRef.current
          if (cur.fromAddress.trim() || cur.toAddress.trim()) return
          programmaticCameraRef.current = true
          skipReverseOnMoveEndRef.current = true
          m.setView([latitude, longitude], 17)
          lastStableMapCenterRef.current = { lat: latitude, lng: longitude }
          window.setTimeout(() => {
            programmaticCameraRef.current = false
          }, 80)
          // Default pickup: where the phone is.
          setDraft((d) =>
            d.fromAddress.trim() ? d : { ...d, fromAddress: tRef.current('placeSearch.myPosition'), fromLat: latitude, fromLon: longitude }
          )
        },
        () => {
          /* keep default map center; permission denied or timeout: search still works without a context */
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 }
      )
    }

    return () => {
      mapClickReverseAbortRef.current?.abort()
      mapClickReverseAbortRef.current = null
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
            lineJoin: 'round',
            interactive: false
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- legacy: only re-run when draft coordinates/addresses change, not on other draft fields (pre-existing)
  }, [draft.fromAddress, draft.toAddress, draft.fromLat, draft.fromLon, draft.toLat, draft.toLon])

  const gpsLat = gps?.lat
  const gpsLon = gps?.lon
  useEffect(() => {
    if (gpsLat == null || gpsLon == null) return
    const ac = new AbortController()
    nearestStop(tokenRef.current, gpsLat, gpsLon, ac.signal)
      .then((r) => {
        if (!ac.signal.aborted) setStop(r)
      })
      .catch(() => {
        /* the hint is optional */
      })
    return () => ac.abort()
  }, [gpsLat, gpsLon])

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
    mapClickReverseAbortRef.current?.abort()
    programmaticCameraRef.current = true
    skipReverseOnMoveEndRef.current = true
    m.setView([lat, lon], m.getZoom())
    lastStableMapCenterRef.current = { lat, lng: lon }
    lastLocationSetRef.current = field
    window.setTimeout(() => {
      programmaticCameraRef.current = false
    }, 80)
  }

  function applySearchResult(item: PlaceResult, field: 'from' | 'to') {
    const { lat, lon } = item
    if (reverseGeocodeDebounceRef.current != null) clearTimeout(reverseGeocodeDebounceRef.current)
    reverseGeocodeDebounceRef.current = null
    mapClickReverseAbortRef.current?.abort()
    programmaticCameraRef.current = true
    skipReverseOnMoveEndRef.current = true
    mapRef.current?.setView([lat, lon], 15)
    lastStableMapCenterRef.current = { lat, lng: lon }
    lastLocationSetRef.current = field
    window.setTimeout(() => {
      programmaticCameraRef.current = false
    }, 80)
    const label = item.formattedAddress || item.name
    if (field === 'from') {
      setDraft((d) => ({ ...d, fromAddress: label, fromLat: lat, fromLon: lon }))
    } else {
      setDraft((d) => ({ ...d, toAddress: label, toLat: lat, toLon: lon }))
    }
  }

  function clearField(field: 'from' | 'to') {
    mapClickReverseAbortRef.current?.abort()
    // ✕ resets the coordinates too, so a stale pin/route never survives an emptied field
    if (field === 'from') {
      setDraft((d) => ({ ...d, fromAddress: '', fromLat: defaultDraft.fromLat, fromLon: defaultDraft.fromLon }))
    } else {
      setDraft((d) => ({ ...d, toAddress: '', toLat: defaultDraft.toLat, toLon: defaultDraft.toLon }))
    }
  }

  function chooseStopAsPickup(s: NearestStop) {
    applySearchResult(
      {
        provider: 'SL',
        providerPlaceId: s.providerPlaceId,
        kind: 'STOP',
        name: s.name,
        area: s.area,
        formattedAddress: s.area ? `${s.name} — ${s.area} (hållplats)` : s.name,
        lat: s.lat,
        lon: s.lon,
        distanceKm: s.distanceM / 1000
      },
      'from'
    )
  }

  async function submitAkaNu() {
    await runBooking(async () => {
      const payload = buildRideBookPayload(draft, 'NOW')
      const key = idempotency.current.keyFor(payload)
      try {
        const ride = await api<RideResponse>('/api/rides', {
          method: 'POST',
          token,
          headers: { 'Idempotency-Key': key },
          body: JSON.stringify(payload)
        })
        idempotency.current.reset()
        clearBookingDraft()
        setSheetOpen(false)
        void refreshActive()
        // The new ride is the home screen from now on (a driver booking for someone else stays put).
        navigate(ride.passengerId === currentUser.id ? `/app/resa/${ride.id}` : '/app/bekraftelse', { state: { ride } })
      } catch (err) {
        onToast(bookingApiErrorMessage(err, t))
      }
    })
  }

  function validateDraft(): boolean {
    if (!draft.fromAddress.trim() || !draft.toAddress.trim()) {
      onToast(t('booking.fillBoth'))
      return false
    }
    return true
  }

  /**
   * "Min position" is only a display default: before booking, swap it for a real label so the driver never sees it.
   * Reverse geocode -> "Nära <stop>" -> "Min position (GPS) lat, lon".
   */
  async function resolveMyPosition(): Promise<boolean> {
    const d = draftRef.current
    if (d.fromAddress !== t('placeSearch.myPosition')) return true
    const { fromLat: lat, fromLon: lon } = d
    let label: string | null
    try {
      label = (await reversePlace(token, lat, lon))?.formattedAddress || null
    } catch {
      label = null
    }
    if (!label && stop) label = t('placeSearch.nearStop', { name: stop.name })
    if (!label) label = t('placeSearch.gpsFallback', { lat: lat.toFixed(5), lon: lon.toFixed(5) })
    const resolved = label
    setDraft((cur) => (cur.fromAddress === t('placeSearch.myPosition') ? { ...cur, fromAddress: resolved } : cur))
    return true
  }

  function goForboka() {
    if (!validateDraft()) return
    void resolveMyPosition().then(() => navigate('/app/forboka'))
  }

  function bookAkaNu() {
    if (!validateDraft()) return
    void resolveMyPosition().then(() => setSheetOpen(true))
  }

  function editFromSheet(field: BookingEditField) {
    if (field === 'who') {
      focusBookingField(field) // the passenger picker lives inside the sheet: keep it open
      return
    }
    setSheetOpen(false)
    if (field === 'when') {
      navigate('/app/forboka') // "Nu" -> choose a time (Förboka)
      return
    }
    focusBookingField(field)
  }

  const bookedFor = isDriver && draft.passengerUserId != null
    ? (bookingUsers?.find((u) => u.id === draft.passengerUserId)?.fullName ?? null)
    : null

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
            <PlaceSearchInput
              token={token}
              fieldName="from"
              value={draft.fromAddress}
              placeholder={t('booking.pickupPlaceholder')}
              ariaLabel={t('booking.pickupAria')}
              clearLabel={t('booking.clearPickup')}
              context={{ gps }}
              onFocus={() => {
                setActiveField('from')
                recenterMapOnField('from')
              }}
              onChange={(v) => {
                setActiveField('from')
                setDraft((d) => ({ ...d, fromAddress: v }))
              }}
              onSelect={(p) => applySearchResult(p, 'from')}
              onClear={() => clearField('from')}
            />
            {stop && gps && draft.fromAddress === t('placeSearch.myPosition') && (
              <p className="pickup-hint">
                <span>
                  {t('placeSearch.hereStop', { name: stop.name, dist: formatDistanceM(stop.distanceM) })}
                </span>
                <button type="button" className="btn btn-touch" onClick={() => chooseStopAsPickup(stop)}>
                  {t('placeSearch.useStop')}
                </button>
              </p>
            )}
            <PlaceSearchInput
              token={token}
              fieldName="to"
              value={draft.toAddress}
              placeholder={t('booking.destinationPlaceholder')}
              ariaLabel={t('booking.destinationAria')}
              clearLabel={t('booking.clearDestination')}
              context={{
                gps,
                pickup: draft.fromAddress.trim() ? { lat: draft.fromLat, lon: draft.fromLon } : null
              }}
              onFocus={() => {
                setActiveField('to')
                recenterMapOnField('to')
              }}
              onChange={(v) => {
                setActiveField('to')
                setDraft((d) => ({ ...d, toAddress: v }))
              }}
              onSelect={(p) => applySearchResult(p, 'to')}
              onClear={() => clearField('to')}
            />
          </div>
        </div>
        <p className="dist-hint">
          {roadRoute
            ? t('booking.roadRoute', { km: roadRoute.km.toFixed(1), min: roadRoute.min })
            : t('booking.distanceKm', { km: distanceKm.toFixed(2) })}
        </p>
        {roadRoute && <p className="dist-hint dist-hint-sub">{t('booking.routingAttribution')}</p>}
        <PickupNoteField
          value={draft.pickupNote ?? ''}
          onChange={(v) => setDraft((d) => ({ ...d, pickupNote: v }))}
        />
        <div className="booking-actions">
          <button type="button" className="btn btn-outline" onClick={goForboka} disabled={booking}>
            {t('booking.forboka')}
          </button>
          <button type="button" className="btn btn-aka-nu" onClick={bookAkaNu} disabled={booking} aria-busy={booking}>
            {booking ? t('booking.submitting') : t('booking.akaNu')}
          </button>
        </div>
      </div>
      <BookingConfirmSheet
        open={sheetOpen}
        busy={booking}
        onClose={() => setSheetOpen(false)}
        onConfirm={() => void submitAkaNu()}
        who={{ name: currentUser.fullName, forName: bookedFor }}
        whoPicker={
          isDriver ? (
            <PassengerPicker
              users={bookingUsers}
              value={draft.passengerUserId}
              onChange={(id) =>
                setDraft((d) => {
                  const next = { ...d }
                  if (id == null) delete next.passengerUserId
                  else next.passengerUserId = id
                  return next
                })
              }
            />
          ) : undefined
        }
        when={{ now: true, iso: new Date().toISOString() }}
        from={draft.fromAddress}
        to={draft.toAddress}
        note={draft.pickupNote ?? ''}
        onEdit={editFromSheet}
      />
    </div>
  )
}
