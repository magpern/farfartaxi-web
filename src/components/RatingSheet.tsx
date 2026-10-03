import { useState } from 'react'
import { useI18n } from '../i18n/context'
import { BottomSheet } from './ui/BottomSheet'
import { Button } from './ui/Button'

type Props = {
  open: boolean
  onClose: () => void
  /** Resolves when saved; the sheet closes itself afterwards. */
  onSubmit: (stars: number, comment: string) => Promise<void>
}

export function RatingSheet({ open, onClose, onSubmit }: Props) {
  const { t } = useI18n()
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (stars < 1 || busy) return
    setBusy(true)
    try {
      await onSubmit(stars, comment.trim())
      setStars(0)
      setComment('')
      onClose()
    } catch {
      /* the caller shows the error toast; keep the sheet open so nothing is lost */
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      title={t('rating.title')}
      onClose={onClose}
      footer={
        <Button variant="primary" size="lg" block disabled={stars < 1 || busy} onClick={() => void submit()}>
          {busy ? t('common.working') : t('rating.send')}
        </Button>
      }
    >
      <div className="rating-stars" role="radiogroup" aria-label={t('rating.starsAria')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={t('rating.starAria', { n })}
            className={`rating-star ${n <= stars ? 'rating-star-on' : ''}`}
            onClick={() => setStars(n)}
          >
            {n <= stars ? '★' : '☆'}
          </button>
        ))}
      </div>
      <label className="pickup-note-field">
        <span className="tiny">{t('rating.commentLabel')}</span>
        <textarea
          className="sheet-input"
          rows={3}
          maxLength={500}
          value={comment}
          placeholder={t('rating.commentPlaceholder')}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
    </BottomSheet>
  )
}
