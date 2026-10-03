import { useEffect, useRef, type ReactNode } from 'react'
import { useI18n } from '../../i18n/context'
import { useOverlayOpen } from './overlayRegistry'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function BottomSheet({ open, title, onClose, children, footer }: Props) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  useOverlayOpen(open)

  useEffect(() => {
    if (!open) return
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="ui-sheet-layer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={ref} className="ui-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="ui-sheet-head">
          <h2 className="ui-sheet-title">{title}</h2>
          <button type="button" className="ui-sheet-close" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        <div className="ui-sheet-body">{children}</div>
        {footer && <div className="ui-sheet-footer">{footer}</div>}
      </div>
    </div>
  )
}
