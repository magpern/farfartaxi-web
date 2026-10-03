import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/context'
import { apiErrorMessage } from '../lib/apiErrors'
import { useBookingUsers } from '../lib/useBookingUsers'
import { useSavedPlaces } from '../lib/useSavedPlaces'
import {
  deleteSavedPlace,
  draftFromResult,
  reorderSavedPlaces,
  SAVED_KIND_ICON,
  updateSavedPlace,
  type PlaceDraft,
  type SavedPlace,
  type SavedPlaceKind
} from '../api/savedPlaces'
import { Button, Card, ConfirmDialog, BottomSheet } from '../components/ui'
import { KindChips, SavePlaceSheet } from '../components/SavePlaceSheet'
import { PlaceSearchInput } from '../components/place-search/PlaceSearchInput'
import { useShell } from '../shell/ShellContext'
import { isDriverRole } from '../shell/types'

const KINDS: SavedPlaceKind[] = ['HOME', 'SCHOOL', 'SPORTS', 'WORK', 'FAMILY', 'OTHER']

/** "Mina platser": favorites with rename / kind, reorder, delete and add. Drivers/admins can pick a passenger (`?userId=`). */
export function PlacesPage() {
  const { t } = useI18n()
  const { token, user, onToast } = useShell()
  const [params, setParams] = useSearchParams()
  const driver = isDriverRole(user.role)
  const forId = driver && params.get('userId') ? Number(params.get('userId')) : undefined
  const userId = Number.isFinite(forId) ? forId : undefined
  const bookingUsers = useBookingUsers(token, driver)
  const forName = userId != null ? bookingUsers?.find((u) => u.id === userId)?.fullName : undefined
  const { places, reload, setPlaces } = useSavedPlaces(token, userId)

  const [editing, setEditing] = useState<SavedPlace | null>(null)
  const [deleting, setDeleting] = useState<SavedPlace | null>(null)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [toSave, setToSave] = useState<PlaceDraft | null>(null)
  const addKind = params.get('add') === 'HOME' ? 'HOME' : undefined

  useEffect(() => {
    if (params.get('add')) setAdding(true)
    // only on first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setUser(id: string) {
    const next = new URLSearchParams(params)
    if (id) next.set('userId', id)
    else next.delete('userId')
    setParams(next, { replace: true })
  }

  async function move(index: number, dir: -1 | 1) {
    if (!places) return
    const j = index + dir
    if (j < 0 || j >= places.length) return
    const next = [...places]
    ;[next[index], next[j]] = [next[j], next[index]]
    setPlaces(next)
    try {
      await reorderSavedPlaces(token, next.map((p) => p.id), userId)
    } catch (err) {
      onToast(apiErrorMessage(err, t))
      await reload()
    }
  }

  async function remove() {
    if (!deleting) return
    const id = deleting.id
    setDeleting(null)
    try {
      await deleteSavedPlace(token, id)
      setPlaces((p) => p && p.filter((x) => x.id !== id))
    } catch (err) {
      onToast(apiErrorMessage(err, t))
    }
  }

  const title = userId != null ? t('places.titleFor', { name: forName ?? '…' }) : t('places.title')

  return (
    <div className="subpage-wrap stack">
      <h1 className="page-title">{title}</h1>

      {driver && (
        <Card>
          <label className="stack">
            <span>{t('places.forWho')}</span>
            <select className="sheet-input" aria-label={t('places.forWho')} value={userId != null ? String(userId) : ''} onChange={(e) => setUser(e.target.value)}>
              <option value="">{t('places.mine')}</option>
              {(bookingUsers ?? []).map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </label>
        </Card>
      )}

      {places === null && <p className="muted">{t('common.loading')}</p>}
      {places !== null && places.length === 0 && (
        <Card className="empty-state">
          <p className="empty-emoji" aria-hidden>
            ⭐
          </p>
          <p>{t('places.empty')}</p>
        </Card>
      )}
      {places !== null && places.length > 0 && (
        <ul className="saved-list">
          {places.map((p, i) => (
            <li key={p.id} className="saved-row">
              <button type="button" className="saved-main" onClick={() => setEditing(p)} aria-label={t('places.editAria', { name: p.label })}>
                <span className="saved-icon" aria-hidden>
                  {SAVED_KIND_ICON[p.kind]}
                </span>
                <span className="saved-text">
                  <strong>{p.label}</strong>
                  <span className="muted tiny">{p.formattedAddress || p.address}</span>
                </span>
              </button>
              <div className="saved-tools">
                <button type="button" className="saved-tool" disabled={i === 0} aria-label={t('places.moveUp', { name: p.label })} onClick={() => void move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="saved-tool" disabled={i === places.length - 1} aria-label={t('places.moveDown', { name: p.label })} onClick={() => void move(i, 1)}>
                  ↓
                </button>
                <button type="button" className="saved-tool" aria-label={t('places.deleteAria', { name: p.label })} onClick={() => setDeleting(p)}>
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button variant="primary" size="lg" block onClick={() => setAdding(true)}>
        ➕ {t('places.add')}
      </Button>

      <BottomSheet open={adding && toSave === null} title={t('places.add')} onClose={() => setAdding(false)}>
        <PlaceSearchInput
          token={token}
          value={query}
          placeholder={t('places.searchPlaceholder')}
          ariaLabel={t('places.searchAria')}
          clearLabel={t('booking.clearDestination')}
          onChange={setQuery}
          onClear={() => setQuery('')}
          onSelect={(p) => setToSave({ ...draftFromResult(p), kind: addKind })}
        />
      </BottomSheet>

      <SavePlaceSheet
        open={toSave !== null}
        place={toSave}
        token={token}
        userId={userId}
        onClose={() => {
          setToSave(null)
        }}
        onSaved={() => {
          setAdding(false)
          setQuery('')
          if (params.get('add')) {
            const next = new URLSearchParams(params)
            next.delete('add')
            setParams(next, { replace: true })
          }
          void reload()
        }}
        onToast={onToast}
      />

      <EditPlaceSheet
        place={editing}
        onClose={() => setEditing(null)}
        onSave={async (label, kind) => {
          if (!editing) return
          try {
            await updateSavedPlace(token, editing.id, { label, kind })
            setEditing(null)
            await reload()
          } catch (err) {
            onToast(apiErrorMessage(err, t))
          }
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        danger
        title={t('places.deleteTitle', { name: deleting?.label ?? '' })}
        confirmLabel={t('places.delete')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

function EditPlaceSheet({
  place,
  onClose,
  onSave
}: {
  place: SavedPlace | null
  onClose: () => void
  onSave: (label: string, kind: SavedPlaceKind) => Promise<void>
}) {
  const { t } = useI18n()
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<SavedPlaceKind>('OTHER')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (place) {
      setLabel(place.label)
      setKind(KINDS.includes(place.kind) ? place.kind : 'OTHER')
    }
  }, [place])
  return (
    <BottomSheet
      open={place !== null}
      title={t('places.editTitle')}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          disabled={busy || !label.trim()}
          onClick={async () => {
            setBusy(true)
            try {
              await onSave(label.trim(), kind)
            } finally {
              setBusy(false)
            }
          }}
        >
          {t('places.save')}
        </Button>
      }
    >
      <div className="stack">
        {place && <p className="muted tiny">{place.formattedAddress || place.address}</p>}
        <label className="stack">
          <span>{t('places.nameLabel')}</span>
          <input className="sheet-input" value={label} maxLength={60} aria-label={t('places.nameLabel')} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <KindChips value={kind} onChange={setKind} />
      </div>
    </BottomSheet>
  )
}
