import { useI18n } from '../i18n/context'
import { PICKUP_NOTE_MAX } from '../lib/rideTypes'

export function PickupNoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  return (
    <label className="pickup-note-field">
      <span className="tiny">{t('pickupNote.label')}</span>
      <textarea
        className="sheet-input"
        rows={2}
        maxLength={PICKUP_NOTE_MAX}
        value={value}
        placeholder={t('pickupNote.placeholder')}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="tiny muted">{t('pickupNote.count', { n: value.length })}</span>
    </label>
  )
}
