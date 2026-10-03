import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/context'
import { apiErrorMessage } from '../lib/apiErrors'
import { ApiError } from '../api/client'
import { createSavedPlace, MAX_PLACE_NAME, placeNameFromAddress, SAVED_KINDS, SAVED_KIND_ICON, type PlaceDraft, type SavedPlace, type SavedPlaceKind } from '../api/savedPlaces'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'

/** Kind chips (icon + friendly name; never the raw enum). */
export function KindChips({ value, onChange }: { value: SavedPlaceKind; onChange: (k: SavedPlaceKind) => void }) {
  const { t } = useI18n()
  return (
    <div className="kind-chips" role="group" aria-label={t('places.kindLabel')}>
      {SAVED_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          className={`kind-chip${value === k ? ' kind-chip-on' : ''}`}
          aria-pressed={value === k}
          onClick={() => onChange(k)}
        >
          <span aria-hidden>{SAVED_KIND_ICON[k]}</span> {t(`places.kind.${k}`)}
        </button>
      ))}
    </div>
  )
}

/** Small sheet: name (prefilled), kind, Spara. */
export function SavePlaceSheet({
  open,
  place,
  token,
  userId,
  forName,
  onClose,
  onSaved,
  onToast
}: {
  open: boolean
  place: PlaceDraft | null
  token: string
  userId?: number
  /** First name of the passenger the place is saved for (driver booking for someone else). */
  forName?: string | null
  onClose: () => void
  onSaved: (p: SavedPlace) => void
  onToast: (m: string) => void
}) {
  const { t } = useI18n()
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<SavedPlaceKind>('OTHER')
  const [busy, setBusy] = useState(false)
  const [nameError, setNameError] = useState(false)
  useEffect(() => {
    if (open && place) {
      setLabel(place.kind === 'HOME' ? t('places.kind.HOME') : placeNameFromAddress(place.name))
      setNameError(false)
      setKind(place.kind ?? 'OTHER')
    }
  }, [open, place, t])
  if (!place) return null

  async function save() {
    if (!place || !label.trim()) return
    setBusy(true)
    setNameError(false)
    try {
      const saved = await createSavedPlace(
        token,
        {
          label: label.trim().slice(0, MAX_PLACE_NAME),
          address: place.address,
          formattedAddress: place.address,
          lat: place.lat,
          lon: place.lon,
          kind,
          provider: place.provider ?? null,
          providerPlaceId: place.providerPlaceId ?? null
        },
        userId
      )
      const name = saved.label || label.trim()
      onToast(forName ? t('places.savedToastFor', { name, who: forName }) : t('places.savedToast', { name }))
      onSaved(saved)
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setNameError(true)
      else onToast(apiErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      title={forName ? t('places.saveTitleFor', { who: forName }) : t('places.saveTitle')}
      onClose={onClose}
      footer={
        <Button variant="primary" size="lg" block disabled={busy || !label.trim()} onClick={() => void save()}>
          {t('places.save')}
        </Button>
      }
    >
      <div className="stack">
        <p className="muted tiny">{place.address}</p>
        <label className="stack">
          <span>{t('places.nameLabel')}</span>
          <input className="sheet-input" value={label} maxLength={MAX_PLACE_NAME} onChange={(e) => { setLabel(e.target.value); setNameError(false) }} aria-label={t('places.nameLabel')} aria-invalid={nameError} />
          {nameError && <span className="field-error tiny" role="alert">{t('places.nameInvalid')}</span>}
        </label>
        <KindChips value={kind} onChange={setKind} />
      </div>
    </BottomSheet>
  )
}
